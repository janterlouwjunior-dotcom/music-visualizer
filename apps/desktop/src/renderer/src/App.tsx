import { useCallback, useEffect, useRef, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { WorkspaceGrid } from "./components/WorkspaceGrid";
import { SettingsPage } from "./components/SettingsPage";
import type { Workspace, WorkspaceFolder, WorkspaceSummary } from "../../shared/workspace";
import type { UpdaterStatus } from "../../shared/updater";
import { midiService } from "./midi/midiService";
import "./App.css";

type Mode = "edit" | "play";
type View = "workspace" | "settings";

export function App() {
  const [summaries, setSummaries] = useState<WorkspaceSummary[]>([]);
  const [folders, setFolders] = useState<WorkspaceFolder[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null);
  const [midiStatus, setMidiStatus] = useState<string>("Initializing MIDI…");
  const [mode, setMode] = useState<Mode>("edit");
  const [view, setView] = useState<View>("workspace");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [updaterStatus, setUpdaterStatus] = useState<UpdaterStatus | null>(null);
  const saveTimer = useRef<number | null>(null);
  const saveTimerWorkspaceId = useRef<string | null>(null);

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
      try {
        const [list] = await Promise.all([refreshSummaries(), refreshFolders()]);
        if (list.length > 0) {
          const first = await window.api.workspaces.load(list[0].id);
          setActiveWorkspace(first);
        }
      } catch (err) {
        console.error("Failed to load workspaces:", err);
        setLoadError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, [refreshSummaries, refreshFolders]);

  useEffect(() => window.api.updater.onStatus(setUpdaterStatus), []);

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
      if (view !== "workspace") return;

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
  }, [activeWorkspace, summaries, view]);

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
    // A pending debounced autosave (see handleWorkspaceChange) captured this
    // workspace's data in its closure — if it's for the workspace being
    // deleted, letting it fire afterward would recreate the just-deleted
    // file. Only clear it when it actually belongs to `id`: the timer can be
    // pending for whichever workspace was active when it was scheduled, not
    // necessarily the one being deleted here (the Sidebar can delete any
    // workspace, not just the active one).
    if (saveTimer.current && saveTimerWorkspaceId.current === id) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
      saveTimerWorkspaceId.current = null;
    }
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
    saveTimerWorkspaceId.current = next.id;
    saveTimer.current = window.setTimeout(() => {
      window.api.workspaces.save(next).catch((err) => {
        console.error("Failed to save workspace:", err);
      });
    }, 400);
  }

  if (view === "settings") {
    return (
      <div className="app">
        <SettingsPage onClose={() => setView("workspace")} />
      </div>
    );
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
          onOpenSettings={() => setView("settings")}
        />
      )}
      <main className="app__main">
        <header className="app__header">
          <h1 className="app__title">{activeWorkspace?.name ?? "No workspace selected"}</h1>
          <div className="app__header-status">
            {updaterStatus?.status === "downloading" && (
              <span className="app__update-status">
                Downloading update… {Math.round(updaterStatus.percent ?? 0)}%
              </span>
            )}
            {updaterStatus?.status === "ready" && (
              <button
                className="app__update-button"
                onClick={() => window.api.updater.install()}
                title="Restart to finish installing the downloaded update"
              >
                ⭳ Restart &amp; update
              </button>
            )}
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
          <div className="app__empty">
            {loadError
              ? `Couldn't load workspaces: ${loadError}. Check that your workspace files aren't corrupted.`
              : "Create a workspace to get started."}
          </div>
        )}
      </main>
    </div>
  );
}
