import { Link2 } from "lucide-react";
import { actionPointCapacity, nextActionPointRecordIndex } from "../../actionPointCapacity";
import { mapTileIndex } from "../../map/geometry";
import { clearTileForMap, clearTileLabel } from "../../map/tileClear";
import { classifyTileValue } from "../../map/tileMetadata";
import type { EditorState } from "../../store";
import type { MapEntity, Project, ProjectCommand, SelectedEntity, TilesetAsset } from "../../types";
import { selectEntityFromId, triggerEntityId } from "../../utils";
import { CollapsibleSection, EmptyState, PanelSection } from "../../ui";
import { CellTileEvidence } from "../MapAffordances";
import { InfoGrid } from "../InfoGrid";
import { CellActionPointDetails, LandCellSecretEditor } from "./MapActionPointInspector";
import { MapDiagnostics } from "./MapFormControls";
import { ScriptedChangeSection, SelectionLinks } from "./MapSelectionLinks";
import { SpecialTileSolidityEditor, TileMeaningInspector } from "./MapTileInspector";
import { mapCellDiagnostics, mapCellSummaryRows } from "./mapCellInspectorModel";
import { nextAvailableRandomRectIndex, scriptedTileChangesForCell, type MapSelection } from "./mapSelectionModel";

type CellSelection = Extract<MapSelection, { kind: "cell" }>;

export function MapCellSelectionInspector({
  selection,
  map,
  project,
  selectedTileset,
  icons,
  onSelectEntity,
  onOpenScripts,
  onApplyCommand
}: {
  selection: CellSelection;
  map: MapEntity | null;
  project: Project | null;
  selectedTileset: TilesetAsset | null;
  icons: EditorState["iconEntries"];
  onSelectEntity: (entity: SelectedEntity) => void;
  onOpenScripts: (entity: SelectedEntity) => void;
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  const meaning = classifyTileValue(selection.cell.tile, selectedTileset, project?.tileAttributes ?? [], icons);
  const diagnostics = mapCellDiagnostics(selection, map, meaning);
  const scriptedChanges = scriptedTileChangesForCell(project, map, selection.cell);
  const relatedCount = selection.triggers.length + selection.rects.length + selection.records.length + scriptedChanges.length;
  const capacity = map && project ? actionPointCapacity(project.triggers, map.levelType, map.index) : null;

  return (
    <div className="map-cell-inspector">
      {capacity && (
        <p className={`context-capacity-note${capacity.canCreate ? "" : " blocked"}`}>
          {capacity.active}/100 Action Point records used on this map.
        </p>
      )}
      <CollapsibleSection
        title="Cell Summary"
        eyebrow={`cell ${selection.cell.x}, ${selection.cell.y}`}
        count={`tile ${selection.cell.tile}`}
        density="compact"
        storageKey="maps.selection.cellSummary.open"
      >
        <InfoGrid rows={mapCellSummaryRows(selection, meaning, selectedTileset)} />
      </CollapsibleSection>
      <CollapsibleSection
        title="Tile Behavior"
        eyebrow="terrain and runtime"
        count={meaning.attributes ? "known" : "unknown"}
        density="compact"
        storageKey="maps.selection.tileBehavior.open"
      >
        {map && (
          <LandCellSecretEditor
            map={map}
            cell={selection.cell}
            onApplyCommand={onApplyCommand}
          />
        )}
        <CellTileEvidence cell={selection.cell} records={selection.records} />
        <TileMeaningInspector title="Selected Cell Meaning" meaning={meaning} compact />
        <SpecialTileSolidityEditor meaning={meaning} onApplyCommand={onApplyCommand} />
      </CollapsibleSection>
      <CollapsibleSection
        title="Linked Records"
        eyebrow="scenario references"
        count={String(relatedCount)}
        density="compact"
        storageKey="maps.selection.linkedRecords.open"
        defaultOpen={relatedCount > 0}
      >
        {relatedCount > 0 ? (
          <>
            <CellActionPointDetails
              project={project}
              triggers={selection.triggers}
              onSelectEntity={onSelectEntity}
              onOpenScripts={onOpenScripts}
            />
            <ScriptedChangeSection
              project={project}
              map={map}
              cell={selection.cell}
              onSelectEntity={onSelectEntity}
              onOpenScripts={onOpenScripts}
            />
            <SelectionLinks
              map={map}
              triggers={[]}
              rects={selection.rects}
              records={selection.records}
              onSelectEntity={onSelectEntity}
              onOpenScripts={onOpenScripts}
            />
          </>
        ) : (
          <EmptyState title="No linked records" icon={<Link2 size={16} />} compact />
        )}
      </CollapsibleSection>
      <CollapsibleSection
        title="Diagnostics"
        eyebrow="map validation"
        count={diagnostics.length ? String(diagnostics.length) : "ready"}
        density="compact"
        storageKey="maps.selection.diagnostics.open"
        defaultOpen={diagnostics.length > 0}
        tone={diagnostics.length ? "warning" : "success"}
      >
        <MapDiagnostics diagnostics={diagnostics} />
      </CollapsibleSection>
      {map && (
        <PanelSection title="Cell Actions" eyebrow="authoring" density="compact">
          <MapCellActions
            selection={selection}
            map={map}
            project={project}
            selectedTileset={selectedTileset}
            onSelectEntity={onSelectEntity}
            onApplyCommand={onApplyCommand}
          />
        </PanelSection>
      )}
    </div>
  );
}

function MapCellActions({
  selection,
  map,
  project,
  selectedTileset,
  onSelectEntity,
  onApplyCommand
}: {
  selection: CellSelection;
  map: MapEntity;
  project: Project | null;
  selectedTileset: TilesetAsset | null;
  onSelectEntity: (entity: SelectedEntity) => void;
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  const clearTile = clearTileForMap(map, selectedTileset);
  const capacity = project ? actionPointCapacity(project.triggers, map.levelType, map.index) : null;
  const nextRectIndex = nextAvailableRandomRectIndex(project, map.levelType, map.index);

  return (
    <div className="context-action-stack">
      <button
        className="btn btn-secondary btn-xs context-action-button"
        type="button"
        disabled={selection.cell.tile === clearTile}
        title={`Restore this cell to ${clearTileLabel(map, selectedTileset)}.`}
        onClick={() => onApplyCommand({
          kind: "paintTiles",
          label: `Clear tile ${selection.cell.x},${selection.cell.y}`,
          mapId: map.id,
          cells: [{ ...selection.cell, index: mapTileIndex(map, selection.cell.x, selection.cell.y), from: selection.cell.tile, to: clearTile }]
        })}
      >
        Clear Tile To {clearTile}
      </button>
      <button
        className="btn btn-primary btn-xs context-action-button"
        type="button"
        disabled={capacity ? !capacity.canCreate : false}
        title={capacity && !capacity.canCreate ? "This map already uses all 100 Realmz Action Point records." : "Create an Action Point at the selected cell."}
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
          if (nextRectIndex != null) {
            onSelectEntity({ type: "encounter", id: `random:${map.levelType}:${map.index}:${nextRectIndex}` });
          }
        }}
        disabled={nextRectIndex == null}
      >
        Create Random Rectangle Here
      </button>
      {selection.cell.tile < 0 && (
        <button
          className="btn btn-ghost btn-xs context-action-button"
          type="button"
          onClick={() => onApplyCommand({
            kind: "paintTiles",
            label: "Remove stamp",
            mapId: map.id,
            cells: [{ ...selection.cell, index: mapTileIndex(map, selection.cell.x, selection.cell.y), from: selection.cell.tile, to: clearTile }]
          })}
        >
          Remove Stamp to {clearTileLabel(map, selectedTileset)}
        </button>
      )}
    </div>
  );
}
