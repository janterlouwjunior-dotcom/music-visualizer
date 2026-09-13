/**
 * MIDI note event shape used by the component contract's onMidiNote hook.
 *
 * Handled by a native MIDI library (@julusian/midi, wrapping RtMidi) running
 * in its own Electron utility process — NOT the browser's Web MIDI API. On at
 * least this machine, Chromium's navigator.requestMIDIAccess() deadlocks the
 * entire renderer process ~30s after being called, reproduced even in a bare
 * Electron app with no code of ours involved, so it can't be used safely no
 * matter how it's wrapped on the JS side. Isolating the native library in its
 * own process means a hang there can only ever affect that one disposable
 * process — never the UI — and lets the main process apply a hard startup
 * timeout instead of hoping the call eventually settles.
 */
export interface MidiNoteEvent {
  type: "noteon" | "noteoff";
  note: number;
  velocity: number;
  /** 0-15, raw MIDI channel. */
  channel: number;
  source: "device" | "internal";
  /** Name of the input port that raised this event; undefined for internal/sent events. */
  portId?: string;
}

export interface MidiInitResult {
  ok: boolean;
  reason?: string;
}

export interface MidiDeviceInfo {
  inputs: string[];
  outputs: string[];
}

const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

/** MIDI note number to scientific pitch notation, e.g. 60 -> "C4" (middle C), 0 -> "C-1". */
export function noteNumberToName(note: number): string {
  const octave = Math.floor(note / 12) - 1;
  return `${NOTE_NAMES[((note % 12) + 12) % 12]}${octave}`;
}
