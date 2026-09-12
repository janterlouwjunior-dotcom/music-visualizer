import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
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
  const draggingRef = useRef<Handle | null>(null);
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

  const moveHandle = useCallback(
    (handle: Handle, clientX: number) => {
      const raw = valueFromClientX(clientX);
      if (handle === "low") onChange(clampLow(raw), high);
      else onChange(low, clampHigh(raw));
    },
    [valueFromClientX, clampLow, clampHigh, low, high, onChange]
  );

  useEffect(() => {
    function handleMove(e: MouseEvent): void {
      if (draggingRef.current) moveHandle(draggingRef.current, e.clientX);
    }
    function handleUp(): void {
      draggingRef.current = null;
      setDragging(null);
    }
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [moveHandle]);

  function startDrag(handle: Handle): void {
    draggingRef.current = handle;
    setDragging(handle);
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
          onMouseDown={() => startDrag("low")}
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
          onMouseDown={() => startDrag("high")}
          onKeyDown={(e) => handleKeyDown("high", e)}
        >
          <span className="mtv-range-slider__label">{formatLabel(high)}</span>
        </div>
      </div>
    </div>
  );
}
