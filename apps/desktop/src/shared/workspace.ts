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

export interface Workspace {
  id: string;
  name: string;
  layout: ComponentInstance[];
}

export interface WorkspaceSummary {
  id: string;
  name: string;
}
