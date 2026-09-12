import { useCallback, useMemo, useState } from "react";
import GridLayout, { WidthProvider, type Layout } from "react-grid-layout";
import { Panel, Button } from "@music-theory-viz/ui-kit";
import type { Workspace, ComponentInstance } from "../../../shared/workspace";
import { getVisualizationDefinition, listVisualizationDefinitions } from "./registry";
import { midiService } from "../midi/midiService";
import "./WorkspaceGrid.css";

const AutoWidthGridLayout = WidthProvider(GridLayout);

interface WorkspaceGridProps {
  workspace: Workspace;
  onChange: (next: Workspace) => void;
}

export function WorkspaceGrid({ workspace, onChange }: WorkspaceGridProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

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

  return (
    <div className="workspace-grid">
      <div className="workspace-grid__toolbar">
        <Button variant="primary" size="sm" onClick={() => setPickerOpen((v) => !v)}>
          + Add component
        </Button>
        {pickerOpen && (
          <div className="workspace-grid__picker">
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

      {workspace.layout.length === 0 ? (
        <div className="workspace-grid__empty">
          No components yet — click "Add component" to place one.
        </div>
      ) : (
        <AutoWidthGridLayout
          className="workspace-grid__layout"
          layout={layout}
          cols={12}
          rowHeight={40}
          margin={[12, 12]}
          compactType="vertical"
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
                    <span className="viz-card__drag-handle">
                      {definition?.icon} {definition?.name ?? item.component}
                    </span>
                  }
                  actions={
                    <button
                      className="viz-card__remove"
                      onClick={() => removeInstance(item.id)}
                      title="Remove"
                    >
                      ✕
                    </button>
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
