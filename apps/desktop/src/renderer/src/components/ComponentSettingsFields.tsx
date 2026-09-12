import { useEffect, useState } from "react";
import { ColorWheel, DualRangeSlider } from "@music-theory-viz/ui-kit";
import type { MidiSettings } from "../../../shared/midiSettings";
import { noteNumberToName } from "../../../shared/midi";
import type { ConfigFieldSchema, NoteRangeValue } from "./types";
import "./ComponentSettingsFields.css";

interface ComponentSettingsFieldsProps {
  schema: ConfigFieldSchema[];
  config: Record<string, unknown>;
  onConfigChange: (partial: Record<string, unknown>) => void;
}

const INPUT_CHANNEL_OPTIONS = [
  { value: "0", label: "All channels" },
  ...Array.from({ length: 16 }, (_, i) => ({ value: String(i + 1), label: `Channel ${i + 1}` }))
];

const OUTPUT_CHANNEL_OPTIONS = Array.from({ length: 16 }, (_, i) => ({
  value: String(i + 1),
  label: `Channel ${i + 1}`
}));

/**
 * Renders one form control per field in a component's configSchema. This is
 * the single place that knows how to draw each field type — components never
 * build their own settings UI, they just declare a schema (see registry.ts).
 */
export function ComponentSettingsFields({
  schema,
  config,
  onConfigChange
}: ComponentSettingsFieldsProps) {
  const [midiSettings, setMidiSettings] = useState<MidiSettings>({ inputs: [], outputs: [] });
  const needsMidiSettings = schema.some(
    (f) => f.type === "midiInputDevice" || f.type === "midiOutputDevice"
  );

  useEffect(() => {
    if (needsMidiSettings) {
      window.api.midiSettings.get().then(setMidiSettings);
    }
  }, [needsMidiSettings]);

  return (
    <div className="component-settings">
      {schema.map((field) => (
        <div key={field.key} className="component-settings__field">
          <label className="component-settings__label">{field.label}</label>
          {renderField(field, config, onConfigChange, midiSettings)}
        </div>
      ))}
    </div>
  );
}

function renderField(
  field: ConfigFieldSchema,
  config: Record<string, unknown>,
  onConfigChange: (partial: Record<string, unknown>) => void,
  midiSettings: MidiSettings
) {
  const value = config[field.key];

  switch (field.type) {
    case "select":
      return (
        <select
          className="component-settings__select"
          value={String(value ?? "")}
          onChange={(e) => onConfigChange({ [field.key]: e.target.value })}
        >
          {(field.options ?? []).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );

    case "boolean":
      return (
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onConfigChange({ [field.key]: e.target.checked })}
        />
      );

    case "text":
      return (
        <input
          className="component-settings__text"
          type="text"
          value={String(value ?? "")}
          onChange={(e) => onConfigChange({ [field.key]: e.target.value })}
        />
      );

    case "number":
      return (
        <input
          className="component-settings__number"
          type="number"
          min={field.min}
          max={field.max}
          value={Number(value ?? field.min ?? 0)}
          onChange={(e) => {
            const raw = Number(e.target.value);
            if (!Number.isFinite(raw)) return;
            const clamped = Math.min(
              field.max ?? Infinity,
              Math.max(field.min ?? -Infinity, Math.round(raw))
            );
            onConfigChange({ [field.key]: clamped });
          }}
        />
      );

    case "color":
      return (
        <ColorWheel
          value={String(value ?? "#6c8cff")}
          onChange={(hex) => onConfigChange({ [field.key]: hex })}
          size={110}
        />
      );

    case "noteRange": {
      const min = field.min ?? 0;
      const max = field.max ?? 127;
      const range = (value as NoteRangeValue | undefined) ?? { low: min, high: max };
      return (
        <div className="component-settings__note-range">
          <DualRangeSlider
            min={min}
            max={max}
            low={range.low}
            high={range.high}
            minGap={field.minGap}
            maxGap={field.maxGap}
            formatLabel={noteNumberToName}
            onChange={(low, high) => onConfigChange({ [field.key]: { low, high } satisfies NoteRangeValue })}
          />
          <div className="component-settings__note-range-count">
            {range.high - range.low + 1} keys
          </div>
        </div>
      );
    }

    case "midiInputDevice":
      return (
        <select
          className="component-settings__select"
          value={String(value ?? "")}
          onChange={(e) => onConfigChange({ [field.key]: e.target.value })}
        >
          <option value="">None</option>
          {midiSettings.inputs.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      );

    case "midiOutputDevice":
      return (
        <select
          className="component-settings__select"
          value={String(value ?? "")}
          onChange={(e) => onConfigChange({ [field.key]: e.target.value })}
        >
          <option value="">None</option>
          {midiSettings.outputs.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} (not yet connected)
            </option>
          ))}
        </select>
      );

    case "midiInputChannel":
      return (
        <select
          className="component-settings__select"
          value={String(value ?? 0)}
          onChange={(e) => onConfigChange({ [field.key]: Number(e.target.value) })}
        >
          {INPUT_CHANNEL_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );

    case "midiOutputChannel":
      return (
        <select
          className="component-settings__select"
          value={String(value ?? 1)}
          onChange={(e) => onConfigChange({ [field.key]: Number(e.target.value) })}
        >
          {OUTPUT_CHANNEL_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );

    default:
      return null;
  }
}
