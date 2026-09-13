import { useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
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
  onRenameWorkspace: (id: string, name: string) => void;
  onRenameFolder: (id: string, name: string) => void;
  onMoveToFolder: (workspaceId: string, folderId: string | null) => void;
  onOpenSettings: () => void;
}

/** The one thing being renamed at a time, if any. */
interface RenameTarget {
  type: "workspace" | "folder";
  id: string;
}

// Custom MIME type rather than "text/plain" so a dropped workspace id can
// never be confused with a plain-text drag from somewhere else in the app.
const DRAG_MIME = "application/x-mtv-workspace-id";

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
  onRenameWorkspace,
  onRenameFolder,
  onMoveToFolder,
  onOpenSettings
}: SidebarProps) {
  const [renaming, setRenaming] = useState<RenameTarget | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [dragOverUngrouped, setDragOverUngrouped] = useState(false);
  // Tracks how many nested dragenter/dragleave pairs deep we are for a drop
  // zone, since a leave fired when the pointer crosses onto a CHILD element
  // (e.g. a workspace row inside a folder) would otherwise clear the
  // highlight prematurely — only the leave that brings this back to 0 means
  // the pointer actually left the zone.
  const dragDepth = useRef(0);

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

  function startRenameWorkspace(ws: WorkspaceSummary): void {
    setRenaming({ type: "workspace", id: ws.id });
    setRenameValue(ws.name);
  }

  function startRenameFolder(folder: WorkspaceFolder): void {
    setRenaming({ type: "folder", id: folder.id });
    setRenameValue(folder.name);
  }

  function commitRename(): void {
    if (!renaming) return;
    const name = renameValue.trim();
    if (name) {
      if (renaming.type === "workspace") onRenameWorkspace(renaming.id, name);
      else onRenameFolder(renaming.id, name);
    }
    setRenaming(null);
  }

  function handleRenameKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "Enter") {
      e.preventDefault();
      commitRename();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setRenaming(null);
    }
  }

  function handleWorkspaceDragStart(e: DragEvent<HTMLLIElement>, workspaceId: string): void {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData(DRAG_MIME, workspaceId);
  }

  function handleFolderDragEnter(e: DragEvent<HTMLLIElement>, folderId: string): void {
    if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
    dragDepth.current += 1;
    setDragOverFolderId(folderId);
  }

  function handleFolderDragLeave(e: DragEvent<HTMLLIElement>): void {
    if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragOverFolderId(null);
  }

  function handleFolderDrop(e: DragEvent<HTMLLIElement>, folderId: string): void {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current = 0;
    setDragOverFolderId(null);
    const workspaceId = e.dataTransfer.getData(DRAG_MIME);
    if (workspaceId) onMoveToFolder(workspaceId, folderId);
  }

  function handleUngroupedDragEnter(e: DragEvent<HTMLUListElement>): void {
    if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
    setDragOverUngrouped(true);
  }

  function handleUngroupedDragLeave(e: DragEvent<HTMLUListElement>): void {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDragOverUngrouped(false);
  }

  function handleUngroupedDrop(e: DragEvent<HTMLUListElement>): void {
    e.preventDefault();
    setDragOverUngrouped(false);
    const workspaceId = e.dataTransfer.getData(DRAG_MIME);
    if (workspaceId) onMoveToFolder(workspaceId, null);
  }

  function renderWorkspaceRow(ws: WorkspaceSummary, nested: boolean) {
    const isRenaming = renaming?.type === "workspace" && renaming.id === ws.id;
    return (
      <li
        key={ws.id}
        draggable={!isRenaming}
        onDragStart={(e) => handleWorkspaceDragStart(e, ws.id)}
        className={[
          "sidebar__item",
          nested ? "sidebar__item--nested" : "",
          ws.id === activeId ? "sidebar__item--active" : ""
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {isRenaming ? (
          <input
            className="sidebar__rename-input"
            value={renameValue}
            autoFocus
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={handleRenameKeyDown}
            onBlur={commitRename}
          />
        ) : (
          <button
            className="sidebar__item-button"
            onClick={() => onSelect(ws.id)}
            onDoubleClick={() => startRenameWorkspace(ws)}
            title="Double-click to rename — drag onto a folder to move it there"
          >
            {ws.name}
          </button>
        )}
        <div className="sidebar__item-actions">
          <button
            className="sidebar__icon-button"
            title="Rename"
            onClick={() => startRenameWorkspace(ws)}
          >
            ✎
          </button>
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
        <button className="sidebar__icon-button" title="Settings" onClick={onOpenSettings}>
          ⚙
        </button>
      </div>
      <div className="sidebar__section-label">Workspaces</div>
      <ul
        className={`sidebar__list${dragOverUngrouped ? " sidebar__list--dragover" : ""}`}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes(DRAG_MIME)) e.preventDefault();
        }}
        onDragEnter={handleUngroupedDragEnter}
        onDragLeave={handleUngroupedDragLeave}
        onDrop={handleUngroupedDrop}
      >
        {folders.map((folder) => {
          const children = byFolder.get(folder.id) ?? [];
          const isActiveGroup = children.some((c) => c.id === activeId);
          const isRenamingFolder = renaming?.type === "folder" && renaming.id === folder.id;
          return (
            <li
              key={folder.id}
              className={`sidebar__folder${dragOverFolderId === folder.id ? " sidebar__folder--dragover" : ""}`}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes(DRAG_MIME)) e.preventDefault();
              }}
              onDragEnter={(e) => handleFolderDragEnter(e, folder.id)}
              onDragLeave={handleFolderDragLeave}
              onDrop={(e) => handleFolderDrop(e, folder.id)}
            >
              <div
                className={
                  isActiveGroup ? "sidebar__folder-header sidebar__folder-header--active" : "sidebar__folder-header"
                }
              >
                {isRenamingFolder ? (
                  <input
                    className="sidebar__rename-input sidebar__rename-input--folder"
                    value={renameValue}
                    autoFocus
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={handleRenameKeyDown}
                    onBlur={commitRename}
                  />
                ) : (
                  <button
                    className="sidebar__folder-button"
                    onClick={() => children[0] && onSelect(children[0].id)}
                    onDoubleClick={() => startRenameFolder(folder)}
                    disabled={children.length === 0}
                    title="Open this folder's first workspace — use ← / → to move between its workspaces, double-click to rename"
                  >
                    📁 {folder.name}
                  </button>
                )}
                <button
                  className="sidebar__icon-button"
                  title="Rename folder"
                  onClick={() => startRenameFolder(folder)}
                >
                  ✎
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
                    Empty — drag a workspace here.
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
