import { app } from "electron";
import { promises as fs } from "fs";
import { join } from "path";
import { DEFAULT_GRID_SETTINGS, type Workspace, type WorkspaceSummary } from "../shared/workspace";
import { createSerialQueue } from "./serialQueue";

// One queue shared by every mutating export below. Internal helpers
// (loadWorkspace, writeWorkspaceFile) stay unqueued and are only called from
// inside an already-queued function — queuing them too would deadlock, since
// createSerialQueue's chain can't resolve a call nested inside itself.
const runSerially = createSerialQueue();

function workspacesDir(): string {
  return join(app.getPath("userData"), "workspaces");
}

function workspacePath(id: string): string {
  return join(workspacesDir(), `${id}.json`);
}

const SAMPLE_WORKSPACE: Workspace = {
  id: "week-1-circle-of-fifths",
  name: "Week 1 — Circle of Fifths",
  gridSettings: DEFAULT_GRID_SETTINGS,
  layout: [
    {
      id: "cof-1",
      component: "circle-of-fifths",
      x: 0,
      y: 0,
      w: 6,
      h: 6,
      props: {}
    }
  ]
};

async function ensureSeeded(): Promise<void> {
  await fs.mkdir(workspacesDir(), { recursive: true });
  const entries = await fs.readdir(workspacesDir());
  if (entries.length === 0) {
    await fs.writeFile(
      workspacePath(SAMPLE_WORKSPACE.id),
      JSON.stringify(SAMPLE_WORKSPACE, null, 2),
      "utf-8"
    );
  }
}

async function writeWorkspaceFile(workspace: Workspace): Promise<void> {
  await fs.mkdir(workspacesDir(), { recursive: true });
  await fs.writeFile(workspacePath(workspace.id), JSON.stringify(workspace, null, 2), "utf-8");
}

export async function listWorkspaces(): Promise<WorkspaceSummary[]> {
  await ensureSeeded();
  const entries = await fs.readdir(workspacesDir());
  const summaries: WorkspaceSummary[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    const raw = await fs.readFile(join(workspacesDir(), entry), "utf-8");
    const workspace = JSON.parse(raw) as Workspace;
    summaries.push({ id: workspace.id, name: workspace.name, folderId: workspace.folderId, order: workspace.order });
  }
  // Order is folder-scoped (see reorderWorkspaces) but compared globally here
  // since callers group by folderId themselves (Sidebar.tsx) — undefined
  // order (older files predating this field) sorts after any explicit order,
  // falling back to name so legacy data still reads alphabetically.
  return summaries.sort((a, b) => {
    const orderDiff = (a.order ?? Number.POSITIVE_INFINITY) - (b.order ?? Number.POSITIVE_INFINITY);
    return orderDiff !== 0 ? orderDiff : a.name.localeCompare(b.name);
  });
}

export async function loadWorkspace(id: string): Promise<Workspace> {
  const raw = await fs.readFile(workspacePath(id), "utf-8");
  return JSON.parse(raw) as Workspace;
}

export async function saveWorkspace(workspace: Workspace): Promise<void> {
  return runSerially(() => writeWorkspaceFile(workspace));
}

/** Every workspace belongs to a folder — see Sidebar.tsx and folders.ts, which enforce that there's always at least one folder to pass here. */
export async function createWorkspace(name: string, folderId: string): Promise<Workspace> {
  return runSerially(async () => {
    const id = `${slugify(name)}-${Date.now().toString(36)}`;
    const existing = await listWorkspaces();
    const order = existing.filter((w) => w.folderId === folderId).length;
    const workspace: Workspace = { id, name, gridSettings: DEFAULT_GRID_SETTINGS, layout: [], folderId, order };
    await writeWorkspaceFile(workspace);
    return workspace;
  });
}

export async function duplicateWorkspace(id: string, newName: string): Promise<Workspace> {
  return runSerially(async () => {
    const source = await loadWorkspace(id);
    const newId = `${slugify(newName)}-${Date.now().toString(36)}`;
    const existing = await listWorkspaces();
    const order = existing.filter((w) => w.folderId === source.folderId).length;
    const copy: Workspace = {
      ...source,
      id: newId,
      name: newName,
      order,
      layout: source.layout.map((item) => ({ ...item }))
    };
    await writeWorkspaceFile(copy);
    return copy;
  });
}

export async function deleteWorkspace(id: string): Promise<void> {
  return runSerially(() => fs.rm(workspacePath(id), { force: true }));
}

export async function renameWorkspace(id: string, name: string): Promise<Workspace> {
  return runSerially(async () => {
    const workspace = await loadWorkspace(id);
    const next: Workspace = { ...workspace, name };
    await writeWorkspaceFile(next);
    return next;
  });
}

export async function setWorkspaceFolder(id: string, folderId: string): Promise<Workspace> {
  return runSerially(async () => {
    const workspace = await loadWorkspace(id);
    const existing = await listWorkspaces();
    const order = existing.filter((w) => w.folderId === folderId && w.id !== id).length;
    const next: Workspace = { ...workspace, folderId, order };
    await writeWorkspaceFile(next);
    return next;
  });
}

/**
 * Rewrites the sort order of every workspace in `folderId` to match
 * `orderedIds` (drag-to-reorder within a folder in the sidebar), writing
 * each affected workspace's own file — unlike reorderFolders in folders.ts,
 * there's no single shared file to rewrite since each workspace is its own
 * JSON file. Any workspace already in the folder but missing from
 * `orderedIds` keeps its relative order, appended after the named ones,
 * rather than silently losing its position. Skips writing files whose order
 * doesn't actually change.
 */
export async function reorderWorkspaces(folderId: string, orderedIds: string[]): Promise<void> {
  return runSerially(async () => {
    const summaries = await listWorkspaces();
    const byId = new Map(summaries.filter((s) => s.folderId === folderId).map((s) => [s.id, s]));
    const ordered: WorkspaceSummary[] = [];
    for (const id of orderedIds) {
      const summary = byId.get(id);
      if (summary) {
        ordered.push(summary);
        byId.delete(id);
      }
    }
    ordered.push(...byId.values());

    for (let i = 0; i < ordered.length; i++) {
      if (ordered[i].order === i) continue;
      const workspace = await loadWorkspace(ordered[i].id);
      await writeWorkspaceFile({ ...workspace, order: i });
    }
  });
}

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "workspace"
  );
}
