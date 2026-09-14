import { utilityProcess, type UtilityProcess } from "electron";
import { join } from "path";
import { getMidiSettings } from "./midiSettings";
import type { MidiDeviceInfo, MidiInitResult, MidiNoteEvent } from "../shared/midi";

// If the worker's native RtMidi calls ever hang (see midiWorker.ts), this
// caps how long the rest of the app waits before treating MIDI as simply
// unavailable and killing the stuck process.
const STARTUP_TIMEOUT_MS = 5000;
const SHUTDOWN_TIMEOUT_MS = 1500;
// Real MIDI enumeration/open calls on at least one machine this app has run
// on have shown genuine intermittent flakiness — succeeding instantly on one
// launch and hanging on the very next with nothing else on the machine
// having changed. A couple of automatic retries meaningfully improves the
// odds of catching a good pass, since the synchronous native calls give no
// way to time out or skip just the one slow port from inside the worker.
const MAX_START_ATTEMPTS = 3;
const RETRY_DELAY_MS = 300;

type WorkerMessage =
  | { type: "status"; available: MidiDeviceInfo; active: MidiDeviceInfo }
  | { type: "note"; event: MidiNoteEvent }
  | { type: "shutdownComplete" };

class NativeMidiService {
  private child: UtilityProcess | null = null;
  private availablePorts: MidiDeviceInfo = { inputs: [], outputs: [] };
  private activePorts: MidiDeviceInfo = { inputs: [], outputs: [] };
  private noteHandlers = new Set<(event: MidiNoteEvent) => void>();
  private deviceChangeHandlers = new Set<() => void>();
  private startPromise: Promise<MidiInitResult> | null = null;
  private shuttingDown = false;

  start(): Promise<MidiInitResult> {
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.startWithRetries();
    return this.startPromise;
  }

  private async startWithRetries(): Promise<MidiInitResult> {
    let lastResult: MidiInitResult = { ok: false, reason: "Never attempted" };
    for (let attempt = 1; attempt <= MAX_START_ATTEMPTS; attempt++) {
      if (this.shuttingDown) return { ok: false, reason: "App is quitting" };
      lastResult = await this.attemptStart();
      if (lastResult.ok || this.shuttingDown) return lastResult;
      if (attempt < MAX_START_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
    return lastResult;
  }

  private async attemptStart(): Promise<MidiInitResult> {
    // Only the ports the user has actually picked in Settings get opened —
    // never every port on the system. Passed as a fork argument rather than
    // a follow-up message: it's synchronously available to the worker from
    // its very first line, so the first status message it sends already
    // reflects the real selection, with no race over whether that message
    // landed before or after an initial "here's your config" message would
    // have arrived.
    const settings = await getMidiSettings();
    const initialConfig = JSON.stringify({
      inputs: settings.inputs.map((d) => d.sourceId),
      outputs: settings.outputs.map((d) => d.sourceId)
    });

    return new Promise((resolve) => {
      let settled = false;
      const settle = (result: MidiInitResult): void => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      let child: UtilityProcess;
      try {
        child = utilityProcess.fork(join(__dirname, "midiWorker.js"), [initialConfig], {
          stdio: "pipe"
        });
      } catch (err) {
        settle({ ok: false, reason: err instanceof Error ? err.message : String(err) });
        return;
      }
      this.child = child;
      child.stdout?.on("data", (data: Buffer) => console.log("[midi worker]", data.toString().trim()));
      child.stderr?.on("data", (data: Buffer) => console.error("[midi worker]", data.toString().trim()));

      const timeout = setTimeout(() => {
        settle({ ok: false, reason: "Timed out starting the MIDI process" });
        child.kill();
        this.child = null;
      }, STARTUP_TIMEOUT_MS);

      child.on("message", (msg: WorkerMessage) => {
        if (msg.type === "status") {
          this.availablePorts = msg.available;
          this.activePorts = msg.active;
          clearTimeout(timeout);
          settle({ ok: true });
          for (const handler of this.deviceChangeHandlers) handler();
        } else if (msg.type === "note") {
          for (const handler of this.noteHandlers) handler(msg.event);
        }
      });

      child.on("exit", (code) => {
        clearTimeout(timeout);
        settle({ ok: false, reason: `MIDI process exited unexpectedly (code ${code})` });
        this.child = null;
      });
    });
  }

  /** Currently open/active ports — what's actually connected right now. */
  getDeviceInfo(): MidiDeviceInfo {
    return this.activePorts;
  }

  /** Every port visible on the system, for Settings' device pickers — not just the selected ones. */
  getAvailablePorts(): MidiDeviceInfo {
    return this.availablePorts;
  }

  /**
   * Re-reads the saved MIDI settings and tells the running worker to open
   * whatever's newly selected and close whatever was deselected. Call this
   * after any change to the settings (add/remove an input or output) so the
   * change takes effect immediately rather than only on next launch.
   */
  async reconfigure(): Promise<void> {
    if (!this.child) return;
    const settings = await getMidiSettings();
    this.child.postMessage({
      type: "reconfigure",
      inputs: settings.inputs.map((d) => d.sourceId),
      outputs: settings.outputs.map((d) => d.sourceId)
    });
  }

  sendNote(event: Omit<MidiNoteEvent, "source">): void {
    this.child?.postMessage({ type: "send", event });
  }

  onNote(handler: (event: MidiNoteEvent) => void): () => void {
    this.noteHandlers.add(handler);
    return () => this.noteHandlers.delete(handler);
  }

  /** Notified whenever the available or active port lists change (hot-plug, or a Settings edit). */
  onDeviceChange(handler: () => void): () => void {
    this.deviceChangeHandlers.add(handler);
    return () => this.deviceChangeHandlers.delete(handler);
  }

  /**
   * Closes every open port before the app quits — done here, entirely
   * within the main process, rather than asking the (possibly unhealthy)
   * renderer to do it. A port left open when the process just dies has, on
   * at least this machine, sometimes left the underlying driver in a state
   * that hangs the *next* launch's MIDI startup — see midiWorker.ts.
   */
  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    const child = this.child;
    if (!child) return;
    this.child = null;
    this.startPromise = null;

    await new Promise<void>((resolve) => {
      let done = false;
      const finish = (): void => {
        if (done) return;
        done = true;
        resolve();
      };
      const timeout = setTimeout(() => {
        child.kill();
        finish();
      }, SHUTDOWN_TIMEOUT_MS);
      child.on("message", (msg: WorkerMessage) => {
        if (msg.type === "shutdownComplete") {
          clearTimeout(timeout);
          child.kill();
          finish();
        }
      });
      child.postMessage({ type: "shutdown" });
    });
  }
}

export const nativeMidi = new NativeMidiService();
