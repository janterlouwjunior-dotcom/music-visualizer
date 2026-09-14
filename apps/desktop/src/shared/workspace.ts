export interface ComponentInstance {
  /** Unique id of this placed instance within the workspace (not the registry key). */
  id: string;
  /** Registry key of the visualization component, e.g. "circle-of-fifths". */
  component: string;
  x: number;
  y: number;
  w: number;
  h: number;
  props?: Record<string, unknown>;
}

export interface GridSettings {
  /** Number of grid columns spanning the workspace width. */
  cols: number;
  /**
   * Number of grid rows spanning the workspace's available height — a
   * division count, like `cols`, not a pixel size. The actual per-row pixel
   * height is computed at render time from the container's measured height,
   * so the grid stays proportioned to whatever space is actually available
   * (e.g. the taller area Play mode gets back once edit-only chrome is
   * hidden) instead of a fixed pixel value drifting out of sync with it.
   */
  rows: number;
  /** Overlay faint column/row lines in edit mode, to help align components. */
  showGrid: boolean;
}

export const DEFAULT_GRID_SETTINGS: GridSettings = { cols: 12, rows: 8, showGrid: false };

export interface Workspace {
  id: string;
  name: string;
  /** Falls back to DEFAULT_GRID_SETTINGS when absent (older workspace files). */
  gridSettings?: GridSettings;
  /** Id of the WorkspaceFolder this workspace belongs to, if any. */
  folderId?: string;
  /** Sort position among sibling workspaces in the same folder — lower first. Falls back to name for older files that predate manual ordering (see Sidebar.tsx). */
  order?: number;
  layout: ComponentInstance[];
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  folderId?: string;
  order?: number;
}

/**
 * A folder groups workspaces as a "mother workspace" — selecting it opens its
 * first child, and the left/right arrow keys cycle between siblings (see
 * App.tsx's keydown handler). Folders themselves, and the workspaces within
 * each one, are both manually reorderable by dragging in the sidebar — see
 * WorkspaceFolder/Workspace's own storage order and Workspace.order,
 * respectively.
 */
export interface WorkspaceFolder {
  id: string;
  name: string;
}
