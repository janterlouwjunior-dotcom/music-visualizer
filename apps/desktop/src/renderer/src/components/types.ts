import type { ComponentType, CSSProperties } from "react";
import type { MidiNoteEvent } from "../../../shared/midi";

export type ConfigFieldType =
  | "select"
  | "boolean"
  | "text"
  | "number"
  | "color"
  | "noteRange"
  | "midiInputDevice"
  | "midiOutputDevice"
  | "midiInputChannel"
  | "midiOutputChannel"
  | "toggleButton"
  | "align"
  | "flatSharp"
  | "note";

/** Stored value shape for a "noteRange" field — MIDI note numbers, inclusive. */
export interface NoteRangeValue {
  low: number;
  high: number;
}

/** Stored value shape for an "align" field. */
export type TextAlign = "left" | "center" | "right";

export interface ConfigFieldSchema {
  key: string;
  label: string;
  type: ConfigFieldType;
  /** Static options, for type "select" only — device/channel fields source their own options. */
  options?: { value: string; label: string }[];
  /** For "number": the value's bounds. For "noteRange": the slider track's overall bounds. */
  min?: number;
  max?: number;
  /** For "noteRange" only: min/max allowed (high - low), e.g. a min/max key count minus one. */
  minGap?: number;
  maxGap?: number;
  /** For "toggleButton" only: the glyph shown on the button — falls back to `label` if omitted. */
  icon?: string;
  /** For "toggleButton" only: style applied to the glyph itself, e.g. { fontWeight: "bold" } for a "B" button. */
  iconStyle?: CSSProperties;
  /** Merges consecutive fields sharing the same group name under one shared label instead of each getting (or not getting) its own — e.g. "Bold" and "Italic" both under a single "Style" heading. */
  group?: string;
}

export interface MidiBridge {
  /** React to incoming note on/off events (from a connected device or another component's send). */
  onMidiNote: (handler: (event: MidiNoteEvent) => void) => () => void;
  /** Emit a note out to connected MIDI outputs (e.g. a Bitwig-pointed track). */
  sendMidiNote: (event: Omit<MidiNoteEvent, "source">) => void;
}

export interface VisualizationProps<TProps = Record<string, unknown>> {
  instanceId: string;
  config: TProps;
  onConfigChange: (next: Partial<TProps>) => void;
  midi: MidiBridge;
  /** True in Edit mode, false in Play mode — for components whose own rendering should differ (e.g. a text box only needs a scrollbar while it's being edited). */
  editable: boolean;
}

export interface VisualizationDefinition<TProps = Record<string, unknown>> {
  key: string;
  name: string;
  description: string;
  configSchema: ConfigFieldSchema[];
  defaultProps: TProps;
  defaultSize: { w: number; h: number };
  component: ComponentType<VisualizationProps<TProps>>;
}
