import { app } from "electron";
import { promises as fs } from "fs";
import { join } from "path";
import { DEFAULT_GRID_SETTINGS, type Workspace, type WorkspaceSummary } from "../shared/workspace";

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
      props: { highlightKey: "C", listenForMidi: true }
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

export async function listWorkspaces(): Promise<WorkspaceSummary[]> {
  await ensureSeeded();
  const entries = await fs.readdir(workspacesDir());
  const summaries: WorkspaceSummary[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    const raw = await fs.readFile(join(workspacesDir(), entry), "utf-8");
    const workspace = JSON.parse(raw) as Workspace;
    summaries.push({ id: workspace.id, name: workspace.name });
  }
  return summaries.sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadWorkspace(id: string): Promise<Workspace> {
  const raw = await fs.readFile(workspacePath(id), "utf-8");
  return JSON.parse(raw) as Workspace;
}

export async function saveWorkspace(workspace: Workspace): Promise<void> {
  await fs.mkdir(workspacesDir(), { recursive: true });
  await fs.writeFile(workspacePath(workspace.id), JSON.stringify(workspace, null, 2), "utf-8");
}

export async function createWorkspace(name: string): Promise<Workspace> {
  const id = `${slugify(name)}-${Date.now().toString(36)}`;
  const workspace: Workspace = { id, name, gridSettings: DEFAULT_GRID_SETTINGS, layout: [] };
  await saveWorkspace(workspace);
  return workspace;
}

export async function duplicateWorkspace(id: string, newName: string): Promise<Workspace> {
  const source = await loadWorkspace(id);
  const newId = `${slugify(newName)}-${Date.now().toString(36)}`;
  const copy: Workspace = {
    ...source,
    id: newId,
    name: newName,
    layout: source.layout.map((item) => ({ ...item }))
  };
  await saveWorkspace(copy);
  return copy;
}

export async function deleteWorkspace(id: string): Promise<void> {
  await fs.rm(workspacePath(id), { force: true });
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "workspace"
  );
}
