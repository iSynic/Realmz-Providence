import type { EditorState } from "../../store";
import type {
  DungeonCellFlag,
  LibraryAsset,
  MapEntity,
  MapPaintVariation,
  Project,
  ProjectCommand,
  SelectedEntity,
  SmartBrushPreset,
  TilePaletteCategory,
  TilesetAsset
} from "../../types";
import type { ConnectedCellSelection } from "../../map/connectedMapSelection";
import { TriggerSelectionDetails } from "./MapActionPointInspector";
import { MapCellSelectionInspector } from "./MapCellSelectionInspector";
import { RecordSelectionDetails } from "./MapRecordsWorkbench";
import { RandomRectangleEditor } from "./RandomEncountersWorkbench";
import { DungeonCellFlagEditor } from "./DungeonFlagInspector";
import { ConnectedSelectionActions } from "./ConnectedSelectionActions";
import type { MapSelection } from "./mapSelectionModel";

export function MapSelectionInspector({
  selection,
  map,
  project,
  libraryAssets,
  atlasStatus,
  selectedTileset,
  atlas,
  icons,
  dungeonDrawFlags,
  onSetDungeonDrawFlags,
  onSelectEntity,
  onOpenScripts,
  onApplyCommand,
  onClearConnectedSelection,
  onSetConnectedSelection,
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
  onUseSelectionAsSmartMask
}: {
  selection: MapSelection;
  map: MapEntity | null;
  project: Project | null;
  libraryAssets: LibraryAsset[];
  atlasStatus: string;
  selectedTileset: TilesetAsset | null;
  atlas: EditorState["atlasEntries"][string] | null;
  icons: EditorState["iconEntries"];
  dungeonDrawFlags: Record<DungeonCellFlag, boolean>;
  onSetDungeonDrawFlags: (flags: Record<DungeonCellFlag, boolean>) => void;
  onSelectEntity: (entity: SelectedEntity) => void;
  onOpenScripts: (entity: SelectedEntity) => void;
  onApplyCommand: (command: ProjectCommand) => void;
  onClearConnectedSelection: () => void;
  onSetConnectedSelection: (selection: ConnectedCellSelection | null) => void;
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
  onUseSelectionAsSmartMask: (cells: ReadonlyArray<{ x: number; y: number }>) => void;
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
          libraryAssets={libraryAssets}
          atlasStatus={atlasStatus}
          selectedTile={selectedTile}
          onSelectTile={onSelectTile}
          paintVariation={paintVariation}
          activePaintGroupId={activePaintGroupId}
          onSetActivePaintGroup={onSetActivePaintGroup}
          paintPaletteMode={paintPaletteMode}
          onSetPaintPaletteMode={onSetPaintPaletteMode}
          activeCustomPaletteId={activeCustomPaletteId}
          onSetActiveCustomPaletteId={onSetActiveCustomPaletteId}
          variationTiles={variationTiles}
          onSetPaletteVariationTiles={onSetPaletteVariationTiles}
          smartBrushPreset={smartBrushPreset}
          onSetSmartBrushPreset={onSetSmartBrushPreset}
          onUseSelectionAsSmartMask={onUseSelectionAsSmartMask}
          onApplyCommand={onApplyCommand}
          onSetSelection={onSetConnectedSelection}
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
