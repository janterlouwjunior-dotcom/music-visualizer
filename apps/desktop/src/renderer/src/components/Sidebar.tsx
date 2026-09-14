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
  onReorderFolders: (orderedIds: string[]) => void;
  onMoveToFolder: (workspaceId: string, folderId: string) => void;
  onReorderWorkspaces: (folderId: string, orderedIds: string[]) => void;
  onOpenSettings: () => void;
}

/** The one thing being renamed at a time, if any. */
interface RenameTarget {
  type: "workspace" | "folder";
  id: string;
}

// Custom MIME types rather than "text/plain" so a dropped id can never be
// confused with a plain-text drag from somewhere else in the app, and so a
// folder drop (reorder) and a workspace drop (move into folder) — both
// landing on the same folder <li> — can be told apart.
const WORKSPACE_DRAG_MIME = "application/x-mtv-workspace-id";
const FOLDER_DRAG_MIME = "application/x-mtv-folder-id";

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
  onReorderFolders,
  onMoveToFolder,
  onReorderWorkspaces,
  onOpenSettings
}: SidebarProps) {
  const [renaming, setRenaming] = useState<RenameTarget | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [dragOverWorkspaceId, setDragOverWorkspaceId] = useState<string | null>(null);
  // Tracks how many nested dragenter/dragleave pairs deep we are for a drop
  // zone, since a leave fired when the pointer crosses onto a CHILD element
  // (e.g. a workspace row inside a folder) would otherwise clear the
  // highlight prematurely — only the leave that brings this back to 0 means
  // the pointer actually left the zone.
  const dragDepth = useRef(0);
  // A separate counter for row-level (workspace-reorder) drag tracking, kept
  // independent of dragDepth above — row handlers stopPropagation() so they
  // never touch the folder-level counter, but need their own since a row can
  // itself contain further nested elements (the rename input, action buttons).
  const rowDragDepth = useRef(0);

  // Every workspace belongs to exactly one folder now (see shared/workspace.ts
  // and main/folders.ts, which guarantee this) — no separate "ungrouped"
  // bucket or drop target.
  const byFolder = useMemo(() => {
    const map = new Map<string, WorkspaceSummary[]>();
    for (const ws of workspaces) {
      if (!ws.folderId) continue;
      const list = map.get(ws.folderId) ?? [];
      list.push(ws);
      map.set(ws.folderId, list);
    }
    // Falls back to name so legacy workspace files that predate manual
    // ordering (no `order` field) still read alphabetically rather than in
    // arbitrary directory-listing order.
    const byOrder = (a: WorkspaceSummary, b: WorkspaceSummary) => {
      const orderDiff = (a.order ?? Number.POSITIVE_INFINITY) - (b.order ?? Number.POSITIVE_INFINITY);
      return orderDiff !== 0 ? orderDiff : a.name.localeCompare(b.name);
    };
    for (const list of map.values()) list.sort(byOrder);
    return map;
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
    e.dataTransfer.setData(WORKSPACE_DRAG_MIME, workspaceId);
  }

  function handleFolderHeaderDragStart(e: DragEvent<HTMLDivElement>, folderId: string): void {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData(FOLDER_DRAG_MIME, folderId);
  }

  function isRelevantDrag(e: DragEvent): boolean {
    return e.dataTransfer.types.includes(WORKSPACE_DRAG_MIME) || e.dataTransfer.types.includes(FOLDER_DRAG_MIME);
  }

  function handleFolderDragEnter(e: DragEvent<HTMLLIElement>, folderId: string): void {
    if (!isRelevantDrag(e)) return;
    dragDepth.current += 1;
    setDragOverFolderId(folderId);
  }

  function handleFolderDragLeave(e: DragEvent<HTMLLIElement>): void {
    if (!isRelevantDrag(e)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragOverFolderId(null);
  }

  function handleFolderDrop(e: DragEvent<HTMLLIElement>, folderId: string): void {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current = 0;
    setDragOverFolderId(null);

    const draggedFolderId = e.dataTransfer.getData(FOLDER_DRAG_MIME);
    if (draggedFolderId) {
      if (draggedFolderId === folderId) return;
      const orderedIds = folders.map((f) => f.id).filter((id) => id !== draggedFolderId);
      const targetIndex = orderedIds.indexOf(folderId);
      orderedIds.splice(targetIndex, 0, draggedFolderId);
      onReorderFolders(orderedIds);
      return;
    }

    const workspaceId = e.dataTransfer.getData(WORKSPACE_DRAG_MIME);
    if (workspaceId) onMoveToFolder(workspaceId, folderId);
  }

  // Row-level handlers reorder a workspace among its siblings (dropping onto
  // another workspace row), as opposed to handleFolderDrop above which moves
  // a workspace INTO a folder (dropping onto the folder itself) or reorders
  // folders. Every handler here stopPropagation()s so these two layers of
  // drop zones — nested in the DOM, since rows sit inside their folder's
  // <li> — never both fire for the same drop.
  function handleWorkspaceDragOver(e: DragEvent<HTMLLIElement>): void {
    if (!isRelevantDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
  }

  function handleWorkspaceRowDragEnter(e: DragEvent<HTMLLIElement>, workspaceId: string): void {
    if (!isRelevantDrag(e)) return;
    e.stopPropagation();
    rowDragDepth.current += 1;
    setDragOverWorkspaceId(workspaceId);
  }

  function handleWorkspaceRowDragLeave(e: DragEvent<HTMLLIElement>): void {
    if (!isRelevantDrag(e)) return;
    e.stopPropagation();
    rowDragDepth.current = Math.max(0, rowDragDepth.current - 1);
    if (rowDragDepth.current === 0) setDragOverWorkspaceId(null);
  }

  function handleWorkspaceRowDrop(e: DragEvent<HTMLLIElement>, targetFolderId: string, targetWs: WorkspaceSummary): void {
    if (!isRelevantDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    rowDragDepth.current = 0;
    setDragOverWorkspaceId(null);

    const draggedFolderId = e.dataTransfer.getData(FOLDER_DRAG_MIME);
    if (draggedFolderId) return; // dropping a folder onto a workspace row doesn't mean anything

    const draggedId = e.dataTransfer.getData(WORKSPACE_DRAG_MIME);
    if (!draggedId || draggedId === targetWs.id) return;

    const draggedWs = workspaces.find((w) => w.id === draggedId);
    const siblingIds = (byFolder.get(targetFolderId) ?? []).map((w) => w.id).filter((id) => id !== draggedId);
    const targetIndex = siblingIds.indexOf(targetWs.id);
    siblingIds.splice(targetIndex, 0, draggedId);

    // Only hop folders first when the drag actually crosses one — otherwise
    // this is a same-folder reorder and onMoveToFolder would just be a
    // needless extra write (it always re-appends to the end of the folder,
    // which onReorderWorkspaces below immediately overrides anyway).
    if (draggedWs && draggedWs.folderId !== targetFolderId) {
      onMoveToFolder(draggedId, targetFolderId);
    }
    onReorderWorkspaces(targetFolderId, siblingIds);
  }

  function renderWorkspaceRow(ws: WorkspaceSummary, folderId: string) {
    const isRenaming = renaming?.type === "workspace" && renaming.id === ws.id;
    return (
      <li
        key={ws.id}
        draggable={!isRenaming}
        onDragStart={(e) => handleWorkspaceDragStart(e, ws.id)}
        onDragOver={handleWorkspaceDragOver}
        onDragEnter={(e) => handleWorkspaceRowDragEnter(e, ws.id)}
        onDragLeave={handleWorkspaceRowDragLeave}
        onDrop={(e) => handleWorkspaceRowDrop(e, folderId, ws)}
        className={[
          "sidebar__item",
          "sidebar__item--nested",
          ws.id === activeId ? "sidebar__item--active" : "",
          dragOverWorkspaceId === ws.id ? "sidebar__item--dragover" : ""
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
      <ul className="sidebar__list">
        {folders.map((folder) => {
          const children = byFolder.get(folder.id) ?? [];
          const isActiveGroup = children.some((c) => c.id === activeId);
          const isRenamingFolder = renaming?.type === "folder" && renaming.id === folder.id;
          const canDelete = children.length === 0 && folders.length > 1;
          return (
            <li
              key={folder.id}
              className={`sidebar__folder${dragOverFolderId === folder.id ? " sidebar__folder--dragover" : ""}`}
              onDragOver={(e) => {
                if (isRelevantDrag(e)) e.preventDefault();
              }}
              onDragEnter={(e) => handleFolderDragEnter(e, folder.id)}
              onDragLeave={handleFolderDragLeave}
              onDrop={(e) => handleFolderDrop(e, folder.id)}
            >
              <div
                draggable={!isRenamingFolder}
                onDragStart={(e) => handleFolderHeaderDragStart(e, folder.id)}
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
                    title="Open this folder's first workspace — use ← / → to move between its workspaces, drag to reorder folders, double-click to rename"
                  >
                    {folder.name}
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
                  title={
                    !canDelete
                      ? folders.length <= 1
                        ? "Can't delete the only folder"
                        : "Move or delete this folder's workspaces first"
                      : "Delete folder"
                  }
                  disabled={!canDelete}
                  onClick={() => onDeleteFolder(folder.id)}
                >
                  ✕
                </button>
              </div>
              <ul className="sidebar__folder-children">
                {children.map((ws) => renderWorkspaceRow(ws, folder.id))}
                {children.length === 0 && (
                  <li className="sidebar__empty sidebar__empty--nested">
                    Empty — drag a workspace here.
                  </li>
                )}
              </ul>
            </li>
          );
        })}
        {workspaces.length === 0 && folders.length === 0 && (
          <li className="sidebar__empty">No workspaces yet.</li>
        )}
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
