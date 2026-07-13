import { actionPointCapacity, nextActionPointRecordIndex } from "../../actionPointCapacity";
import { actionPointMarkerState, landCellSecretState } from "../../map/actionPointMarkers";
import { mapTileIndex } from "../../map/geometry";
import { hasSecretMarkerTile, isSecretWalkableTile } from "../../map/secrets";
import { clearTileForMap, clearTileLabel } from "../../map/tileClear";
import { classifyTileValue, tileAttributeGroup } from "../../map/tileMetadata";
import type { EditorState } from "../../store";
import type { DungeonCellFlag, MapEntity, Project, ProjectCommand, SelectedEntity, TilesetAsset } from "../../types";
import { selectEntityFromId, triggerEntityId } from "../../utils";
import { CellTileEvidence } from "../MapAffordances";
import { InfoGrid } from "../InfoGrid";
import { CellActionPointDetails, LandCellSecretEditor, TriggerSelectionDetails } from "./MapActionPointInspector";
import { MapDiagnostics } from "./MapFormControls";
import { RecordSelectionDetails } from "./MapRecordsWorkbench";
import { ScriptedChangeSection, SelectionLinks } from "./MapSelectionLinks";
import { SpecialTileSolidityEditor, TileMeaningInspector } from "./MapTileInspector";
import { normalizedCombatBuild, yesNo } from "./mapTileUiUtils";
import { RandomRectangleEditor, randomRectDiagnostics } from "./RandomEncountersWorkbench";
import { DungeonCellFlagEditor } from "./DungeonFlagInspector";
import { nextAvailableRandomRectIndex, type MapSelection } from "./mapSelectionModel";

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
  onApplyCommand
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
}) {
  const selectedCellMeaning = selection.kind === "cell"
    ? classifyTileValue(selection.cell.tile, selectedTileset, project?.tileAttributes ?? [], icons)
    : null;
  return (
    <section className="context-panel">
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
        <>
          {map && project && (
            <p className={`context-capacity-note${actionPointCapacity(project.triggers, map.levelType, map.index).canCreate ? "" : " blocked"}`}>
              {actionPointCapacity(project.triggers, map.levelType, map.index).active}/100 Action Point records used on this map.
            </p>
          )}
          <InfoGrid
            rows={[
              ["Cell", `${selection.cell.x}, ${selection.cell.y}`],
              ["Raw Tile", selection.cell.tile],
              ["Render Tile", selectedCellMeaning?.renderTile ?? "unknown"],
              ["Tile Group", selectedCellMeaning ? tileAttributeGroup(selectedCellMeaning.attributes ?? null, selection.cell.tile, selectedTileset).join(", ") || "uncategorized" : "unknown"],
              ["Special/Icon", selectedCellMeaning?.iconId ?? "none"],
              ["Icon Art", selectedCellMeaning?.iconCandidates.length ? (selectedCellMeaning.iconAvailable ? "loaded" : "missing") : "none"],
              ["Solid Type", selectedCellMeaning?.attributes?.solidType ?? "unknown"],
              ["Move Cost", selectedCellMeaning?.attributes?.movementCost ?? "unknown"],
              ["Sound", selectedCellMeaning?.attributes?.movementSoundId ?? "none"],
              ["Shore / Water", yesNo(selectedCellMeaning?.attributes?.shore)],
              ["Runtime Path", yesNo(selectedCellMeaning?.attributes?.pathFlag)],
              ["Road Art", selectedCellMeaning?.attributeFlags.includes("visual-path") ? "yes" : "no"],
              ["Boat Required", selectedCellMeaning?.attributes?.boatRequirement ?? "unknown"],
              ["Fly / Float", yesNo(selectedCellMeaning?.attributes?.flyFloatRequired)],
              ["Blocks LOS", yesNo(selectedCellMeaning?.attributes?.blocksLos)],
              ["Combat Expansion", normalizedCombatBuild(selectedCellMeaning?.attributes ?? null) ? "3 x 3" : "none"],
              ["Action Points", selection.triggers.length],
              ["Random Rects", selection.rects.length],
              ["Player Maps", selection.records.length],
              ["Edit State", "editable"]
            ]}
          />
          {map && (
            <LandCellSecretEditor
              map={map}
              cell={selection.cell}
              onApplyCommand={onApplyCommand}
            />
          )}
          <CellTileEvidence cell={selection.cell} records={selection.records} />
          {selectedCellMeaning && <TileMeaningInspector title="Selected Cell Meaning" meaning={selectedCellMeaning} compact />}
          {selectedCellMeaning && (
            <SpecialTileSolidityEditor
              meaning={selectedCellMeaning}
              onApplyCommand={onApplyCommand}
            />
          )}
          <CellActionPointDetails
            project={project}
            triggers={selection.triggers}
            onSelectEntity={onSelectEntity}
            onOpenScripts={onOpenScripts}
          />
          <ScriptedChangeSection project={project} map={map} cell={selection.cell} onSelectEntity={onSelectEntity} onOpenScripts={onOpenScripts} />
          <MapDiagnostics diagnostics={[...(map ? cellDiagnostics(selection, map) : []), ...mapTileDiagnostics(selection, map, selectedCellMeaning)]} />
          <SelectionLinks
            map={map}
            triggers={selection.triggers}
            rects={selection.rects}
            records={selection.records}
            onSelectEntity={onSelectEntity}
            onOpenScripts={onOpenScripts}
          />
          {map && (
            <div className="context-action-stack">
              <button
                className="btn btn-secondary btn-xs context-action-button"
                type="button"
                disabled={selection.cell.tile === clearTileForMap(map, selectedTileset)}
                title={`Restore this cell to ${clearTileLabel(map, selectedTileset)}.`}
                onClick={() => {
                  const to = clearTileForMap(map, selectedTileset);
                  onApplyCommand({
                    kind: "paintTiles",
                    label: `Clear tile ${selection.cell.x},${selection.cell.y}`,
                    mapId: map.id,
                    cells: [{ ...selection.cell, index: mapTileIndex(map, selection.cell.x, selection.cell.y), from: selection.cell.tile, to }]
                  });
                }}
              >
                Clear Tile To {clearTileForMap(map, selectedTileset)}
              </button>
              <button
                className="btn btn-primary btn-xs context-action-button"
                type="button"
                disabled={project ? !actionPointCapacity(project.triggers, map.levelType, map.index).canCreate : false}
                title={project && !actionPointCapacity(project.triggers, map.levelType, map.index).canCreate ? "This map already uses all 100 Realmz Action Point records." : "Create an Action Point at the selected cell."}
                onClick={() => {
                  const recordIndex = nextActionPointRecordIndex(project?.triggers ?? [], map.levelType, map.index);
                  onApplyCommand({
                    kind: "createActionPoint",
                    label: `Create Action Point ${selection.cell.x},${selection.cell.y}`,
                    levelType: map.levelType,
                    levelIndex: map.index,
                    x: selection.cell.x,
                    y: selection.cell.y
                  });
                  if (recordIndex != null) {
                    const source = map.levelType === "land" ? "Data DD" : "Data DDD";
                    onSelectEntity(selectEntityFromId(triggerEntityId(map.levelType, map.index, recordIndex, source)));
                  }
                }}
              >
                Create Action Point Here
              </button>
              <button
                className="btn btn-ghost btn-xs context-action-button"
                type="button"
                onClick={() => {
                  const rectIndex = nextAvailableRandomRectIndex(project, map.levelType, map.index);
                  onApplyCommand({
                    kind: "createRandomRect",
                    label: `Create Random Rectangle ${selection.cell.x},${selection.cell.y}`,
                    levelType: map.levelType,
                    levelIndex: map.index,
                    rect: {
                      left: selection.cell.x,
                      top: selection.cell.y,
                      right: selection.cell.x,
                      bottom: selection.cell.y,
                      percent: 1000,
                      battleRange: [0, 0],
                      randomDoors: [0, 0, 0],
                      randomDoorPercent: [0, 0, 0],
                      only: false,
                      option: 0,
                      sound: 0,
                      text: 0
                    }
                  });
                  if (rectIndex != null) onSelectEntity({ type: "encounter", id: `random:${map.levelType}:${map.index}:${rectIndex}` });
                }}
                disabled={nextAvailableRandomRectIndex(project, map.levelType, map.index) == null}
              >
                Create Random Rectangle Here
              </button>
              {selection.cell.tile < 0 && (
                <button
                  className="btn btn-ghost btn-xs context-action-button"
                  type="button"
                  onClick={() => {
                    const fallback = clearTileForMap(map, selectedTileset);
                    onApplyCommand({
                      kind: "paintTiles",
                      label: "Remove stamp",
                      mapId: map.id,
                      cells: [{ ...selection.cell, index: mapTileIndex(map, selection.cell.x, selection.cell.y), from: selection.cell.tile, to: fallback }]
                    });
                  }}
                >
                  Remove Stamp to {clearTileLabel(map, selectedTileset)}
                </button>
              )}
            </div>
          )}
        </>
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

function cellDiagnostics(selection: Extract<MapSelection, { kind: "cell" }>, map: MapEntity) {
  const diagnostics: string[] = [];
  const markerState = actionPointMarkerState(selection.cell.tile, map.levelType);
  const tileLooksLikeActionMarker = markerState !== "none";
  if (selection.triggers.length > 0 && !tileLooksLikeActionMarker) {
    diagnostics.push("Action Point exists here, but the tile does not look like an AP marker.");
  }
  const orphanedActionMarker = map.levelType === "land" ? markerState === "normal" : tileLooksLikeActionMarker;
  if (orphanedActionMarker && selection.triggers.length === 0) {
    diagnostics.push("Tile looks like an AP marker, but no Action Point record resolves to this cell.");
  }
  for (const rect of selection.rects) {
    diagnostics.push(...randomRectDiagnostics(rect).map((message) => `Random Rectangle ${rect.rectIndex}: ${message}`));
  }
  if (selection.rects.length > 1) {
    const priority = [...selection.rects].sort((a, b) => b.rectIndex - a.rectIndex)[0];
    diagnostics.push(`Multiple Random Rectangles overlap this cell; Realmz checks higher record indexes first, so rectangle ${priority.rectIndex} has priority here.`);
  }
  return diagnostics;
}
function mapTileDiagnostics(
  selection: Extract<MapSelection, { kind: "cell" }>,
  map: MapEntity | null,
  meaning: ReturnType<typeof classifyTileValue> | null
) {
  const diagnostics: string[] = [];
  if (!meaning) return diagnostics;
  const attributes = meaning.attributes;
  if (meaning.attributeFlags.includes("visual-path") && !attributes?.pathFlag) {
    diagnostics.push("Tile is Divinity road/path art, but Realmz mapstats does not mark it as a runtime path.");
  }
  if (meaning.raw < 0 && attributes?.sourceKind !== "data-solids") {
    diagnostics.push("Special negative tile has no decoded Data Solids row; passability remains unknown.");
  }
  if (meaning.attributeFlags.includes("unknown-metadata")) {
    diagnostics.push("Tile behavior is unknown because no mapstats or Data Solids metadata matched this value.");
  }
  if (map) {
    const hasLandSecretState = map.levelType === "land" && landCellSecretState(selection.cell.tile) !== "normal";
    if ((hasLandSecretState || hasSecretMarkerTile(selection.cell.tile, map)) && attributes?.flags.includes("solid")) {
      diagnostics.push("Secret marker appears on a tile marked solid; verify that Realmz can actually enter this cell.");
    }
    if (isSecretWalkableTile(selection.cell.tile, map) && (attributes?.boatRequirement || attributes?.flyFloatRequired)) {
      diagnostics.push("Secret/passable marker is on a tile with boat or fly/float movement requirements.");
    }
  }
  return diagnostics;
}
