import { useCallback, useEffect, useRef, useState } from "react";
import "./ColorWheel.css";

export interface ColorWheelProps {
  value: string;
  onChange: (hex: string) => void;
  size?: number;
}

interface Hsv {
  h: number;
  s: number;
  v: number;
}

function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (n: number): string =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToHsv(hex: string): Hsv {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16) / 255 || 0;
  const g = parseInt(clean.substring(2, 4), 16) / 255 || 0;
  const b = parseInt(clean.substring(4, 6), 16) / 255 || 0;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = (((g - b) / d) % 6) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}

/**
 * Hue/saturation wheel (click or drag) plus a lightness slider. The wheel is
 * a conic-gradient (hue) with a radial white-to-transparent overlay
 * (desaturates toward the center) — plain alpha compositing, no JS pixel math
 * needed to render it; only the pointer math is manual.
 */
export function ColorWheel({ value, onChange, size = 120 }: ColorWheelProps) {
  const wheelRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value));

  useEffect(() => {
    // Skip while actively dragging — an hsv->hex->hsv round trip loses a little
    // precision to rounding, which would otherwise make the knob jitter.
    if (draggingRef.current) return;
    setHsv(hexToHsv(value));
  }, [value]);

  const updateFromPoint = useCallback(
    (clientX: number, clientY: number) => {
      const el = wheelRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const radius = rect.width / 2;
      const dx = clientX - (rect.left + radius);
      const dy = clientY - (rect.top + radius);
      const dist = Math.min(Math.sqrt(dx * dx + dy * dy), radius);
      let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      if (angle < 0) angle += 360;
      const s = radius === 0 ? 0 : dist / radius;
      setHsv((prev) => {
        const next = { h: angle, s, v: prev.v };
        onChange(hsvToHex(next.h, next.s, next.v));
        return next;
      });
    },
    [onChange]
  );

  useEffect(() => {
    function handleMove(e: MouseEvent): void {
      if (draggingRef.current) updateFromPoint(e.clientX, e.clientY);
    }
    function handleUp(): void {
      draggingRef.current = false;
    }
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [updateFromPoint]);

  function handleLightnessChange(v: number): void {
    setHsv((prev) => {
      const next = { ...prev, v };
      onChange(hsvToHex(next.h, next.s, next.v));
      return next;
    });
  }

  const knobX = 50 + Math.cos((hsv.h * Math.PI) / 180) * hsv.s * 50;
  const knobY = 50 + Math.sin((hsv.h * Math.PI) / 180) * hsv.s * 50;

  return (
    <div className="mtv-color-wheel">
      <div
        ref={wheelRef}
        className="mtv-color-wheel__wheel"
        style={{ width: size, height: size }}
        onMouseDown={(e) => {
          draggingRef.current = true;
          updateFromPoint(e.clientX, e.clientY);
        }}
      >
        <div
          className="mtv-color-wheel__knob"
          style={{
            left: `${knobX}%`,
            top: `${knobY}%`,
            background: hsvToHex(hsv.h, hsv.s, hsv.v)
          }}
        />
      </div>
      <input
        className="mtv-color-wheel__lightness"
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={hsv.v}
        onChange={(e) => handleLightnessChange(Number(e.target.value))}
        aria-label="Lightness"
      />
    </div>
  );
}
