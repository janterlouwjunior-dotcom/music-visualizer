/**
 * User-configured named MIDI devices, managed from the global Settings page.
 *
 * Inputs are real today: sourceId is a Web MIDI MIDIInput.id, resolved against
 * whatever's connected when the app is used.
 *
 * Outputs are placeholders for now — Web MIDI can only send to ports that
 * already exist, it cannot create a new virtual one that other apps (like
 * Bitwig) would see. Creating a real virtual output needs a native MIDI
 * module and, on Windows, bundling a virtual-port driver SDK — deliberately
 * deferred (see README). An output entry here just reserves a name so
 * components can be pointed at it once that's wired up.
 */
export interface MidiInputDevice {
  id: string;
  name: string;
  sourceId: string;
}

export interface MidiOutputDevice {
  id: string;
  name: string;
}

export interface MidiSettings {
  inputs: MidiInputDevice[];
  outputs: MidiOutputDevice[];
}
