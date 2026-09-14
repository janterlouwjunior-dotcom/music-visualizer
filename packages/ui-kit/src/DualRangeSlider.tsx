import { useCallback, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import "./DualRangeSlider.css";

export interface DualRangeSliderProps {
  min: number;
  max: number;
  low: number;
  high: number;
  /** Minimum allowed distance between low and high (high - low >= minGap). */
  minGap?: number;
  /** Maximum allowed distance between low and high (high - low <= maxGap). */
  maxGap?: number;
  /** Formats a raw value for display on each handle, e.g. a MIDI note number -> "C4". */
  formatLabel?: (value: number) => string;
  onChange: (low: number, high: number) => void;
}

type Handle = "low" | "high";

/**
 * Generic two-handle range slider — deliberately has no MIDI/note awareness
 * of its own (that's the caller's `formatLabel`), so it stays reusable
 * outside this app like the rest of the design-system package.
 *
 * Drag tracking uses Pointer Events with explicit capture
 * (setPointerCapture) rather than a window-level mousemove/mouseup
 * useEffect. The earlier approach could get stuck: if the mouseup happened
 * outside the page's content area, the DOM event never reached `window` and
 * the dragging ref never reset, so every later mousemove anywhere kept
 * re-triggering onChange. Pointer capture guarantees pointerup/pointercancel
 * is delivered to the specific thumb that started the drag regardless of
 * where the pointer ends up, and scopes pointermove to that same thumb, so
 * there's no cross-talk between the two handles and no window-level
 * listener to rebind on every render or every drag tick.
 */
export function DualRangeSlider({
  min,
  max,
  low,
  high,
  minGap = 0,
  maxGap = Infinity,
  formatLabel = String,
  onChange
}: DualRangeSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<Handle | null>(null);

  const clampLow = useCallback(
    (candidate: number): number => {
      let next = Math.min(candidate, high - minGap);
      next = Math.max(next, high - maxGap);
      return Math.max(min, Math.round(next));
    },
    [high, minGap, maxGap, min]
  );

  const clampHigh = useCallback(
    (candidate: number): number => {
      let next = Math.max(candidate, low + minGap);
      next = Math.min(next, low + maxGap);
      return Math.min(max, Math.round(next));
    },
    [low, minGap, maxGap, max]
  );

  const valueFromClientX = useCallback(
    (clientX: number): number => {
      const el = trackRef.current;
      if (!el) return min;
      const rect = el.getBoundingClientRect();
      const fraction = rect.width === 0 ? 0 : (clientX - rect.left) / rect.width;
      return min + fraction * (max - min);
    },
    [min, max]
  );

  function moveHandle(handle: Handle, clientX: number): void {
    const raw = valueFromClientX(clientX);
    if (handle === "low") onChange(clampLow(raw), high);
    else onChange(low, clampHigh(raw));
  }

  function handlePointerDown(handle: Handle, e: ReactPointerEvent<HTMLDivElement>): void {
    // Capture can throw (e.g. NotFoundError for a pointer id the browser
    // doesn't recognize as active) — that shouldn't prevent the drag from
    // starting, just lose the "keep tracking outside the element" guarantee
    // capture provides.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignored — see above.
    }
    setDragging(handle);
    moveHandle(handle, e.clientX);
  }

  function handlePointerMove(handle: Handle, e: ReactPointerEvent<HTMLDivElement>): void {
    // Without this guard, a thumb that merely has the mouse hovering over it
    // (button up) still receives pointermove — pointer capture only
    // redirects *where* move events target, it doesn't gate them on button
    // state — so the handle would drift on hover alone. Only track once this
    // handle's own pointerdown actually started a drag.
    if (dragging !== handle) return;
    moveHandle(handle, e.clientX);
  }

  function endDrag(): void {
    setDragging(null);
  }

  function handleKeyDown(handle: Handle, e: KeyboardEvent): void {
    let delta = 0;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") delta = 1;
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") delta = -1;
    else return;
    e.preventDefault();
    if (handle === "low") onChange(clampLow(low + delta), high);
    else onChange(low, clampHigh(high + delta));
  }

  const lowPct = ((low - min) / (max - min)) * 100;
  const highPct = ((high - min) / (max - min)) * 100;

  return (
    <div className="mtv-range-slider">
      <div className="mtv-range-slider__track" ref={trackRef}>
        <div
          className="mtv-range-slider__fill"
          style={{ left: `${lowPct}%`, width: `${highPct - lowPct}%` }}
        />
        <div
          className={`mtv-range-slider__thumb${dragging === "low" ? " mtv-range-slider__thumb--active" : ""}`}
          style={{ left: `${lowPct}%` }}
          role="slider"
          tabIndex={0}
          aria-valuemin={min}
          aria-valuemax={high - minGap}
          aria-valuenow={low}
          aria-label="Lowest value"
          onPointerDown={(e) => handlePointerDown("low", e)}
          onPointerMove={(e) => handlePointerMove("low", e)}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={(e) => handleKeyDown("low", e)}
        >
          <span className="mtv-range-slider__label">{formatLabel(low)}</span>
        </div>
        <div
          className={`mtv-range-slider__thumb${dragging === "high" ? " mtv-range-slider__thumb--active" : ""}`}
          style={{ left: `${highPct}%` }}
          role="slider"
          tabIndex={0}
          aria-valuemin={low + minGap}
          aria-valuemax={max}
          aria-valuenow={high}
          aria-label="Highest value"
          onPointerDown={(e) => handlePointerDown("high", e)}
          onPointerMove={(e) => handlePointerMove("high", e)}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={(e) => handleKeyDown("high", e)}
        >
          <span className="mtv-range-slider__label">{formatLabel(high)}</span>
        </div>
      </div>
    </div>
  );
}
