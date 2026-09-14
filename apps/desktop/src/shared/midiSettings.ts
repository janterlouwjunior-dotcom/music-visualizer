/**
 * User-configured named MIDI devices, managed from the global Settings page.
 *
 * Both inputs and outputs point at a real port now (sourceId — a port name
 * from main/nativeMidi.ts's native MIDI backend, resolved against whatever's
 * actually connected when the app is used). Outputs used to be placeholders
 * — the old Web MIDI-based approach could only send to a port that already
 * existed, and had no native module to create a virtual one of its own — but
 * the native backend (see nativeMidi.ts) can open and send to any real
 * output port directly, so there's no reason left to keep that distinction.
 */
export interface MidiInputDevice {
  id: string;
  name: string;
  sourceId: string;
}

export interface MidiOutputDevice {
  id: string;
  name: string;
  sourceId: string;
}

export interface MidiSettings {
  inputs: MidiInputDevice[];
  outputs: MidiOutputDevice[];
}
