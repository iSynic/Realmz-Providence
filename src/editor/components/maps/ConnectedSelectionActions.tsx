import { useEffect, useMemo, useState } from "react";
import type { EditorState } from "../../store";
import type {
  LibraryAsset,
  MapEntity,
  MapPaintVariation,
  PaintCellChange,
  Project,
  ProjectCommand,
  SmartBrushPreset,
  TilePaletteCategory,
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
import { SMART_BRUSH_PRESETS, smartBrushProfileForTileset } from "../../map/smartTerrainBrush";
import { tileValueAt } from "../../map/geometry";
import { reshapeConnectedCellSelection, type ConnectedCellSelection } from "../../map/connectedMapSelection";
import { analyzeMapPaintOperation, applyMapPaintImpactToSmartPlan } from "../../map/mapPaintSafeguards";
import { PaintPalettePanel } from "../TileSelectionBar";
import { MapPaintProtectionSummary } from "./MapPaintProtectionSummary";

export function ConnectedSelectionActions({
  selection,
  map,
  selectedTileset,
  atlas,
  project,
  libraryAssets,
  atlasStatus,
  selectedTile,
  onSelectTile,
  paintVariation,
  activePaintGroupId,
  onSetActivePaintGroup,
  paintPaletteMode,
  onSetPaintPaletteMode,
  activeCustomPaletteId,
  onSetActiveCustomPaletteId,
  variationTiles,
  onSetPaletteVariationTiles,
  smartBrushPreset,
  onSetSmartBrushPreset,
  protectMapFeatures,
  onSetProtectMapFeatures,
  onUseSelectionAsSmartMask,
  onApplyCommand,
  onSetSelection,
  onClearSelection
}: {
  selection: ConnectedCellSelection;
  map: MapEntity | null;
  selectedTileset: TilesetAsset | null;
  atlas: EditorState["atlasEntries"][string] | null;
  project: Project | null;
  libraryAssets: LibraryAsset[];
  atlasStatus: string;
  selectedTile: number;
  onSelectTile: (tile: number) => void;
  paintVariation: MapPaintVariation;
  activePaintGroupId: string;
  onSetActivePaintGroup: (groupId: string) => void;
  paintPaletteMode: TilePaletteCategory;
  onSetPaintPaletteMode: (mode: TilePaletteCategory) => void;
  activeCustomPaletteId: string | null;
  onSetActiveCustomPaletteId: (paletteId: string | null) => void;
  variationTiles: number[] | null;
  onSetPaletteVariationTiles: (tiles: number[] | null) => void;
  smartBrushPreset: SmartBrushPreset;
  onSetSmartBrushPreset: (preset: SmartBrushPreset) => void;
  protectMapFeatures: boolean;
  onSetProtectMapFeatures: (enabled: boolean) => void;
  onUseSelectionAsSmartMask: (cells: ReadonlyArray<{ x: number; y: number }>) => void;
  onApplyCommand: (command: ProjectCommand) => void;
  onSetSelection: (selection: ConnectedCellSelection | null) => void;
  onClearSelection: () => void;
}) {
  const anchorTile = map ? tileValueAt(map, selection.anchor.x, selection.anchor.y) : 0;
  const [sourceTile, setSourceTile] = useState(anchorTile);
  const [paletteOpen, setPaletteOpen] = useState(false);
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
  const fillImpact = useMemo(
    () => connectedSelectionImpact(map, fillPlan?.changes ?? [], project, selectedTileset, protectMapFeatures),
    [fillPlan, map, project, protectMapFeatures, selectedTileset]
  );
  const replaceImpact = useMemo(
    () => connectedSelectionImpact(map, replacePlan?.changes ?? [], project, selectedTileset, protectMapFeatures),
    [map, project, protectMapFeatures, replacePlan, selectedTileset]
  );
  const clearImpact = useMemo(
    () => connectedSelectionImpact(map, clearPlan?.changes ?? [], project, selectedTileset, protectMapFeatures),
    [clearPlan, map, project, protectMapFeatures, selectedTileset]
  );
  const rawSmartCommand = useMemo(
    () => map && smartPlan ? connectedSelectionSmartTerrainCommand(map, smartBrushPreset, smartPlan) : null,
    [map, smartBrushPreset, smartPlan]
  );
  const smartImpact = useMemo(
    () => connectedSelectionImpact(map, rawSmartCommand?.cells ?? [], project, selectedTileset, protectMapFeatures),
    [map, project, protectMapFeatures, rawSmartCommand, selectedTileset]
  );
  const protectedSmartPlan = useMemo(
    () => smartPlan && smartImpact ? applyMapPaintImpactToSmartPlan(smartPlan, smartImpact) : smartPlan,
    [smartImpact, smartPlan]
  );
  const stampPreview = useMemo(
    () => map ? captureMapStampFromCells(map, selection.cells, "Selection stamp", "map-stamp:selection-preview") : null,
    [map, selection.cells]
  );
  const stampTooLarge = Boolean(stampPreview && (stampPreview.width > 32 || stampPreview.height > 32));
  const smartPresetLabel = SMART_BRUSH_PRESETS.find((preset) => preset.id === smartBrushPreset)?.label ?? smartBrushPreset;
  const smartTerrainAvailable = map?.levelType === "land" && smartBrushProfileForTileset(selectedTileset) != null;
  const applyPlan = (label: string, plan: typeof fillPlan, impact: typeof fillImpact) => {
    if (!map || !plan || !impact) return;
    const command = connectedSelectionPaintCommand(map, label, { ...plan, changes: impact.allowedChanges });
    if (command) onApplyCommand(command);
  };
  const applySmartTerrain = () => {
    if (!map || !protectedSmartPlan) return;
    const command = connectedSelectionSmartTerrainCommand(map, smartBrushPreset, protectedSmartPlan);
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
  const reshapeSelection = (operation: "grow" | "shrink") => {
    if (!map) return;
    onSetSelection(reshapeConnectedCellSelection(selection, operation, map));
  };
  return (
    <div className="connected-selection-summary">
      <div className="connected-selection-heading">
        <strong>Connected Cell Selection</strong>
        <span>{selection.cells.length.toLocaleString()} {selection.cells.length === 1 ? "cell" : "cells"}</span>
      </div>
      <section className="connected-selection-shape-card">
        <div><strong>Selection Shape</strong><span>One orthogonal cell ring</span></div>
        <div className="connected-selection-shape-actions">
          <button className="btn btn-secondary btn-xs" type="button" onClick={() => reshapeSelection("grow")}>Grow Selection</button>
          <button className="btn btn-secondary btn-xs" type="button" onClick={() => reshapeSelection("shrink")}>Shrink Selection</button>
        </div>
      </section>
      {map?.levelType === "land" && (
        <div className="connected-selection-actions">
          <MapPaintProtectionSummary
            enabled={protectMapFeatures}
            impact={null}
            onSetEnabled={onSetProtectMapFeatures}
          />
          <section>
            <div className="connected-selection-action-heading"><strong>Fill</strong><span>Paint {selectedTile}</span></div>
            <button className="btn btn-secondary btn-xs" type="button" aria-expanded={paletteOpen} onClick={() => setPaletteOpen((current) => !current)}>
              {paletteOpen ? "Hide Tile Palette" : "Choose Fill Tile"}
            </button>
            {paletteOpen && (
              <div className="connected-selection-palette">
                <PaintPalettePanel
                  map={map}
                  project={project}
                  libraryAssets={libraryAssets}
                  selectedTile={selectedTile}
                  inspectedTile={anchorTile}
                  setSelectedTile={onSelectTile}
                  tileset={selectedTileset}
                  atlas={atlas}
                  atlasStatus={atlasStatus}
                  mode={paintPaletteMode}
                  onSetMode={onSetPaintPaletteMode}
                  activePaintGroupId={activePaintGroupId}
                  paintVariation={paintVariation}
                  activeCustomPaletteId={activeCustomPaletteId}
                  onSetActivePaintGroup={onSetActivePaintGroup}
                  onSetActiveCustomPaletteId={onSetActiveCustomPaletteId}
                  onSetVariationTiles={onSetPaletteVariationTiles}
                  onApplyCommand={onApplyCommand}
                  showStampMode={false}
                  variant="sidebar"
                />
              </div>
            )}
            <button className="btn btn-primary btn-xs" type="button" disabled={!fillImpact?.allowedChanges.length} onClick={() => applyPlan("Fill selected cells", fillPlan, fillImpact)}>Fill Selection ({fillImpact?.allowedChanges.length.toLocaleString() ?? 0})</button>
          </section>
          <section>
            <label>
              <span>Replace Tile</span>
              <input type="number" value={sourceTile} onChange={(event) => setSourceTile(Number(event.target.value) || 0)} />
            </label>
            <button className="btn btn-secondary btn-xs" type="button" disabled={!replaceImpact?.allowedChanges.length} onClick={() => applyPlan(`Replace tile ${sourceTile} in selection`, replacePlan, replaceImpact)}>Replace In Selection ({replaceImpact?.allowedChanges.length.toLocaleString() ?? 0})</button>
          </section>
          <section>
            <div className="connected-selection-action-heading"><strong>Clear</strong><span>Restore base terrain</span></div>
            <button className="btn btn-danger btn-xs" type="button" disabled={!clearImpact?.allowedChanges.length} onClick={() => applyPlan("Clear selected cells", clearPlan, clearImpact)}>Clear Selected Cells ({clearImpact?.allowedChanges.length.toLocaleString() ?? 0})</button>
          </section>
          <section>
            <div className="connected-selection-action-heading"><strong>Smart Terrain</strong><span>{smartPresetLabel}</span></div>
            <label>
              <span>Terrain Type</span>
              <select aria-label="Connected selection terrain type" value={smartBrushPreset} onChange={(event) => onSetSmartBrushPreset(event.currentTarget.value as SmartBrushPreset)}>
                {SMART_BRUSH_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
              </select>
            </label>
            {smartPlan?.reason && <small>{smartPlan.reason}</small>}
            <div className="connected-selection-smart-actions">
              <button className="btn btn-primary btn-xs" type="button" disabled={!protectedSmartPlan?.changedCount} onClick={applySmartTerrain}>Apply {smartPresetLabel} ({protectedSmartPlan?.changedCount.toLocaleString() ?? 0})</button>
              <button className="btn btn-secondary btn-xs" type="button" disabled={!smartTerrainAvailable || selection.cells.length === 0} onClick={() => onUseSelectionAsSmartMask(selection.cells)}>Use As Smart Mask</button>
            </div>
          </section>
          <section>
            <div className="connected-selection-action-heading"><strong>Reusable Stamp</strong><span>{stampPreview ? `${stampPreview.width}x${stampPreview.height}` : "No cells"}</span></div>
            <small>{stampTooLarge ? "Selection exceeds the 32x32 reusable stamp limit" : `${selection.cells.length.toLocaleString()} selected cells; unselected cells inside the bounds stay transparent`}</small>
            <button className="btn btn-secondary btn-xs" type="button" disabled={!project || !stampPreview || stampTooLarge} onClick={createStamp}>Create Reusable Stamp</button>
          </section>
        </div>
      )}
      <button className="btn btn-secondary btn-xs" type="button" onClick={onClearSelection}>Clear Selection</button>
    </div>
  );
}

function connectedSelectionImpact(
  map: MapEntity | null,
  changes: ReadonlyArray<PaintCellChange>,
  project: Project | null,
  tileset: TilesetAsset | null,
  protectFeatures: boolean
) {
  if (!map) return null;
  return analyzeMapPaintOperation({
    map,
    changes,
    triggers: project?.triggers ?? [],
    tileset,
    protectFeatures
  });
}
