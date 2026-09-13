import type { MidiDeviceInfo, MidiInitResult, MidiNoteEvent } from "../../../shared/midi";

/**
 * Thin wrapper around the main process's native MIDI service (see
 * main/nativeMidi.ts and main/midiWorker.ts) — deliberately NOT the
 * browser's Web MIDI API. See the comment on MidiNoteEvent in shared/midi.ts
 * for why: navigator.requestMIDIAccess() deadlocks the entire renderer on at
 * least one real machine this app has run on, reproduced even in a bare
 * Electron app with none of this app's code involved.
 *
 * Keeps the exact same public shape the old Web-MIDI-backed version had
 * (init/subscribe/send/getDeviceInfo/listInputs/onDeviceChange) so nothing
 * elsewhere in the renderer needed to change when the transport did.
 */

type Handler = (event: MidiNoteEvent) => void;

export type { MidiInitResult, MidiDeviceInfo };

export interface MidiPortInfo {
  id: string;
  name: string;
}

class MidiService {
  private handlers = new Set<Handler>();
  private deviceChangeHandlers = new Set<() => void>();
  private deviceInfo: MidiDeviceInfo = { inputs: [], outputs: [] };
  private initPromise: Promise<MidiInitResult> | null = null;
  private wired = false;

  private wireBridgeOnce(): void {
    if (this.wired) return;
    this.wired = true;

    window.api.midi.onNote((event) => this.dispatch(event));
    window.api.midi.onDeviceChange(() => {
      window.api.midi.getDeviceInfo().then((info) => {
        this.deviceInfo = info;
        for (const handler of this.deviceChangeHandlers) handler();
      });
    });
  }

  async init(): Promise<MidiInitResult> {
    if (this.initPromise) return this.initPromise;
    this.wireBridgeOnce();

    this.initPromise = (async () => {
      const result = await window.api.midi.init();
      if (result.ok) {
        this.deviceInfo = await window.api.midi.getDeviceInfo();
      }
      return result;
    })();

    return this.initPromise;
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
    window.api.midi.send(event);
    this.dispatch({ ...event, source: "internal" });
  }

  getDeviceInfo(): MidiDeviceInfo {
    return this.deviceInfo;
  }

  /** Connected MIDI inputs as {id, name} pairs, for device-picker dropdowns. */
  listInputs(): MidiPortInfo[] {
    return this.deviceInfo.inputs.map((name) => ({ id: name, name }));
  }

  /** Notified whenever a MIDI device is plugged in or unplugged. */
  onDeviceChange(handler: () => void): () => void {
    this.deviceChangeHandlers.add(handler);
    return () => this.deviceChangeHandlers.delete(handler);
  }
}

export const midiService = new MidiService();
