import { app } from "electron";
import { promises as fs } from "fs";
import { join } from "path";
import type { WorkspaceFolder } from "../shared/workspace";
import { listWorkspaces, loadWorkspace, saveWorkspace, slugify } from "./workspaces";
import { createSerialQueue } from "./serialQueue";

const runSerially = createSerialQueue();

const DEFAULT_FOLDER_NAME = "General";

function foldersPath(): string {
  return join(app.getPath("userData"), "folders.json");
}

async function readFolders(): Promise<WorkspaceFolder[]> {
  try {
    const raw = await fs.readFile(foldersPath(), "utf-8");
    return JSON.parse(raw) as WorkspaceFolder[];
  } catch {
    return [];
  }
}

async function writeFolders(folders: WorkspaceFolder[]): Promise<void> {
  await fs.mkdir(app.getPath("userData"), { recursive: true });
  await fs.writeFile(foldersPath(), JSON.stringify(folders, null, 2), "utf-8");
}

/**
 * Every workspace must belong to a folder — there's no "ungrouped" bucket
 * (see Sidebar.tsx). This is what enforces that on the read side: it runs
 * at the top of every listFolders() call, so it self-heals (creating a
 * first folder, and reassigning any orphaned workspace to it) rather than
 * needing a one-time migration hook somewhere in the app's startup.
 * Calling listWorkspaces() here — rather than reading workspace files
 * directly — also guarantees the sample workspace has already been seeded
 * by the time this scans for orphans, since listWorkspaces() seeds it as
 * its own first step.
 */
async function ensureFoldersAndMigrateOrphans(): Promise<WorkspaceFolder[]> {
  let folders = await readFolders();
  if (folders.length === 0) {
    const folder: WorkspaceFolder = {
      id: `${slugify(DEFAULT_FOLDER_NAME)}-${Date.now().toString(36)}`,
      name: DEFAULT_FOLDER_NAME
    };
    folders = [folder];
    await writeFolders(folders);
  }

  const summaries = await listWorkspaces();
  const orphanIds = summaries.filter((s) => !s.folderId).map((s) => s.id);
  if (orphanIds.length > 0) {
    const fallbackFolderId = folders[0].id;
    for (const id of orphanIds) {
      const workspace = await loadWorkspace(id);
      await saveWorkspace({ ...workspace, folderId: fallbackFolderId });
    }
  }

  return folders;
}

export async function listFolders(): Promise<WorkspaceFolder[]> {
  return ensureFoldersAndMigrateOrphans();
}

export async function createFolder(name: string): Promise<WorkspaceFolder> {
  return runSerially(async () => {
    const folders = await readFolders();
    const folder: WorkspaceFolder = { id: `${slugify(name)}-${Date.now().toString(36)}`, name };
    folders.push(folder);
    await writeFolders(folders);
    return folder;
  });
}

export async function renameFolder(id: string, name: string): Promise<WorkspaceFolder> {
  return runSerially(async () => {
    const folders = await readFolders();
    const folder = folders.find((f) => f.id === id);
    if (!folder) throw new Error(`Folder not found: ${id}`);
    folder.name = name;
    await writeFolders(folders);
    return folder;
  });
}

/** Rewrites the folder list in exactly the given order (drag-to-reorder in the sidebar). Any id not present keeps its relative order, appended at the end, rather than silently vanishing. */
export async function reorderFolders(orderedIds: string[]): Promise<WorkspaceFolder[]> {
  return runSerially(async () => {
    const folders = await readFolders();
    const byId = new Map(folders.map((f) => [f.id, f]));
    const reordered: WorkspaceFolder[] = [];
    for (const id of orderedIds) {
      const folder = byId.get(id);
      if (folder) {
        reordered.push(folder);
        byId.delete(id);
      }
    }
    reordered.push(...byId.values());
    await writeFolders(reordered);
    return reordered;
  });
}

export async function deleteFolder(id: string): Promise<void> {
  return runSerially(async () => {
    const folders = await readFolders();
    if (folders.length <= 1) {
      throw new Error("Can't delete the only folder — every workspace needs one to live in.");
    }
    const summaries = await listWorkspaces();
    if (summaries.some((s) => s.folderId === id)) {
      throw new Error("Move or delete this folder's workspaces before deleting it.");
    }
    await writeFolders(folders.filter((f) => f.id !== id));
  });
}
