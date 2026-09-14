import { NOTE_NAMES } from "./midi";

/**
 * Real-time chord-symbol recognition from currently-held MIDI notes.
 *
 * This reimplements, in plain TypeScript, the pitch-class-template matching
 * that a tool like music21's chord.commonName does — rather than shelling
 * out to music21 itself (a Python library). Bundling and calling into a
 * Python runtime for every note-on/note-off just to get a chord label would
 * add a second language runtime to an Electron app's distribution, plus
 * process-spawn or IPC latency on a path that needs to feel instant as
 * someone plays a keyboard. A template match against a fixed interval table
 * is a few dozen integer comparisons and never leaves the renderer.
 */

const FLAT_NOTE_NAMES = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"];

/** Minimum semitone gap between the two lowest held notes for the bass to be
 *  spelled out as a slash chord (e.g. "C/E") instead of just naming the
 *  chord in root position. A close-voiced inversion (bass only a third or
 *  so under the rest of the notes) reads to the ear as the chord itself,
 *  not as a distinctly voiced bass note — that reading only kicks in once
 *  the bass is left further apart, wider than the chord's own widest common
 *  interval (a perfect fifth). */
const SLASH_BASS_MIN_GAP = 7;

interface ChordTemplate {
  /** Pitch classes relative to the root, ascending, always starting with 0. */
  intervals: number[];
  suffix: string;
}

// Ordered roughly by how commonly a classroom keyboard would produce them;
// order only matters as a tie-break of last resort (see identifyChord).
const CHORD_TEMPLATES: ChordTemplate[] = [
  // Triads
  { intervals: [0, 4, 7], suffix: "" },
  { intervals: [0, 3, 7], suffix: "m" },
  { intervals: [0, 3, 6], suffix: "dim" },
  { intervals: [0, 4, 8], suffix: "aug" },
  { intervals: [0, 2, 7], suffix: "sus2" },
  { intervals: [0, 5, 7], suffix: "sus4" },
  // Sevenths
  { intervals: [0, 4, 7, 10], suffix: "7" },
  { intervals: [0, 4, 7, 11], suffix: "maj7" },
  { intervals: [0, 3, 7, 10], suffix: "m7" },
  { intervals: [0, 3, 7, 11], suffix: "m(maj7)" },
  { intervals: [0, 3, 6, 10], suffix: "m7♭5" },
  { intervals: [0, 3, 6, 9], suffix: "dim7" },
  { intervals: [0, 4, 8, 10], suffix: "7♯5" },
  { intervals: [0, 4, 8, 11], suffix: "maj7♯5" },
  { intervals: [0, 4, 6, 10], suffix: "7♭5" },
  { intervals: [0, 5, 7, 10], suffix: "7sus4" },
  // Sixths
  { intervals: [0, 4, 7, 9], suffix: "6" },
  { intervals: [0, 3, 7, 9], suffix: "m6" },
  // Added tone / 9ths (no 7th)
  { intervals: [0, 2, 4, 7], suffix: "add9" },
  { intervals: [0, 2, 3, 7], suffix: "m(add9)" },
  { intervals: [0, 2, 4, 7, 9], suffix: "6/9" },
  // 9ths
  { intervals: [0, 2, 4, 7, 10], suffix: "9" },
  { intervals: [0, 2, 4, 7, 11], suffix: "maj9" },
  { intervals: [0, 2, 3, 7, 10], suffix: "m9" },
  // Altered dominants
  { intervals: [0, 1, 4, 7, 10], suffix: "7♭9" },
  { intervals: [0, 3, 4, 7, 10], suffix: "7♯9" },
  { intervals: [0, 4, 6, 7, 10], suffix: "7♯11" },
  { intervals: [0, 4, 6, 7, 11], suffix: "maj7♯11" },
  { intervals: [0, 2, 4, 6, 7, 11], suffix: "maj9♯11" },
  // 11ths (3rd conventionally omitted from dominant/half-dim voicings)
  { intervals: [0, 2, 5, 7, 10], suffix: "11" },
  { intervals: [0, 2, 3, 5, 7, 10], suffix: "m11" },
  // 13ths (11th conventionally omitted)
  { intervals: [0, 2, 4, 7, 9, 10], suffix: "13" },
  { intervals: [0, 2, 3, 7, 9, 10], suffix: "m13" },
  { intervals: [0, 2, 4, 7, 9, 11], suffix: "maj13" }
];

const TEMPLATE_BY_INTERVALS = new Map<string, string>(
  CHORD_TEMPLATES.map((t) => [t.intervals.join(","), t.suffix])
);

/**
 * Identifies the chord symbol formed by a set of currently-held MIDI notes.
 *
 * `notes` are real MIDI note numbers (not just pitch classes): the two
 * lowest-sounding ones decide whether the bass gets spelled out as a slash
 * chord (see SLASH_BASS_MIN_GAP), and the lowest one is also used as a
 * root-preference tie-break for symmetric chords (e.g. diminished 7th,
 * augmented, whose pitch-class set is the same starting from any of their
 * members). Returns null when there's nothing chord-like to show — fewer
 * than three distinct notes, or a set of three-plus notes that doesn't
 * actually match any recognized chord shape (a tone cluster isn't a chord,
 * so it's not worth inventing a label like "A+F+G+F♯+G♯" for one).
 */
export function identifyChord(notes: number[], useFlats = false): string | null {
  const noteNames = useFlats ? FLAT_NOTE_NAMES : NOTE_NAMES;
  const sortedNotes = [...new Set(notes)].sort((a, b) => a - b);
  const pitchClasses = [...new Set(sortedNotes.map((n) => ((n % 12) + 12) % 12))];
  if (pitchClasses.length < 3) return null;

  const bassPitchClass = ((sortedNotes[0] % 12) + 12) % 12;
  const bassGap = sortedNotes[1] - sortedNotes[0];

  let best: { root: number; suffix: string } | null = null;
  for (const root of pitchClasses) {
    const intervals = pitchClasses.map((pc) => ((pc - root + 12) % 12)).sort((a, b) => a - b);
    const suffix = TEMPLATE_BY_INTERVALS.get(intervals.join(","));
    if (suffix === undefined) continue;
    if (!best || root === bassPitchClass) {
      best = { root, suffix };
      if (root === bassPitchClass) break;
    }
  }

  if (!best) return null;

  const rootName = noteNames[best.root];
  const isInversion =
    bassGap > SLASH_BASS_MIN_GAP && bassPitchClass !== best.root && pitchClasses.includes(bassPitchClass);
  return isInversion ? `${rootName}${best.suffix}/${noteNames[bassPitchClass]}` : `${rootName}${best.suffix}`;
}
