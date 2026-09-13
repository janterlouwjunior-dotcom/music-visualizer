import type { MidiNoteEvent } from "../../../shared/midi";

/**
 * Thin wrapper around the Web MIDI API (supported natively by Chromium, so no
 * native Node module / node-gyp toolchain is needed for the prototype).
 * TypeScript's DOM lib already ships MIDIAccess/MIDIInput/MIDIOutput types.
 *
 * This talks to whatever real MIDI devices are already connected — it does not
 * yet create a virtual MIDI port of its own. Acting as a virtual device for
 * Bitwig routing (virtualMIDI SDK on Windows, CoreMIDI on Mac) is a
 * distribution-phase feature, not required to prove the onMidiNote contract.
 */

type Handler = (event: MidiNoteEvent) => void;

export interface MidiInitResult {
  ok: boolean;
  reason?: string;
}

export interface MidiDeviceInfo {
  inputs: string[];
  outputs: string[];
}

export interface MidiPortInfo {
  id: string;
  name: string;
}

// navigator.requestMIDIAccess() deadlocks the ENTIRE renderer (not just the
// MIDI call) roughly 28-30 seconds after being invoked, on at least this
// machine — confirmed by isolated testing: a 1s heartbeat interval, all click
// handling, and even Electron's own webContents "unresponsive" hang detector
// all stop dead at that point, every run, only when this call is made. Wrapping
// it in a timeout does NOT help: the timeout only stops OUR code from awaiting
// the promise, the underlying OS-level device enumeration keeps running
// in Chromium and still deadlocks the render thread later regardless. With no
// freeze at all (95+s clean) when this call is skipped entirely, the hang is
// coming from Chromium's/Windows' MIDI device enumeration itself, most likely
// tripped up by one of the many virtual-MIDI-port-creating apps installed on
// this machine (loopMIDI, Bome MIDI Translator, a DAW's MIDI bridge, etc.).
// Disabled until that's tracked down — flip this back on to re-test once a
// candidate driver has been removed/disabled.
const MIDI_ENABLED = false;

class MidiService {
  private access: MIDIAccess | null = null;
  private handlers = new Set<Handler>();
  private deviceChangeHandlers = new Set<() => void>();
  private initPromise: Promise<MidiInitResult> | null = null;

  async init(): Promise<MidiInitResult> {
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      if (!MIDI_ENABLED) {
        return {
          ok: false,
          reason: "MIDI disabled on this machine — see the MIDI_ENABLED comment in midiService.ts"
        };
      }
      if (typeof navigator.requestMIDIAccess !== "function") {
        return { ok: false, reason: "Web MIDI API not available in this runtime" };
      }
      try {
        this.access = await navigator.requestMIDIAccess();
        this.attachAll();
        this.access.onstatechange = () => {
          this.attachAll();
          for (const handler of this.deviceChangeHandlers) handler();
        };
        return { ok: true };
      } catch (err) {
        return { ok: false, reason: err instanceof Error ? err.message : String(err) };
      }
    })();

    return this.initPromise;
  }

  private attachAll(): void {
    if (!this.access) return;
    for (const input of this.access.inputs.values()) {
      input.onmidimessage = (event) => this.handleMessage(event, input.id);
    }
  }

  private handleMessage(event: MIDIMessageEvent, portId: string): void {
    const data = event.data;
    if (!data || data.length < 3) return;
    const [statusByte, note, velocity] = data;
    const command = statusByte & 0xf0;
    const channel = statusByte & 0x0f;

    if (command === 0x90 && velocity > 0) {
      this.dispatch({ type: "noteon", note, velocity, channel, source: "device", portId });
    } else if (command === 0x80 || (command === 0x90 && velocity === 0)) {
      this.dispatch({ type: "noteoff", note, velocity, channel, source: "device", portId });
    }
  }

  private dispatch(event: MidiNoteEvent): void {
    for (const handler of this.handlers) handler(event);
  }

  /** Subscribe to note on/off events from any connected input, or internally-sent notes. */
  subscribe(handler: Handler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  /** Emit a note out to all connected MIDI outputs (e.g. a track pointed at Bitwig), and echo locally. */
  send(event: Omit<MidiNoteEvent, "source">): void {
    const status = (event.type === "noteon" ? 0x90 : 0x80) | (event.channel & 0x0f);
    const bytes = [status, event.note & 0x7f, event.velocity & 0x7f];

    if (this.access) {
      for (const output of this.access.outputs.values()) {
        output.send(bytes);
      }
    }

    this.dispatch({ ...event, source: "internal" });
  }

  getDeviceInfo(): MidiDeviceInfo {
    if (!this.access) return { inputs: [], outputs: [] };
    return {
      inputs: Array.from(this.access.inputs.values()).map((i) => i.name ?? "Unnamed input"),
      outputs: Array.from(this.access.outputs.values()).map((o) => o.name ?? "Unnamed output")
    };
  }

  /** Connected MIDI inputs as {id, name} pairs, for device-picker dropdowns. */
  listInputs(): MidiPortInfo[] {
    if (!this.access) return [];
    return Array.from(this.access.inputs.values()).map((i) => ({
      id: i.id,
      name: i.name ?? "Unnamed input"
    }));
  }

  /** Notified whenever a MIDI device is plugged in or unplugged. */
  onDeviceChange(handler: () => void): () => void {
    this.deviceChangeHandlers.add(handler);
    return () => this.deviceChangeHandlers.delete(handler);
  }
}

export const midiService = new MidiService();
