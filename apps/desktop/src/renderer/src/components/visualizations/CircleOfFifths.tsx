import { useEffect, useMemo, useState } from "react";
import type { VisualizationProps } from "../types";
import "./CircleOfFifths.css";

export interface CircleOfFifthsConfig {
  highlightKey: string;
  listenForMidi: boolean;
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

export function CircleOfFifths({
  config,
  onConfigChange,
  midi
}: VisualizationProps<CircleOfFifthsConfig>) {
  const [midiActive, setMidiActive] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!config.listenForMidi) {
      setMidiActive(new Set());
      return;
    }
    return midi.onMidiNote((event) => {
      const pitchClass = ((event.note % 12) + 12) % 12;
      setMidiActive((prev) => {
        const next = new Set(prev);
        if (event.type === "noteon") next.add(pitchClass);
        else next.delete(pitchClass);
        return next;
      });
    });
  }, [config.listenForMidi, midi]);

  const highlightPitchClass = useMemo(
    () => SEGMENTS.find((s) => s.name === config.highlightKey)?.pitchClass,
    [config.highlightKey]
  );

  function handleSegmentClick(pitchClass: number): void {
    midi.sendMidiNote({ type: "noteon", note: 60 + pitchClass, velocity: 100, channel: 0 });
    window.setTimeout(() => {
      midi.sendMidiNote({ type: "noteoff", note: 60 + pitchClass, velocity: 0, channel: 0 });
    }, 220);
  }

  return (
    <div className="cof">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="cof__svg"
        role="img"
        aria-label={`Circle of fifths, key of ${config.highlightKey}`}
      >
        {SEGMENTS.map((segment, index) => {
          const isConfigHighlight = segment.pitchClass === highlightPitchClass;
          const isMidiActive = midiActive.has(segment.pitchClass);
          const pos = labelPosition(index);
          return (
            <g key={segment.name}>
              <path
                d={wedgePath(index)}
                className={[
                  "cof__wedge",
                  isConfigHighlight ? "cof__wedge--selected" : "",
                  isMidiActive ? "cof__wedge--midi" : ""
                ]
                  .filter(Boolean)
                  .join(" ")}
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
      </svg>
      <div className="cof__controls">
        <label className="cof__field">
          Key
          <select
            value={config.highlightKey}
            onChange={(e) => onConfigChange({ highlightKey: e.target.value })}
          >
            {SEGMENTS.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="cof__field cof__field--checkbox">
          <input
            type="checkbox"
            checked={config.listenForMidi}
            onChange={(e) => onConfigChange({ listenForMidi: e.target.checked })}
          />
          Listen for MIDI
        </label>
      </div>
    </div>
  );
}
