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
  layout: ComponentInstance[];
}

export interface WorkspaceSummary {
  id: string;
  name: string;
}
