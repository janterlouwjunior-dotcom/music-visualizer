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
  /** Height in pixels of a single grid row unit. */
  rowHeight: number;
}

export const DEFAULT_GRID_SETTINGS: GridSettings = { cols: 12, rowHeight: 40 };

export interface Workspace {
  id: string;
  name: string;
  /** Falls back to DEFAULT_GRID_SETTINGS when absent (older workspace files). */
  gridSettings?: GridSettings;
  /** Id of the WorkspaceFolder this workspace belongs to, if any. */
  folderId?: string;
  layout: ComponentInstance[];
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  folderId?: string;
}

/**
 * A folder groups workspaces as a "mother workspace" — selecting it opens its
 * first child, and the left/right arrow keys cycle between siblings (see
 * App.tsx's keydown handler). Child order is alphabetical by workspace name,
 * not manually sortable, to keep this a lightweight grouping mechanism rather
 * than a second layout system.
 */
export interface WorkspaceFolder {
  id: string;
  name: string;
}
