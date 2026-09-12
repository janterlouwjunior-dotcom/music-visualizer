import type { ComponentType } from "react";
import type { MidiNoteEvent } from "../../../shared/midi";

export interface ConfigFieldSchema {
  key: string;
  label: string;
  type: "select" | "boolean" | "text" | "number";
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
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
}

export interface VisualizationDefinition<TProps = Record<string, unknown>> {
  key: string;
  name: string;
  description: string;
  /** Placeholder thumbnail for the component picker — swap for real icons later. */
  icon: string;
  configSchema: ConfigFieldSchema[];
  defaultProps: TProps;
  defaultSize: { w: number; h: number };
  component: ComponentType<VisualizationProps<TProps>>;
}
