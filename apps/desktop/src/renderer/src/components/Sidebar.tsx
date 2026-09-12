import { Button } from "@music-theory-viz/ui-kit";
import type { WorkspaceSummary } from "../../../shared/workspace";
import "./Sidebar.css";

interface SidebarProps {
  workspaces: WorkspaceSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}

export function Sidebar({
  workspaces,
  activeId,
  onSelect,
  onCreate,
  onDuplicate,
  onDelete
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar__header">
        <span className="sidebar__brand">Music Theory Visualizer</span>
      </div>
      <div className="sidebar__section-label">Workspaces</div>
      <ul className="sidebar__list">
        {workspaces.map((ws) => (
          <li
            key={ws.id}
            className={
              ws.id === activeId ? "sidebar__item sidebar__item--active" : "sidebar__item"
            }
          >
            <button className="sidebar__item-button" onClick={() => onSelect(ws.id)}>
              {ws.name}
            </button>
            <div className="sidebar__item-actions">
              <button
                className="sidebar__icon-button"
                title="Duplicate"
                onClick={() => onDuplicate(ws.id)}
              >
                ⧉
              </button>
              <button
                className="sidebar__icon-button"
                title="Delete"
                onClick={() => onDelete(ws.id)}
              >
                ✕
              </button>
            </div>
          </li>
        ))}
        {workspaces.length === 0 && (
          <li className="sidebar__empty">No workspaces yet.</li>
        )}
      </ul>
      <div className="sidebar__footer">
        <Button variant="primary" size="sm" onClick={onCreate}>
          + New workspace
        </Button>
      </div>
    </aside>
  );
}
