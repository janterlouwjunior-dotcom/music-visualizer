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

class MidiService {
  private access: MIDIAccess | null = null;
  private handlers = new Set<Handler>();
  private initPromise: Promise<MidiInitResult> | null = null;

  async init(): Promise<MidiInitResult> {
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      if (typeof navigator.requestMIDIAccess !== "function") {
        return { ok: false, reason: "Web MIDI API not available in this runtime" };
      }
      try {
        this.access = await navigator.requestMIDIAccess();
        this.attachAll();
        this.access.onstatechange = () => this.attachAll();
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
      input.onmidimessage = (event) => this.handleMessage(event);
    }
  }

  private handleMessage(event: MIDIMessageEvent): void {
    const data = event.data;
    if (!data || data.length < 3) return;
    const [statusByte, note, velocity] = data;
    const command = statusByte & 0xf0;
    const channel = statusByte & 0x0f;

    if (command === 0x90 && velocity > 0) {
      this.dispatch({ type: "noteon", note, velocity, channel, source: "device" });
    } else if (command === 0x80 || (command === 0x90 && velocity === 0)) {
      this.dispatch({ type: "noteoff", note, velocity, channel, source: "device" });
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
}

export const midiService = new MidiService();
