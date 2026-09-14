import type { MidiDeviceInfo, MidiInitResult, MidiNoteEvent } from "../../../shared/midi";

/**
 * Thin wrapper around the main process's native MIDI service (see
 * main/nativeMidi.ts and main/midiWorker.ts) — deliberately NOT the
 * browser's Web MIDI API. See the comment on MidiNoteEvent in shared/midi.ts
 * for why: navigator.requestMIDIAccess() deadlocks the entire renderer on at
 * least one real machine this app has run on, reproduced even in a bare
 * Electron app with none of this app's code involved.
 *
 * Only the ports named in the user's saved MIDI settings are ever actually
 * opened (see nativeMidi.ts) — "available" below means every port visible on
 * the system, for populating a Settings picker; "active"/getDeviceInfo means
 * just the ones currently open.
 */

type Handler = (event: MidiNoteEvent) => void;

export type { MidiInitResult, MidiDeviceInfo };

export interface MidiPortInfo {
  id: string;
  name: string;
}

function toPortInfoList(names: string[]): MidiPortInfo[] {
  return names.map((name) => ({ id: name, name }));
}

class MidiService {
  private handlers = new Set<Handler>();
  private deviceChangeHandlers = new Set<() => void>();
  private activePorts: MidiDeviceInfo = { inputs: [], outputs: [] };
  private availablePorts: MidiDeviceInfo = { inputs: [], outputs: [] };
  private initPromise: Promise<MidiInitResult> | null = null;
  private wired = false;

  private wireBridgeOnce(): void {
    if (this.wired) return;
    this.wired = true;

    window.api.midi.onNote((event) => this.dispatch(event));
    window.api.midi.onDeviceChange(() => {
      this.refreshCachedPorts().then(() => {
        for (const handler of this.deviceChangeHandlers) handler();
      });
    });
  }

  private async refreshCachedPorts(): Promise<void> {
    const [active, available] = await Promise.all([
      window.api.midi.getDeviceInfo(),
      window.api.midi.getAvailablePorts()
    ]);
    this.activePorts = active;
    this.availablePorts = available;
  }

  async init(): Promise<MidiInitResult> {
    if (this.initPromise) return this.initPromise;
    this.wireBridgeOnce();

    this.initPromise = (async () => {
      const result = await window.api.midi.init();
      await this.refreshCachedPorts();
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

  /** Emit a note out to all selected MIDI outputs (e.g. a track pointed at Bitwig), and echo locally. */
  send(event: Omit<MidiNoteEvent, "source">): void {
    window.api.midi.send(event);
    this.dispatch({ ...event, source: "internal" });
  }

  /** Currently open ports — what's actually connected and selected right now. */
  getDeviceInfo(): MidiDeviceInfo {
    return this.activePorts;
  }

  /** Every input port visible on the system, for Settings' "add input" picker. */
  listAvailableInputs(): MidiPortInfo[] {
    return toPortInfoList(this.availablePorts.inputs);
  }

  /** Every output port visible on the system, for Settings' "add output" picker. */
  listAvailableOutputs(): MidiPortInfo[] {
    return toPortInfoList(this.availablePorts.outputs);
  }

  /** Notified whenever the available or active port lists change (hot-plug, or a Settings edit). */
  onDeviceChange(handler: () => void): () => void {
    this.deviceChangeHandlers.add(handler);
    return () => this.deviceChangeHandlers.delete(handler);
  }
}

export const midiService = new MidiService();
