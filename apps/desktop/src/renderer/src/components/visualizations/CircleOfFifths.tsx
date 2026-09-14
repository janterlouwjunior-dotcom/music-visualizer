import { useEffect, useMemo, useRef, useState } from "react";
import type { VisualizationProps } from "../types";
import type { MidiSettings } from "../../../../shared/midiSettings";
import { identifyChord } from "../../../../shared/chordAnalysis";
import "./CircleOfFifths.css";

export interface CircleOfFifthsConfig {
  /** Show the recognized chord symbol in the center of the circle. */
  showChordSymbol: boolean;
  /** Spell the played chord's root/bass with flats instead of sharps. */
  useFlats: boolean;
  inputDeviceId: string;
  /** 0 = All channels, 1-16 = specific. */
  inputChannel: number;
  outputDeviceId: string;
  /** 1-16 — there's no "All" for output, a message always goes out on one channel. */
  outputChannel: number;
}

const SEGMENTS: { name: string; pitchClass: number }[] = [
  { name: "C", pitchClass: 0 },
  { name: "G", pitchClass: 7 },
  { name: "D", pitchClass: 2 },
  { name: "A", pitchClass: 9 },
  { name: "E", pitchClass: 4 },
  { name: "B", pitchClass: 11 },
  { name: "F♯", pitchClass: 6 },
  { name: "D♭", pitchClass: 1 },
  { name: "A♭", pitchClass: 8 },
  { name: "E♭", pitchClass: 3 },
  { name: "B♭", pitchClass: 10 },
  { name: "F", pitchClass: 5 }
];

const SIZE = 320;
const CENTER = SIZE / 2;
const OUTER_R = SIZE / 2 - 8;
const INNER_R = OUTER_R * 0.45;

function wedgePath(index: number): string {
  const startAngle = ((index * 30 - 90 - 15) * Math.PI) / 180;
  const endAngle = ((index * 30 - 90 + 15) * Math.PI) / 180;
  const x1o = CENTER + OUTER_R * Math.cos(startAngle);
  const y1o = CENTER + OUTER_R * Math.sin(startAngle);
  const x2o = CENTER + OUTER_R * Math.cos(endAngle);
  const y2o = CENTER + OUTER_R * Math.sin(endAngle);
  const x1i = CENTER + INNER_R * Math.cos(endAngle);
  const y1i = CENTER + INNER_R * Math.sin(endAngle);
  const x2i = CENTER + INNER_R * Math.cos(startAngle);
  const y2i = CENTER + INNER_R * Math.sin(startAngle);
  return `M ${x1o} ${y1o} A ${OUTER_R} ${OUTER_R} 0 0 1 ${x2o} ${y2o} L ${x1i} ${y1i} A ${INNER_R} ${INNER_R} 0 0 0 ${x2i} ${y2i} Z`;
}

function labelPosition(index: number): { x: number; y: number } {
  const midAngle = ((index * 30 - 90) * Math.PI) / 180;
  const r = (OUTER_R + INNER_R) / 2;
  return { x: CENTER + r * Math.cos(midAngle), y: CENTER + r * Math.sin(midAngle) };
}

const FLASH_DURATION_MS = 500;

export function CircleOfFifths({ config, midi, editable }: VisualizationProps<CircleOfFifthsConfig>) {
  // Real note numbers, not just pitch classes — chord recognition needs the
  // actual lowest-sounding note (for inversions/slash chords), which a
  // pitch-class-only set would have thrown away.
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  const [midiSettings, setMidiSettings] = useState<MidiSettings>({ inputs: [], outputs: [] });

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
  const outputSourceId = useMemo(
    () => midiSettings.outputs.find((d) => d.id === config.outputDeviceId)?.sourceId,
    [midiSettings.outputs, config.outputDeviceId]
  );

  useEffect(() => {
    // No input device selected means no reaction at all — not "listen to
    // everything." An "internal" event (this component's own wedge click, or
    // another visualization sending a note) still lights things up
    // regardless of the selected input, since that's not device input at
    // all; it's only actual incoming device notes that need an explicitly
    // matching device+channel to be accepted.
    if (!config.inputDeviceId) {
      setActiveNotes(new Set());
      return;
    }
    return midi.onMidiNote((event) => {
      if (event.source === "device") {
        if (event.portId !== inputSourceId) return;
        if (config.inputChannel !== 0 && event.channel !== config.inputChannel - 1) return;

        // Pass the incoming note through to this component's own configured
        // output, remapped onto its output channel — scoped to actual device
        // input only, not "internal" echoes (its own wedge clicks, or
        // another component's sends), which would otherwise double-send or
        // feedback-loop between components sharing an output.
        midi.sendMidiNote({
          type: event.type,
          note: event.note,
          velocity: event.velocity,
          channel: config.outputChannel - 1,
          outputPortId: outputSourceId
        });
      }
      setActiveNotes((prev) => {
        const next = new Set(prev);
        if (event.type === "noteon") next.add(event.note);
        else next.delete(event.note);
        return next;
      });
    });
  }, [config.inputDeviceId, config.inputChannel, config.outputChannel, inputSourceId, outputSourceId, midi]);

  const midiActive = useMemo(
    () => new Set([...activeNotes].map((n) => ((n % 12) + 12) % 12)),
    [activeNotes]
  );

  const chordSymbol = useMemo(
    () => (config.showChordSymbol ? identifyChord([...activeNotes], config.useFlats) : null),
    [config.showChordSymbol, config.useFlats, activeNotes]
  );

  // Play mode has no settings bar to show the flat/sharp checkbox changing,
  // so the global "." shortcut (see WorkspaceGrid.tsx, which toggles every
  // Circle of Fifths in the workspace at once) needs its own confirmation —
  // a brief flash of the new spelling in the middle of the circle. Skipped
  // in edit mode, where the selection bar's own toggle is visible feedback
  // enough and a flash on top of it would just be noise. Keyed off
  // config.useFlats itself (not a separate event/prop) so it reacts the
  // same way regardless of whether this instance was the one clicked on or
  // just swept along by the all-at-once hotkey.
  //
  // prevUseFlats tracks the last value this effect actually saw, so a
  // render triggered by something else entirely — editable flipping true to
  // false as Play mode is entered, with useFlats untouched — doesn't read as
  // "it changed" just because the effect happens to have editable in its
  // dependency array too.
  const [flashSymbol, setFlashSymbol] = useState<"♭" | "♯" | null>(null);
  const prevUseFlats = useRef(config.useFlats);
  const flashTimeout = useRef<number | null>(null);
  useEffect(() => {
    const changed = prevUseFlats.current !== config.useFlats;
    prevUseFlats.current = config.useFlats;
    if (!changed || editable) return;
    setFlashSymbol(config.useFlats ? "♭" : "♯");
    if (flashTimeout.current) window.clearTimeout(flashTimeout.current);
    flashTimeout.current = window.setTimeout(() => setFlashSymbol(null), FLASH_DURATION_MS);
    return () => {
      if (flashTimeout.current) window.clearTimeout(flashTimeout.current);
    };
  }, [config.useFlats, editable]);

  function handleSegmentClick(pitchClass: number): void {
    const channel = config.outputChannel - 1;
    midi.sendMidiNote({ type: "noteon", note: 60 + pitchClass, velocity: 100, channel, outputPortId: outputSourceId });
    window.setTimeout(() => {
      midi.sendMidiNote({ type: "noteoff", note: 60 + pitchClass, velocity: 0, channel, outputPortId: outputSourceId });
    }, 220);
  }

  return (
    <div className="cof">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="cof__svg" role="img" aria-label="Circle of fifths">
        {SEGMENTS.map((segment, index) => {
          const isMidiActive = midiActive.has(segment.pitchClass);
          const pos = labelPosition(index);
          return (
            <g key={segment.name}>
              <path
                d={wedgePath(index)}
                className={`cof__wedge${isMidiActive ? " cof__wedge--midi" : ""}`}
                onClick={() => handleSegmentClick(segment.pitchClass)}
              />
              <text
                x={pos.x}
                y={pos.y}
                className="cof__label"
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {segment.name}
              </text>
            </g>
          );
        })}
        {flashSymbol ? (
          <text
            x={CENTER}
            y={CENTER}
            className="cof__flash-symbol"
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {flashSymbol}
          </text>
        ) : (
          chordSymbol && (
            <text
              x={CENTER}
              y={CENTER}
              className="cof__chord-symbol"
              textAnchor="middle"
              dominantBaseline="middle"
              // Longer symbols (extended/slash chords, e.g. "C♯m7♭5/F♯") need
              // to shrink to stay inside the fixed-diameter center hole —
              // SVG text doesn't wrap or auto-fit on its own.
              style={
                chordSymbol.length > 4
                  ? { fontSize: `${Math.max(13, 26 - (chordSymbol.length - 4) * 2)}px` }
                  : undefined
              }
            >
              {chordSymbol}
            </text>
          )
        )}
      </svg>
    </div>
  );
}
