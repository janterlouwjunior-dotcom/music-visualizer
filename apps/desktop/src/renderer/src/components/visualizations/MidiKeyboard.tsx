import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { VisualizationProps } from "../types";
import type { MidiSettings } from "../../../../shared/midiSettings";
import "./MidiKeyboard.css";

export interface MidiKeyboardConfig {
  numberOfKeys: number;
  accentColor: string;
  inputDeviceId: string;
  /** 0 = All channels, 1-16 = specific. */
  inputChannel: number;
  outputDeviceId: string;
  /** 1-16 — there's no "All" for output, a message always goes out on one channel. */
  outputChannel: number;
}

/** Top of an 88-key piano is C8 — shrinking numberOfKeys removes keys from the bottom. */
const TOP_NOTE = 108;
const WHITE_PITCH_CLASSES = new Set([0, 2, 4, 5, 7, 9, 11]);

interface KeyInfo {
  note: number;
  isWhite: boolean;
  /** Position in white-key-width units, including half-steps for black keys. */
  x: number;
}

function buildKeys(numberOfKeys: number): { keys: KeyInfo[]; whiteCount: number } {
  const startNote = TOP_NOTE - numberOfKeys + 1;
  const keys: KeyInfo[] = [];
  let whiteIndex = 0;
  for (let note = startNote; note <= TOP_NOTE; note++) {
    const pitchClass = ((note % 12) + 12) % 12;
    if (WHITE_PITCH_CLASSES.has(pitchClass)) {
      keys.push({ note, isWhite: true, x: whiteIndex });
      whiteIndex += 1;
    } else {
      keys.push({ note, isWhite: false, x: whiteIndex - 0.5 });
    }
  }
  return { keys, whiteCount: whiteIndex };
}

const WHITE_KEY_WIDTH = 24;
const WHITE_KEY_HEIGHT = 120;
const BLACK_KEY_WIDTH = WHITE_KEY_WIDTH * 0.6;
const BLACK_KEY_HEIGHT = WHITE_KEY_HEIGHT * 0.6;

export function MidiKeyboard({ config, midi }: VisualizationProps<MidiKeyboardConfig>) {
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  const [midiSettings, setMidiSettings] = useState<MidiSettings>({ inputs: [], outputs: [] });

  useEffect(() => {
    window.api.midiSettings.get().then(setMidiSettings);
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

  const { keys, whiteCount } = useMemo(() => buildKeys(config.numberOfKeys), [config.numberOfKeys]);

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

  const width = whiteCount * WHITE_KEY_WIDTH;
  const svgStyle = { "--accent-color": config.accentColor } as CSSProperties;

  return (
    <div className="midi-keyboard">
      <svg
        viewBox={`0 0 ${width} ${WHITE_KEY_HEIGHT}`}
        className="midi-keyboard__svg"
        style={svgStyle}
        role="img"
        aria-label={`${config.numberOfKeys}-key MIDI keyboard`}
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
