import { useMemo } from "react";
import { Button } from "@music-theory-viz/ui-kit";
import type { WorkspaceFolder, WorkspaceSummary } from "../../../shared/workspace";
import "./Sidebar.css";

interface SidebarProps {
  workspaces: WorkspaceSummary[];
  folders: WorkspaceFolder[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onCreateFolder: () => void;
  onDeleteFolder: (id: string) => void;
  onMoveToFolder: (workspaceId: string, folderId: string | null) => void;
}

export function Sidebar({
  workspaces,
  folders,
  activeId,
  onSelect,
  onCreate,
  onDuplicate,
  onDelete,
  onCreateFolder,
  onDeleteFolder,
  onMoveToFolder
}: SidebarProps) {
  const { byFolder, ungrouped } = useMemo(() => {
    const byFolder = new Map<string, WorkspaceSummary[]>();
    const ungrouped: WorkspaceSummary[] = [];
    for (const ws of workspaces) {
      if (ws.folderId) {
        const list = byFolder.get(ws.folderId) ?? [];
        list.push(ws);
        byFolder.set(ws.folderId, list);
      } else {
        ungrouped.push(ws);
      }
    }
    const byName = (a: WorkspaceSummary, b: WorkspaceSummary) => a.name.localeCompare(b.name);
    for (const list of byFolder.values()) list.sort(byName);
    ungrouped.sort(byName);
    return { byFolder, ungrouped };
  }, [workspaces]);

  function renderWorkspaceRow(ws: WorkspaceSummary, nested: boolean) {
    return (
      <li
        key={ws.id}
        className={[
          "sidebar__item",
          nested ? "sidebar__item--nested" : "",
          ws.id === activeId ? "sidebar__item--active" : ""
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <button className="sidebar__item-button" onClick={() => onSelect(ws.id)}>
          {ws.name}
        </button>
        <div className="sidebar__item-actions">
          <select
            className="sidebar__folder-select"
            value={ws.folderId ?? ""}
            title="Move to folder"
            onChange={(e) => onMoveToFolder(ws.id, e.target.value || null)}
          >
            <option value="">No folder</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <button
            className="sidebar__icon-button"
            title="Duplicate"
            onClick={() => onDuplicate(ws.id)}
          >
            ⧉
          </button>
          <button className="sidebar__icon-button" title="Delete" onClick={() => onDelete(ws.id)}>
            ✕
          </button>
        </div>
      </li>
    );
  }

  return (
    <aside className="sidebar">
      <div className="sidebar__header">
        <span className="sidebar__brand">Music Theory Visualizer</span>
      </div>
      <div className="sidebar__section-label">Workspaces</div>
      <ul className="sidebar__list">
        {folders.map((folder) => {
          const children = byFolder.get(folder.id) ?? [];
          const isActiveGroup = children.some((c) => c.id === activeId);
          return (
            <li key={folder.id} className="sidebar__folder">
              <div
                className={
                  isActiveGroup ? "sidebar__folder-header sidebar__folder-header--active" : "sidebar__folder-header"
                }
              >
                <button
                  className="sidebar__folder-button"
                  onClick={() => children[0] && onSelect(children[0].id)}
                  disabled={children.length === 0}
                  title="Open this folder's first workspace — use ← / → to move between its workspaces"
                >
                  📁 {folder.name}
                </button>
                <button
                  className="sidebar__icon-button"
                  title="Delete folder (workspaces inside are kept, just ungrouped)"
                  onClick={() => onDeleteFolder(folder.id)}
                >
                  ✕
                </button>
              </div>
              <ul className="sidebar__folder-children">
                {children.map((ws) => renderWorkspaceRow(ws, true))}
                {children.length === 0 && (
                  <li className="sidebar__empty sidebar__empty--nested">
                    Empty — move a workspace here below.
                  </li>
                )}
              </ul>
            </li>
          );
        })}
        {ungrouped.map((ws) => renderWorkspaceRow(ws, false))}
        {workspaces.length === 0 && <li className="sidebar__empty">No workspaces yet.</li>}
      </ul>
      <div className="sidebar__footer">
        <Button variant="primary" size="sm" onClick={onCreate}>
          + New workspace
        </Button>
        <Button variant="secondary" size="sm" onClick={onCreateFolder}>
          + New folder
        </Button>
      </div>
    </aside>
  );
}
