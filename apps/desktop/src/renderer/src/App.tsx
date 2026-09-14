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

  // Undo/redo history for the active workspace's layout/settings/component
  // props — anything that flows through handleWorkspaceChange. Plain refs
  // rather than state: nothing in the UI reflects stack contents (no
  // enabled/disabled undo button), so there's no reason to re-render on push.
  const undoStack = useRef<Workspace[]>([]);
  const redoStack = useRef<Workspace[]>([]);
  // The workspace state from just before the current burst of edits (e.g.
  // one drag, one resize, one slider drag) — flushed into undoStack once the
  // burst goes idle, so a whole gesture becomes one undo step instead of one
  // per intermediate onLayoutChange/onChange call.
  const pendingBeforeEdit = useRef<Workspace | null>(null);
  const burstTimer = useRef<number | null>(null);

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

  // Switching to a different workspace starts a fresh undo history — edits
  // to workspace A shouldn't be undoable after you've moved on to workspace
  // B. Undo/redo restoring a past version of the SAME workspace re-sets
  // activeWorkspace to an object with the same id, so this intentionally
  // doesn't fire then.
  useEffect(() => {
    undoStack.current = [];
    redoStack.current = [];
    pendingBeforeEdit.current = null;
    if (burstTimer.current) {
      window.clearTimeout(burstTimer.current);
      burstTimer.current = null;
    }
  }, [activeWorkspace?.id]);

  useEffect(() => {
    function describeActiveDevices(): string {
      const info = midiService.getDeviceInfo();
      return info.inputs.length || info.outputs.length
        ? `MIDI ready — ${info.inputs.length} in / ${info.outputs.length} out`
        : "MIDI ready — no devices selected";
    }

    midiService.init().then((result) => {
      setMidiStatus(result.ok ? describeActiveDevices() : `MIDI unavailable: ${result.reason}`);
    });

    // Keeps the header in sync with Settings: adding/removing a device there
    // takes effect on the running MIDI process immediately (see
    // nativeMidi.ts's reconfigure()), so the status text should update
    // immediately too, not just reflect whatever was active at startup.
    return midiService.onDeviceChange(() => setMidiStatus(describeActiveDevices()));
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

      // Left as native browser undo/redo while a text field has focus (e.g.
      // renaming a workspace), same as Tab above.
      if (!isFormControl && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) handleRedo();
        else handleUndo();
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
    // Every workspace lives in a folder — "the currently used folder" is
    // wherever the active workspace already is, falling back to the first
    // folder on the very first creation (before any workspace is active).
    const folderId = activeWorkspace?.folderId ?? folders[0]?.id;
    if (!folderId) return;
    const name = `New Workspace ${summaries.length + 1}`;
    const workspace = await window.api.workspaces.create(name, folderId);
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
    // The Sidebar already disables deleting a non-empty or the last
    // remaining folder — this is a defensive backstop against a stale UI
    // state (e.g. a workspace moved in from another window) racing the
    // click, not the primary way the user finds out it's blocked.
    try {
      await window.api.folders.delete(id);
      await refreshFolders();
    } catch (err) {
      console.error("Failed to delete folder:", err);
    }
  }

  async function handleReorderFolders(orderedIds: string[]): Promise<void> {
    await window.api.folders.reorder(orderedIds);
    await refreshFolders();
  }

  async function handleRenameWorkspace(id: string, name: string): Promise<void> {
    await window.api.workspaces.rename(id, name);
    await refreshSummaries();
    setActiveWorkspace((prev) => (prev && prev.id === id ? { ...prev, name } : prev));
  }

  async function handleRenameFolder(id: string, name: string): Promise<void> {
    await window.api.folders.rename(id, name);
    await refreshFolders();
  }

  async function handleMoveToFolder(workspaceId: string, folderId: string): Promise<void> {
    await window.api.workspaces.setFolder(workspaceId, folderId);
    await refreshSummaries();
    setActiveWorkspace((prev) => (prev && prev.id === workspaceId ? { ...prev, folderId } : prev));
  }

  async function handleReorderWorkspaces(folderId: string, orderedIds: string[]): Promise<void> {
    await window.api.workspaces.reorder(folderId, orderedIds);
    await refreshSummaries();
  }

  const UNDO_BURST_IDLE_MS = 500;
  const MAX_HISTORY = 100;

  /** Pushes the in-progress edit burst's "before" snapshot onto undoStack. */
  function commitPendingHistory(): void {
    if (burstTimer.current) {
      window.clearTimeout(burstTimer.current);
      burstTimer.current = null;
    }
    if (pendingBeforeEdit.current) {
      undoStack.current.push(pendingBeforeEdit.current);
      if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift();
      pendingBeforeEdit.current = null;
    }
  }

  function persistWorkspace(workspace: Workspace): void {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimerWorkspaceId.current = workspace.id;
    saveTimer.current = window.setTimeout(() => {
      window.api.workspaces.save(workspace).catch((err) => {
        console.error("Failed to save workspace:", err);
      });
    }, 400);
  }

  function handleWorkspaceChange(next: Workspace): void {
    // Capture the pre-burst snapshot the first time this fires after the
    // last commit — later calls within the same burst (e.g. every
    // intermediate step of one drag) leave it alone, so the whole burst
    // collapses into a single undo step. Reads activeWorkspace from this
    // render's closure rather than a setState updater, which Strict Mode
    // can invoke twice in development purely to detect impurities.
    if (activeWorkspace && pendingBeforeEdit.current === null) {
      pendingBeforeEdit.current = activeWorkspace;
    }
    setActiveWorkspace(next);
    redoStack.current = [];
    if (burstTimer.current) window.clearTimeout(burstTimer.current);
    burstTimer.current = window.setTimeout(commitPendingHistory, UNDO_BURST_IDLE_MS);
    persistWorkspace(next);
  }

  function handleUndo(): void {
    commitPendingHistory();
    const previous = undoStack.current.pop();
    if (!previous || !activeWorkspace) return;
    redoStack.current.push(activeWorkspace);
    setActiveWorkspace(previous);
    persistWorkspace(previous);
  }

  function handleRedo(): void {
    const next = redoStack.current.pop();
    if (!next || !activeWorkspace) return;
    undoStack.current.push(activeWorkspace);
    setActiveWorkspace(next);
    persistWorkspace(next);
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
          onRenameWorkspace={handleRenameWorkspace}
          onRenameFolder={handleRenameFolder}
          onReorderFolders={handleReorderFolders}
          onMoveToFolder={handleMoveToFolder}
          onReorderWorkspaces={handleReorderWorkspaces}
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
