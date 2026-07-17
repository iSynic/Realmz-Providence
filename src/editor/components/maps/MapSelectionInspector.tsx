import { useEffect, useMemo, useState } from "react";
import type { EditorState } from "../../store";
import type {
  DungeonCellFlag,
  MapEntity,
  MapPaintVariation,
  Project,
  ProjectCommand,
  SelectedEntity,
  SmartBrushPreset,
  TilesetAsset
} from "../../types";
import {
  buildConnectedSelectionClearPlan,
  buildConnectedSelectionFillPlan,
  buildConnectedSelectionReplacePlan,
  buildConnectedSelectionSmartTerrainPlan,
  connectedSelectionPaintCommand,
  connectedSelectionSmartTerrainCommand
} from "../../map/connectedSelectionActions";
import { captureMapStampFromCells, createMapStampId } from "../../map/customMapStamps";
import { paintSeed } from "../../map/paintResolver";
import { SMART_BRUSH_PRESETS } from "../../map/smartTerrainBrush";
import { tileValueAt } from "../../map/geometry";
import { TriggerSelectionDetails } from "./MapActionPointInspector";
import { MapCellSelectionInspector } from "./MapCellSelectionInspector";
import { RecordSelectionDetails } from "./MapRecordsWorkbench";
import { RandomRectangleEditor } from "./RandomEncountersWorkbench";
import { DungeonCellFlagEditor } from "./DungeonFlagInspector";
import type { MapSelection } from "./mapSelectionModel";

export function MapSelectionInspector({
  selection,
  map,
  project,
  selectedTileset,
  atlas,
  icons,
  dungeonDrawFlags,
  onSetDungeonDrawFlags,
  onSelectEntity,
  onOpenScripts,
  onApplyCommand,
  onClearConnectedSelection,
  selectedTile,
  paintVariation,
  activePaintGroupId,
  variationTiles,
  smartBrushPreset
}: {
  selection: MapSelection;
  map: MapEntity | null;
  project: Project | null;
  selectedTileset: TilesetAsset | null;
  atlas: EditorState["atlasEntries"][string] | null;
  icons: EditorState["iconEntries"];
  dungeonDrawFlags: Record<DungeonCellFlag, boolean>;
  onSetDungeonDrawFlags: (flags: Record<DungeonCellFlag, boolean>) => void;
  onSelectEntity: (entity: SelectedEntity) => void;
  onOpenScripts: (entity: SelectedEntity) => void;
  onApplyCommand: (command: ProjectCommand) => void;
  onClearConnectedSelection: () => void;
  selectedTile: number;
  paintVariation: MapPaintVariation;
  activePaintGroupId: string;
  variationTiles: number[] | null;
  smartBrushPreset: SmartBrushPreset;
}) {
  return (
    <section className="context-panel map-selection-inspector">
      <div className="panel-header">
        <span>Selection Inspector</span>
      </div>
      {map?.levelType === "dungeon" && (selection.kind === "cell" || selection.kind === "region") && (
        <DungeonCellFlagEditor
          map={map}
          selection={selection}
          atlas={atlas}
          selectedTileset={selectedTileset}
          icons={icons}
          dungeonDrawFlags={dungeonDrawFlags}
          onSetDungeonDrawFlags={onSetDungeonDrawFlags}
          onApplyCommand={onApplyCommand}
        />
      )}
      {selection.kind === "cell" && map?.levelType !== "dungeon" && (
        <MapCellSelectionInspector
          selection={selection}
          map={map}
          project={project}
          selectedTileset={selectedTileset}
          icons={icons}
          onSelectEntity={onSelectEntity}
          onOpenScripts={onOpenScripts}
          onApplyCommand={onApplyCommand}
        />
      )}
      {selection.kind === "cells" && (
        <ConnectedSelectionActions
          selection={selection.selection}
          map={map}
          selectedTileset={selectedTileset}
          atlas={atlas}
          project={project}
          selectedTile={selectedTile}
          paintVariation={paintVariation}
          activePaintGroupId={activePaintGroupId}
          variationTiles={variationTiles}
          smartBrushPreset={smartBrushPreset}
          onApplyCommand={onApplyCommand}
          onClearSelection={onClearConnectedSelection}
        />
      )}
      {selection.kind === "trigger" && (
        <TriggerSelectionDetails
          project={project}
          trigger={selection.trigger}
          onApplyCommand={onApplyCommand}
          onSelectEntity={onSelectEntity}
          onOpenScripts={onOpenScripts}
        />
      )}
      {selection.kind === "random" && (
        <RandomRectangleEditor map={map} rect={selection.rect} onApplyCommand={onApplyCommand} compact />
      )}
      {selection.kind === "record" && (
        <RecordSelectionDetails project={project} map={map} record={selection.record} onSelectEntity={onSelectEntity} onApplyCommand={onApplyCommand} />
      )}
      {project && <small className="context-footnote">{project.scenario.name}</small>}
    </section>
  );
}

function ConnectedSelectionActions({
  selection,
  map,
  selectedTileset,
  atlas,
  project,
  selectedTile,
  paintVariation,
  activePaintGroupId,
  variationTiles,
  smartBrushPreset,
  onApplyCommand,
  onClearSelection
}: {
  selection: Extract<MapSelection, { kind: "cells" }>["selection"];
  map: MapEntity | null;
  selectedTileset: TilesetAsset | null;
  atlas: EditorState["atlasEntries"][string] | null;
  project: Project | null;
  selectedTile: number;
  paintVariation: MapPaintVariation;
  activePaintGroupId: string;
  variationTiles: number[] | null;
  smartBrushPreset: SmartBrushPreset;
  onApplyCommand: (command: ProjectCommand) => void;
  onClearSelection: () => void;
}) {
  const anchorTile = map ? tileValueAt(map, selection.anchor.x, selection.anchor.y) : 0;
  const [sourceTile, setSourceTile] = useState(anchorTile);
  useEffect(() => setSourceTile(anchorTile), [anchorTile, selection.anchor.x, selection.anchor.y]);
  const intent = useMemo(() => ({
    selectedTile,
    selectedTileset,
    variation: paintVariation,
    activeGroupId: activePaintGroupId,
    variationTiles,
    seed: paintSeed(map?.id, "connected-selection", selection.anchor.x, selection.anchor.y, selectedTile, activePaintGroupId, variationTiles?.join(","))
  }), [activePaintGroupId, map?.id, paintVariation, selectedTile, selectedTileset, selection.anchor.x, selection.anchor.y, variationTiles]);
  const fillPlan = useMemo(
    () => map ? buildConnectedSelectionFillPlan(map, selection.cells, intent) : null,
    [intent, map, selection.cells]
  );
  const replacePlan = useMemo(
    () => map ? buildConnectedSelectionReplacePlan(map, selection.cells, sourceTile, intent) : null,
    [intent, map, selection.cells, sourceTile]
  );
  const clearPlan = useMemo(
    () => map ? buildConnectedSelectionClearPlan(map, selection.cells, selectedTileset) : null,
    [map, selectedTileset, selection.cells]
  );
  const smartPlan = useMemo(
    () => map ? buildConnectedSelectionSmartTerrainPlan(map, selection.cells, smartBrushPreset, selectedTileset, atlas) : null,
    [atlas, map, selectedTileset, selection.cells, smartBrushPreset]
  );
  const stampPreview = useMemo(
    () => map ? captureMapStampFromCells(map, selection.cells, "Selection stamp", "map-stamp:selection-preview") : null,
    [map, selection.cells]
  );
  const stampTooLarge = Boolean(stampPreview && (stampPreview.width > 32 || stampPreview.height > 32));
  const applyPlan = (label: string, plan: typeof fillPlan) => {
    if (!map || !plan) return;
    const command = connectedSelectionPaintCommand(map, label, plan);
    if (command) onApplyCommand(command);
  };
  const applySmartTerrain = () => {
    if (!map || !smartPlan) return;
    const command = connectedSelectionSmartTerrainCommand(map, smartBrushPreset, smartPlan);
    if (command) onApplyCommand(command);
  };
  const createStamp = () => {
    if (!map || !project || !stampPreview || stampTooLarge) return;
    const fallbackName = `Stamp ${(project.editorMetadata?.mapStamps?.length ?? 0) + 1}`;
    const name = window.prompt("Name this map stamp", fallbackName)?.trim();
    if (!name) return;
    const stamp = captureMapStampFromCells(map, selection.cells, name, createMapStampId(name));
    if (!stamp) return;
    onApplyCommand({
      kind: "createMapStamp",
      label: `Create stamp ${stamp.name}`,
      id: stamp.id,
      name: stamp.name,
      width: stamp.width,
      height: stamp.height,
      cells: stamp.cells
    });
  };
  const smartPresetLabel = SMART_BRUSH_PRESETS.find((preset) => preset.id === smartBrushPreset)?.label ?? smartBrushPreset;
  return (
    <div className="connected-selection-summary">
      <div className="connected-selection-heading">
        <strong>Connected Cell Selection</strong>
        <span>{selection.cells.length.toLocaleString()} cells</span>
      </div>
      <small>
        {connectedMatchModeLabel(selection.matchMode)} | Anchor {selection.anchor.x}, {selection.anchor.y} | Tile {anchorTile}
      </small>
      {map?.levelType === "land" && (
        <div className="connected-selection-actions">
          <section>
            <div><strong>Fill</strong><span>Paint {selectedTile}</span></div>
            <small>{affectedCellsLabel(fillPlan?.changes.length ?? 0, selection.cells.length)}</small>
            <button className="btn btn-primary btn-xs" type="button" disabled={!fillPlan?.changes.length} onClick={() => applyPlan("Fill selected cells", fillPlan)}>
              Fill Selection
            </button>
          </section>
          <section>
            <label>
              <span>Replace Tile</span>
              <input type="number" value={sourceTile} onChange={(event) => setSourceTile(Number(event.target.value) || 0)} />
            </label>
            <small>{affectedCellsLabel(replacePlan?.changes.length ?? 0, selection.cells.length)}</small>
            <button className="btn btn-secondary btn-xs" type="button" disabled={!replacePlan?.changes.length} onClick={() => applyPlan(`Replace tile ${sourceTile} in selection`, replacePlan)}>
              Replace In Selection
            </button>
          </section>
          <section>
            <div><strong>Clear</strong><span>Restore base terrain</span></div>
            <small>{affectedCellsLabel(clearPlan?.changes.length ?? 0, selection.cells.length)}</small>
            <button className="btn btn-danger btn-xs" type="button" disabled={!clearPlan?.changes.length} onClick={() => applyPlan("Clear selected cells", clearPlan)}>
              Clear Selected Cells
            </button>
          </section>
          <section>
            <div><strong>Smart Terrain</strong><span>{smartPresetLabel}</span></div>
            <small>
              {smartPlan?.reason ?? `${(smartPlan?.changedCount ?? 0).toLocaleString()} cells will change${smartPlan?.skippedCount ? `; ${smartPlan.skippedCount.toLocaleString()} protected cells skipped` : ""}`}
            </small>
            <button className="btn btn-primary btn-xs" type="button" disabled={!smartPlan?.changedCount} onClick={applySmartTerrain}>
              Apply {smartPresetLabel}
            </button>
          </section>
          <section>
            <div><strong>Reusable Stamp</strong><span>{stampPreview ? `${stampPreview.width}x${stampPreview.height}` : "No cells"}</span></div>
            <small>
              {stampTooLarge
                ? "Selection exceeds the 32x32 reusable stamp limit"
                : `${selection.cells.length.toLocaleString()} selected cells; unselected cells inside the bounds stay transparent`}
            </small>
            <button className="btn btn-secondary btn-xs" type="button" disabled={!project || !stampPreview || stampTooLarge} onClick={createStamp}>
              Create Reusable Stamp
            </button>
          </section>
        </div>
      )}
      <button className="btn btn-secondary btn-xs" type="button" onClick={onClearSelection}>
        Clear Selection
      </button>
    </div>
  );
}

function affectedCellsLabel(changed: number, selected: number) {
  return changed === 0 ? `No changes across ${selected.toLocaleString()} selected cells` : `${changed.toLocaleString()} of ${selected.toLocaleString()} selected cells will change`;
}

function connectedMatchModeLabel(mode: "exact" | "semantic-family" | "behavior") {
  if (mode === "semantic-family") return "Terrain family";
  if (mode === "behavior") return "Realmz behavior";
  return "Exact tile";
}
