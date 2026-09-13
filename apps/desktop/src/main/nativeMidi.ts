import { utilityProcess, type UtilityProcess } from "electron";
import { join } from "path";
import type { MidiDeviceInfo, MidiInitResult, MidiNoteEvent } from "../shared/midi";

// If the worker's native RtMidi calls ever hang (see midiWorker.ts), this
// caps how long the rest of the app waits before treating MIDI as simply
// unavailable and killing the stuck process.
const STARTUP_TIMEOUT_MS = 5000;
const SHUTDOWN_TIMEOUT_MS = 1500;

type WorkerMessage =
  | { type: "ready"; inputs: string[]; outputs: string[] }
  | { type: "devicechange"; inputs: string[]; outputs: string[] }
  | { type: "note"; event: MidiNoteEvent }
  | { type: "shutdownComplete" };

class NativeMidiService {
  private child: UtilityProcess | null = null;
  private deviceInfo: MidiDeviceInfo = { inputs: [], outputs: [] };
  private noteHandlers = new Set<(event: MidiNoteEvent) => void>();
  private deviceChangeHandlers = new Set<() => void>();
  private startPromise: Promise<MidiInitResult> | null = null;

  start(): Promise<MidiInitResult> {
    if (this.startPromise) return this.startPromise;

    this.startPromise = new Promise((resolve) => {
      let settled = false;
      const settle = (result: MidiInitResult): void => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      let child: UtilityProcess;
      try {
        child = utilityProcess.fork(join(__dirname, "midiWorker.js"));
      } catch (err) {
        settle({ ok: false, reason: err instanceof Error ? err.message : String(err) });
        return;
      }
      this.child = child;

      const timeout = setTimeout(() => {
        settle({ ok: false, reason: "Timed out starting the MIDI process" });
        child.kill();
        this.child = null;
      }, STARTUP_TIMEOUT_MS);

      child.on("message", (msg: WorkerMessage) => {
        if (msg.type === "ready") {
          clearTimeout(timeout);
          this.deviceInfo = { inputs: msg.inputs, outputs: msg.outputs };
          settle({ ok: true });
        } else if (msg.type === "devicechange") {
          this.deviceInfo = { inputs: msg.inputs, outputs: msg.outputs };
          for (const handler of this.deviceChangeHandlers) handler();
        } else if (msg.type === "note") {
          for (const handler of this.noteHandlers) handler(msg.event);
        }
      });

      child.on("exit", (code) => {
        settle({ ok: false, reason: `MIDI process exited unexpectedly (code ${code})` });
        this.child = null;
      });
    });

    return this.startPromise;
  }

  getDeviceInfo(): MidiDeviceInfo {
    return this.deviceInfo;
  }

  sendNote(event: Omit<MidiNoteEvent, "source">): void {
    this.child?.postMessage({ type: "send", event });
  }

  onNote(handler: (event: MidiNoteEvent) => void): () => void {
    this.noteHandlers.add(handler);
    return () => this.noteHandlers.delete(handler);
  }

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
