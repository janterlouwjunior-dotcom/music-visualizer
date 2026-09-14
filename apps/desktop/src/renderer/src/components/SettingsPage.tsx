import { useEffect, useState } from "react";
import { Button, Panel } from "@music-theory-viz/ui-kit";
import type { MidiInputDevice, MidiOutputDevice } from "../../../shared/midiSettings";
import { midiService, type MidiPortInfo } from "../midi/midiService";
import "./SettingsPage.css";

interface SettingsPageProps {
  onClose: () => void;
}

export function SettingsPage({ onClose }: SettingsPageProps) {
  const [inputs, setInputs] = useState<MidiInputDevice[]>([]);
  const [outputs, setOutputs] = useState<MidiOutputDevice[]>([]);
  const [availableInputs, setAvailableInputs] = useState<MidiPortInfo[]>([]);
  const [availableOutputs, setAvailableOutputs] = useState<MidiPortInfo[]>([]);

  const [addingInput, setAddingInput] = useState(false);
  const [newInputName, setNewInputName] = useState("");
  const [newInputSourceId, setNewInputSourceId] = useState("");

  const [addingOutput, setAddingOutput] = useState(false);
  const [newOutputName, setNewOutputName] = useState("");
  const [newOutputSourceId, setNewOutputSourceId] = useState("");

  async function refresh(): Promise<void> {
    const settings = await window.api.midiSettings.get();
    setInputs(settings.inputs);
    setOutputs(settings.outputs);
  }

  function refreshAvailablePorts(): void {
    setAvailableInputs(midiService.listAvailableInputs());
    setAvailableOutputs(midiService.listAvailableOutputs());
  }

  useEffect(() => {
    refresh();
    midiService.init().then(refreshAvailablePorts);
    return midiService.onDeviceChange(refreshAvailablePorts);
  }, []);

  async function handleAddInput(): Promise<void> {
    if (!newInputName.trim() || !newInputSourceId) return;
    await window.api.midiSettings.addInput(newInputName.trim(), newInputSourceId);
    setNewInputName("");
    setNewInputSourceId("");
    setAddingInput(false);
    await refresh();
  }

  async function handleDeleteInput(id: string): Promise<void> {
    await window.api.midiSettings.deleteInput(id);
    await refresh();
  }

  async function handleAddOutput(): Promise<void> {
    if (!newOutputName.trim() || !newOutputSourceId) return;
    await window.api.midiSettings.addOutput(newOutputName.trim(), newOutputSourceId);
    setNewOutputName("");
    setNewOutputSourceId("");
    setAddingOutput(false);
    await refresh();
  }

  async function handleDeleteOutput(id: string): Promise<void> {
    await window.api.midiSettings.deleteOutput(id);
    await refresh();
  }

  function resolveSourceLabel(sourceId: string, available: MidiPortInfo[]): string {
    return available.find((d) => d.id === sourceId)?.name ?? "Not currently connected";
  }

  function isSourceConnected(sourceId: string, available: MidiPortInfo[]): boolean {
    return available.some((d) => d.id === sourceId);
  }

  return (
    <div className="settings-page">
      <header className="settings-page__header">
        <button className="settings-page__back" onClick={onClose}>
          ← Back
        </button>
        <h1 className="settings-page__title">Settings</h1>
      </header>

      <div className="settings-page__body">
        <Panel
          className="settings-page__section"
          title="MIDI input devices"
          actions={
            <Button variant="primary" size="sm" onClick={() => setAddingInput((v) => !v)}>
              + Add input
            </Button>
          }
        >
          <p className="settings-page__hint">
            Name a controller here so visualizations can be pointed at it by name.
          </p>

          {addingInput && (
            <div className="settings-page__form">
              <input
                className="settings-page__text-input"
                placeholder='Name (e.g. "Classroom keyboard")'
                value={newInputName}
                onChange={(e) => setNewInputName(e.target.value)}
                autoFocus
              />
              <select
                className="settings-page__select"
                value={newInputSourceId}
                onChange={(e) => setNewInputSourceId(e.target.value)}
              >
                <option value="">Select a MIDI controller…</option>
                {availableInputs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              {availableInputs.length === 0 && (
                <p className="settings-page__hint settings-page__hint--warning">
                  No MIDI input devices detected. Plug one in — this list updates live.
                </p>
              )}
              <div className="settings-page__form-actions">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleAddInput}
                  disabled={!newInputName.trim() || !newInputSourceId}
                >
                  Add
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setAddingInput(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          <ul className="settings-page__list">
            {inputs.map((device) => (
              <li key={device.id} className="settings-page__item">
                <div>
                  <div className="settings-page__item-name">{device.name}</div>
                  <div
                    className={`settings-page__item-detail${
                      isSourceConnected(device.sourceId, availableInputs)
                        ? ""
                        : " settings-page__item-detail--pending"
                    }`}
                  >
                    {resolveSourceLabel(device.sourceId, availableInputs)}
                  </div>
                </div>
                <button
                  className="settings-page__remove"
                  title="Remove"
                  onClick={() => handleDeleteInput(device.id)}
                >
                  ✕
                </button>
              </li>
            ))}
            {inputs.length === 0 && (
              <li className="settings-page__empty">No input devices configured yet.</li>
            )}
          </ul>
        </Panel>

        <Panel
          className="settings-page__section"
          title="MIDI output devices"
          actions={
            <Button variant="primary" size="sm" onClick={() => setAddingOutput((v) => !v)}>
              + Add output
            </Button>
          }
        >
          <p className="settings-page__hint">
            This app doesn't create MIDI ports of its own — Windows has no built-in way to add a
            "virtual" one. Create a named virtual port first in a tool like{" "}
            <strong>loopMIDI</strong> (any name you like, e.g. "Lesson synth out"), point Bitwig
            (or whatever DAW) at that same port, then select it below — this list updates live as
            soon as loopMIDI creates it.
          </p>

          {addingOutput && (
            <div className="settings-page__form">
              <input
                className="settings-page__text-input"
                placeholder='Name (e.g. "Lesson synth out")'
                value={newOutputName}
                onChange={(e) => setNewOutputName(e.target.value)}
                autoFocus
              />
              <select
                className="settings-page__select"
                value={newOutputSourceId}
                onChange={(e) => setNewOutputSourceId(e.target.value)}
              >
                <option value="">Select a MIDI output…</option>
                {availableOutputs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              {availableOutputs.length === 0 && (
                <p className="settings-page__hint settings-page__hint--warning">
                  No MIDI output ports detected — create one in loopMIDI first. This list updates
                  live once it exists.
                </p>
              )}
              <div className="settings-page__form-actions">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleAddOutput}
                  disabled={!newOutputName.trim() || !newOutputSourceId}
                >
                  Add
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setAddingOutput(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          <ul className="settings-page__list">
            {outputs.map((device) => (
              <li key={device.id} className="settings-page__item">
                <div>
                  <div className="settings-page__item-name">{device.name}</div>
                  <div
                    className={`settings-page__item-detail${
                      isSourceConnected(device.sourceId, availableOutputs)
                        ? ""
                        : " settings-page__item-detail--pending"
                    }`}
                  >
                    {resolveSourceLabel(device.sourceId, availableOutputs)}
                  </div>
                </div>
                <button
                  className="settings-page__remove"
                  title="Remove"
                  onClick={() => handleDeleteOutput(device.id)}
                >
                  ✕
                </button>
              </li>
            ))}
            {outputs.length === 0 && (
              <li className="settings-page__empty">No output devices configured yet.</li>
            )}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
