import type { VisualizationDefinition } from "./types";
import { CircleOfFifths, type CircleOfFifthsConfig } from "./visualizations/CircleOfFifths";
import { MidiKeyboard, type MidiKeyboardConfig } from "./visualizations/MidiKeyboard";

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
  },
  "midi-keyboard": {
    key: "midi-keyboard",
    name: "MIDI Keyboard",
    description: "A playable piano with a customizable key range — highlights incoming notes and plays back out.",
    icon: "🎹",
    configSchema: [
      { key: "numberOfKeys", label: "Number of keys", type: "number", min: 24, max: 88 },
      { key: "accentColor", label: "Accent color", type: "color" },
      { key: "inputDeviceId", label: "MIDI input device", type: "midiInputDevice" },
      { key: "inputChannel", label: "Input channel", type: "midiInputChannel" },
      { key: "outputDeviceId", label: "MIDI output device", type: "midiOutputDevice" },
      { key: "outputChannel", label: "Output channel", type: "midiOutputChannel" }
    ],
    defaultProps: {
      numberOfKeys: 61,
      accentColor: "#6c8cff",
      inputDeviceId: "",
      inputChannel: 0,
      outputDeviceId: "",
      outputChannel: 1
    } satisfies MidiKeyboardConfig,
    defaultSize: { w: 8, h: 3 },
    component: MidiKeyboard
  }
};

export function getVisualizationDefinition(key: string): VisualizationDefinition<any> | undefined {
  return componentRegistry[key];
}

export function listVisualizationDefinitions(): VisualizationDefinition<any>[] {
  return Object.values(componentRegistry);
}
