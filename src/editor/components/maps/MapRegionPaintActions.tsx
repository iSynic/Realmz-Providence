import { useMemo } from "react";
import type { EditorState } from "../../store";
import type {
  MapEntity,
  MapPaintVariation,
  MapRegionSelection,
  Project,
  ProjectCommand,
  TilesetAsset
} from "../../types";
import { analyzeMapPaintOperation } from "../../map/mapPaintSafeguards";
import { classifyTileValue } from "../../map/tileMetadata";
import { TutorialTip } from "../TutorialTip";
import { MapPaintProtectionSummary } from "./MapPaintProtectionSummary";
import {
  applyRegionPaintOperation,
  buildClearRegionOperation,
  buildFillRegionOperation
} from "./mapRegionUiUtils";

export function RegionPaintActions({
  map,
  region,
  selectedTile,
  selectedTileset,
  paintVariation,
  activePaintGroupId,
  variationTiles,
  paintFillChance,
  onSetPaintFillChance,
  triggers,
  protectMapFeatures,
  onSetProtectMapFeatures,
  onApplyCommand
}: {
  map: MapEntity | null;
  region: MapRegionSelection;
  selectedTile: number;
  selectedTileset: TilesetAsset | null;
  paintVariation: MapPaintVariation;
  activePaintGroupId: string;
  variationTiles: number[] | null | undefined;
  paintFillChance: number;
  onSetPaintFillChance: (chance: number) => void;
  triggers: Project["triggers"];
  protectMapFeatures: boolean;
  onSetProtectMapFeatures: (enabled: boolean) => void;
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  const fillOperation = useMemo(() => buildFillRegionOperation(
    map,
    region,
    selectedTile,
    selectedTileset,
    paintVariation,
    activePaintGroupId,
    variationTiles,
    paintFillChance
  ), [activePaintGroupId, map, paintFillChance, paintVariation, region, selectedTile, selectedTileset, variationTiles]);
  const clearOperation = useMemo(
    () => buildClearRegionOperation(map, region, selectedTileset),
    [map, region, selectedTileset]
  );
  const fillImpact = useMemo(() => map && fillOperation
    ? analyzeMapPaintOperation({
        map,
        changes: fillOperation.changes,
        triggers,
        tileset: selectedTileset,
        protectFeatures: protectMapFeatures
      })
    : null,
  [fillOperation, map, protectMapFeatures, selectedTileset, triggers]);
  const clearImpact = useMemo(() => map && clearOperation
    ? analyzeMapPaintOperation({
        map,
        changes: clearOperation.changes,
        triggers,
        tileset: selectedTileset,
        protectFeatures: protectMapFeatures
      })
    : null,
  [clearOperation, map, protectMapFeatures, selectedTileset, triggers]);
  return (
    <div className="paint-region-quick-actions">
      <label className="paint-fill-chance">
        <TutorialTip
          title="Chance To Fill"
          body="Use less than 100% to scatter the selected tile, random group, cycle group, or custom palette across a region. This is useful for flavor tiles such as rocks, trees, graves, and ruins."
          side="right"
        >
          <span>Chance To Fill</span>
        </TutorialTip>
        <b>{paintFillChance}%</b>
        <input
          type="range"
          min={1}
          max={100}
          step={1}
          value={paintFillChance}
          onChange={(event) => onSetPaintFillChance(Number(event.currentTarget.value))}
        />
        <small>{paintFillChance === 100 ? "Fill every eligible cell." : `Scatter paint across about ${paintFillChance}% of the selected region.`}</small>
      </label>
      <MapPaintProtectionSummary
        enabled={protectMapFeatures}
        onSetEnabled={onSetProtectMapFeatures}
      />
      <div className="paint-region-action-buttons">
        <button
          className="paint-region-fill"
          type="button"
          disabled={!fillImpact || fillImpact.allowedChanges.length === 0}
          onClick={() => applyRegionPaintOperation(map, fillOperation, fillImpact?.allowedChanges ?? [], onApplyCommand)}
        >
          Fill ({fillImpact?.allowedChanges.length.toLocaleString() ?? 0})
        </button>
        <button
          className="paint-region-clear"
          type="button"
          disabled={!clearImpact || clearImpact.allowedChanges.length === 0}
          onClick={() => applyRegionPaintOperation(map, clearOperation, clearImpact?.allowedChanges ?? [], onApplyCommand)}
        >
          Clear ({clearImpact?.allowedChanges.length.toLocaleString() ?? 0})
        </button>
      </div>
    </div>
  );
}

export function RegionSelectionDetails({
  map,
  region: _region,
  selectedTileset,
  tileAttributes,
  icons,
  selectedPaintTile
}: {
  map: MapEntity | null;
  region: MapRegionSelection;
  selectedTileset: TilesetAsset | null;
  tileAttributes: Project["tileAttributes"];
  icons: EditorState["iconEntries"];
  selectedPaintTile: number;
}) {
  if (!map) return <p className="empty-copy compact">Select a map region to edit tiles.</p>;
  const selectedMeaning = classifyTileValue(selectedPaintTile, selectedTileset, tileAttributes, icons);
  return (
    <div className="region-selection-details">
      <div className="tile-meaning-inspector compact">
        <div className="tile-meaning-title">
          <span>Selected Paint Tile</span>
          <b>{selectedMeaning.kind.replace(/-/g, " ")}</b>
        </div>
        <p>{selectedMeaning.compatibility}</p>
      </div>
    </div>
  );
}
