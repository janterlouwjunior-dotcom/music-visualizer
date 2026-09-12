/**
 * MIDI note event shape used by the component contract's onMidiNote hook.
 * Handled entirely in the renderer via the Web MIDI API (Chromium supports it
 * natively) — no native Node MIDI bindings needed for the prototype.
 */
export interface MidiNoteEvent {
  type: "noteon" | "noteoff";
  note: number;
  velocity: number;
  channel: number;
  source: "device" | "internal";
}
