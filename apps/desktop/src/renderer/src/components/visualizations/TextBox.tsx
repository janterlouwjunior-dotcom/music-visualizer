import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { TextAlign, VisualizationProps } from "../types";
import "./TextBox.css";

export interface TextBoxConfig {
  text: string;
  bold: boolean;
  italic: boolean;
  /** Empty string means "use the app's own UI font" (see FONT_OPTIONS below). */
  fontFamily: string;
  align: TextAlign;
}

export const FONT_OPTIONS = [
  { value: "", label: "App default" },
  { value: "Georgia, 'Times New Roman', serif", label: "Georgia" },
  { value: "'Times New Roman', Times, serif", label: "Times New Roman" },
  { value: "Arial, Helvetica, sans-serif", label: "Arial" },
  { value: "Verdana, Geneva, sans-serif", label: "Verdana" },
  { value: "'Courier New', Courier, monospace", label: "Courier New" },
  { value: "'Comic Sans MS', 'Comic Sans', cursive", label: "Comic Sans MS" },
  { value: "'Brush Script MT', cursive", label: "Brush Script" }
];

const MIN_FONT_PX = 8;
const MAX_FONT_PX = 300;
/** Flat size for the placeholder — text that isn't there yet has no content
 * to size against, and letting the search run on an empty box would just
 * grow the placeholder until one blank line fills the whole height. */
const EMPTY_FONT_PX = 16;

export function TextBox({ config, onConfigChange, editable }: VisualizationProps<TextBoxConfig>) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [fontSize, setFontSize] = useState(EMPTY_FONT_PX);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;

    function fit(): void {
      if (!el) return;
      if (!config.text) {
        el.style.fontSize = `${EMPTY_FONT_PX}px`;
        setFontSize(EMPTY_FONT_PX);
        return;
      }
      // Binary search the largest font size whose rendered text still fits
      // both dimensions of the box — scrollHeight/scrollWidth vs. the box's
      // own fixed clientHeight/clientWidth (100% of the panel, independent
      // of content) tell us when it stops fitting. Mutating el.style
      // directly during the search (rather than via React state per
      // iteration) keeps this to one measured reflow per step instead of a
      // render each, and one final setState once it converges.
      let lo = MIN_FONT_PX;
      let hi = MAX_FONT_PX;
      let best = MIN_FONT_PX;
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        el.style.fontSize = `${mid}px`;
        const fits = el.scrollHeight <= el.clientHeight && el.scrollWidth <= el.clientWidth;
        if (fits) {
          best = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      el.style.fontSize = `${best}px`;
      setFontSize(best);
    }

    fit();
    // Refit on resize too (dragging/resizing the panel changes clientWidth/
    // clientHeight without changing any of the effect's own dependencies).
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [config.text, config.bold, config.italic, config.fontFamily]);

  const style: CSSProperties = {
    fontSize: `${fontSize}px`,
    fontWeight: config.bold ? "bold" : "normal",
    fontStyle: config.italic ? "italic" : "normal",
    // Falls back to the app's own font (see tokens.css) rather than baking a
    // specific family in as the "default" — a blank selection should track
    // whatever the app's UI font is, even if that changes later.
    fontFamily: config.fontFamily || "var(--font-family-ui)",
    textAlign: config.align ?? "left",
    // Play mode is a clean read view — text that overflows is just clipped,
    // never scrollable. Edit mode keeps a scrollbar as a fallback for
    // whatever the fit search couldn't quite resolve (e.g. a single line so
    // long even the minimum font size can't fit it — see MIN_FONT_PX).
    overflowY: editable ? "auto" : "hidden",
    overflowX: editable ? "auto" : "hidden"
  };

  return (
    <textarea
      ref={textareaRef}
      className="text-box"
      style={style}
      value={config.text}
      placeholder="Type here…"
      onChange={(e) => onConfigChange({ text: e.target.value })}
      spellCheck={false}
      autoCorrect="off"
      autoCapitalize="off"
      autoComplete="off"
    />
  );
}
