import { useCallback, useEffect, useRef, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { WorkspaceGrid } from "./components/WorkspaceGrid";
import type { Workspace, WorkspaceSummary } from "../../shared/workspace";
import { midiService } from "./midi/midiService";
import "./App.css";

export function App() {
  const [summaries, setSummaries] = useState<WorkspaceSummary[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null);
  const [midiStatus, setMidiStatus] = useState<string>("Initializing MIDI…");
  const saveTimer = useRef<number | null>(null);

  const refreshSummaries = useCallback(async (): Promise<WorkspaceSummary[]> => {
    const list = await window.api.workspaces.list();
    setSummaries(list);
    return list;
  }, []);

  useEffect(() => {
    (async () => {
      const list = await refreshSummaries();
      if (list.length > 0) {
        const first = await window.api.workspaces.load(list[0].id);
        setActiveWorkspace(first);
      }
    })();
  }, [refreshSummaries]);

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

  function handleWorkspaceChange(next: Workspace): void {
    setActiveWorkspace(next);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      window.api.workspaces.save(next);
    }, 400);
  }

  return (
    <div className="app">
      <Sidebar
        workspaces={summaries}
        activeId={activeWorkspace?.id ?? null}
        onSelect={handleSelectWorkspace}
        onCreate={handleCreateWorkspace}
        onDuplicate={handleDuplicateWorkspace}
        onDelete={handleDeleteWorkspace}
      />
      <main className="app__main">
        <header className="app__header">
          <h1 className="app__title">{activeWorkspace?.name ?? "No workspace selected"}</h1>
          <div className="app__midi-status">{midiStatus}</div>
        </header>
        {activeWorkspace ? (
          <WorkspaceGrid workspace={activeWorkspace} onChange={handleWorkspaceChange} />
        ) : (
          <div className="app__empty">Create a workspace to get started.</div>
        )}
      </main>
    </div>
  );
}
