/**
 * MIDI note event shape used by the component contract's onMidiNote hook.
 * Handled entirely in the renderer via the Web MIDI API (Chromium supports it
 * natively) — no native Node MIDI bindings needed for the prototype.
 */
export interface MidiNoteEvent {
  type: "noteon" | "noteoff";
  note: number;
  velocity: number;
  /** 0-15, raw MIDI channel. */
  channel: number;
  source: "device" | "internal";
  /** Web MIDI input port id that raised this event; undefined for internal/sent events. */
  portId?: string;
}

const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

/** MIDI note number to scientific pitch notation, e.g. 60 -> "C4" (middle C), 0 -> "C-1". */
export function noteNumberToName(note: number): string {
  const octave = Math.floor(note / 12) - 1;
  return `${NOTE_NAMES[((note % 12) + 12) % 12]}${octave}`;
}
