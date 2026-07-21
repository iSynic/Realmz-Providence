import type { EditorTool } from "../../types";
import type { ConnectedTileMatchMode } from "../../map/connectedMapSelection";
import type { MapSelectionDrawMode, MapShapeFill } from "../../map/mapCellShapes";
import { SegmentedControl, type SegmentedControlOption } from "../../ui";

const CONNECTED_MATCH_OPTIONS: ReadonlyArray<SegmentedControlOption<ConnectedTileMatchMode>> = [
  { value: "exact", label: "Exact", title: "Match the exact raw tile value" },
  { value: "semantic-family", label: "Terrain", title: "Match the known terrain family, including center and transition variants" },
  { value: "behavior", label: "Behavior", title: "Match known Realmz movement and blocking behavior" }
];
const SELECTION_DRAW_OPTIONS: ReadonlyArray<SegmentedControlOption<MapSelectionDrawMode>> = [
  { value: "area", label: "Area", title: "Drag a filled rectangular authoring region" },
  { value: "line", label: "Line", title: "Drag an orthogonally connected line selection" },
  { value: "rectangle", label: "Rect", title: "Drag a rectangular cell selection" },
  { value: "ellipse", label: "Ellipse", title: "Drag an elliptical cell selection" }
];
const SHAPE_FILL_OPTIONS: ReadonlyArray<SegmentedControlOption<MapShapeFill>> = [
  { value: "outline", label: "Outline" },
  { value: "filled", label: "Filled" }
];

export function MapSelectionToolOptions({
  activeTool,
  connectedSelectionMode,
  selectionDrawMode,
  selectionShapeFill,
  onSetConnectedSelectionMode,
  onSetSelectionDrawMode,
  onSetSelectionShapeFill
}: {
  activeTool: EditorTool;
  connectedSelectionMode: ConnectedTileMatchMode;
  selectionDrawMode: MapSelectionDrawMode;
  selectionShapeFill: MapShapeFill;
  onSetConnectedSelectionMode: (mode: ConnectedTileMatchMode) => void;
  onSetSelectionDrawMode: (mode: MapSelectionDrawMode) => void;
  onSetSelectionShapeFill: (fill: MapShapeFill) => void;
}) {
  return (
    <>
      {(activeTool === "wand" || activeTool === "bucket") && (
        <div className="map-sidebar-group wand-match-group">
          <div className="map-sidebar-group-title">Connected Match</div>
          <SegmentedControl
            ariaLabel={`${activeTool === "wand" ? "Magic Wand" : "Paint Bucket"} connected tile match`}
            value={connectedSelectionMode}
            options={CONNECTED_MATCH_OPTIONS}
            onChange={onSetConnectedSelectionMode}
            className="wand-match-control"
          />
        </div>
      )}
      {activeTool === "select" && (
        <div className="map-sidebar-group selection-shape-group">
          <div className="map-sidebar-group-title">Selection Shape</div>
          <SegmentedControl
            ariaLabel="Selection shape"
            value={selectionDrawMode}
            options={SELECTION_DRAW_OPTIONS}
            onChange={onSetSelectionDrawMode}
            className="selection-shape-control"
          />
          {(selectionDrawMode === "rectangle" || selectionDrawMode === "ellipse") && (
            <SegmentedControl
              ariaLabel="Selection shape fill"
              value={selectionShapeFill}
              options={SHAPE_FILL_OPTIONS}
              onChange={onSetSelectionShapeFill}
              className="shape-fill-control"
            />
          )}
          {selectionDrawMode !== "area" && (
            <small className="context-capacity-note">Drag on the map. Shift adds to the current selection; Alt subtracts.</small>
          )}
        </div>
      )}
    </>
  );
}
