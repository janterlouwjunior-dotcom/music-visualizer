import { useEffect, useState } from "react";
import { ColorWheel, DualRangeSlider } from "@music-theory-viz/ui-kit";
import type { MidiSettings } from "../../../shared/midiSettings";
import { noteNumberToName } from "../../../shared/midi";
import type { ConfigFieldSchema, NoteRangeValue, TextAlign } from "./types";
import "./ComponentSettingsFields.css";

/** Field types that default to no caption of their own — a lone icon button
 * like the chord-symbol toggle is self-explanatory (it has its own title
 * tooltip). A field can still get a caption despite being one of these
 * types, by giving it a `group` (see groupFields below) — that's how
 * "Alignment" and the "Style" heading over Bold/Italic work. */
const ICON_ONLY_TYPES = new Set<ConfigFieldSchema["type"]>(["toggleButton", "flatSharp"]);

/** Field types small enough to sit flush against their neighbors instead of
 * getting the width a label-plus-dropdown field needs — independent of
 * whether a caption happens to be showing above them (see FieldGroup.compact
 * vs .label, which answer two different questions). */
const COMPACT_TYPES = new Set<ConfigFieldSchema["type"]>(["toggleButton", "align", "flatSharp"]);

interface FieldGroup {
  key: string;
  label: string | null;
  fields: ConfigFieldSchema[];
  compact: boolean;
}

/** Merges consecutive same-`group` fields into one captioned cluster (e.g. Bold+Italic under "Style"); every other field renders on its own, captioned unless it's one of ICON_ONLY_TYPES. */
function groupFields(schema: ConfigFieldSchema[]): FieldGroup[] {
  const groups: FieldGroup[] = [];
  for (const field of schema) {
    const compact = COMPACT_TYPES.has(field.type);
    if (field.group) {
      const last = groups[groups.length - 1];
      if (last && last.label === field.group) {
        last.fields.push(field);
        last.compact = last.compact && compact;
        continue;
      }
      groups.push({ key: field.group, label: field.group, fields: [field], compact });
    } else {
      groups.push({
        key: field.key,
        label: ICON_ONLY_TYPES.has(field.type) ? null : field.label,
        fields: [field],
        compact
      });
    }
  }
  return groups;
}

function AlignmentIcon({ align }: { align: TextAlign }) {
  const widths = [12, 8, 10];
  const xFor = (w: number): number => (align === "left" ? 0 : align === "right" ? 16 - w : (16 - w) / 2);
  return (
    <svg width="16" height="12" viewBox="0 0 16 12" aria-hidden="true">
      {widths.map((w, i) => (
        <rect key={i} x={xFor(w)} y={i * 4.5} width={w} height="2" rx="1" fill="currentColor" />
      ))}
    </svg>
  );
}

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
      {groupFields(schema).map((group) => {
        return (
          <div
            key={group.key}
            className={`component-settings__field${group.compact ? " component-settings__field--icon" : ""}`}
          >
            {group.label && <label className="component-settings__label">{group.label}</label>}
            {group.fields.length > 1 ? (
              <div className="component-settings__button-row">
                {group.fields.map((field) => (
                  <span key={field.key}>{renderField(field, config, onConfigChange, midiSettings)}</span>
                ))}
              </div>
            ) : (
              renderField(group.fields[0], config, onConfigChange, midiSettings)
            )}
          </div>
        );
      })}
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

    case "note": {
      const noteValue = Number(value ?? 60);
      return (
        <select
          className="component-settings__select"
          value={noteValue}
          onChange={(e) => onConfigChange({ [field.key]: Number(e.target.value) })}
        >
          {Array.from({ length: 128 }, (_, note) => (
            <option key={note} value={note}>
              {noteNumberToName(note)}
            </option>
          ))}
        </select>
      );
    }

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
      const minGap = field.minGap ?? 0;
      const maxGap = field.maxGap ?? Infinity;
      const range = (value as NoteRangeValue | undefined) ?? { low: min, high: max };

      // Mirrors DualRangeSlider's own clampLow/clampHigh so typing a number
      // here can't produce a range the slider itself would never allow.
      function clampLow(candidate: number): number {
        let next = Math.min(candidate, range.high - minGap);
        next = Math.max(next, range.high - maxGap);
        return Math.max(min, Math.round(next));
      }
      function clampHigh(candidate: number): number {
        let next = Math.max(candidate, range.low + minGap);
        next = Math.min(next, range.low + maxGap);
        return Math.min(max, Math.round(next));
      }

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
          {/* Beside the slider, not stacked underneath it — a field this
              much taller than a plain dropdown already stands out in the
              settings bar without also being three rows deep. */}
          <div className="component-settings__note-range-numbers">
            <input
              type="number"
              className="component-settings__number"
              title="Lowest key"
              min={min}
              max={max}
              value={range.low}
              onChange={(e) => {
                const raw = Number(e.target.value);
                if (!Number.isFinite(raw)) return;
                onConfigChange({
                  [field.key]: { low: clampLow(raw), high: range.high } satisfies NoteRangeValue
                });
              }}
            />
            <span className="component-settings__note-range-sep">–</span>
            <input
              type="number"
              className="component-settings__number"
              title="Highest key"
              min={min}
              max={max}
              value={range.high}
              onChange={(e) => {
                const raw = Number(e.target.value);
                if (!Number.isFinite(raw)) return;
                onConfigChange({
                  [field.key]: { low: range.low, high: clampHigh(raw) } satisfies NoteRangeValue
                });
              }}
            />
          </div>
        </div>
      );
    }

    case "toggleButton":
      return (
        <button
          type="button"
          className={`component-settings__toggle${value ? " component-settings__toggle--active" : ""}`}
          style={field.iconStyle}
          onClick={() => onConfigChange({ [field.key]: !value })}
          title={field.label}
          aria-pressed={Boolean(value)}
        >
          {field.icon ?? field.label}
        </button>
      );

    case "align": {
      const current = (value as TextAlign | undefined) ?? "left";
      return (
        <div className="component-settings__button-row" role="group" aria-label={field.label}>
          {(["left", "center", "right"] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              className={`component-settings__toggle${current === opt ? " component-settings__toggle--active" : ""}`}
              onClick={() => onConfigChange({ [field.key]: opt })}
              title={`Align ${opt}`}
              aria-pressed={current === opt}
            >
              <AlignmentIcon align={opt} />
            </button>
          ))}
        </div>
      );
    }

    case "flatSharp": {
      const isFlats = Boolean(value);
      return (
        <div className="component-settings__button-row" role="group" aria-label={field.label}>
          <button
            type="button"
            className={`component-settings__toggle${!isFlats ? " component-settings__toggle--active" : ""}`}
            onClick={() => onConfigChange({ [field.key]: false })}
            title="Sharps"
            aria-pressed={!isFlats}
          >
            ♯
          </button>
          <button
            type="button"
            className={`component-settings__toggle${isFlats ? " component-settings__toggle--active" : ""}`}
            onClick={() => onConfigChange({ [field.key]: true })}
            title="Flats"
            aria-pressed={isFlats}
          >
            ♭
          </button>
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
              {d.name}
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
