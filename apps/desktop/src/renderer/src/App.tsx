import { useCallback, useEffect, useRef, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { WorkspaceGrid } from "./components/WorkspaceGrid";
import type { Workspace, WorkspaceFolder, WorkspaceSummary } from "../../shared/workspace";
import { midiService } from "./midi/midiService";
import "./App.css";

type Mode = "edit" | "play";

export function App() {
  const [summaries, setSummaries] = useState<WorkspaceSummary[]>([]);
  const [folders, setFolders] = useState<WorkspaceFolder[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null);
  const [midiStatus, setMidiStatus] = useState<string>("Initializing MIDI…");
  const [mode, setMode] = useState<Mode>("edit");
  const saveTimer = useRef<number | null>(null);

  const refreshSummaries = useCallback(async (): Promise<WorkspaceSummary[]> => {
    const list = await window.api.workspaces.list();
    setSummaries(list);
    return list;
  }, []);

  const refreshFolders = useCallback(async (): Promise<WorkspaceFolder[]> => {
    const list = await window.api.folders.list();
    setFolders(list);
    return list;
  }, []);

  useEffect(() => {
    (async () => {
      const [list] = await Promise.all([refreshSummaries(), refreshFolders()]);
      if (list.length > 0) {
        const first = await window.api.workspaces.load(list[0].id);
        setActiveWorkspace(first);
      }
    })();
  }, [refreshSummaries, refreshFolders]);

  useEffect(() => {
    midiService.init().then((result) => {
      if (result.ok) {
        const info = midiService.getDeviceInfo();
        setMidiStatus(
          info.inputs.length || info.outputs.length
            ? `MIDI ready — ${info.inputs.length} in / ${info.outputs.length} out`
            : "MIDI ready — no devices connected"
        );
      } else {
        setMidiStatus(`MIDI unavailable: ${result.reason}`);
      }
    });
  }, []);

  // Tab toggles Edit/Play mode; Left/Right arrow keys cycle between sibling
  // workspaces of the active workspace's folder ("mother workspace"
  // navigation). Both are ignored while a form control has focus, so
  // text/number fields (and normal Tab-to-next-field behavior) keep working.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      const isFormControl =
        tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || !!target?.isContentEditable;

      if (event.key === "Tab" && !isFormControl) {
        event.preventDefault();
        setMode((m) => (m === "edit" ? "play" : "edit"));
        return;
      }

      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (isFormControl) return;
      if (!activeWorkspace?.folderId) return;

      const siblings = summaries
        .filter((s) => s.folderId === activeWorkspace.folderId)
        .sort((a, b) => a.name.localeCompare(b.name));
      if (siblings.length < 2) return;

      const currentIndex = siblings.findIndex((s) => s.id === activeWorkspace.id);
      if (currentIndex === -1) return;

      const delta = event.key === "ArrowRight" ? 1 : -1;
      const nextIndex = (currentIndex + delta + siblings.length) % siblings.length;
      event.preventDefault();
      handleSelectWorkspace(siblings[nextIndex].id);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeWorkspace, summaries]);

  async function handleSelectWorkspace(id: string): Promise<void> {
    const workspace = await window.api.workspaces.load(id);
    setActiveWorkspace(workspace);
  }

  async function handleCreateWorkspace(): Promise<void> {
    const name = `New Workspace ${summaries.length + 1}`;
    const workspace = await window.api.workspaces.create(name);
    await refreshSummaries();
    setActiveWorkspace(workspace);
  }

  async function handleDuplicateWorkspace(id: string): Promise<void> {
    const source = summaries.find((s) => s.id === id);
    const name = source ? `${source.name} (copy)` : "Workspace copy";
    const workspace = await window.api.workspaces.duplicate(id, name);
    await refreshSummaries();
    setActiveWorkspace(workspace);
  }

  async function handleDeleteWorkspace(id: string): Promise<void> {
    await window.api.workspaces.delete(id);
    const list = await refreshSummaries();
    if (activeWorkspace?.id === id) {
      setActiveWorkspace(list.length > 0 ? await window.api.workspaces.load(list[0].id) : null);
    }
  }

  async function handleCreateFolder(): Promise<void> {
    const name = `New Folder ${folders.length + 1}`;
    await window.api.folders.create(name);
    await refreshFolders();
  }

  async function handleDeleteFolder(id: string): Promise<void> {
    await window.api.folders.delete(id);
    await Promise.all([refreshFolders(), refreshSummaries()]);
    setActiveWorkspace((prev) => (prev && prev.folderId === id ? { ...prev, folderId: undefined } : prev));
  }

  async function handleMoveToFolder(workspaceId: string, folderId: string | null): Promise<void> {
    await window.api.workspaces.setFolder(workspaceId, folderId);
    await refreshSummaries();
    setActiveWorkspace((prev) =>
      prev && prev.id === workspaceId ? { ...prev, folderId: folderId ?? undefined } : prev
    );
  }

  function handleWorkspaceChange(next: Workspace): void {
    setActiveWorkspace(next);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      window.api.workspaces.save(next);
    }, 400);
  }

  return (
    <div className="app">
      {mode === "edit" && (
        <Sidebar
          workspaces={summaries}
          folders={folders}
          activeId={activeWorkspace?.id ?? null}
          onSelect={handleSelectWorkspace}
          onCreate={handleCreateWorkspace}
          onDuplicate={handleDuplicateWorkspace}
          onDelete={handleDeleteWorkspace}
          onCreateFolder={handleCreateFolder}
          onDeleteFolder={handleDeleteFolder}
          onMoveToFolder={handleMoveToFolder}
        />
      )}
      <main className="app__main">
        <header className="app__header">
          <h1 className="app__title">{activeWorkspace?.name ?? "No workspace selected"}</h1>
          <div className="app__header-status">
            <span className="app__mode-indicator" title="Press Tab to switch modes">
              {mode === "edit" ? "✎ Edit — Tab for Play" : "▶ Play — Tab to edit"}
            </span>
            <span className="app__midi-status">{midiStatus}</span>
          </div>
        </header>
        {activeWorkspace ? (
          <WorkspaceGrid
            workspace={activeWorkspace}
            editable={mode === "edit"}
            onChange={handleWorkspaceChange}
          />
        ) : (
          <div className="app__empty">Create a workspace to get started.</div>
        )}
      </main>
    </div>
  );
}
