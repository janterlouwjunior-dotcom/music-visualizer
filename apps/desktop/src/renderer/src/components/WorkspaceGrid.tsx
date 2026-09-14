import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import GridLayout, { WidthProvider, type Layout } from "react-grid-layout";
import { Panel, Button } from "@music-theory-viz/ui-kit";
import {
  DEFAULT_GRID_SETTINGS,
  type ComponentInstance,
  type GridSettings,
  type Workspace
} from "../../../shared/workspace";
import { getVisualizationDefinition, listVisualizationDefinitions } from "./registry";
import { ComponentSettingsFields } from "./ComponentSettingsFields";
import type { MidiBridge } from "./types";
import { midiService } from "../midi/midiService";
import { transportService } from "../transport/transportService";
import "./WorkspaceGrid.css";

const MIN_BPM = 40;
const MAX_BPM = 240;

const MIN_COLS = 2;
const MAX_COLS = 48;
const MIN_ROWS = 2;
const MAX_ROWS = 48;
// Matches the `margin` prop passed to the grid below — both the horizontal
// gap RGL manages itself and the vertical gap this component reproduces by
// hand (see rowHeightPx/colWidthPx) need to agree on the same number.
const GRID_MARGIN = 12;
// Floor for computed cell sizes: guards against a divide-into-near-nothing
// result (e.g. a huge `rows`/`cols` count, or a not-yet-measured container)
// producing zero or negative pixel sizes.
const MIN_CELL_PX = 20;

// A stable, module-scoped object rather than a fresh literal per render: the
// previous inline `midi={{ onMidiNote: ..., sendMidiNote: ... }}` created a
// new reference on every WorkspaceGrid render, which every visualization's
// subscription useEffect depends on — forcing every MIDI-listening component
// on the grid to unsubscribe/resubscribe from midiService on any unrelated
// re-render (e.g. someone else's settings edit).
const midiBridge: MidiBridge = {
  onMidiNote: (handler) => midiService.subscribe(handler),
  sendMidiNote: (event) => midiService.send(event)
};

const AutoWidthGridLayout = WidthProvider(GridLayout);

interface WorkspaceGridProps {
  workspace: Workspace;
  /** Edit mode allows dragging/resizing/adding/removing; Play mode is read-only. */
  editable: boolean;
  onChange: (next: Workspace) => void;
}

interface PendingPlacement {
  componentKey: string;
  w: number;
  h: number;
}

interface GridCell {
  x: number;
  y: number;
}

interface ContextMenuState {
  /** Viewport coordinates, for positioning the menu itself. */
  clientX: number;
  clientY: number;
  /** Grid-area-relative coordinates, for seeding the placement ghost. */
  localX: number;
  localY: number;
}

function rectsOverlap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Whether a w×h footprint at (x, y) is fully in-bounds and clear of every existing item. */
function fitsAt(
  x: number,
  y: number,
  w: number,
  h: number,
  cols: number,
  rows: number,
  existing: ComponentInstance[]
): boolean {
  if (x < 0 || y < 0 || x + w > cols || y + h > rows) return false;
  return !existing.some((item) => rectsOverlap({ x, y, w, h }, item));
}

export function WorkspaceGrid({ workspace, editable, onChange }: WorkspaceGridProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingPlacement, setPendingPlacement] = useState<PendingPlacement | null>(null);
  const [ghostPos, setGhostPos] = useState<GridCell | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const gridAreaRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(transportService.isPlaying());
  const [bpm, setBpm] = useState(transportService.getBpm());
  useEffect(
    () =>
      transportService.subscribe(() => {
        setIsPlaying(transportService.isPlaying());
        setBpm(transportService.getBpm());
      }),
    []
  );

  useEffect(() => {
    // Unconditional — not gated by editable — since Space is the play/stop
    // shortcut in Play mode too, where the playback bar itself isn't shown
    // (see the toolbar below, which only renders in edit mode).
    function handleSpaceKeyDown(event: KeyboardEvent): void {
      if (event.code !== "Space") return;
      // A held key fires repeated keydowns at the OS repeat rate with only
      // one keyup at the end — without this guard, holding Space would
      // toggle play/stop repeatedly instead of once.
      if (event.repeat) return;
      const target = event.target as HTMLElement | null;
      const isFormControl =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        !!target?.isContentEditable;
      if (isFormControl) return;
      event.preventDefault();
      transportService.toggle();
    }
    window.addEventListener("keydown", handleSpaceKeyDown);
    return () => window.removeEventListener("keydown", handleSpaceKeyDown);
  }, []);

  useEffect(() => {
    const el = gridAreaRef.current;
    if (!el) return;
    // The grid area's height depends on flex layout (how much of
    // .workspace-grid the toolbar/selection bar leave behind), not on the
    // grid's own content — measuring it is what lets rowHeightPx below track
    // "however much vertical space is actually available" instead of a
    // fixed pixel number that drifts out of sync with it (e.g. once Play
    // mode's chrome disappears and hands that space back).
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setContainerSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!editable) {
      setSettingsOpen(false);
      setSelectedId(null);
      setPendingPlacement(null);
      setGhostPos(null);
      setContextMenu(null);
    }
  }, [editable]);

  useEffect(() => {
    setSelectedId(null);
    setPendingPlacement(null);
    setGhostPos(null);
    setContextMenu(null);
  }, [workspace.id]);

  useEffect(() => {
    if (!contextMenu) return;
    // Closes the menu on a click anywhere outside it. Attached in an effect
    // (not inline on the triggering contextmenu handler) so it can't catch
    // the very mousedown that opened the menu — that already happened by
    // the time this effect's cleanup-then-setup runs after render.
    function handleClickOutside(event: MouseEvent): void {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setContextMenu(null);
      }
    }
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, [contextMenu]);

  useEffect(() => {
    if (!selectedId && !pendingPlacement && !contextMenu) return;
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key !== "Escape") return;
      setSelectedId(null);
      setPendingPlacement(null);
      setGhostPos(null);
      setContextMenu(null);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedId, pendingPlacement, contextMenu]);

  useEffect(() => {
    // Unconditional — not gated by editable/selectedId — since this needs
    // to work in Play mode too, where there's no selection concept at all.
    // Flips every component with a "flatSharp" field (currently just Circle
    // of Fifths) at once, rather than only whichever one is selected: this
    // is meant as a whole-lesson spelling switch while performing, not a
    // per-component edit. Each Circle of Fifths instance shows its own
    // brief on-canvas confirmation in Play mode (see CircleOfFifths.tsx).
    function handleFlatSharpKeyDown(event: KeyboardEvent): void {
      if (event.key !== ".") return;
      const target = event.target as HTMLElement | null;
      const isFormControl =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        !!target?.isContentEditable;
      if (isFormControl) return;

      let changed = false;
      const nextItems = workspace.layout.map((item) => {
        const definition = getVisualizationDefinition(item.component);
        const hasFlatSharp = definition?.configSchema.some(
          (f) => f.key === "useFlats" && f.type === "flatSharp"
        );
        if (!definition || !hasFlatSharp) return item;
        const defaults = definition.defaultProps as Record<string, unknown>;
        const current = Boolean(item.props?.useFlats ?? defaults.useFlats);
        changed = true;
        return { ...item, props: { ...item.props, useFlats: !current } };
      });
      if (!changed) return;
      event.preventDefault();
      onChange({ ...workspace, layout: nextItems });
    }
    window.addEventListener("keydown", handleFlatSharpKeyDown);
    return () => window.removeEventListener("keydown", handleFlatSharpKeyDown);
  }, [workspace, onChange]);

  const gridSettings: GridSettings = workspace.gridSettings ?? DEFAULT_GRID_SETTINGS;
  const cols = gridSettings.cols ?? DEFAULT_GRID_SETTINGS.cols;
  const rows = gridSettings.rows ?? DEFAULT_GRID_SETTINGS.rows;
  const showGrid = gridSettings.showGrid ?? DEFAULT_GRID_SETTINGS.showGrid;

  // Mirrors react-grid-layout's own column-width formula (margin between
  // cells, plus the same margin again as outer container padding, which is
  // RGL's default when containerPadding isn't set) so the grid-line overlay
  // and the placement ghost land exactly on the real cell boundaries.
  const colWidthPx =
    containerSize.width > 0
      ? Math.max(MIN_CELL_PX, (containerSize.width - GRID_MARGIN * (cols + 1)) / cols)
      : 80;
  const rowHeightPx =
    containerSize.height > 0
      ? Math.max(MIN_CELL_PX, (containerSize.height - GRID_MARGIN * (rows + 1)) / rows)
      : 40;

  const layout: Layout[] = useMemo(
    () =>
      workspace.layout.map((item) => ({
        i: item.id,
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h
      })),
    [workspace.layout]
  );

  const handleLayoutChange = useCallback(
    (nextLayout: Layout[]) => {
      // react-grid-layout fires onLayoutChange continuously during a drag/resize,
      // not just once at the end. Every call here used to unconditionally build
      // new objects and call onChange, which produces a new `layout` array prop
      // on the next render, which react-grid-layout treats as an external change
      // and reacts to again — a feedback loop that pegs the render thread and
      // freezes the window. Bailing out when nothing actually moved (both at the
      // per-item level, preserving reference equality, and overall) breaks it.
      let changed = false;
      const nextItems: ComponentInstance[] = workspace.layout.map((item) => {
        const positioned = nextLayout.find((l) => l.i === item.id);
        if (!positioned) return item;
        if (
          positioned.x === item.x &&
          positioned.y === item.y &&
          positioned.w === item.w &&
          positioned.h === item.h
        ) {
          return item;
        }
        changed = true;
        return { ...item, x: positioned.x, y: positioned.y, w: positioned.w, h: positioned.h };
      });
      if (!changed) return;
      onChange({ ...workspace, layout: nextItems });
    },
    [workspace, onChange]
  );

  function updateInstanceProps(instanceId: string, partial: Record<string, unknown>): void {
    const nextItems = workspace.layout.map((item) =>
      item.id === instanceId ? { ...item, props: { ...item.props, ...partial } } : item
    );
    onChange({ ...workspace, layout: nextItems });
  }

  function removeInstance(instanceId: string): void {
    onChange({ ...workspace, layout: workspace.layout.filter((item) => item.id !== instanceId) });
    setSelectedId((cur) => (cur === instanceId ? null : cur));
  }

  /**
   * Exactly mirrors react-grid-layout's own calcGridItemPosition/
   * calcGridItemWHPx (see node_modules/react-grid-layout/.../calculateUtils.js)
   * — margin doubling as containerPadding, same as the `margin` prop passed
   * to AutoWidthGridLayout below. RGL rounds each item's final pixel left/
   * top/width/height independently (not just the shared colWidth/rowHeight
   * inputs), so reproducing that same per-item rounding here — rather than
   * multiplying the unrounded cell size straight through — is what makes
   * the placement ghost and the grid-line overlay land exactly on the same
   * pixel boundaries RGL itself draws items at.
   */
  function calcItemRectPx(
    x: number,
    y: number,
    w: number,
    h: number
  ): { left: number; top: number; width: number; height: number } {
    return {
      left: Math.round((colWidthPx + GRID_MARGIN) * x + GRID_MARGIN),
      top: Math.round((rowHeightPx + GRID_MARGIN) * y + GRID_MARGIN),
      width: Math.round(colWidthPx * w + Math.max(0, w - 1) * GRID_MARGIN),
      height: Math.round(rowHeightPx * h + Math.max(0, h - 1) * GRID_MARGIN)
    };
  }

  /** Grid cell under a grid-area-relative point, clamped so a w×h footprint always sits fully in bounds. */
  function computeClampedCell(localX: number, localY: number, w: number, h: number): GridCell {
    const rawX = Math.floor(localX / (colWidthPx + GRID_MARGIN));
    const rawY = Math.floor(localY / (rowHeightPx + GRID_MARGIN));
    return {
      x: Math.max(0, Math.min(rawX, Math.max(0, cols - w))),
      y: Math.max(0, Math.min(rawY, Math.max(0, rows - h)))
    };
  }

  function handleGridMouseMove(event: ReactMouseEvent<HTMLDivElement>): void {
    if (!pendingPlacement) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setGhostPos(
      computeClampedCell(
        event.clientX - rect.left,
        event.clientY - rect.top,
        pendingPlacement.w,
        pendingPlacement.h
      )
    );
  }

  function handleContextMenu(event: ReactMouseEvent<HTMLDivElement>): void {
    if (!editable) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    setPendingPlacement(null);
    setGhostPos(null);
    setSelectedId(null);
    setContextMenu({
      clientX: event.clientX,
      clientY: event.clientY,
      localX: event.clientX - rect.left,
      localY: event.clientY - rect.top
    });
  }

  function startPlacementFromContextMenu(componentKey: string): void {
    const definition = getVisualizationDefinition(componentKey);
    if (!definition || !contextMenu) return;
    const { w, h } = definition.defaultSize;
    setPendingPlacement({ componentKey, w, h });
    setGhostPos(computeClampedCell(contextMenu.localX, contextMenu.localY, w, h));
    setContextMenu(null);
  }

  function handleGridAreaClick(): void {
    if (pendingPlacement) {
      if (ghostPos && fitsAt(ghostPos.x, ghostPos.y, pendingPlacement.w, pendingPlacement.h, cols, rows, workspace.layout)) {
        const definition = getVisualizationDefinition(pendingPlacement.componentKey);
        if (definition) {
          const id = `${pendingPlacement.componentKey}-${Date.now().toString(36)}`;
          const newItem: ComponentInstance = {
            id,
            component: pendingPlacement.componentKey,
            x: ghostPos.x,
            y: ghostPos.y,
            w: pendingPlacement.w,
            h: pendingPlacement.h,
            props: { ...definition.defaultProps }
          };
          onChange({ ...workspace, layout: [...workspace.layout, newItem] });
          setSelectedId(id);
        }
      }
      setPendingPlacement(null);
      setGhostPos(null);
      return;
    }
    setSelectedId(null);
  }

  function handleItemClick(instanceId: string, event: ReactMouseEvent<HTMLDivElement>): void {
    // While placing a new component, a click anywhere over the grid area —
    // including on top of an existing item — should attempt placement there
    // (and correctly fail as a collision), not select the item underneath.
    // Not stopping propagation here lets it bubble to handleGridAreaClick,
    // which already has the up-to-date ghostPos from the mousemove above it.
    if (pendingPlacement) return;
    event.stopPropagation();
    setSelectedId(instanceId);
  }

  function updateGridSettings(partial: Partial<GridSettings>): void {
    onChange({ ...workspace, gridSettings: { ...gridSettings, ...partial } });
  }

  const selectedItem = selectedId ? workspace.layout.find((item) => item.id === selectedId) : undefined;
  const selectedDefinition = selectedItem ? getVisualizationDefinition(selectedItem.component) : undefined;

  const placementValid =
    pendingPlacement !== null &&
    ghostPos !== null &&
    fitsAt(ghostPos.x, ghostPos.y, pendingPlacement.w, pendingPlacement.h, cols, rows, workspace.layout);

  return (
    <div className="workspace-grid">
      {editable && (
        <div className="workspace-grid__toolbar">
          <div className="workspace-grid__playback-bar">
            <button
              type="button"
              className="workspace-grid__playback-button"
              onClick={() => transportService.toggle()}
              title={isPlaying ? "Stop (Space)" : "Play (Space)"}
              aria-pressed={isPlaying}
            >
              {isPlaying ? "■" : "▶"}
            </button>
            <button
              type="button"
              className="workspace-grid__playback-button workspace-grid__playback-button--placeholder"
              title="Ableton Link — not wired up yet"
              disabled
            >
              Link
            </button>
            <div className="workspace-grid__bpm">
              <input
                type="range"
                min={MIN_BPM}
                max={MAX_BPM}
                value={bpm}
                onChange={(e) => transportService.setBpm(Number(e.target.value))}
                aria-label="Tempo"
              />
              <span className="workspace-grid__bpm-value">{bpm} BPM</span>
            </div>
          </div>

          <div className="workspace-grid__toolbar-group workspace-grid__toolbar-group--right">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSettingsOpen((v) => !v)}
              title="Workspace settings"
            >
              ⚙ Grid settings
            </Button>
            {settingsOpen && (
              <div className="workspace-grid__popover workspace-grid__popover--right">
                <div className="workspace-grid__settings-field">
                  <label htmlFor="grid-cols">Columns</label>
                  <input
                    id="grid-cols"
                    type="number"
                    min={MIN_COLS}
                    max={MAX_COLS}
                    value={cols}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      if (Number.isFinite(value)) {
                        updateGridSettings({
                          cols: Math.min(MAX_COLS, Math.max(MIN_COLS, Math.round(value)))
                        });
                      }
                    }}
                  />
                </div>
                <div className="workspace-grid__settings-field">
                  <label htmlFor="grid-rows">Rows</label>
                  <input
                    id="grid-rows"
                    type="number"
                    min={MIN_ROWS}
                    max={MAX_ROWS}
                    value={rows}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      if (Number.isFinite(value)) {
                        updateGridSettings({
                          rows: Math.min(MAX_ROWS, Math.max(MIN_ROWS, Math.round(value)))
                        });
                      }
                    }}
                  />
                </div>
                <div className="workspace-grid__settings-field">
                  <label htmlFor="grid-show">Show grid</label>
                  <input
                    id="grid-show"
                    type="checkbox"
                    checked={showGrid}
                    onChange={(e) => updateGridSettings({ showGrid: e.target.checked })}
                  />
                </div>
                <button
                  className="workspace-grid__settings-reset"
                  onClick={() => updateGridSettings(DEFAULT_GRID_SETTINGS)}
                >
                  Reset to default
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {editable && (
        <div className="workspace-grid__selection-bar">
          {selectedItem && selectedDefinition ? (
            selectedDefinition.configSchema.length > 0 ? (
              <ComponentSettingsFields
                schema={selectedDefinition.configSchema}
                config={selectedItem.props ?? selectedDefinition.defaultProps}
                onConfigChange={(partial) => updateInstanceProps(selectedItem.id, partial)}
              />
            ) : (
              <span className="workspace-grid__selection-bar-hint">
                {selectedDefinition.name} has no options.
              </span>
            )
          ) : (
            <span className="workspace-grid__selection-bar-hint">
              {pendingPlacement
                ? "Click on the grid to place it (it won't drop somewhere that doesn't fit) — Escape to cancel."
                : "Select a component to see its options here."}
            </span>
          )}
        </div>
      )}

      <div
        ref={gridAreaRef}
        className={`workspace-grid__area${pendingPlacement ? " workspace-grid__area--placing" : ""}`}
        onMouseMove={handleGridMouseMove}
        onClick={handleGridAreaClick}
        onContextMenu={handleContextMenu}
      >
        {editable && showGrid && (
          <svg className="workspace-grid__grid-overlay">
            {Array.from({ length: cols }, (_, cx) =>
              Array.from({ length: rows }, (_, cy) => {
                const rect = calcItemRectPx(cx, cy, 1, 1);
                return (
                  <rect
                    key={`${cx}-${cy}`}
                    className="workspace-grid__grid-cell"
                    x={rect.left}
                    y={rect.top}
                    width={rect.width}
                    height={rect.height}
                  />
                );
              })
            )}
          </svg>
        )}

        {workspace.layout.length === 0 && (
          <div className="workspace-grid__empty">
            {editable ? "No components yet — right-click to add one." : "This workspace has no components."}
          </div>
        )}

        <AutoWidthGridLayout
          className="workspace-grid__layout"
          layout={layout}
          cols={cols}
          rowHeight={rowHeightPx}
          margin={[GRID_MARGIN, GRID_MARGIN]}
          compactType={null}
          preventCollision
          isDraggable={editable && !pendingPlacement}
          isResizable={editable && !pendingPlacement}
          resizeHandles={["nw", "ne", "sw", "se"]}
          onLayoutChange={handleLayoutChange}
          draggableHandle=".viz-card__move-handle"
        >
          {workspace.layout.map((item) => {
            const definition = getVisualizationDefinition(item.component);
            const Component = definition?.component;
            return (
              <div
                key={item.id}
                onClick={editable ? (e) => handleItemClick(item.id, e) : undefined}
              >
                <Panel
                  className={`viz-card${editable ? "" : " viz-card--play"}${
                    selectedId === item.id ? " viz-card--selected" : ""
                  }`}
                >
                  {editable && (
                    <div className="viz-card__overlay-controls">
                      <button className="viz-card__icon-button viz-card__move-handle" title="Move">
                        ⠿
                      </button>
                      <button
                        className="viz-card__icon-button viz-card__remove"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeInstance(item.id);
                        }}
                        title="Remove"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                  {Component && definition ? (
                    <Component
                      instanceId={item.id}
                      config={{ ...definition.defaultProps, ...item.props }}
                      onConfigChange={(partial) => updateInstanceProps(item.id, partial)}
                      midi={midiBridge}
                      editable={editable}
                    />
                  ) : (
                    <div className="viz-card__unknown">Unknown component: {item.component}</div>
                  )}
                </Panel>
              </div>
            );
          })}
        </AutoWidthGridLayout>

        {pendingPlacement &&
          ghostPos &&
          (() => {
            const rect = calcItemRectPx(ghostPos.x, ghostPos.y, pendingPlacement.w, pendingPlacement.h);
            return (
              <div
                className={`workspace-grid__placement-ghost${placementValid ? "" : " workspace-grid__placement-ghost--invalid"}`}
                style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
              />
            );
          })()}
      </div>

      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="workspace-grid__context-menu"
          style={{ left: contextMenu.clientX, top: contextMenu.clientY }}
        >
          {listVisualizationDefinitions().map((def) => (
            <button
              key={def.key}
              className="workspace-grid__picker-item"
              onClick={() => startPlacementFromContextMenu(def.key)}
            >
              <span className="workspace-grid__picker-text">
                <span className="workspace-grid__picker-name">{def.name}</span>
                <span className="workspace-grid__picker-desc">{def.description}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
