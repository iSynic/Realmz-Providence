import type { EditorState } from "../../store";
import type {
  EditorTool,
  MapEntity,
  MapViewFlag,
  MapWorkbenchMode,
  Project,
  ProjectCommand,
  RandomLevel,
  SelectedEntity,
  TilesetAsset
} from "../../types";
import { actionPointCapacity } from "../../actionPointCapacity";
import { randomRectEntityId } from "../../map/geometry";
import { classifyTileValue } from "../../map/tileMetadata";
import { clearTileLabel } from "../../map/tileClear";
import { InfoGrid } from "../InfoGrid";
import { MapCapabilityPanel } from "../MapAffordances";
import { tileColor } from "../TileSprite";
import { TileSwatch } from "../TileSwatch";
import { landLayoutStats, normalizeLayoutCells } from "./LandLayoutWorkbench";
import { mapWorkbenchModeLabel, type MapContextFocus } from "./mapBrowserModel";
import { buildClearLevelCommand, buildDungeonMappingCommand } from "./mapSetupModel";
import { tileAttributeRows } from "./mapTileUiUtils";

export function MapModeInspector({
  mode,
  project,
  selectedMap,
  selectedTileset,
  atlas,
  icons,
  selectedTile,
  randomLevel,
  onSetWorkbenchMode
}: {
  mode: MapWorkbenchMode;
  project: Project | null;
  selectedMap: MapEntity | null;
  selectedTileset: TilesetAsset | null;
  atlas: EditorState["atlasEntries"][string] | null;
  icons: EditorState["iconEntries"];
  selectedTile: number;
  randomLevel: RandomLevel | null;
  onSetWorkbenchMode: (mode: MapWorkbenchMode) => void;
}) {
  const landMaps = (project?.maps ?? []).filter((map) => map.levelType === "land");
  const layoutCells = normalizeLayoutCells(project?.landLayout?.cells ?? []);
  const layoutWarnings = project?.landLayout ? landLayoutStats(layoutCells, landMaps, selectedMap).warnings : [];
  const modeTitle = mapWorkbenchModeLabel(mode);
  return (
    <section className="context-panel map-mode-inspector">
      <div className="panel-header">
        <span>{modeTitle}</span>
        <small>Mode</small>
      </div>
      {mode === "land-layout" && (
        <>
          <InfoGrid
            rows={[
              ["Layout", project?.landLayout ? "configured" : "not created"],
              ["Outdoor Maps", landMaps.length],
              ["Current Map", selectedMap?.levelType === "land" ? selectedMap.name : "none"],
              ["Warnings", layoutWarnings.length]
            ]}
          />
          {layoutWarnings.length > 0 && (
            <div className="inline-diagnostics mode-summary">
              {layoutWarnings.slice(0, 4).map((warning) => <div key={warning} className="diagnostic warning">{warning}</div>)}
            </div>
          )}
        </>
      )}
      {mode === "land-tiles" && (
        <LandTilesModeInspector
          project={project}
          selectedMap={selectedMap}
          selectedTileset={selectedTileset}
          atlas={atlas}
          icons={icons}
          selectedTile={selectedTile}
        />
      )}
      {mode === "random-areas" && (
        <InfoGrid
          rows={[
            ["Current Map", selectedMap?.name ?? "none"],
            ["Rectangles", `${randomLevel?.rects.length ?? 0} / 20`],
            ["Editing", "Canvas-backed"],
            ["Next Step", "Full table planned"]
          ]}
        />
      )}
      <div className="context-action-stack compact">
        <button className="btn btn-primary btn-xs context-action-button context-action-button-narrow" type="button" onClick={() => onSetWorkbenchMode("canvas")}>
          Return To Canvas
        </button>
      </div>
    </section>
  );
}

function LandTilesModeInspector({
  project,
  selectedMap,
  selectedTileset,
  atlas,
  icons,
  selectedTile
}: {
  project: Project | null;
  selectedMap: MapEntity | null;
  selectedTileset: TilesetAsset | null;
  atlas: EditorState["atlasEntries"][string] | null;
  icons: EditorState["iconEntries"];
  selectedTile: number;
}) {
  if (!selectedTileset) {
    return <p className="empty-copy compact">Select a land map to inspect its land tiles.</p>;
  }
  const meaning = classifyTileValue(selectedTile, selectedTileset, project?.tileAttributes ?? [], icons);
  return (
    <div className="land-tiles-sidebar-detail">
      <div className="land-tiles-sidebar-summary">
        <div className="land-tiles-sidebar-swatch" style={{ background: tileColor(selectedTile) }}>
          <TileSwatch atlas={atlas} icons={icons} tile={selectedTile} tileset={selectedTileset} showBadge={false} />
        </div>
        <div>
          <strong>{meaning.label}</strong>
          <small>{selectedTileset.name}</small>
          <small>{selectedMap?.name ?? "No current map"}</small>
        </div>
      </div>
      <InfoGrid rows={tileAttributeRows(meaning)} />
    </div>
  );
}

export function MapSetupInspector({
  project,
  selectedMap,
  selectedTileset,
  randomLevel,
  activeTool,
  workbenchMode,
  showRandomRects,
  onSetContextFocus,
  onSetWorkbenchMode,
  onSetTool,
  onSetViewFlag,
  onOpenPalette,
  onSelectEntity,
  onApplyCommand
}: {
  project: Project | null;
  selectedMap: MapEntity | null;
  selectedTileset: TilesetAsset | null;
  randomLevel: RandomLevel | null;
  activeTool: EditorTool;
  workbenchMode: MapWorkbenchMode;
  showRandomRects: boolean;
  onSetContextFocus: (focus: MapContextFocus) => void;
  onSetWorkbenchMode: (mode: MapWorkbenchMode) => void;
  onSetTool: (tool: EditorTool) => void;
  onSetViewFlag: (flag: MapViewFlag, value: boolean) => void;
  onOpenPalette: () => void;
  onSelectEntity: (entity: SelectedEntity) => void;
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  const clearLevel = () => {
    if (!selectedMap) return;
    const confirmed = window.confirm(`Clear ${selectedMap.name} to ${clearTileLabel(selectedMap, selectedTileset)}? This will overwrite all ${selectedMap.tiles.length.toLocaleString()} cells.`);
    if (!confirmed) return;
    onApplyCommand(buildClearLevelCommand(selectedMap, selectedTileset));
  };
  const setEntireDungeonMappedState = (unmapped: boolean) => {
    if (!selectedMap) return;
    const command = buildDungeonMappingCommand(selectedMap, unmapped);
    if (command) onApplyCommand(command);
  };
  const focusFirstRandomRect = () => {
    if (!selectedMap || !randomLevel?.rects.length) return;
    onSetViewFlag("showRandomRects", true);
    onSelectEntity({ type: "encounter", id: randomRectEntityId(selectedMap, randomLevel.rects[0].rectIndex) });
  };
  return (
    <section className="context-panel map-setup-panel">
      <div className="panel-header">
        <span>Level Setup</span>
        <small>{mapWorkbenchModeLabel(workbenchMode)} | {selectedMap ? selectedMap.levelType : "none"}</small>
      </div>
      <div className="map-setup-body">
        <section className="map-setup-card">
          <header>
            <span>Current Level</span>
            <b>{selectedMap ? selectedMap.levelType : "none"}</b>
          </header>
          <InfoGrid
            rows={[
              ["Name", selectedMap?.name ?? "none"],
              ["Index", selectedMap ? selectedMap.index : "none"],
              ["Tileset", selectedTileset?.name ?? selectedMap?.render.tilesetId ?? "none"],
              ["Landlook", randomLevel?.landlook ?? selectedMap?.render.landlook ?? "none"]
            ]}
          />
          {selectedMap && project && (
            <div className="map-setup-counts">
              <span>{actionPointCapacity(project.triggers, selectedMap.levelType, selectedMap.index).active}/100 AP</span>
              <span>{randomLevel?.rects.length ?? 0}/20 random</span>
            </div>
          )}
        </section>
      </div>
      <MapCapabilityPanel
        map={selectedMap}
        randomLevel={randomLevel}
        activeTool={activeTool}
        showRandomRects={showRandomRects}
        onSetTool={(tool) => {
          onSetTool(tool);
          if (tool === "paint") onOpenPalette();
        }}
        onOpenPalette={onOpenPalette}
        onFocusFlags={() => onSetContextFocus("flags")}
        onFocusAtlas={() => onSetWorkbenchMode("land-tiles")}
        onFocusLayout={() => onSetWorkbenchMode("land-layout")}
        onClearLevel={clearLevel}
        onShowRandomRects={() => onSetViewFlag("showRandomRects", true)}
        onHighlightRandomRect={focusFirstRandomRect}
        onEditRandomRect={() => onSetWorkbenchMode("random-areas")}
        onMapEntireDungeon={selectedMap?.levelType === "dungeon" ? () => setEntireDungeonMappedState(false) : undefined}
        onUnmapEntireDungeon={selectedMap?.levelType === "dungeon" ? () => setEntireDungeonMappedState(true) : undefined}
        onSelectRandomRect={
          selectedMap
            ? (rectIndex) => onSelectEntity({ type: "encounter", id: randomRectEntityId(selectedMap, rectIndex) })
            : undefined
        }
      />
    </section>
  );
}
