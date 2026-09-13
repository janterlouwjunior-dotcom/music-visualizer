import { Input, Output } from "@julusian/midi";
import type { MidiNoteEvent } from "../shared/midi";

/**
 * Runs as an isolated Electron utility process (forked by nativeMidi.ts) —
 * never in the main or renderer process. If RtMidi's native calls hang here
 * (the Windows MIDI driver stack on at least one real machine has proven
 * capable of exactly that, independent of any JS/Electron code — see the
 * comment on MidiNoteEvent in shared/midi.ts), the parent's startup timeout
 * just kills this process; the rest of the app never even notices.
 */

interface OpenInput {
  name: string;
  port: Input;
}

interface OpenOutput {
  name: string;
  port: Output;
}

let openInputs: OpenInput[] = [];
let openOutputs: OpenOutput[] = [];

function closeAll(): void {
  for (const { port } of openInputs) {
    try {
      port.closePort();
    } catch {
      // A port that's already gone (unplugged) can't be closed again.
    }
  }
  for (const { port } of openOutputs) {
    try {
      port.closePort();
    } catch {
      // Same as above.
    }
  }
  openInputs = [];
  openOutputs = [];
}

function handleMessage(portName: string, message: number[]): void {
  if (message.length < 3) return;
  const [statusByte, note, velocity] = message;
  const command = statusByte & 0xf0;
  const channel = statusByte & 0x0f;

  let event: MidiNoteEvent | null = null;
  if (command === 0x90 && velocity > 0) {
    event = { type: "noteon", note, velocity, channel, source: "device", portId: portName };
  } else if (command === 0x80 || (command === 0x90 && velocity === 0)) {
    event = { type: "noteoff", note, velocity, channel, source: "device", portId: portName };
  }
  if (event) {
    process.parentPort.postMessage({ type: "note", event });
  }
}

/** Closes and reopens every port, returning the names that are now open. */
function openAll(): { inputs: string[]; outputs: string[] } {
  closeAll();

  for (const name of Input.getPortNames()) {
    try {
      const port = new Input();
      port.on("message", (_deltaTime, message) => handleMessage(name, message));
      port.openPortByName(name);
      openInputs.push({ name, port });
    } catch {
      // Skip a port that fails to open rather than aborting every other one.
    }
  }

  for (const name of Output.getPortNames()) {
    try {
      const port = new Output();
      port.openPortByName(name);
      openOutputs.push({ name, port });
    } catch {
      // Same as above.
    }
  }

  return { inputs: openInputs.map((i) => i.name), outputs: openOutputs.map((o) => o.name) };
}

const initial = openAll();
process.parentPort.postMessage({ type: "ready", ...initial });

// RtMidi has no cross-platform "device added/removed" event, so hot-plug
// detection is a cheap poll: just compare port-name lists, and only actually
// tear down/reopen anything when they differ.
setInterval(() => {
  const currentInputs = Input.getPortNames();
  const currentOutputs = Output.getPortNames();
  const sameInputs =
    currentInputs.length === openInputs.length &&
    currentInputs.every((name, i) => name === openInputs[i].name);
  const sameOutputs =
    currentOutputs.length === openOutputs.length &&
    currentOutputs.every((name, i) => name === openOutputs[i].name);
  if (sameInputs && sameOutputs) return;

  const next = openAll();
  process.parentPort.postMessage({ type: "devicechange", ...next });
}, 3000);

interface SendMessage {
  type: "send";
  event: Omit<MidiNoteEvent, "source">;
}

interface ShutdownMessage {
  type: "shutdown";
}

process.parentPort.on("message", (e) => {
  const msg = e.data as SendMessage | ShutdownMessage;
  if (msg.type === "send") {
    const status = (msg.event.type === "noteon" ? 0x90 : 0x80) | (msg.event.channel & 0x0f);
    const bytes = [status, msg.event.note & 0x7f, msg.event.velocity & 0x7f];
    for (const { port } of openOutputs) {
      try {
        port.sendMessage(bytes);
      } catch {
        // A port that just got unplugged shouldn't crash the send fan-out.
      }
    }
  } else if (msg.type === "shutdown") {
    closeAll();
    process.parentPort.postMessage({ type: "shutdownComplete" });
    process.exit(0);
  }
});
