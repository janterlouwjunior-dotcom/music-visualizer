import type { VisualizationDefinition } from "./types";
import { CircleOfFifths, type CircleOfFifthsConfig } from "./visualizations/CircleOfFifths";

/**
 * Registry of every visualization component available to workspaces.
 * Add a new visualization by adding one entry here — never edit existing
 * entries' consumers (Sidebar, ComponentPicker, WorkspaceGrid) to support it.
 */
export const componentRegistry: Record<string, VisualizationDefinition<any>> = {
  "circle-of-fifths": {
    key: "circle-of-fifths",
    name: "Circle of Fifths",
    description: "Interactive circle of fifths — highlights a key and reacts to incoming MIDI notes.",
    icon: "🎯",
    configSchema: [
      {
        key: "highlightKey",
        label: "Key",
        type: "select",
        options: [
          "C",
          "G",
          "D",
          "A",
          "E",
          "B",
          "F♯",
          "D♭",
          "A♭",
          "E♭",
          "B♭",
          "F"
        ].map((k) => ({ value: k, label: k }))
      },
      { key: "listenForMidi", label: "Listen for MIDI", type: "boolean" }
    ],
    defaultProps: { highlightKey: "C", listenForMidi: true } satisfies CircleOfFifthsConfig,
    defaultSize: { w: 6, h: 6 },
    component: CircleOfFifths
  }
};

export function getVisualizationDefinition(key: string): VisualizationDefinition<any> | undefined {
  return componentRegistry[key];
}

export function listVisualizationDefinitions(): VisualizationDefinition<any>[] {
  return Object.values(componentRegistry);
}
