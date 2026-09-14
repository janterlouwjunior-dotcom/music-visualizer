import { useEffect, useMemo, useRef, useState } from "react";
import type { VisualizationProps } from "../types";
import type { MidiSettings } from "../../../../shared/midiSettings";
import { transportService } from "../../transport/transportService";
import "./EuclideanRhythm.css";

export interface EuclideanRhythmConfig {
  /** Number of onsets ("the 1's") — k in the paper's E(k, n) notation. */
  beats: number;
  /** Total steps in the cycle — n in E(k, n). */
  steps: number;
  /** Clockwise shift of the generated pattern around the circle. */
  rotation: number;
  /** MIDI note number sent for every active beat while playing. */
  noteNumber: number;
  /** Note-value denominator each step represents — "4" | "8" | "16" | "32" — stored as the select field's string value. */
  subdivision: string;
  /** Draw the ring connecting the nodes as a smooth circle instead of the straight-edged polygon through each node. */
  roundedRing: boolean;
  /** Show the matched traditional rhythm's name (see NAMED_RHYTHMS) in the center, when the current beats/steps/rotation match one. */
  showRhythmName: boolean;
  /** Disables the Beats/Steps/Rotation hotkeys (see HOTKEY_LETTERS) while playing — a per-instance safeguard so a performer can't accidentally reshape a rhythm they aren't pointing at. */
  hotkeysLocked: boolean;
  outputDeviceId: string;
  /** 1-16 — there's no "All" for output, a message always goes out on one channel. */
  outputChannel: number;
}

/** How long an active beat's note stays on, in ms — capped well under even a
 * fast 32nd-note step's own duration so back-to-back beats never overlap. */
const NOTE_GATE_MS = 60;

const SIZE = 320;
const CENTER = SIZE / 2;
const RING_R = 130;
const NODE_R = 11;

/**
 * Bjorklund's algorithm for generating Euclidean rhythms, per Godfried
 * Toussaint's "The Euclidean Algorithm Generates Traditional Musical
 * Rhythms": repeatedly pairs up the smaller group of bit-sequences with the
 * larger one, folding each small sequence onto the tail of a large one,
 * until at most one small sequence is left over. Verified against the
 * paper's own worked examples (E(5,13), E(3,8), E(5,8)) — the k=5,n=8 case
 * in particular exercises the "leftover becomes the new minority" branch
 * below, not just the more obvious "leftover zeros" case.
 */
function bjorklund(beats: number, steps: number): boolean[] {
  if (steps <= 0) return [];
  if (beats <= 0) return new Array(steps).fill(false);
  if (beats >= steps) return new Array(steps).fill(true);

  let major: boolean[][] = Array.from({ length: beats }, () => [true]);
  let minor: boolean[][] = Array.from({ length: steps - beats }, () => [false]);

  while (minor.length > 1) {
    const pairCount = Math.min(major.length, minor.length);
    const merged: boolean[][] = [];
    for (let i = 0; i < pairCount; i++) merged.push([...major[i], ...minor[i]]);
    const leftoverMajor = major.slice(pairCount);
    const leftoverMinor = minor.slice(pairCount);
    major = merged;
    minor = leftoverMajor.length > 0 ? leftoverMajor : leftoverMinor;
  }

  return [...major, ...minor].flat();
}

/** Shifts the pattern clockwise by `rotation` node-positions — the value at index 0 ends up showing at index `rotation`. */
function rotateClockwise(pattern: boolean[], rotation: number): boolean[] {
  const n = pattern.length;
  if (n === 0) return pattern;
  const r = ((rotation % n) + n) % n;
  return pattern.map((_, i) => pattern[(i - r + n) % n]);
}

function nodePosition(index: number, steps: number): { x: number; y: number } {
  // -90° so step 0 sits at the top, matching the paper's own figures — time
  // then flows clockwise from there, also per the paper's convention.
  const angle = (index / steps) * 2 * Math.PI - Math.PI / 2;
  return { x: CENTER + RING_R * Math.cos(angle), y: CENTER + RING_R * Math.sin(angle) };
}

/**
 * The named traditional rhythms from Toussaint's paper that are Euclidean
 * rhythms E(beats, steps) — some as the base (Bjorklund) pattern itself,
 * others only once rotated to "start on" a particular onset, exactly as the
 * paper describes each one. `startOnset` is that onset number counting from
 * 1 (1 = the base pattern's own start, i.e. no rotation) — see
 * findRhythmName, which turns that into the actual rotation amount by
 * locating the onset in the freshly-generated base pattern rather than
 * requiring a hand-computed rotation number here.
 */
const NAMED_RHYTHMS: { beats: number; steps: number; startOnset: number; name: string }[] = [
  { beats: 2, steps: 3, startOnset: 1, name: "Afro-Cuban Tumbao" },
  { beats: 2, steps: 5, startOnset: 1, name: "Khafif-e-ramal" },
  { beats: 2, steps: 5, startOnset: 2, name: "Take Five" },
  { beats: 3, steps: 4, startOnset: 1, name: "Cumbia" },
  { beats: 3, steps: 5, startOnset: 2, name: "Khafif-e-ramal" },
  { beats: 3, steps: 7, startOnset: 1, name: "Ruchenitza (Pink Floyd's Money)" },
  { beats: 3, steps: 8, startOnset: 1, name: "Tresillo" },
  { beats: 4, steps: 7, startOnset: 1, name: "Ruchenitza" },
  { beats: 4, steps: 9, startOnset: 1, name: "Aksak (Rondo à la Turk)" },
  { beats: 4, steps: 11, startOnset: 1, name: "Zappa's Outside Now" },
  { beats: 4, steps: 12, startOnset: 1, name: "Fandango" },
  { beats: 5, steps: 6, startOnset: 2, name: "York-Samai" },
  { beats: 5, steps: 7, startOnset: 1, name: "Nawakhat" },
  { beats: 5, steps: 8, startOnset: 1, name: "Cinquillo" },
  { beats: 5, steps: 8, startOnset: 2, name: "Spanish Tango" },
  { beats: 5, steps: 9, startOnset: 1, name: "Agsag-Samai" },
  { beats: 5, steps: 9, startOnset: 2, name: "Venda Drum Pattern" },
  { beats: 5, steps: 11, startOnset: 1, name: "Pictures at an Exhibition" },
  { beats: 5, steps: 12, startOnset: 1, name: "Venda Clapping" },
  { beats: 5, steps: 16, startOnset: 3, name: "Bossa-Nova" },
  { beats: 7, steps: 8, startOnset: 1, name: "Tuareg Bendir" },
  { beats: 7, steps: 12, startOnset: 1, name: "Mpré (Ashanti Bell)" },
  { beats: 7, steps: 16, startOnset: 5, name: "Ghana Clapping" },
  { beats: 7, steps: 16, startOnset: 7, name: "Samba" },
  { beats: 9, steps: 16, startOnset: 4, name: "Samba Cowbell" },
  { beats: 9, steps: 16, startOnset: 8, name: "Ngbaka-Maibo Bell" },
  { beats: 11, steps: 24, startOnset: 7, name: "Aka Pygmies" },
  { beats: 13, steps: 24, startOnset: 4, name: "Aka Pygmies (Sangha)" }
];

/** Finds which (if any) named rhythm the current beats/steps/rotation matches — see NAMED_RHYTHMS. */
function findRhythmName(beats: number, steps: number, rotation: number): string | null {
  const candidates = NAMED_RHYTHMS.filter((r) => r.beats === beats && r.steps === steps);
  if (candidates.length === 0) return null;

  const base = bjorklund(beats, steps);
  const onsetPositions: number[] = [];
  base.forEach((isBeat, i) => {
    if (isBeat) onsetPositions.push(i);
  });

  const normalizedRotation = ((rotation % steps) + steps) % steps;
  for (const candidate of candidates) {
    const onsetIndex = onsetPositions[candidate.startOnset - 1];
    if (onsetIndex === undefined) continue;
    const requiredRotation = (steps - onsetIndex) % steps;
    if (requiredRotation === normalizedRotation) return candidate.name;
  }
  return null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

type HotkeyKind = "beats" | "steps" | "rotation";

/**
 * Play-mode hotkeys: hold the letter, type digits, release to commit — e.g.
 * holding B then typing 1, 6 sets 16 beats on release. Scoped to whichever
 * instance the pointer is over (see isHovered below) since there's no
 * "selected" component concept in Play mode, and gated on config.hotkeysLocked
 * so a performer can lock a rhythm they don't want disturbed mid-set.
 */
const HOTKEY_LETTERS: Record<string, HotkeyKind> = { b: "beats", s: "steps", r: "rotation" };
const HOTKEY_LABELS: Record<HotkeyKind, string> = { beats: "Beats", steps: "Steps", rotation: "Rotation" };
const HOTKEY_BOUNDS: Record<HotkeyKind, [number, number]> = {
  beats: [0, 32],
  steps: [2, 32],
  rotation: [0, 31]
};

/** Splits a longer name onto two lines at the space nearest its middle, so it wraps instead of running past the ring. */
function splitRhythmName(name: string): string[] {
  if (name.length <= 16) return [name];
  const mid = Math.floor(name.length / 2);
  const splitAt = name.lastIndexOf(" ", mid) > 0 ? name.lastIndexOf(" ", mid) : name.indexOf(" ", mid);
  if (splitAt <= 0) return [name];
  return [name.slice(0, splitAt), name.slice(splitAt + 1)];
}

export function EuclideanRhythm({
  config,
  midi,
  onConfigChange,
  editable
}: VisualizationProps<EuclideanRhythmConfig>) {
  const steps = Math.max(1, Math.round(config.steps));
  const beats = Math.min(Math.max(0, Math.round(config.beats)), steps);
  const rotation = config.rotation ?? 0;
  const pattern = useMemo(() => rotateClockwise(bjorklund(beats, steps), rotation), [beats, steps, rotation]);
  const positions = useMemo(() => pattern.map((_, i) => nodePosition(i, steps)), [pattern, steps]);
  const rhythmName = config.showRhythmName ? findRhythmName(beats, steps, rotation) : null;

  const [midiSettings, setMidiSettings] = useState<MidiSettings>({ inputs: [], outputs: [] });
  useEffect(() => {
    // Same refetch-on-focus pattern as the other visualizations — the named
    // output mapping is edited on the separate Settings page.
    function refresh(): void {
      window.api.midiSettings.get().then(setMidiSettings);
    }
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);
  const outputSourceId = useMemo(
    () => midiSettings.outputs.find((d) => d.id === config.outputDeviceId)?.sourceId,
    [midiSettings.outputs, config.outputDeviceId]
  );

  const [isPlaying, setIsPlaying] = useState(transportService.isPlaying());
  useEffect(() => transportService.subscribe(() => setIsPlaying(transportService.isPlaying())), []);

  const [currentStep, setCurrentStep] = useState<number | null>(null);
  const lastStepRef = useRef<number | null>(null);
  const noteOffTimeout = useRef<number | null>(null);

  useEffect(() => {
    if (!isPlaying) {
      setCurrentStep(null);
      lastStepRef.current = null;
      return;
    }

    let frameId: number;
    function tick(): void {
      // Recomputed from absolute elapsed time every frame, not accumulated
      // from a timer — see transportService's own comment on why: this is
      // what keeps every playing component's steps phase-locked to the same
      // downbeat and immune to setInterval-style drift.
      const elapsedMs = performance.now() - transportService.getStartTime();
      const msPerQuarter = 60000 / transportService.getBpm();
      const subdivisionsPerQuarter = Number(config.subdivision) / 4;
      const msPerStep = msPerQuarter / subdivisionsPerQuarter;
      const stepIndex = Math.floor(elapsedMs / msPerStep) % steps;

      if (stepIndex !== lastStepRef.current) {
        lastStepRef.current = stepIndex;
        setCurrentStep(stepIndex);
        if (pattern[stepIndex]) {
          midi.sendMidiNote({
            type: "noteon",
            note: config.noteNumber,
            velocity: 100,
            channel: config.outputChannel - 1,
            outputPortId: outputSourceId
          });
          if (noteOffTimeout.current) window.clearTimeout(noteOffTimeout.current);
          noteOffTimeout.current = window.setTimeout(() => {
            midi.sendMidiNote({
              type: "noteoff",
              note: config.noteNumber,
              velocity: 0,
              channel: config.outputChannel - 1,
              outputPortId: outputSourceId
            });
          }, Math.min(NOTE_GATE_MS, msPerStep * 0.5));
        }
      }
      frameId = requestAnimationFrame(tick);
    }
    frameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frameId);
      if (noteOffTimeout.current) window.clearTimeout(noteOffTimeout.current);
    };
  }, [isPlaying, steps, pattern, config.subdivision, config.noteNumber, config.outputChannel, outputSourceId, midi]);

  const [isHovered, setIsHovered] = useState(false);
  const activeHotkeyRef = useRef<HotkeyKind | null>(null);
  const digitBufferRef = useRef("");
  const [hotkeyBuffer, setHotkeyBuffer] = useState<{ kind: HotkeyKind; digits: string } | null>(null);

  useEffect(() => {
    // Only live while playing, only for the instance the pointer is over,
    // and never when this instance's own Lock toggle is on.
    if (editable || !isHovered || config.hotkeysLocked) return;

    function isFormControl(target: EventTarget | null): boolean {
      const el = target as HTMLElement | null;
      return (
        el?.tagName === "INPUT" ||
        el?.tagName === "TEXTAREA" ||
        el?.tagName === "SELECT" ||
        !!el?.isContentEditable
      );
    }

    function commit(kind: HotkeyKind): void {
      const raw = digitBufferRef.current;
      if (raw !== "") {
        const parsed = parseInt(raw, 10);
        if (!Number.isNaN(parsed)) {
          const [min, max] = HOTKEY_BOUNDS[kind];
          onConfigChange({ [kind]: clamp(parsed, min, max) } as Partial<EuclideanRhythmConfig>);
        }
      }
      activeHotkeyRef.current = null;
      digitBufferRef.current = "";
      setHotkeyBuffer(null);
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (isFormControl(event.target)) return;
      const key = event.key.toLowerCase();

      if (activeHotkeyRef.current === null) {
        const kind = HOTKEY_LETTERS[key];
        if (!kind) return;
        event.preventDefault();
        activeHotkeyRef.current = kind;
        digitBufferRef.current = "";
        setHotkeyBuffer({ kind, digits: "" });
        return;
      }

      // Guards against OS key-repeat re-appending the same digit over and
      // over while a number key is held down.
      if (event.repeat) return;
      if (key.length === 1 && key >= "0" && key <= "9") {
        event.preventDefault();
        digitBufferRef.current += key;
        setHotkeyBuffer({ kind: activeHotkeyRef.current, digits: digitBufferRef.current });
      }
    }

    function handleKeyUp(event: KeyboardEvent): void {
      const kind = HOTKEY_LETTERS[event.key.toLowerCase()];
      if (kind && activeHotkeyRef.current === kind) commit(kind);
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      activeHotkeyRef.current = null;
      digitBufferRef.current = "";
      setHotkeyBuffer(null);
    };
  }, [editable, isHovered, config.hotkeysLocked, onConfigChange]);

  return (
    <div
      className="euclidean-rhythm"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="euclidean-rhythm__svg"
        role="img"
        aria-label={`Euclidean rhythm, ${beats} beats over ${steps} steps${rhythmName ? `, ${rhythmName}` : ""}`}
      >
        {config.roundedRing ? (
          <circle cx={CENTER} cy={CENTER} r={RING_R} className="euclidean-rhythm__ring" />
        ) : (
          <polygon
            points={positions.map((p) => `${p.x},${p.y}`).join(" ")}
            className="euclidean-rhythm__ring"
          />
        )}
        {pattern.map((isBeat, i) => (
          <circle
            key={i}
            cx={positions[i].x}
            cy={positions[i].y}
            r={NODE_R}
            className={`euclidean-rhythm__node${isBeat ? " euclidean-rhythm__node--beat" : ""}${
              i === currentStep ? " euclidean-rhythm__node--playhead" : ""
            }`}
          />
        ))}
        {rhythmName &&
          (() => {
            const lines = splitRhythmName(rhythmName);
            const fontSize = lines.some((l) => l.length > 16) ? 14 : 18;
            return (
              <text
                x={CENTER}
                y={CENTER}
                className="euclidean-rhythm__name"
                textAnchor="middle"
                dominantBaseline="middle"
                style={{ fontSize: `${fontSize}px` }}
              >
                {lines.map((line, i) => (
                  <tspan key={i} x={CENTER} dy={i === 0 ? (lines.length > 1 ? "-0.6em" : "0") : "1.2em"}>
                    {line}
                  </tspan>
                ))}
              </text>
            );
          })()}
        {hotkeyBuffer && (
          <text x={CENTER} y={SIZE - 18} textAnchor="middle" className="euclidean-rhythm__hotkey-readout">
            {HOTKEY_LABELS[hotkeyBuffer.kind]}: {hotkeyBuffer.digits || "_"}
          </text>
        )}
      </svg>
    </div>
  );
}
