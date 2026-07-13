import type { ReactNode } from "react";
import { LandLayoutEditor } from "../../components/maps/LandLayoutWorkbench";
import { LandTileAtlasEditor } from "../../components/maps/LandTilesWorkbench";
import { RandomAreasWorkbench } from "../../components/maps/RandomEncountersWorkbench";
import type { EditorState } from "../../store";
import type {
  MapEntity,
  MapViewFlag,
  ProjectCommand,
  RandomLevel,
  SelectedEntity,
  TilesetAsset
} from "../../types";
import type { MapWorkbenchState } from "./useMapWorkbenchState";

export function MapAuxiliaryWorkbenches({
  state,
  selectedMap,
  selectedRandomLevel,
  selectedTileset,
  atlas,
  workbench,
  onSelectMap,
  onSelectTile,
  onSelectEntity,
  onSetViewFlag,
  onApplyCommand
}: {
  state: EditorState;
  selectedMap: MapEntity | null;
  selectedRandomLevel: RandomLevel | null;
  selectedTileset: TilesetAsset | null;
  atlas: EditorState["atlasEntries"][string] | null;
  workbench: MapWorkbenchState;
  onSelectMap: (id: string) => void;
  onSelectTile: (tile: number) => void;
  onSelectEntity: (entity: SelectedEntity) => void;
  onSetViewFlag: (flag: MapViewFlag, value: boolean) => void;
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  const {
    shell: { workbenchMode, setWorkbenchMode, selectedLayoutCell, setSelectedLayoutCell },
    openCanvasTool
  } = workbench;

  if (workbenchMode === "land-layout") {
    return (
      <MapModeSurface
        title="Land Layout"
        subtitle="Outdoor level adjacency. Blank cells disable edge travel; Land 0 is stored as -1 for Realmz."
      >
        <LandLayoutEditor
          project={state.project}
          selectedMap={selectedMap}
          atlasEntries={state.atlasEntries}
          icons={state.iconEntries}
          selectedCell={selectedLayoutCell}
          onSetSelectedCell={setSelectedLayoutCell}
          onSelectMap={onSelectMap}
          onApplyCommand={onApplyCommand}
        />
      </MapModeSurface>
    );
  }

  if (workbenchMode === "land-tiles") {
    return (
      <MapModeSurface
        title="Land Tiles And Combat Tiles"
        subtitle="Inspect the current landlook, tile movement metadata, and Realmz combat-map expansion."
      >
        <LandTileAtlasEditor
          project={state.project}
          selectedMapId={selectedMap?.id ?? null}
          selectedTileset={selectedTileset}
          atlas={atlas}
          atlasEntries={state.atlasEntries}
          icons={state.iconEntries}
          selectedPaintTile={state.selectedTile}
          onSelectTile={onSelectTile}
          onApplyCommand={onApplyCommand}
        />
      </MapModeSurface>
    );
  }

  if (workbenchMode === "random-areas") {
    return (
      <MapModeSurface
        title="Random Encounter Areas"
        subtitle="Realmz checks random encounter rectangle slots from 19 down to 0. Edit fields here or draw rectangles on the canvas."
      >
        <RandomAreasWorkbench
          selectedMap={selectedMap}
          randomLevel={selectedRandomLevel}
          onSetWorkbenchMode={setWorkbenchMode}
          onSetViewFlag={onSetViewFlag}
          onSetTool={openCanvasTool}
          onSelectEntity={onSelectEntity}
          onApplyCommand={onApplyCommand}
        />
      </MapModeSurface>
    );
  }

  return null;
}

function MapModeSurface({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="map-mode-surface">
      <div className="map-mode-header">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
      </div>
      <div className="map-mode-body">
        {children}
      </div>
    </div>
  );
}
