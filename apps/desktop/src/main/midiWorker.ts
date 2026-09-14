import { Input, Output } from "@julusian/midi";
import type { MidiDeviceInfo, MidiNoteEvent } from "../shared/midi";

/**
 * Runs as an isolated Electron utility process (forked by nativeMidi.ts) —
 * never in the main or renderer process. If RtMidi's native calls hang here
 * (the Windows MIDI driver stack on at least one real machine has proven
 * capable of exactly that, independent of any JS/Electron code — see the
 * comment on MidiNoteEvent in shared/midi.ts), the parent's startup timeout
 * just kills this process; the rest of the app never even notices.
 *
 * Only opens the ports the user has actually configured in Settings —
 * opening every port on the system was the original design and made things
 * strictly worse: with ~25 real ports (several multi-port hardware/network
 * interfaces), every port is one more chance for a single bad one to hang
 * the whole worker, for no benefit to a user who's only ever going to point
 * a component at one or two named devices.
 */

interface OpenInput {
  name: string;
  port: Input;
}

interface OpenOutput {
  name: string;
  port: Output;
}

// The initial selection arrives as a fork argument — synchronously available
// from the first line, unlike an IPC message, which could arrive either
// before or after this module's own startup postStatus() call and make
// "ready" ambiguous (reflecting an empty selection, or the real one,
// depending on a race). Later changes (adding/removing a device in Settings
// while the app is running) go through the "reconfigure" message instead.
const initialConfig = JSON.parse(process.argv[2] ?? '{"inputs":[],"outputs":[]}') as {
  inputs: string[];
  outputs: string[];
};
let wantedInputs = new Set<string>(initialConfig.inputs);
let wantedOutputs = new Set<string>(initialConfig.outputs);
let openInputs: OpenInput[] = [];
let openOutputs: OpenOutput[] = [];
let lastAvailableInputs: string[] = [];
let lastAvailableOutputs: string[] = [];

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

function closePort(name: string, list: OpenInput[] | OpenOutput[]): void {
  const index = list.findIndex((p) => p.name === name);
  if (index === -1) return;
  try {
    list[index].port.closePort();
  } catch {
    // A port that's already gone (unplugged) can't be closed again.
  }
  list.splice(index, 1);
}

/**
 * Reconciles the open ports against `wantedInputs`/`wantedOutputs` and
 * whatever's actually present on the system right now: opens a wanted port
 * that just became available, closes an open port that was deselected or
 * disappeared. Never touches a port that's already in the correct state, so
 * a hot-plug poll finding nothing changed does no native calls at all.
 */
function syncPorts(): { changed: boolean; active: MidiDeviceInfo } {
  let changed = false;
  const availableInputs = new Set(Input.getPortNames());
  const availableOutputs = new Set(Output.getPortNames());

  for (const { name } of [...openInputs]) {
    if (!wantedInputs.has(name) || !availableInputs.has(name)) {
      closePort(name, openInputs);
      changed = true;
    }
  }
  for (const { name } of [...openOutputs]) {
    if (!wantedOutputs.has(name) || !availableOutputs.has(name)) {
      closePort(name, openOutputs);
      changed = true;
    }
  }

  for (const name of wantedInputs) {
    if (!availableInputs.has(name) || openInputs.some((p) => p.name === name)) continue;
    try {
      const port = new Input();
      port.on("message", (_deltaTime, message) => handleMessage(name, message));
      port.openPortByName(name);
      openInputs.push({ name, port });
      changed = true;
    } catch {
      // Leave it unopened — the next poll will retry.
    }
  }
  for (const name of wantedOutputs) {
    if (!availableOutputs.has(name) || openOutputs.some((p) => p.name === name)) continue;
    try {
      const port = new Output();
      port.openPortByName(name);
      openOutputs.push({ name, port });
      changed = true;
    } catch {
      // Same as above.
    }
  }

  return {
    changed,
    active: { inputs: openInputs.map((i) => i.name), outputs: openOutputs.map((o) => o.name) }
  };
}

function postStatus(): void {
  const { active } = syncPorts();
  lastAvailableInputs = Input.getPortNames();
  lastAvailableOutputs = Output.getPortNames();
  process.parentPort.postMessage({
    type: "status",
    available: { inputs: lastAvailableInputs, outputs: lastAvailableOutputs },
    active
  });
}

interface ReconfigureMessage {
  type: "reconfigure";
  inputs: string[];
  outputs: string[];
}

interface SendMessage {
  type: "send";
  event: Omit<MidiNoteEvent, "source">;
}

interface ShutdownMessage {
  type: "shutdown";
}

process.parentPort.on("message", (e) => {
  const msg = e.data as ReconfigureMessage | SendMessage | ShutdownMessage;

  if (msg.type === "reconfigure") {
    wantedInputs = new Set(msg.inputs);
    wantedOutputs = new Set(msg.outputs);
    postStatus();
  } else if (msg.type === "send") {
    const status = (msg.event.type === "noteon" ? 0x90 : 0x80) | (msg.event.channel & 0x0f);
    const bytes = [status, msg.event.note & 0x7f, msg.event.velocity & 0x7f];
    // Only to the specific output the sending component is configured for —
    // never a fan-out to every open port. No outputPortId (nothing
    // configured) or a target that isn't currently open both mean "send
    // nowhere", not "send everywhere": a component with no output picked
    // should stay silent, not spray whatever else happens to be open.
    const targets = openOutputs.filter((o) => o.name === msg.event.outputPortId);
    for (const { port } of targets) {
      try {
        port.sendMessage(bytes);
      } catch {
        // A port that just got unplugged shouldn't crash the send fan-out.
      }
    }
  } else if (msg.type === "shutdown") {
    for (const { name } of [...openInputs]) closePort(name, openInputs);
    for (const { name } of [...openOutputs]) closePort(name, openOutputs);
    process.parentPort.postMessage({ type: "shutdownComplete" });
    process.exit(0);
  }
});

// Attempts to open whatever was selected at fork time (see initialConfig
// above) and reports both that and the full available-port list (for
// Settings' device pickers) back to the parent. This is the one and only
// "ready" signal nativeMidi.ts waits for — see the comment there.
postStatus();

// RtMidi has no cross-platform "device added/removed" event, so hot-plug
// detection is a cheap poll: re-derive available names and reconcile against
// what's wanted, only touching ports whose state actually needs to change.
setInterval(() => {
  const { changed, active } = syncPorts();
  const availableInputs = Input.getPortNames();
  const availableOutputs = Output.getPortNames();
  const sameAvailable =
    JSON.stringify(availableInputs) === JSON.stringify(lastAvailableInputs) &&
    JSON.stringify(availableOutputs) === JSON.stringify(lastAvailableOutputs);
  if (!changed && sameAvailable) return;

  lastAvailableInputs = availableInputs;
  lastAvailableOutputs = availableOutputs;
  process.parentPort.postMessage({
    type: "status",
    available: { inputs: availableInputs, outputs: availableOutputs },
    active
  });
}, 3000);
