/**
 * The workspace-wide playback clock — one shared play/stop state and tempo
 * that every time-driven visualization (currently just Euclidean Rhythm)
 * reads from, the same way every visualization reads from the one shared
 * `midiService` rather than each opening its own MIDI connection.
 *
 * Deliberately just a start timestamp plus a tempo, not a running "current
 * beat" counter updated on a timer: a listener recomputes its own position
 * as `(performance.now() - startTime)`, so two components with different
 * subdivisions (a 16th-note one and an 8th-note one) both derive their
 * step from the exact same downbeat and stay phase-locked to each other,
 * and nothing drifts from accumulating per-tick rounding error the way a
 * running counter incremented on a setInterval would.
 */
class TransportService {
  private playing = false;
  private bpm = 120;
  private startTime = 0;
  private listeners = new Set<() => void>();

  isPlaying(): boolean {
    return this.playing;
  }

  getBpm(): number {
    return this.bpm;
  }

  /** performance.now() timestamp of the downbeat — meaningless while stopped. */
  getStartTime(): number {
    return this.startTime;
  }

  play(): void {
    if (this.playing) return;
    this.playing = true;
    this.startTime = performance.now();
    this.notify();
  }

  stop(): void {
    if (!this.playing) return;
    this.playing = false;
    this.notify();
  }

  toggle(): void {
    if (this.playing) this.stop();
    else this.play();
  }

  setBpm(bpm: number): void {
    this.bpm = bpm;
    this.notify();
  }

  /** Fires on every play/stop/tempo change — not on every clock tick, which each listener derives itself from getStartTime(). */
  subscribe(handler: () => void): () => void {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  private notify(): void {
    for (const handler of this.listeners) handler();
  }
}

export const transportService = new TransportService();
