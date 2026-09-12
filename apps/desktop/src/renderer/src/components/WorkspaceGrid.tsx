import { useCallback, useEffect, useMemo, useState } from "react";
import GridLayout, { WidthProvider, type Layout } from "react-grid-layout";
import { Panel, Button } from "@music-theory-viz/ui-kit";
import {
  DEFAULT_GRID_SETTINGS,
  type ComponentInstance,
  type GridSettings,
  type Workspace
} from "../../../shared/workspace";
import { getVisualizationDefinition, listVisualizationDefinitions } from "./registry";
import { midiService } from "../midi/midiService";
import "./WorkspaceGrid.css";

const MIN_COLS = 2;
const MAX_COLS = 48;
const MIN_ROW_HEIGHT = 10;
const MAX_ROW_HEIGHT = 200;

const AutoWidthGridLayout = WidthProvider(GridLayout);

interface WorkspaceGridProps {
  workspace: Workspace;
  /** Edit mode allows dragging/resizing/adding/removing; Play mode is read-only. */
  editable: boolean;
  onChange: (next: Workspace) => void;
}

export function WorkspaceGrid({ workspace, editable, onChange }: WorkspaceGridProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (!editable) {
      setPickerOpen(false);
      setSettingsOpen(false);
    }
  }, [editable]);

  const gridSettings: GridSettings = workspace.gridSettings ?? DEFAULT_GRID_SETTINGS;

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
      const nextItems: ComponentInstance[] = workspace.layout.map((item) => {
        const positioned = nextLayout.find((l) => l.i === item.id);
        return positioned
          ? { ...item, x: positioned.x, y: positioned.y, w: positioned.w, h: positioned.h }
          : item;
      });
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
  }

  function addInstance(componentKey: string): void {
    const definition = getVisualizationDefinition(componentKey);
    if (!definition) return;
    const id = `${componentKey}-${Date.now().toString(36)}`;
    const newItem: ComponentInstance = {
      id,
      component: componentKey,
      x: 0,
      y: Infinity,
      w: definition.defaultSize.w,
      h: definition.defaultSize.h,
      props: { ...definition.defaultProps }
    };
    onChange({ ...workspace, layout: [...workspace.layout, newItem] });
    setPickerOpen(false);
  }

  function updateGridSettings(partial: Partial<GridSettings>): void {
    onChange({ ...workspace, gridSettings: { ...gridSettings, ...partial } });
  }

  return (
    <div className="workspace-grid">
      {editable && (
        <div className="workspace-grid__toolbar">
          <div className="workspace-grid__toolbar-group">
            <Button variant="primary" size="sm" onClick={() => setPickerOpen((v) => !v)}>
              + Add component
            </Button>
            {pickerOpen && (
              <div className="workspace-grid__popover">
                {listVisualizationDefinitions().map((def) => (
                  <button
                    key={def.key}
                    className="workspace-grid__picker-item"
                    onClick={() => addInstance(def.key)}
                  >
                    <span className="workspace-grid__picker-icon">{def.icon}</span>
                    <span className="workspace-grid__picker-text">
                      <span className="workspace-grid__picker-name">{def.name}</span>
                      <span className="workspace-grid__picker-desc">{def.description}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
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
                    value={gridSettings.cols}
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
                  <label htmlFor="grid-row-height">Row height (px)</label>
                  <input
                    id="grid-row-height"
                    type="number"
                    min={MIN_ROW_HEIGHT}
                    max={MAX_ROW_HEIGHT}
                    value={gridSettings.rowHeight}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      if (Number.isFinite(value)) {
                        updateGridSettings({
                          rowHeight: Math.min(MAX_ROW_HEIGHT, Math.max(MIN_ROW_HEIGHT, Math.round(value)))
                        });
                      }
                    }}
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

      {workspace.layout.length === 0 ? (
        <div className="workspace-grid__empty">
          {editable
            ? 'No components yet — click "Add component" to place one.'
            : "This workspace has no components."}
        </div>
      ) : (
        <AutoWidthGridLayout
          className="workspace-grid__layout"
          layout={layout}
          cols={gridSettings.cols}
          rowHeight={gridSettings.rowHeight}
          margin={[12, 12]}
          compactType="vertical"
          isDraggable={editable}
          isResizable={editable}
          onLayoutChange={handleLayoutChange}
          draggableHandle=".viz-card__drag-handle"
        >
          {workspace.layout.map((item) => {
            const definition = getVisualizationDefinition(item.component);
            const Component = definition?.component;
            return (
              <div key={item.id}>
                <Panel
                  className="viz-card"
                  title={
                    <span className={editable ? "viz-card__drag-handle" : undefined}>
                      {definition?.icon} {definition?.name ?? item.component}
                    </span>
                  }
                  actions={
                    editable ? (
                      <button
                        className="viz-card__remove"
                        onClick={() => removeInstance(item.id)}
                        title="Remove"
                      >
                        ✕
                      </button>
                    ) : undefined
                  }
                >
                  {Component && definition ? (
                    <Component
                      instanceId={item.id}
                      config={item.props ?? definition.defaultProps}
                      onConfigChange={(partial) => updateInstanceProps(item.id, partial)}
                      midi={{
                        onMidiNote: (handler) => midiService.subscribe(handler),
                        sendMidiNote: (event) => midiService.send(event)
                      }}
                    />
                  ) : (
                    <div className="viz-card__unknown">Unknown component: {item.component}</div>
                  )}
                </Panel>
              </div>
            );
          })}
        </AutoWidthGridLayout>
      )}
    </div>
  );
}
