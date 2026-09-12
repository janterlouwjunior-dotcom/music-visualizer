import { app } from "electron";
import { promises as fs } from "fs";
import { join } from "path";
import type { MidiInputDevice, MidiOutputDevice, MidiSettings } from "../shared/midiSettings";
import { createSerialQueue } from "./serialQueue";

const runSerially = createSerialQueue();

function settingsPath(): string {
  return join(app.getPath("userData"), "midi-settings.json");
}

async function readSettings(): Promise<MidiSettings> {
  try {
    const raw = await fs.readFile(settingsPath(), "utf-8");
    const parsed = JSON.parse(raw) as Partial<MidiSettings>;
    return { inputs: parsed.inputs ?? [], outputs: parsed.outputs ?? [] };
  } catch {
    return { inputs: [], outputs: [] };
  }
}

async function writeSettings(settings: MidiSettings): Promise<void> {
  await fs.mkdir(app.getPath("userData"), { recursive: true });
  await fs.writeFile(settingsPath(), JSON.stringify(settings, null, 2), "utf-8");
}

export async function getMidiSettings(): Promise<MidiSettings> {
  return runSerially(() => readSettings());
}

export async function addMidiInput(name: string, sourceId: string): Promise<MidiInputDevice> {
  return runSerially(async () => {
    const settings = await readSettings();
    const device: MidiInputDevice = { id: `input-${Date.now().toString(36)}`, name, sourceId };
    settings.inputs.push(device);
    await writeSettings(settings);
    return device;
  });
}

export async function deleteMidiInput(id: string): Promise<void> {
  return runSerially(async () => {
    const settings = await readSettings();
    settings.inputs = settings.inputs.filter((d) => d.id !== id);
    await writeSettings(settings);
  });
}

export async function addMidiOutput(name: string): Promise<MidiOutputDevice> {
  return runSerially(async () => {
    const settings = await readSettings();
    const device: MidiOutputDevice = { id: `output-${Date.now().toString(36)}`, name };
    settings.outputs.push(device);
    await writeSettings(settings);
    return device;
  });
}

export async function deleteMidiOutput(id: string): Promise<void> {
  return runSerially(async () => {
    const settings = await readSettings();
    settings.outputs = settings.outputs.filter((d) => d.id !== id);
    await writeSettings(settings);
  });
}
