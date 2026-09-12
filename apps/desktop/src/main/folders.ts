import { app } from "electron";
import { promises as fs } from "fs";
import { join } from "path";
import type { WorkspaceFolder } from "../shared/workspace";
import { listWorkspaces, loadWorkspace, saveWorkspace, slugify } from "./workspaces";

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

export async function listFolders(): Promise<WorkspaceFolder[]> {
  const folders = await readFolders();
  return folders.sort((a, b) => a.name.localeCompare(b.name));
}

export async function createFolder(name: string): Promise<WorkspaceFolder> {
  const folders = await readFolders();
  const folder: WorkspaceFolder = { id: `${slugify(name)}-${Date.now().toString(36)}`, name };
  folders.push(folder);
  await writeFolders(folders);
  return folder;
}

export async function deleteFolder(id: string): Promise<void> {
  const folders = (await readFolders()).filter((f) => f.id !== id);
  await writeFolders(folders);

  // Ungroup any workspaces left pointing at the deleted folder.
  const summaries = await listWorkspaces();
  for (const summary of summaries) {
    if (summary.folderId === id) {
      const workspace = await loadWorkspace(summary.id);
      await saveWorkspace({ ...workspace, folderId: undefined });
    }
  }
}
