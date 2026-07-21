import { TOOLS } from "../../constants";
import type { EditorState } from "../../store";
import type { EditorTool, MapEntity, MapWorkbenchMode, TilesetAsset } from "../../types";
import type { ConnectedTileMatchMode } from "../../map/connectedMapSelection";
import type { MapSelectionDrawMode, MapShapeFill } from "../../map/mapCellShapes";
import { TutorialTip } from "../TutorialTip";
import { mapWorkbenchModeLabel } from "./mapBrowserModel";
import { PaintTileSummary } from "./MapPaintInspector";
import { MapSelectionToolOptions } from "./MapSelectionToolOptions";
import { MapToolsetModeNotice } from "./MapToolsetModeNotice";

const LAND_AUTHORING_TOOL_IDS: EditorTool[] = ["paint", "bucket", "stamp", "trigger", "random"];
const DUNGEON_AUTHORING_TOOL_IDS: EditorTool[] = ["dungeon-draw", "trigger", "random"];
const NAVIGATION_TOOL_IDS: EditorTool[] = ["select", "wand", "pan", "sample"];
const TOOL_BY_ID = new Map(TOOLS.map((tool) => [tool.id, tool]));

export function MapToolset({
  state,
  selectedMap,
  selectedTileset,
  atlas,
  workbenchMode,
  connectedSelectionMode,
  selectionDrawMode,
  selectionShapeFill,
  onSetWorkbenchMode,
  onSetConnectedSelectionMode,
  onSetSelectionDrawMode,
  onSetSelectionShapeFill,
  onSetTool,
  onSelectTile
}: {
  state: EditorState;
  selectedMap: MapEntity | null;
  selectedTileset: TilesetAsset | null;
  atlas: EditorState["atlasEntries"][string] | null;
  workbenchMode: MapWorkbenchMode;
  connectedSelectionMode: ConnectedTileMatchMode;
  selectionDrawMode: MapSelectionDrawMode;
  selectionShapeFill: MapShapeFill;
  onSetWorkbenchMode: (mode: MapWorkbenchMode) => void;
  onSetConnectedSelectionMode: (mode: ConnectedTileMatchMode) => void;
  onSetSelectionDrawMode: (mode: MapSelectionDrawMode) => void;
  onSetSelectionShapeFill: (fill: MapShapeFill) => void;
  onSetTool: (tool: EditorTool) => void;
  onSelectTile: (tile: number) => void;
}) {
  const isDungeon = selectedMap?.levelType === "dungeon";
  const authoringTools = isDungeon ? DUNGEON_AUTHORING_TOOL_IDS : LAND_AUTHORING_TOOL_IDS;
  return (
    <section className="context-panel map-toolset-panel">
      <div className="panel-header">
        <span>Map Toolset</span>
        <small>{workbenchMode === "canvas" ? toolLabel(state.activeTool) : mapWorkbenchModeLabel(workbenchMode)}</small>
      </div>
      {workbenchMode === "canvas" ? (
        <>
          <div className="map-sidebar-group canvas-tools-group">
            <div className="map-sidebar-group-title">Canvas Tools</div>
            <div className="sidebar-tool-columns">
              <div className="sidebar-tool-column authoring-tools" aria-label="Authoring tools">
                {authoringTools.map((id) => renderSidebarTool(id, state.activeTool, onSetTool))}
              </div>
              <div className="sidebar-tool-column navigation-tools" aria-label="Navigation and selection tools">
                {NAVIGATION_TOOL_IDS.map((id) => renderSidebarTool(id, state.activeTool, onSetTool))}
              </div>
            </div>
          </div>
          <MapSelectionToolOptions
            activeTool={state.activeTool}
            connectedSelectionMode={connectedSelectionMode}
            selectionDrawMode={selectionDrawMode}
            selectionShapeFill={selectionShapeFill}
            onSetConnectedSelectionMode={onSetConnectedSelectionMode}
            onSetSelectionDrawMode={onSetSelectionDrawMode}
            onSetSelectionShapeFill={onSetSelectionShapeFill}
          />
          {isDungeon ? (
            <div className="map-toolset-mode-notice">
              <strong>Dungeon cells use flags</strong>
              <p>Draw applies the selected dungeon cell flags. Select a cell or region to adjust the draw flags in the inspector.</p>
            </div>
          ) : (
            <PaintTileSummary
              selectedTile={state.selectedTile}
              inspectedTile={state.selectedCell?.tile ?? null}
              atlas={atlas}
              selectedTileset={selectedTileset}
              tileAttributes={state.project?.tileAttributes ?? []}
              icons={state.iconEntries}
              onSelectTile={onSelectTile}
            />
          )}
        </>
      ) : (
        <MapToolsetModeNotice
          mode={workbenchMode}
          onReturnToCanvas={() => onSetWorkbenchMode("canvas")}
        />
      )}
    </section>
  );
}

function renderSidebarTool(id: EditorTool, activeTool: EditorTool, onSetTool: (tool: EditorTool) => void) {
  const tool = TOOL_BY_ID.get(id);
  if (!tool) return null;
  return (
    <TutorialTip key={tool.id} title={toolLabel(tool.id)} body={tool.hint} side="right">
      <button className={`sidebar-tool${activeTool === tool.id ? " active" : ""}`} onClick={() => onSetTool(tool.id)}>
        {tool.icon}
        <span>{toolLabel(tool.id)}</span>
      </button>
    </TutorialTip>
  );
}

function toolLabel(tool: EditorTool) {
  const definition = TOOL_BY_ID.get(tool);
  if (definition) return definition.label;
  return tool[0].toUpperCase() + tool.slice(1);
}
