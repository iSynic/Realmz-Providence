import type { EditorState } from "../../store";
import type { DungeonCellFlag, MapEntity, Project, ProjectCommand, SelectedEntity, TilesetAsset } from "../../types";
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
  onClearConnectedSelection
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
        <div className="connected-selection-summary">
          <div>
            <strong>Connected Cell Selection</strong>
            <span>{selection.selection.cells.length.toLocaleString()} cells</span>
          </div>
          <small>
            {connectedMatchModeLabel(selection.selection.matchMode)} | Anchor {selection.selection.anchor.x}, {selection.selection.anchor.y}
          </small>
          <button className="btn btn-secondary btn-xs" type="button" onClick={onClearConnectedSelection}>
            Clear Selection
          </button>
        </div>
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

function connectedMatchModeLabel(mode: "exact" | "semantic-family" | "behavior") {
  if (mode === "semantic-family") return "Terrain family";
  if (mode === "behavior") return "Realmz behavior";
  return "Exact tile";
}
