import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { NoteRangeValue, VisualizationProps } from "../types";
import type { MidiSettings } from "../../../../shared/midiSettings";
import { noteNumberToName } from "../../../../shared/midi";
import "./MidiKeyboard.css";

export interface MidiKeyboardConfig {
  noteRange: NoteRangeValue;
  accentColor: string;
  inputDeviceId: string;
  /** 0 = All channels, 1-16 = specific. */
  inputChannel: number;
  outputDeviceId: string;
  /** 1-16 — there's no "All" for output, a message always goes out on one channel. */
  outputChannel: number;
}

/** Falls back to the old default range for workspace files saved before this field existed. */
const DEFAULT_NOTE_RANGE: NoteRangeValue = { low: 48, high: 108 };

const WHITE_PITCH_CLASSES = new Set([0, 2, 4, 5, 7, 9, 11]);

interface KeyInfo {
  note: number;
  isWhite: boolean;
  /** Position in white-key-width units, including half-steps for black keys. */
  x: number;
}

/**
 * Builds the key range [lowNote, highNote], clamped to the valid MIDI range.
 *
 * Returns exact left/right pixel bounds rather than assuming the range spans
 * [0, whiteCount * WHITE_KEY_WIDTH] — a low note that's itself a black key
 * (e.g. G#6) pokes half a black-key-width left of the first white key, which
 * a 0-based viewBox would clip.
 */
function buildKeys(lowNote: number, highNote: number): { keys: KeyInfo[]; left: number; right: number } {
  const firstNote = Math.max(0, Math.round(lowNote));
  const lastNote = Math.min(127, Math.round(highNote));
  const keys: KeyInfo[] = [];
  let whiteIndex = 0;
  for (let note = firstNote; note <= lastNote; note++) {
    const pitchClass = ((note % 12) + 12) % 12;
    if (WHITE_PITCH_CLASSES.has(pitchClass)) {
      keys.push({ note, isWhite: true, x: whiteIndex });
      whiteIndex += 1;
    } else {
      keys.push({ note, isWhite: false, x: whiteIndex - 0.5 });
    }
  }

  let left = 0;
  let right = whiteIndex * WHITE_KEY_WIDTH;
  for (const k of keys) {
    if (!k.isWhite) {
      left = Math.min(left, k.x * WHITE_KEY_WIDTH - BLACK_KEY_WIDTH / 2);
      right = Math.max(right, k.x * WHITE_KEY_WIDTH + BLACK_KEY_WIDTH / 2);
    }
  }

  return { keys, left, right };
}

const WHITE_KEY_WIDTH = 24;
const WHITE_KEY_HEIGHT = 120;
const BLACK_KEY_WIDTH = WHITE_KEY_WIDTH * 0.6;
const BLACK_KEY_HEIGHT = WHITE_KEY_HEIGHT * 0.6;

export function MidiKeyboard({ config, midi }: VisualizationProps<MidiKeyboardConfig>) {
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  const [midiSettings, setMidiSettings] = useState<MidiSettings>({ inputs: [], outputs: [] });

  const noteRange = config.noteRange ?? DEFAULT_NOTE_RANGE;

  useEffect(() => {
    // Refetch on focus, not just on mount: this instance stays mounted for as
    // long as its workspace does, but the named-device mapping it depends on
    // (inputSourceId below) is edited on a separate page (Settings), so a
    // mount-only fetch would go stale until the component happened to remount.
    function refresh(): void {
      window.api.midiSettings.get().then(setMidiSettings);
    }
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  const inputSourceId = useMemo(
    () => midiSettings.inputs.find((d) => d.id === config.inputDeviceId)?.sourceId,
    [midiSettings.inputs, config.inputDeviceId]
  );

  useEffect(() => {
    return midi.onMidiNote((event) => {
      if (event.source !== "device") return;
      if (config.inputDeviceId && event.portId !== inputSourceId) return;
      if (config.inputChannel !== 0 && event.channel !== config.inputChannel - 1) return;

      setActiveNotes((prev) => {
        const next = new Set(prev);
        if (event.type === "noteon") next.add(event.note);
        else next.delete(event.note);
        return next;
      });
    });
  }, [midi, config.inputDeviceId, config.inputChannel, inputSourceId]);

  const { keys, left, right } = useMemo(
    () => buildKeys(noteRange.low, noteRange.high),
    [noteRange.low, noteRange.high]
  );

  function playNoteOn(note: number): void {
    setActiveNotes((prev) => new Set(prev).add(note));
    midi.sendMidiNote({ type: "noteon", note, velocity: 100, channel: config.outputChannel - 1 });
  }

  function playNoteOff(note: number): void {
    setActiveNotes((prev) => {
      const next = new Set(prev);
      next.delete(note);
      return next;
    });
    midi.sendMidiNote({ type: "noteoff", note, velocity: 0, channel: config.outputChannel - 1 });
  }

  const svgStyle = { "--accent-color": config.accentColor } as CSSProperties;
  const firstNote = keys[0]?.note ?? noteRange.low;
  const lastNote = keys[keys.length - 1]?.note ?? noteRange.high;

  return (
    <div className="midi-keyboard">
      <svg
        viewBox={`${left} 0 ${right - left} ${WHITE_KEY_HEIGHT}`}
        className="midi-keyboard__svg"
        style={svgStyle}
        role="img"
        aria-label={`MIDI keyboard, ${noteNumberToName(firstNote)} to ${noteNumberToName(lastNote)}`}
      >
        {keys
          .filter((k) => k.isWhite)
          .map((k) => (
            <rect
              key={k.note}
              x={k.x * WHITE_KEY_WIDTH}
              y={0}
              width={WHITE_KEY_WIDTH}
              height={WHITE_KEY_HEIGHT}
              className={`midi-keyboard__key midi-keyboard__key--white${
                activeNotes.has(k.note) ? " midi-keyboard__key--active" : ""
              }`}
              onMouseDown={() => playNoteOn(k.note)}
              onMouseUp={() => playNoteOff(k.note)}
              onMouseLeave={() => playNoteOff(k.note)}
            />
          ))}
        {keys
          .filter((k) => !k.isWhite)
          .map((k) => (
            <rect
              key={k.note}
              x={k.x * WHITE_KEY_WIDTH - BLACK_KEY_WIDTH / 2}
              y={0}
              width={BLACK_KEY_WIDTH}
              height={BLACK_KEY_HEIGHT}
              className={`midi-keyboard__key midi-keyboard__key--black${
                activeNotes.has(k.note) ? " midi-keyboard__key--active" : ""
              }`}
              onMouseDown={() => playNoteOn(k.note)}
              onMouseUp={() => playNoteOff(k.note)}
              onMouseLeave={() => playNoteOff(k.note)}
            />
          ))}
      </svg>
    </div>
  );
}
