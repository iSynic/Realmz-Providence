import { useEffect, useState } from "react";
import { TOOLS } from "../constants";
import { EditorState } from "../store";
import { EditorTool, IconEntry, MapEntity, MapPaintMode, MapPreviewFocalPoint, MapPreviewMode, MapRecord, MapRegionSelection, MapViewFlag, Project, ProjectCommand, RandomLevel, SelectedEntity, SemanticEntity, TileAttributeFlag, TilesetAsset, TriggerRecord } from "../types";
import { randomRectEntityId } from "../map/geometry";
import { allMapCells, buildPaintChanges, buildReplaceChanges, dominantTiles, rectCells, regionCellCount, regionDimensions } from "../map/regionPaint";
import { actionSlotEntitiesForTriggerRecord } from "../semanticGraph";
import { compactValue, linksFor, mapEntityId, selectEntityFromId, semanticLabel, triggerEntityId } from "../utils";
import { InfoGrid } from "./InfoGrid";
import { ActionPointCodeTable, CellTileEvidence, MapCapabilityPanel, RandomRectangleForm } from "./MapAffordances";
import { PaintPalettePanel } from "./TileSelectionBar";
import { classifyTileValue, standardTileValues, tileAttributeGroup } from "../map/tileMetadata";
import { tileColor } from "./TileSprite";
import { TileSwatch } from "./TileSwatch";
import { TutorialTip } from "./TutorialTip";
import { ScrollArea } from "../ui";
import { ResizablePane } from "./ResizablePane";
import { actionPointCapacity, nextActionPointRecordIndex } from "../actionPointCapacity";

type MapContextFocus = "flags" | "atlas" | "layout" | "source";
const LAND_LAYOUT_ROWS = 8;
const LAND_LAYOUT_COLS = 16;

export function MapContextSidebar({
  state,
  selectedMap,
  selectedTileset,
  atlas,
  onSelectMap,
  onSetTool,
  onSelectTile,
  paintMode,
  onSetPaintMode,
  selectedRegion,
  onSetSelectedRegion,
  replaceSourceTile,
  onSetReplaceSourceTile,
  onApplyCommand,
  paletteOpen,
  onSetPaletteOpen
}: {
  state: EditorState;
  selectedMap: MapEntity | null;
  selectedTileset: TilesetAsset | null;
  atlas: EditorState["atlasEntries"][string] | null;
  onSelectMap: (id: string) => void;
  onSetTool: (tool: EditorTool) => void;
  onSelectTile: (tile: number) => void;
  paintMode: MapPaintMode;
  onSetPaintMode: (mode: MapPaintMode) => void;
  selectedRegion: MapRegionSelection | null;
  onSetSelectedRegion: (region: MapRegionSelection | null) => void;
  replaceSourceTile: number | null;
  onSetReplaceSourceTile: (tile: number | null) => void;
  onApplyCommand: (command: ProjectCommand) => void;
  paletteOpen: boolean;
  onSetPaletteOpen: (open: boolean) => void;
}) {
  return (
    <ResizablePane
      className="editor-sidebar contextual-sidebar"
      ariaLabel="Map tools and context"
      storageKey="providence.mapLeftSidebarWidth.v4"
      defaultWidth={360}
      minWidth={320}
      maxWidth={560}
      edge="right"
    >
      <ScrollArea className="contextual-sidebar-scroll" aria-label="Map tools and browser">
        <MapOutliner
          project={state.project}
          selectedMap={selectedMap}
          onSelectMap={onSelectMap}
        />
        <MapToolset
          state={state}
          selectedMap={selectedMap}
          selectedTileset={selectedTileset}
          atlas={atlas}
          onSetTool={onSetTool}
          onSelectTile={onSelectTile}
          paintMode={paintMode}
          onSetPaintMode={onSetPaintMode}
          selectedRegion={selectedRegion}
          onSetSelectedRegion={onSetSelectedRegion}
          replaceSourceTile={replaceSourceTile}
          onSetReplaceSourceTile={onSetReplaceSourceTile}
          onApplyCommand={onApplyCommand}
          paletteOpen={paletteOpen}
          onSetPaletteOpen={onSetPaletteOpen}
        />
      </ScrollArea>
    </ResizablePane>
  );
}

export function MapSelectionSidebar({
  state,
  selectedMap,
  selectedTileset,
  atlas,
  selectedRandomLevel,
  mapTriggers,
  mapRecords,
  onSelectMap,
  onSelectTile,
  contextFocus,
  onSetContextFocus,
  previewMode,
  previewFocalPoint,
  onSetPreviewMode,
  onSetPreviewFocalPoint,
  onSetTool,
  onSetViewFlag,
  onOpenPalette,
  onOpenScripts,
  paintMode,
  onSetPaintMode,
  selectedRegion,
  onSetSelectedRegion,
  replaceSourceTile,
  onSetReplaceSourceTile,
  onSelectEntity,
  onClearSelection,
  onApplyCommand
}: {
  state: EditorState;
  selectedMap: MapEntity | null;
  selectedTileset: TilesetAsset | null;
  atlas: EditorState["atlasEntries"][string] | null;
  selectedRandomLevel: RandomLevel | null;
  mapTriggers: TriggerRecord[];
  mapRecords: SemanticEntity[];
  onSelectMap: (id: string) => void;
  onSelectTile: (tile: number) => void;
  contextFocus: MapContextFocus;
  onSetContextFocus: (focus: MapContextFocus) => void;
  previewMode: MapPreviewMode;
  previewFocalPoint: MapPreviewFocalPoint;
  onSetPreviewMode: (mode: MapPreviewMode) => void;
  onSetPreviewFocalPoint: (point: MapPreviewFocalPoint | null) => void;
  onSetTool: (tool: EditorTool) => void;
  onSetViewFlag: (flag: MapViewFlag, value: boolean) => void;
  onOpenPalette: () => void;
  onOpenScripts: (entity: SelectedEntity) => void;
  paintMode: MapPaintMode;
  onSetPaintMode: (mode: MapPaintMode) => void;
  selectedRegion: MapRegionSelection | null;
  onSetSelectedRegion: (region: MapRegionSelection | null) => void;
  replaceSourceTile: number | null;
  onSetReplaceSourceTile: (tile: number | null) => void;
  onSelectEntity: (entity: SelectedEntity) => void;
  onClearSelection: () => void;
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  const [open, setOpen] = useState(() => localStorage.getItem("providence.mapRightContextOpen.v1") !== "0");
  useEffect(() => {
    localStorage.setItem("providence.mapRightContextOpen.v1", open ? "1" : "0");
  }, [open]);
  const selection = selectionSummary(selectedMap, state.selectedEntity, state.selectedCell, selectedRegion, mapTriggers, selectedRandomLevel, mapRecords);
  if (!open) {
    return (
      <aside className="map-context-rail">
        <button type="button" onClick={() => setOpen(true)}>
          Inspector
        </button>
      </aside>
    );
  }
  return (
    <ResizablePane
      className="editor-inspector map-context-sidebar"
      ariaLabel="Map contextual inspector"
      storageKey="providence.mapRightContextWidth.v1"
      defaultWidth={380}
      minWidth={320}
      maxWidth={680}
      edge="left"
    >
      <ScrollArea className="editor-inspector-scroll map-context-scroll" aria-label="Map contextual inspector">
        <div className="panel-header map-context-header">
          <span>{selection ? "Selection Inspector" : "Map Setup"}</span>
          <button className="btn btn-ghost btn-xs" type="button" onClick={() => setOpen(false)}>Collapse</button>
        </div>
        {selection ? (
          <SelectionInspector
            selection={selection}
            map={selectedMap}
            project={state.project}
            selectedPaintTile={state.selectedTile}
            selectedTileset={selectedTileset}
            icons={state.iconEntries}
            paintMode={paintMode}
            onSetPaintMode={onSetPaintMode}
            selectedRegion={selectedRegion}
            onSetSelectedRegion={onSetSelectedRegion}
            replaceSourceTile={replaceSourceTile}
            onSetReplaceSourceTile={onSetReplaceSourceTile}
            onSelectEntity={onSelectEntity}
            onOpenScripts={onOpenScripts}
            onClearSelection={onClearSelection}
            onApplyCommand={onApplyCommand}
          />
        ) : (
          <CoreMapSetup
            project={state.project}
            selectedMap={selectedMap}
            selectedTileset={selectedTileset}
            atlas={atlas}
            randomLevel={selectedRandomLevel}
            activeTool={state.activeTool}
            contextFocus={contextFocus}
            icons={state.iconEntries}
            selectedPaintTile={state.selectedTile}
            onSelectMap={onSelectMap}
            onSelectTile={onSelectTile}
            previewMode={previewMode}
            previewFocalPoint={previewFocalPoint}
            showRandomRects={state.showRandomRects}
            onSetContextFocus={onSetContextFocus}
            onSetPreviewMode={onSetPreviewMode}
            onSetPreviewFocalPoint={onSetPreviewFocalPoint}
            onSetTool={onSetTool}
            onSetViewFlag={onSetViewFlag}
            onOpenPalette={onOpenPalette}
            onSelectEntity={onSelectEntity}
            onApplyCommand={onApplyCommand}
          />
        )}
      </ScrollArea>
    </ResizablePane>
  );
}

type Selection =
  | { kind: "cell"; cell: { x: number; y: number; tile: number }; triggers: TriggerRecord[]; rects: RandomLevel["rects"]; records: SemanticEntity[] }
  | { kind: "region"; region: MapRegionSelection }
  | { kind: "trigger"; trigger: TriggerRecord }
  | { kind: "random"; rect: RandomLevel["rects"][number] }
  | { kind: "record"; record: SemanticEntity };

function CoreMapSetup({
  project,
  selectedMap,
  selectedTileset,
  atlas,
  randomLevel,
  activeTool,
  contextFocus,
  onSelectMap,
  onSelectTile,
  previewMode,
  previewFocalPoint,
  showRandomRects,
  onSetContextFocus,
  icons,
  selectedPaintTile,
  onSetPreviewMode,
  onSetPreviewFocalPoint,
  onSetTool,
  onSetViewFlag,
  onOpenPalette,
  onSelectEntity,
  onApplyCommand
}: {
  project: Project | null;
  selectedMap: MapEntity | null;
  selectedTileset: TilesetAsset | null;
  atlas: EditorState["atlasEntries"][string] | null;
  randomLevel: RandomLevel | null;
  activeTool: EditorTool;
  contextFocus: MapContextFocus;
  icons: EditorState["iconEntries"];
  selectedPaintTile: number;
  onSelectMap: (id: string) => void;
  onSelectTile: (tile: number) => void;
  previewMode: MapPreviewMode;
  previewFocalPoint: MapPreviewFocalPoint;
  showRandomRects: boolean;
  onSetContextFocus: (focus: MapContextFocus) => void;
  onSetPreviewMode: (mode: MapPreviewMode) => void;
  onSetPreviewFocalPoint: (point: MapPreviewFocalPoint | null) => void;
  onSetTool: (tool: EditorTool) => void;
  onSetViewFlag: (flag: MapViewFlag, value: boolean) => void;
  onOpenPalette: () => void;
  onSelectEntity: (entity: SelectedEntity) => void;
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  const clearLevel = () => {
    if (!selectedMap) return;
    const fillTile = selectedTileset?.baseTile ?? selectedMap.tiles[0] ?? 1;
    const confirmed = window.confirm(`Clear ${selectedMap.name} to tile ${fillTile}? This will overwrite all ${selectedMap.tiles.length.toLocaleString()} cells.`);
    if (!confirmed) return;
    onApplyCommand({
      kind: "paintTiles",
      label: "Clear level",
      mapId: selectedMap.id,
      cells: selectedMap.tiles.map((from, index) => ({
        index,
        x: index % selectedMap.width,
        y: Math.floor(index / selectedMap.width),
        from,
        to: fillTile
      }))
    });
  };
  const focusFirstRandomRect = () => {
    if (!selectedMap || !randomLevel?.rects.length) return;
    onSetViewFlag("showRandomRects", true);
    onSelectEntity({ type: "encounter", id: randomRectEntityId(selectedMap, randomLevel.rects[0].rectIndex) });
  };
  return (
    <section className="context-panel">
      <div className="panel-header">
        <span>Core Map Setup</span>
        <small>{selectedMap?.levelType ?? "none"}</small>
      </div>
      <details className="context-section" open>
        <summary>
          <span>Map Identity</span>
          <b>{selectedMap?.levelType ?? "none"}</b>
        </summary>
        <InfoGrid
          rows={[
            ["Map ID", selectedMap ? mapEntityId(selectedMap.levelType, selectedMap.index) : "none"],
            ["Record", selectedMap ? `${selectedMap.source} #${selectedMap.index}` : "none"],
            ["Tileset", selectedMap?.render.tilesetId ?? "none"],
            ["Land Look", randomLevel?.landlook ?? "none"]
          ]}
        />
      </details>
      <details className="context-section" open={contextFocus === "flags"}>
        <summary>
          <span>Realmz Map Flags</span>
          <b>{randomLevel ? "configured" : "none"}</b>
        </summary>
        <MapLevelSettings
          map={selectedMap}
          randomLevel={randomLevel}
          selectedTileset={selectedTileset}
          previewMode={previewMode}
          previewFocalPoint={previewFocalPoint}
          onSetPreviewMode={onSetPreviewMode}
          onSetPreviewFocalPoint={onSetPreviewFocalPoint}
          onApplyCommand={onApplyCommand}
        />
      </details>
      <details className="context-section" open={contextFocus === "atlas"}>
        <summary>
          <span>Tile Atlas</span>
          <b>{selectedTileset?.id ?? "none"}</b>
        </summary>
        <InfoGrid
          rows={[
            ["Tileset", selectedTileset?.name ?? "none"],
            ["Atlas", selectedTileset?.imagePath ? "available" : "missing"],
            ["Tile Count", selectedTileset ? selectedTileset.columns * selectedTileset.rows : 0],
            ["Base Tile", selectedTileset?.baseTile ?? "none"]
          ]}
        />
        <p className="context-capacity-note">
          {atlas ? "Palette previews use the same renderer as the map canvas." : "No atlas image is loaded; Providence will show fallback swatches."}
        </p>
        <LandTileAtlasEditor
          project={project}
          selectedTileset={selectedTileset}
          atlas={atlas}
          icons={icons}
          selectedPaintTile={selectedPaintTile}
          onSelectTile={onSelectTile}
          onSetTool={onSetTool}
          onOpenPalette={onOpenPalette}
        />
      </details>
      <details className="context-section" open={contextFocus === "layout"}>
        <summary>
          <span>Land Layout</span>
          <b>{project?.landLayout ? "configured" : "none"}</b>
        </summary>
        <LandLayoutEditor
          project={project}
          selectedMap={selectedMap}
          onSelectMap={onSelectMap}
          onApplyCommand={onApplyCommand}
        />
      </details>
      {selectedMap && project && (
        <p className="context-capacity-note">
          {actionPointCapacity(project.triggers, selectedMap.levelType, selectedMap.index).active}/100 Action Point records used.{" "}
          {randomLevel?.rects.length ?? 0}/20 Random Rectangles active.
        </p>
      )}
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
        onFocusAtlas={() => onSetContextFocus("atlas")}
        onFocusLayout={() => onSetContextFocus("layout")}
        onClearLevel={clearLevel}
        onShowRandomRects={() => onSetViewFlag("showRandomRects", true)}
        onHighlightRandomRect={focusFirstRandomRect}
        onEditRandomRect={focusFirstRandomRect}
        onSelectRandomRect={
          selectedMap
            ? (rectIndex) => onSelectEntity({ type: "encounter", id: randomRectEntityId(selectedMap, rectIndex) })
            : undefined
        }
      />
    </section>
  );
}

function MapOutliner({
  project,
  selectedMap,
  onSelectMap
}: {
  project: Project | null;
  selectedMap: MapEntity | null;
  onSelectMap: (id: string) => void;
}) {
  const maps = project?.maps ?? [];
  const landCount = maps.filter((map) => map.levelType === "land").length;
  const dungeonCount = maps.filter((map) => map.levelType === "dungeon").length;
  return (
    <section className="context-panel map-outliner-panel compact">
      <div className="panel-header">
        <span>Scenario Maps</span>
        <small>{maps.length.toLocaleString()}</small>
      </div>
      <label className="context-field compact">
        <span>Current Map</span>
        <select value={selectedMap?.id ?? ""} onChange={(event) => onSelectMap(event.currentTarget.value)} disabled={!project}>
          {!project && <option value="">No project loaded</option>}
          {maps.map((map) => (
            <option key={map.id} value={map.id}>
              {map.name}
            </option>
          ))}
        </select>
      </label>
      <div className="map-outliner-meta">
        <span>{landCount} land</span>
        <span>{dungeonCount} dungeon</span>
        {selectedMap && <span>{selectedMap.render.tilesetId}</span>}
      </div>
      {selectedMap && (
        <p className="map-current-summary">
          {selectedMap.name} | {selectedMap.levelType} {selectedMap.index} | {selectedMap.render.tilesetId}
        </p>
      )}
      {!project && <p className="empty-copy compact">Create or import a scenario to browse maps.</p>}
    </section>
  );
}

function LandLayoutEditor({
  project,
  selectedMap,
  onSelectMap,
  onApplyCommand
}: {
  project: Project | null;
  selectedMap: MapEntity | null;
  onSelectMap: (id: string) => void;
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  const landMaps = (project?.maps ?? []).filter((map) => map.levelType === "land").sort((a, b) => a.index - b.index);
  const layout = project?.landLayout ?? null;
  const cells = normalizeLayoutCells(layout?.cells ?? []);
  const stats = landLayoutStats(cells, landMaps);
  if (!project) {
    return <p className="empty-copy compact">Open or import a scenario to edit outdoor level layout.</p>;
  }
  if (!layout) {
    return (
      <div className="land-layout-editor">
        <p className="empty-copy compact">
          This scenario has no Layout file yet. Realmz will not automatically move between outdoor levels when the party walks off a map edge.
        </p>
        <button className="btn btn-primary btn-sm" type="button" onClick={() => onApplyCommand({ kind: "createLandLayout", label: "Create land layout" })}>
          Create Layout Table
        </button>
      </div>
    );
  }
  return (
    <div className="land-layout-editor">
      <p className="empty-copy compact">
        Arrange outdoor levels in the grid. Blank cells disable edge travel; Land 0 is stored as -1 for Realmz compatibility.
      </p>
      <div className="land-layout-toolbar">
        <button className="btn btn-secondary btn-xs" type="button" onClick={() => onApplyCommand({ kind: "clearLandLayout", label: "Clear land layout" })}>
          Clear Layout
        </button>
        {selectedMap?.levelType === "land" && <span>Current: {selectedMap.name}</span>}
      </div>
      {stats.warnings.length > 0 && (
        <div className="inline-diagnostics">
          {stats.warnings.map((warning) => <div key={warning} className="diagnostic warning">{warning}</div>)}
        </div>
      )}
      <div className="land-layout-grid" style={{ gridTemplateColumns: `repeat(${LAND_LAYOUT_COLS}, minmax(2.1rem, 1fr))` }}>
        {Array.from({ length: LAND_LAYOUT_ROWS }, (_, row) =>
          Array.from({ length: LAND_LAYOUT_COLS }, (_, col) => {
            const index = row * LAND_LAYOUT_COLS + col;
            const value = cells[index] ?? 0;
            const target = mapForLayoutValue(value, landMaps);
            const selected = selectedMap?.levelType === "land" && layoutValueForMapIndex(selectedMap.index) === value;
            return (
              <label key={`${row}:${col}`} className={`land-layout-cell${value !== 0 ? " filled" : ""}${selected ? " current" : ""}${value !== 0 && !target ? " missing" : ""}`} title={layoutCellTitle(value, target)}>
                <span>{row + 1},{col + 1}</span>
                <select
                  value={String(value)}
                  onChange={(event) => onApplyCommand({ kind: "updateLandLayoutCell", label: "Update land layout", row, col, value: Number(event.currentTarget.value) })}
                >
                  <option value="0">-</option>
                  {landMaps.map((map) => (
                    <option key={map.id} value={String(layoutValueForMapIndex(map.index))}>{map.index}</option>
                  ))}
                  {value !== 0 && !landMaps.some((map) => layoutValueForMapIndex(map.index) === value) && (
                    <option value={String(value)}>{value}</option>
                  )}
                </select>
                {target && (
                  <button type="button" onClick={() => onSelectMap(target.id)} aria-label={`Open ${target.name}`}>
                    Open
                  </button>
                )}
              </label>
            );
          })
        )}
      </div>
      <div className="land-layout-legend">
        <span><b>-</b> No edge travel</span>
        <span><b>0</b> Land level 0</span>
        <span><b>1+</b> Matching land level</span>
      </div>
    </div>
  );
}

function normalizeLayoutCells(cells: number[]) {
  const normalized = new Array(LAND_LAYOUT_ROWS * LAND_LAYOUT_COLS).fill(0);
  for (let index = 0; index < normalized.length; index += 1) {
    normalized[index] = Number.isFinite(cells[index]) ? Math.trunc(cells[index]) : 0;
  }
  return normalized;
}

function layoutValueForMapIndex(index: number) {
  return index === 0 ? -1 : index;
}

function mapForLayoutValue(value: number, landMaps: MapEntity[]) {
  if (value === 0) return null;
  const mapIndex = value === -1 ? 0 : value;
  return landMaps.find((map) => map.index === mapIndex) ?? null;
}

function layoutCellTitle(value: number, target: MapEntity | null) {
  if (value === 0) return "Blank cell: no automatic edge travel.";
  if (target) return `Opens ${target.name}.`;
  return `References missing land level ${value === -1 ? 0 : value}.`;
}

function landLayoutStats(cells: number[], landMaps: MapEntity[]) {
  const warnings: string[] = [];
  const knownValues = new Set(landMaps.map((map) => layoutValueForMapIndex(map.index)));
  const counts = new Map<number, number>();
  for (const value of cells) {
    if (value === 0) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
    if (!knownValues.has(value)) warnings.push(`Layout references missing land level ${value === -1 ? 0 : value}.`);
  }
  const duplicateLevels = [...counts.entries()].filter(([, count]) => count > 1).map(([value]) => value === -1 ? 0 : value);
  if (duplicateLevels.length > 0) warnings.push(`Land level ${duplicateLevels.slice(0, 6).join(", ")} appears more than once; Realmz uses the first match for edge travel.`);
  return { warnings: [...new Set(warnings)] };
}

function MapToolset({
  state,
  selectedMap,
  selectedTileset,
  atlas,
  onSetTool,
  onSelectTile,
  paintMode,
  onSetPaintMode,
  selectedRegion,
  onSetSelectedRegion,
  replaceSourceTile,
  onSetReplaceSourceTile,
  onApplyCommand,
  paletteOpen,
  onSetPaletteOpen
}: {
  state: EditorState;
  selectedMap: MapEntity | null;
  selectedTileset: TilesetAsset | null;
  atlas: EditorState["atlasEntries"][string] | null;
  onSetTool: (tool: EditorTool) => void;
  onSelectTile: (tile: number) => void;
  paintMode: MapPaintMode;
  onSetPaintMode: (mode: MapPaintMode) => void;
  selectedRegion: MapRegionSelection | null;
  onSetSelectedRegion: (region: MapRegionSelection | null) => void;
  replaceSourceTile: number | null;
  onSetReplaceSourceTile: (tile: number | null) => void;
  onApplyCommand: (command: ProjectCommand) => void;
  paletteOpen: boolean;
  onSetPaletteOpen: (open: boolean) => void;
}) {
  const setPaintSubmode = (mode: MapPaintMode) => {
    onSetTool("paint");
    onSetPaintMode(mode);
    onSetPaletteOpen(true);
  };
  return (
    <section className="context-panel map-toolset-panel">
      <div className="panel-header">
        <span>Map Toolset</span>
        <small>{toolLabel(state.activeTool)}</small>
      </div>
      <div className="sidebar-tool-grid">
        {TOOLS.map((tool) => (
          <TutorialTip key={tool.id} title={toolLabel(tool.id)} body={tool.hint} side="right">
            <button className={`sidebar-tool${state.activeTool === tool.id ? " active" : ""}`} onClick={() => onSetTool(tool.id)}>
              {tool.icon}
              <span>{toolLabel(tool.id)}</span>
            </button>
          </TutorialTip>
        ))}
      </div>
      <PaintTileSummary
        selectedTile={state.selectedTile}
        inspectedTile={state.selectedCell?.tile ?? null}
        atlas={atlas}
        selectedTileset={selectedTileset}
        tileAttributes={state.project?.tileAttributes ?? []}
        icons={state.iconEntries}
        onSelectTile={onSelectTile}
      />
      <PaintModePanel
        map={selectedMap}
        selectedTileset={selectedTileset}
        selectedTile={state.selectedTile}
        paintMode={paintMode}
        onSetPaintMode={setPaintSubmode}
        selectedRegion={selectedRegion}
        onSetSelectedRegion={onSetSelectedRegion}
        replaceSourceTile={replaceSourceTile}
        onSetReplaceSourceTile={onSetReplaceSourceTile}
        onApplyCommand={onApplyCommand}
      />
      <button className={`toolset-disclosure${paletteOpen ? " open" : ""}`} onClick={() => onSetPaletteOpen(!paletteOpen)}>
        <span>{paletteOpen ? "Collapse" : "Open"} Paint Palette</span>
        <b>Paint {state.selectedTile}</b>
      </button>
      {paletteOpen && (
        <PaintPalettePanel
          map={selectedMap}
          project={state.project}
          libraryAssets={state.libraryCatalog?.assets ?? []}
          selectedTile={state.selectedTile}
          inspectedTile={state.selectedCell?.tile ?? null}
          setSelectedTile={onSelectTile}
          tileset={selectedTileset}
          atlas={atlas}
          icons={state.iconEntries}
          atlasStatus={state.atlasStatus}
          variant="sidebar"
        />
      )}
    </section>
  );
}

function MapLevelSettings({
  map,
  randomLevel,
  selectedTileset,
  previewMode,
  previewFocalPoint,
  onSetPreviewMode,
  onSetPreviewFocalPoint,
  onApplyCommand
}: {
  map: MapEntity | null;
  randomLevel: RandomLevel | null;
  selectedTileset: TilesetAsset | null;
  previewMode: MapPreviewMode;
  previewFocalPoint: MapPreviewFocalPoint;
  onSetPreviewMode: (mode: MapPreviewMode) => void;
  onSetPreviewFocalPoint: (point: MapPreviewFocalPoint | null) => void;
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  const [applied, setApplied] = useState<string | null>(null);
  if (!map) return <p className="empty-copy compact">Select a map to edit Realmz level flags.</p>;
  const commit = (fields: Partial<Pick<RandomLevel, "landlook" | "isDark" | "useLos">>) => {
    onApplyCommand({
      kind: "updateRandomLevelSettings",
      label: "Update map level flags",
      levelType: map.levelType,
      levelIndex: map.index,
      fields
    });
    setApplied("Applied");
    window.setTimeout(() => setApplied(null), 1200);
  };
  const atlasMissing = map.levelType === "land" && selectedTileset && (!selectedTileset.available || !selectedTileset.imagePath);
  return (
    <div className="map-level-settings">
      <MapNumberField label="Landlook" value={randomLevel?.landlook ?? map.render.landlook ?? (map.levelType === "land" ? 2 : -1)} onCommit={(landlook) => commit({ landlook })} />
      <label className="map-check-field">
        <input type="checkbox" checked={Boolean(randomLevel?.isDark)} onChange={(event) => commit({ isDark: event.currentTarget.checked })} />
        <span>Dark level</span>
      </label>
      <label className="map-check-field">
        <input type="checkbox" checked={Boolean(randomLevel?.useLos)} onChange={(event) => commit({ useLos: event.currentTarget.checked })} />
        <span>Use line of sight</span>
      </label>
      {applied && <small className="map-applied-status">{applied}</small>}
      {atlasMissing && <div className="map-diagnostic-list"><span>Landlook atlas is unavailable; map rendering will fall back to colors.</span></div>}
      <div className="map-preview-controls">
        <label className="context-field compact">
          <span>Editor Preview</span>
          <select value={previewMode} onChange={(event) => onSetPreviewMode(event.currentTarget.value as MapPreviewMode)}>
            <option value="off">Off</option>
            <option value="los">LOS preview</option>
            <option value="darkness">Darkness preview</option>
            <option value="both">Both</option>
          </select>
        </label>
        <div className="map-authoring-form">
          <MapNumberField label="Focus X" value={previewFocalPoint.x} min={0} max={89} onCommit={(x) => onSetPreviewFocalPoint({ ...previewFocalPoint, x })} />
          <MapNumberField label="Focus Y" value={previewFocalPoint.y} min={0} max={89} onCommit={(y) => onSetPreviewFocalPoint({ ...previewFocalPoint, y })} />
        </div>
        <button className="btn btn-ghost btn-xs context-action-button" type="button" onClick={() => onSetPreviewFocalPoint(null)}>
          Use selected/default focus
        </button>
      </div>
      <small>
        {map.levelType === "dungeon"
          ? "Dungeon geometry editing is not ready in this slice."
          : "Landlook changes update Realmz random-level metadata and render hints."}{" "}
        Dark and line-of-sight are saved/exported Realmz flags; previews are editor-only approximations and do not write runtime site data.
      </small>
    </div>
  );
}

const LAND_TILE_FILTERS: Array<{ id: TileAttributeFlag | "all"; label: string; hint: string }> = [
  { id: "all", label: "All", hint: "Show the full current landlook atlas." },
  { id: "walkable", label: "Walkable", hint: "Tiles Realmz treats as ordinary foot movement." },
  { id: "solid", label: "Solid", hint: "Tiles Realmz treats as blocking, boat-only, or fly/float-gated." },
  { id: "path", label: "Path", hint: "Road/path art and path-marked tiles." },
  { id: "shore", label: "Shore / Water", hint: "Tiles marked as shore or water movement surfaces." },
  { id: "boat-required", label: "Boat", hint: "Tiles that require boat-style movement." },
  { id: "fly-float-required", label: "Fly / Float", hint: "Tiles that require fly or float movement." },
  { id: "blocks-los", label: "Blocks LOS", hint: "Tiles that block line of sight." },
  { id: "unknown-metadata", label: "Unknown", hint: "Tiles with no decoded attribute data yet." }
];

function LandTileAtlasEditor({
  project,
  selectedTileset,
  atlas,
  icons,
  selectedPaintTile,
  onSelectTile,
  onSetTool,
  onOpenPalette
}: {
  project: Project | null;
  selectedTileset: TilesetAsset | null;
  atlas: EditorState["atlasEntries"][string] | null;
  icons: Record<number, IconEntry>;
  selectedPaintTile: number;
  onSelectTile: (tile: number) => void;
  onSetTool: (tool: EditorTool) => void;
  onOpenPalette: () => void;
}) {
  const [filter, setFilter] = useState<TileAttributeFlag | "all">("all");
  const [inspectedTile, setInspectedTile] = useState(selectedPaintTile);
  useEffect(() => {
    setInspectedTile(selectedPaintTile);
  }, [selectedPaintTile, selectedTileset?.id]);

  if (!selectedTileset) {
    return <p className="empty-copy compact">Select a land map to inspect its tile set.</p>;
  }

  const attributes = project?.tileAttributes ?? [];
  const tiles = standardTileValues(selectedTileset);
  const visibleTiles = filter === "all"
    ? tiles
    : tiles.filter((tile) => tileAttributeGroup(classifyTileValue(tile, selectedTileset, attributes, icons).attributes, tile, selectedTileset).includes(filter));
  const meaning = classifyTileValue(inspectedTile, selectedTileset, attributes, icons);
  const attributeRows = tileAttributeRows(meaning);

  return (
    <div className="land-tile-atlas-editor">
      <div className="land-tile-atlas-toolbar" role="toolbar" aria-label="Tile attribute filters">
        {LAND_TILE_FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={filter === item.id ? "active" : ""}
            onClick={() => setFilter(item.id)}
            title={item.hint}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="land-tile-atlas-grid" style={{ gridTemplateColumns: `repeat(${Math.max(1, selectedTileset.columns)}, minmax(0, 1fr))` }}>
        {visibleTiles.map((tile) => (
          <button
            key={tile}
            type="button"
            className={[
              tile === selectedPaintTile ? "selected" : "",
              tile === inspectedTile ? "inspected" : ""
            ].filter(Boolean).join(" ")}
            style={{ background: tileColor(tile) }}
            onClick={() => {
              setInspectedTile(tile);
              onSelectTile(tile);
            }}
            title={`Tile ${tile}`}
          >
            <TileSwatch atlas={atlas} icons={icons} tile={tile} tileset={selectedTileset} />
          </button>
        ))}
        {visibleTiles.length === 0 && <span className="empty-inline">No tiles match this filter.</span>}
      </div>
      <div className="land-tile-detail-card">
        <div className="land-tile-detail-preview" style={{ background: tileColor(inspectedTile) }}>
          <TileSwatch atlas={atlas} icons={icons} tile={inspectedTile} tileset={selectedTileset} showBadge={false} />
        </div>
        <div className="land-tile-detail-body">
          <div className="tile-meaning-title">
            <span>{meaning.label}</span>
            <b>{attributeSourceLabel(meaning.attributes)}</b>
          </div>
          <InfoGrid rows={attributeRows} />
          <div className="context-action-stack compact">
            <button
              className="btn btn-primary btn-xs context-action-button"
              type="button"
              onClick={() => {
                onSelectTile(inspectedTile);
                onSetTool("paint");
                onOpenPalette();
              }}
            >
              Paint With This Tile
            </button>
          </div>
        </div>
      </div>
      <p className="context-capacity-note">
        Tile attributes are shown from Realmz landlook data when available. Editing the attribute table is read-only for now.
      </p>
    </div>
  );
}

function tileAttributeRows(meaning: ReturnType<typeof classifyTileValue>): [string, string | number][] {
  const attributes = meaning.attributes;
  return [
    ["Raw Value", meaning.raw],
    ["Rendered Tile", meaning.renderTile],
    ["Solid Type", attributes?.solidType ?? "unknown"],
    ["Move Sound", attributes?.movementSoundId ?? "unknown"],
    ["Time / Move", attributes?.movementCost ?? "unknown"],
    ["Traits", meaning.attributeFlags.map(tileAttributeLabel).join(", ") || "unknown"],
    ["Icon Art", meaning.iconCandidates.length === 0 ? "none" : meaning.iconAvailable ? "available" : "missing"],
    ["Status", userFacingConfidence(attributes?.confidence ?? (meaning.iconCandidates.length > 0 ? "preserved" : "unknown"))]
  ];
}

function PaintTileSummary({
  selectedTile,
  inspectedTile,
  atlas,
  selectedTileset,
  tileAttributes,
  icons,
  onSelectTile
}: {
  selectedTile: number;
  inspectedTile: number | null;
  atlas: EditorState["atlasEntries"][string] | null;
  selectedTileset: TilesetAsset | null;
  tileAttributes: Project["tileAttributes"];
  icons: EditorState["iconEntries"];
  onSelectTile: (tile: number) => void;
}) {
  const paintMeaning = classifyTileValue(selectedTile, selectedTileset, tileAttributes, icons);
  const inspectedMeaning = inspectedTile != null && inspectedTile !== selectedTile
    ? classifyTileValue(inspectedTile, selectedTileset, tileAttributes, icons)
    : null;
  return (
    <div className="paint-tile-card">
      <div className="paint-tile-summary">
        <button
          type="button"
          className="paint-tile-preview"
          style={{ background: tileColor(selectedTile) }}
          onClick={() => onSelectTile(selectedTile)}
          title={`Selected paint tile ${selectedTile}`}
        >
          <TileSwatch atlas={atlas} icons={icons} tile={selectedTile} tileset={selectedTileset} />
        </button>
        <div>
          <strong>{paintMeaning.label}</strong>
          <small>{selectedTileset?.name ?? "No tileset loaded"}</small>
          {inspectedTile != null && <small>Selected cell tile {inspectedTile}</small>}
        </div>
      </div>
      <TileMeaningInspector title="Paint Tile Meaning" meaning={paintMeaning} />
      {inspectedMeaning && <TileMeaningInspector title="Selected Cell Meaning" meaning={inspectedMeaning} compact />}
    </div>
  );
}

function TileMeaningInspector({
  title,
  meaning,
  compact = false
}: {
  title: string;
  meaning: ReturnType<typeof classifyTileValue>;
  compact?: boolean;
}) {
  const flags = [
    meaning.flags.markerBit ? "marker" : null,
    meaning.flags.pathBit ? "path" : null,
    meaning.flags.noteBit ? "note" : null,
    meaning.iconId != null ? `icon ${meaning.iconId}` : null
  ].filter(Boolean).join(", ") || "none";
  const iconState = meaning.iconCandidates.length === 0
    ? "none"
    : meaning.iconAvailable
      ? `loaded ${meaning.iconCandidates.join(", ")}`
      : `missing ${meaning.iconCandidates.join(", ")}`;
  const attributes = meaning.attributes;
  const attributeFlags = meaning.attributeFlags.length ? meaning.attributeFlags.map(tileAttributeLabel).join(", ") : "unknown";
  return (
    <div className={`tile-meaning-inspector${compact ? " compact" : ""}`}>
      <div className="tile-meaning-title">
        <span>{title}</span>
        <b>{meaning.kind.replace(/-/g, " ")}</b>
      </div>
      <div className="tile-meaning-grid">
        <span>Raw</span>
        <b>{meaning.raw}</b>
        <span>Render</span>
        <b>{meaning.renderTile}</b>
        <span>Normalized</span>
        <b>{meaning.normalized}</b>
        <span>Flags</span>
        <b>{flags}</b>
        <span>Icon Art</span>
        <b>{iconState}</b>
        <span>Solid Type</span>
        <b>{attributes?.solidType ?? "unknown"}</b>
        <span>Traits</span>
        <b>{attributeFlags}</b>
        <span>Attribute Table</span>
        <b>{attributeSourceLabel(attributes)}</b>
        <span>Move Cost</span>
        <b>{attributes?.movementCost ?? "unknown"}</b>
        <span>Sound</span>
        <b>{attributes?.movementSoundId ?? "unknown"}</b>
        <span>Status</span>
        <b>{userFacingConfidence(attributes?.confidence ?? (meaning.iconCandidates.length > 0 ? "preserved" : "unknown"))}</b>
      </div>
      {!compact && <p>{meaning.compatibility}</p>}
    </div>
  );
}

const PAINT_MODES: Array<{ id: MapPaintMode; label: string; body: string }> = [
  { id: "brush", label: "Brush", body: "Paint cells by dragging." },
  { id: "rectangle", label: "Rectangle Fill", body: "Drag a rectangle and fill it on release." },
  { id: "region", label: "Region Select", body: "Drag a rectangle without changing tiles." },
  { id: "replace", label: "Replace Tile", body: "Replace one tile value in a region or map." },
  { id: "clear", label: "Clear Region", body: "Reset a selected region to the base tile." }
];

function PaintModePanel({
  map,
  selectedTileset,
  selectedTile,
  paintMode,
  onSetPaintMode,
  selectedRegion,
  onSetSelectedRegion,
  replaceSourceTile,
  onSetReplaceSourceTile,
  onApplyCommand
}: {
  map: MapEntity | null;
  selectedTileset: TilesetAsset | null;
  selectedTile: number;
  paintMode: MapPaintMode;
  onSetPaintMode: (mode: MapPaintMode) => void;
  selectedRegion: MapRegionSelection | null;
  onSetSelectedRegion: (region: MapRegionSelection | null) => void;
  replaceSourceTile: number | null;
  onSetReplaceSourceTile: (tile: number | null) => void;
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  const clearTile = clearTileForMap(map, selectedTileset);
  return (
    <div className="paint-mode-panel">
      <div className="paint-mode-header">
        <span>Paint Subtool</span>
        <b>{paintModeLabel(paintMode)}</b>
      </div>
      <div className="paint-mode-grid">
        {PAINT_MODES.map((mode) => (
          <button key={mode.id} className={paintMode === mode.id ? "active" : ""} type="button" onClick={() => onSetPaintMode(mode.id)} title={mode.body}>
            {mode.label}
          </button>
        ))}
      </div>
      <p className="paint-mode-hint">
        {paintMode === "brush" && "Brush keeps the current single-cell and drag painting behavior."}
        {paintMode === "rectangle" && "Drag on the map to preview a rectangle; release fills it with the selected paint tile."}
        {paintMode === "region" && "Drag on the map to select a rectangular region for later fill, replace, or clear operations."}
        {paintMode === "replace" && "Select a region, then replace one tile value with the selected paint tile."}
        {paintMode === "clear" && `Select a region, then clear it to tile ${clearTile}.`}
      </p>
      {selectedRegion && (
        <div className="paint-region-quick-actions">
          <span>{regionLabel(selectedRegion)}</span>
          <button type="button" onClick={() => fillRegion(map, selectedRegion, selectedTile, onApplyCommand)}>Fill</button>
          <button type="button" onClick={() => clearRegion(map, selectedRegion, selectedTileset, onApplyCommand)}>Clear</button>
          <button type="button" onClick={() => onSetSelectedRegion(null)}>Clear Selection</button>
        </div>
      )}
      {paintMode === "replace" && (
        <MapNumberField
          label="Replace Source Tile"
          value={replaceSourceTile ?? selectedTile}
          onCommit={(tile) => onSetReplaceSourceTile(tile)}
        />
      )}
    </div>
  );
}

function RegionSelectionDetails({
  map,
  region,
  selectedTileset,
  tileAttributes,
  icons,
  paintMode,
  onSetPaintMode,
  selectedRegion,
  onSetSelectedRegion,
  replaceSourceTile,
  onSetReplaceSourceTile,
  selectedPaintTile,
  onApplyCommand
}: {
  map: MapEntity | null;
  region: MapRegionSelection;
  selectedTileset: TilesetAsset | null;
  tileAttributes: Project["tileAttributes"];
  icons: EditorState["iconEntries"];
  paintMode: MapPaintMode;
  onSetPaintMode: (mode: MapPaintMode) => void;
  selectedRegion: MapRegionSelection | null;
  onSetSelectedRegion: (region: MapRegionSelection | null) => void;
  replaceSourceTile: number | null;
  onSetReplaceSourceTile: (tile: number | null) => void;
  selectedPaintTile: number;
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  if (!map) return <p className="empty-copy compact">Select a map region to edit tiles.</p>;
  const cells = rectCells(map, region);
  const dimensions = regionDimensions(region);
  const clearTile = clearTileForMap(map, selectedTileset);
  const sourceTile = replaceSourceTile ?? dominantTiles(cells, 1)[0]?.tile ?? selectedPaintTile;
  const regionReplaceCount = buildReplaceChanges(map, cells, sourceTile, selectedPaintTile).length;
  const mapReplaceCount = buildReplaceChanges(map, allMapCells(map), sourceTile, selectedPaintTile).length;
  const selectedMeaning = classifyTileValue(selectedPaintTile, selectedTileset, tileAttributes, icons);
  return (
    <div className="region-selection-details">
      <InfoGrid
        rows={[
          ["Bounds", `${region.left},${region.top} to ${region.right},${region.bottom}`],
          ["Size", `${dimensions.width} x ${dimensions.height}`],
          ["Cells", regionCellCount(region).toLocaleString()],
          ["Paint Tile", selectedPaintTile],
          ["Clear Tile", clearTile],
          ["Mode", paintModeLabel(paintMode)]
        ]}
      />
      <details className="context-section" open>
        <summary><span>Dominant Tiles</span><b>{cells.length}</b></summary>
        <div className="dominant-tile-list">
          {dominantTiles(cells).map((entry) => (
            <button key={entry.tile} type="button" className="link-chip" onClick={() => onSetReplaceSourceTile(entry.tile)}>
              Tile {entry.tile} <b>{entry.count}</b>
            </button>
          ))}
        </div>
      </details>
      <div className="context-action-stack">
        <button className="btn btn-primary btn-xs context-action-button" type="button" onClick={() => fillRegion(map, region, selectedPaintTile, onApplyCommand)}>
          Fill Region
        </button>
        <button className="btn btn-ghost btn-xs context-action-button" type="button" onClick={() => clearRegion(map, region, selectedTileset, onApplyCommand)}>
          Clear Region
        </button>
        <button className="btn btn-ghost btn-xs context-action-button" type="button" onClick={() => onSetSelectedRegion(null)}>
          Clear Selection
        </button>
      </div>
      <details className="context-section" open={paintMode === "replace"}>
        <summary><span>Replace Tile</span><b>{sourceTile} to {selectedPaintTile}</b></summary>
        <div className="map-authoring-form">
          <MapNumberField label="Source Tile" value={sourceTile} onCommit={(tile) => onSetReplaceSourceTile(tile)} />
          <label className="map-number-field">
            <span>Target Tile</span>
            <input type="number" value={selectedPaintTile} readOnly />
          </label>
        </div>
        <div className="context-action-stack">
          <button className="btn btn-primary btn-xs context-action-button" type="button" disabled={regionReplaceCount === 0} onClick={() => replaceRegion(map, region, sourceTile, selectedPaintTile, onApplyCommand)}>
            Replace In Region ({regionReplaceCount})
          </button>
          <button
            className="btn btn-ghost btn-xs context-action-button"
            type="button"
            disabled={mapReplaceCount === 0}
            onClick={() => {
              if (mapReplaceCount > 250 && !window.confirm(`Replace ${mapReplaceCount.toLocaleString()} tiles across ${map.name}?`)) return;
              replaceWholeMap(map, sourceTile, selectedPaintTile, onApplyCommand);
            }}
          >
            Replace Whole Map ({mapReplaceCount})
          </button>
        </div>
      </details>
      <div className="tile-meaning-inspector compact">
        <div className="tile-meaning-title">
          <span>Selected Paint Tile</span>
          <b>{selectedMeaning.kind.replace(/-/g, " ")}</b>
        </div>
        <p>{selectedMeaning.compatibility}</p>
      </div>
      {!selectedRegion && <p className="empty-copy compact">No region is currently selected.</p>}
      <button className="btn btn-ghost btn-xs context-action-button" type="button" onClick={() => onSetPaintMode("region")}>
        Return to Region Select
      </button>
    </div>
  );
}

function SelectionInspector({
  selection,
  map,
  project,
  selectedPaintTile,
  selectedTileset,
  icons,
  paintMode,
  onSetPaintMode,
  selectedRegion,
  onSetSelectedRegion,
  replaceSourceTile,
  onSetReplaceSourceTile,
  onSelectEntity,
  onOpenScripts,
  onClearSelection,
  onApplyCommand
}: {
  selection: Selection;
  map: MapEntity | null;
  project: Project | null;
  selectedPaintTile: number;
  selectedTileset: TilesetAsset | null;
  icons: EditorState["iconEntries"];
  paintMode: MapPaintMode;
  onSetPaintMode: (mode: MapPaintMode) => void;
  selectedRegion: MapRegionSelection | null;
  onSetSelectedRegion: (region: MapRegionSelection | null) => void;
  replaceSourceTile: number | null;
  onSetReplaceSourceTile: (tile: number | null) => void;
  onSelectEntity: (entity: SelectedEntity) => void;
  onOpenScripts: (entity: SelectedEntity) => void;
  onClearSelection: () => void;
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  const selectedCellMeaning = selection.kind === "cell"
    ? classifyTileValue(selection.cell.tile, selectedTileset, project?.tileAttributes ?? [], icons)
    : null;
  return (
    <section className="context-panel">
      <div className="panel-header">
        <span>Selection Inspector</span>
        <button className="btn btn-ghost btn-xs" onClick={onClearSelection}>Core</button>
      </div>
      {selection.kind === "cell" && (
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
              ["Special/Icon", selectedCellMeaning?.iconId ?? "none"],
              ["Icon Art", selectedCellMeaning?.iconCandidates.length ? (selectedCellMeaning.iconAvailable ? "loaded" : "missing") : "none"],
              ["Solid Type", selectedCellMeaning?.attributes?.solidType ?? "unknown"],
              ["Action Points", selection.triggers.length],
              ["Random Rects", selection.rects.length],
              ["Starts", selection.records.length],
              ["Edit State", "editable"]
            ]}
          />
          <CellTileEvidence cell={selection.cell} records={selection.records} />
          {selectedCellMeaning && <TileMeaningInspector title="Selected Cell Meaning" meaning={selectedCellMeaning} compact />}
          <ScriptedChangeSection project={project} map={map} cell={selection.cell} onSelectEntity={onSelectEntity} onOpenScripts={onOpenScripts} />
          <MapDiagnostics diagnostics={cellDiagnostics(selection)} />
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
                    const fallback = selectedTileset?.baseTile ?? 1;
                    onApplyCommand({
                      kind: "paintTiles",
                      label: "Remove stamp",
                      mapId: map.id,
                      cells: [{ ...selection.cell, index: selection.cell.y * map.width + selection.cell.x, from: selection.cell.tile, to: fallback }]
                    });
                  }}
                >
                  Remove Stamp to Tile {selectedTileset?.baseTile ?? 1}
                </button>
              )}
            </div>
          )}
        </>
      )}
      {selection.kind === "region" && (
        <RegionSelectionDetails
          map={map}
          region={selection.region}
          selectedTileset={selectedTileset}
          tileAttributes={project?.tileAttributes ?? []}
          icons={icons}
          paintMode={paintMode}
          onSetPaintMode={onSetPaintMode}
          selectedRegion={selectedRegion}
          onSetSelectedRegion={onSetSelectedRegion}
          replaceSourceTile={replaceSourceTile}
          onSetReplaceSourceTile={onSetReplaceSourceTile}
          selectedPaintTile={selectedPaintTile}
          onApplyCommand={onApplyCommand}
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
        <RandomRectangleEditor map={map} rect={selection.rect} onApplyCommand={onApplyCommand} />
      )}
      {selection.kind === "record" && (
        <RecordSelectionDetails project={project} map={map} record={selection.record} onSelectEntity={onSelectEntity} onApplyCommand={onApplyCommand} />
      )}
      {project && <small className="context-footnote">{project.scenario.name}</small>}
    </section>
  );
}

function MapDiagnostics({ diagnostics }: { diagnostics: string[] }) {
  if (diagnostics.length === 0) {
    return <div className="map-diagnostic-list ok"><span>Realmz-writable</span>No map-local blockers detected.</div>;
  }
  return (
    <div className="map-diagnostic-list">
      {diagnostics.map((diagnostic) => (
        <span key={diagnostic}>{diagnostic}</span>
      ))}
    </div>
  );
}

function ScriptedChangeSection({
  project,
  map,
  cell,
  onSelectEntity,
  onOpenScripts
}: {
  project: Project | null;
  map: MapEntity | null;
  cell: { x: number; y: number; tile: number };
  onSelectEntity: (entity: SelectedEntity) => void;
  onOpenScripts: (entity: SelectedEntity) => void;
}) {
  const changes = scriptedTileChangesForCell(project, map, cell);
  if (changes.length === 0) return null;
  return (
    <details className="context-section scripted-change-section" open>
      <summary><span>Scripted Changes</span><b>{changes.length}</b></summary>
      <div className="selection-link-list">
        {changes.map((change) => {
          const selected = selectEntityFromId(change.entityId);
          return (
            <div className="link-chip-group" key={`${change.entityId}:${change.slot}`}>
              <button className="link-chip" type="button" onClick={() => onSelectEntity(selected)}>
                Slot {change.slot}: {change.label}
              </button>
              <button className="link-chip action" type="button" onClick={() => onOpenScripts(selected)}>
                Scripts/AP
              </button>
            </div>
          );
        })}
      </div>
      <p className="empty-copy compact">These are runtime script effects, not static stamps painted into the map grid.</p>
    </details>
  );
}

function scriptedTileChangesForCell(project: Project | null, map: MapEntity | null, cell: { x: number; y: number }) {
  if (!project || !map) return [];
  const out: { entityId: string; slot: number; label: string }[] = [];
  for (const trigger of project.triggers) {
    for (const action of trigger.actions) {
      if (![12, 13, 25].includes(action.code)) continue;
      const edcd = project.extracodes.find((row) => row.id === action.id);
      const values = edcd?.values ?? [];
      const targetLevel = values[0];
      const targetX = values[1];
      const targetY = values[2];
      const matches = targetLevel === map.index && targetX === cell.x && targetY === cell.y;
      if (!matches) continue;
      const entityId = trigger.levelType && trigger.levelIndex != null
        ? triggerEntityId(trigger.levelType, trigger.levelIndex, trigger.recordIndex, trigger.source)
        : `ed3-action-record:${trigger.recordIndex}`;
      out.push({ entityId, slot: action.slot, label: `${action.label} targets ${cell.x},${cell.y}` });
    }
  }
  return out;
}

function cellDiagnostics(selection: Extract<Selection, { kind: "cell" }>) {
  const diagnostics: string[] = [];
  const tileLooksLikeActionMarker = selection.cell.tile > 999;
  if (selection.triggers.length > 0 && !tileLooksLikeActionMarker) {
    diagnostics.push("Action Point exists here, but the tile does not look like an AP marker.");
  }
  if (tileLooksLikeActionMarker && selection.triggers.length === 0) {
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

function randomRectDiagnostics(rect: RandomLevel["rects"][number]) {
  const diagnostics: string[] = [];
  if (rect.left < 0 || rect.top < 0 || rect.right > 89 || rect.bottom > 89) diagnostics.push("Bounds are outside the 90x90 map.");
  if (rect.left > rect.right || rect.top > rect.bottom) diagnostics.push("Bounds are inverted.");
  if (rect.percent > 10000) diagnostics.push("Times in 10,000 must not exceed 10000.");
  if (rect.percent < 0) diagnostics.push("Negative Times in 10,000 was imported from the scenario, but normal authoring should use 0..10000.");
  rect.randomDoorPercent.forEach((percent, index) => {
    if (percent < -100 || percent > 100) diagnostics.push(`Door ${index + 1} percent must be between -100 and 100.`);
  });
  if (rect.percent === 0 && rect.randomDoors.every((door) => door === 0)) diagnostics.push("Rectangle is effectively inactive.");
  return diagnostics;
}

function randomDoorPercentMeaning(percent: number) {
  if (percent < 0) return `${Math.abs(percent)}% repeat door path`;
  if (percent > 0) return `${percent}% one-shot door path`;
  return "No extra AP chance.";
}

function TriggerSelectionDetails({
  project,
  trigger,
  onApplyCommand,
  onSelectEntity,
  onOpenScripts
}: {
  project: Project | null;
  trigger: TriggerRecord;
  onApplyCommand: (command: ProjectCommand) => void;
  onSelectEntity: (entity: SelectedEntity) => void;
  onOpenScripts: (entity: SelectedEntity) => void;
}) {
  const slots = actionSlotEntitiesForTriggerRecord(project, trigger);
  const isActionPoint = trigger.source !== "Data ED3" && trigger.levelType && trigger.levelIndex != null;
  const move = (patch: Partial<{ x: number; y: number }>) => {
    const levelType = trigger.levelType;
    const levelIndex = trigger.levelIndex;
    if (!isActionPoint || !trigger.coordinate || !levelType || levelIndex == null) return;
    onApplyCommand({
      kind: "moveActionPoint",
      label: "Move Action Point",
      triggerId: trigger.id,
      levelType,
      levelIndex,
      x: patch.x ?? trigger.coordinate.x,
      y: patch.y ?? trigger.coordinate.y
    });
  };
  return (
    <>
      <InfoGrid
        rows={[
          ["Type", trigger.source === "Data ED3" ? "Extra Action Point" : "Action Point"],
          ["Record", `${trigger.source} #${trigger.recordIndex}`],
          ["Edit State", isActionPoint ? "Realmz-writable" : "macro"]
        ]}
      />
      {isActionPoint && (
        <div className="context-action-stack">
          <button
            className="btn btn-primary btn-xs context-action-button"
            type="button"
            onClick={() => onOpenScripts(selectEntityFromId(triggerEntityId(trigger.levelType, trigger.levelIndex, trigger.recordIndex, trigger.source)))}
          >
            Open in Scripts/AP
          </button>
        </div>
      )}
      {isActionPoint && trigger.coordinate && (
        <div className="map-authoring-form">
          <MapNumberField label="Cell X" value={trigger.coordinate.x} min={0} max={89} onCommit={(x) => move({ x })} />
          <MapNumberField label="Cell Y" value={trigger.coordinate.y} min={0} max={89} onCommit={(y) => move({ y })} />
          <MapNumberField label="% Chance" value={trigger.percent} min={0} max={100} onCommit={(percent) => onApplyCommand({ kind: "updateTriggerHeader", label: "Update Action Point chance", triggerId: trigger.id, fields: { percent } })} />
          <MapNumberField label="Goto Level" value={trigger.landid ?? 0} min={0} max={255} onCommit={(landid) => onApplyCommand({ kind: "updateTriggerHeader", label: "Update Action Point target level", triggerId: trigger.id, fields: { landid } })} />
          <MapNumberField label="Goto X" value={trigger.targetX ?? 0} min={0} max={89} onCommit={(targetX) => onApplyCommand({ kind: "updateTriggerHeader", label: "Update Action Point target X", triggerId: trigger.id, fields: { targetX } })} />
          <MapNumberField label="Goto Y" value={trigger.targetY ?? 0} min={0} max={89} onCommit={(targetY) => onApplyCommand({ kind: "updateTriggerHeader", label: "Update Action Point target Y", triggerId: trigger.id, fields: { targetY } })} />
          <button className="btn btn-ghost btn-xs context-action-button" type="button" onClick={() => onApplyCommand({ kind: "deleteTrigger", label: "Clear Action Point", triggerId: trigger.id })}>
            Clear to reusable slot
          </button>
        </div>
      )}
      <ActionPointCodeTable trigger={trigger} />
      <div className="action-slot-list padded">
        {slots.length > 0
          ? slots.map((slot) => (
              <button key={slot.id} className="link-chip" onClick={() => onSelectEntity(selectEntityFromId(slot.id))}>
                {String(slot.summary.slot ?? "?")}: {actionSlotLabel(slot)}
              </button>
            ))
          : trigger.actions.map((action) => (
              <button key={`${trigger.id}:${action.slot}`} className="link-chip">
                {action.slot}: {action.label} {action.id ? `#${action.id}` : ""}
              </button>
            ))}
      </div>
    </>
  );
}

function RandomRectangleEditor({
  map,
  rect,
  onApplyCommand
}: {
  map: MapEntity | null;
  rect: RandomLevel["rects"][number];
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  if (!map) return null;
  const update = (fields: Partial<Omit<RandomLevel["rects"][number], "rectIndex">>) => {
    onApplyCommand({
      kind: "updateRandomRect",
      label: `Update Random Rectangle ${rect.rectIndex}`,
      levelType: map.levelType,
      levelIndex: map.index,
      rectIndex: rect.rectIndex,
      fields
    });
  };
  const updateDoor = (index: number, value: number) => {
    const randomDoors = [rect.randomDoors[0] ?? 0, rect.randomDoors[1] ?? 0, rect.randomDoors[2] ?? 0];
    randomDoors[index] = value;
    update({ randomDoors });
  };
  const updateDoorPercent = (index: number, value: number) => {
    const randomDoorPercent = [rect.randomDoorPercent[0] ?? 0, rect.randomDoorPercent[1] ?? 0, rect.randomDoorPercent[2] ?? 0];
    randomDoorPercent[index] = value;
    update({ randomDoorPercent });
  };
  return (
    <div className="map-random-editor">
      <InfoGrid
        rows={[
          ["Rectangle", rect.rectIndex],
          ["Edit State", "Realmz-writable"],
          ["Source", map.levelType === "land" ? "Data RD" : "Data RDD"]
        ]}
      />
      <MapDiagnostics diagnostics={randomRectDiagnostics(rect)} />
      <div className="map-authoring-form">
        <MapNumberField label="Left" value={rect.left} min={0} max={89} onCommit={(left) => update({ left })} />
        <MapNumberField label="Top" value={rect.top} min={0} max={89} onCommit={(top) => update({ top })} />
        <MapNumberField label="Right" value={rect.right} min={0} max={89} onCommit={(right) => update({ right })} />
        <MapNumberField label="Bottom" value={rect.bottom} min={0} max={89} onCommit={(bottom) => update({ bottom })} />
        <MapNumberField label="Times in 10,000" value={rect.percent} min={0} max={10000} onCommit={(percent) => update({ percent })} />
        <MapNumberField label="Battle Low" value={rect.battleRange[0] ?? 0} onCommit={(value) => update({ battleRange: [value, rect.battleRange[1] ?? value] })} />
        <MapNumberField label="Battle High" value={rect.battleRange[1] ?? 0} onCommit={(value) => update({ battleRange: [rect.battleRange[0] ?? value, value] })} />
        <MapNumberField label="Option" value={rect.option} min={-128} max={127} onCommit={(option) => update({ option })} />
        <MapNumberField label="Sound" value={rect.sound} onCommit={(sound) => update({ sound })} />
        <MapNumberField label="Text" value={rect.text} onCommit={(text) => update({ text })} />
        <label className="map-check-field">
          <input type="checkbox" checked={rect.only} onChange={(event) => update({ only: event.currentTarget.checked })} />
          <span>Only this rectangle can fire</span>
        </label>
      </div>
      <details className="context-section" open>
        <summary><span>Extra Action Point Doors</span><b>3</b></summary>
        <div className="map-authoring-form">
          {[0, 1, 2].map((index) => (
            <div className="map-door-pair" key={index}>
              <MapNumberField label={`Door ${index + 1}`} value={rect.randomDoors[index] ?? 0} onCommit={(value) => updateDoor(index, value)} />
              <MapNumberField label={`Door ${index + 1} %`} value={rect.randomDoorPercent[index] ?? 0} min={-100} max={100} onCommit={(value) => updateDoorPercent(index, value)} />
              <small className="context-capacity-note compact">{randomDoorPercentMeaning(rect.randomDoorPercent[index] ?? 0)}</small>
            </div>
          ))}
        </div>
      </details>
      <button
        className="btn btn-ghost btn-xs context-action-button"
        type="button"
        onClick={() => onApplyCommand({ kind: "clearRandomRect", label: `Clear Random Rectangle ${rect.rectIndex}`, levelType: map.levelType, levelIndex: map.index, rectIndex: rect.rectIndex })}
      >
        Clear Random Rectangle
      </button>
      <details className="context-section">
        <summary><span>Technical Details</span><b>{map.levelType === "land" ? "Data RD" : "Data RDD"}</b></summary>
        <RandomRectangleForm rect={rect} />
      </details>
    </div>
  );
}

function SelectionLinks({
  map,
  triggers,
  rects,
  records,
  onSelectEntity,
  onOpenScripts
}: {
  map: MapEntity | null;
  triggers: TriggerRecord[];
  rects: RandomLevel["rects"];
  records: SemanticEntity[];
  onSelectEntity: (entity: SelectedEntity) => void;
  onOpenScripts: (entity: SelectedEntity) => void;
}) {
  return (
    <div className="selection-link-list">
      {triggers.map((trigger) => {
        const selected = selectEntityFromId(triggerEntityId(trigger.levelType, trigger.levelIndex, trigger.recordIndex, trigger.source));
        return (
          <div className="link-chip-group" key={trigger.id}>
            <button
              className="link-chip"
              onClick={() => onSelectEntity(selected)}
            >
              {trigger.actions[0]?.label ?? "Action Point"} #{trigger.recordIndex}
            </button>
            <button className="link-chip action" onClick={() => onOpenScripts(selected)}>
              Scripts/AP
            </button>
          </div>
        );
      })}
      {map && rects.map((rect) => (
        <button key={rect.rectIndex} className="link-chip" onClick={() => onSelectEntity({ type: "encounter", id: `random:${map.levelType}:${map.index}:${rect.rectIndex}` })}>
          Random Rectangle {rect.rectIndex}
        </button>
      ))}
      {records.map((record) => (
        <button key={record.id} className="link-chip" onClick={() => onSelectEntity(selectEntityFromId(record.id))}>
          {record.label}
        </button>
      ))}
    </div>
  );
}

function RecordSelectionDetails({
  project,
  map,
  record,
  onSelectEntity,
  onApplyCommand
}: {
  project: Project | null;
  map: MapEntity | null;
  record: SemanticEntity;
  onSelectEntity: (entity: SelectedEntity) => void;
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  const links = linksFor(project, record.id);
  const mapRecord = mapRecordForSemantic(project, record);
  const summaryRows = Object.entries(record.summary)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .slice(0, 12)
    .map(([key, value]) => [labelizeKey(key), compactValue(value)] as [string, string]);
  return (
    <div className="record-selection-details">
      <InfoGrid
        rows={[
          ["Label", record.label],
          ["Type", record.type],
          ["Source", record.source],
          ["Record", record.recordRef ?? "none"],
          ["Byte Range", record.byteRange ? `${record.byteRange.start}..${record.byteRange.endExclusive} (${record.byteRange.length} bytes)` : "none"],
          ["Edit State", userFacingEditState(record.editState ?? (record.editable ? "editable" : "inspect-only"))],
          ["Status", userFacingConfidence(record.confidence)]
        ]}
      />
      {mapRecord && (
        <MapRecordEditor
          map={map}
          record={mapRecord}
          semanticRecord={record}
          onSelectEntity={onSelectEntity}
          onApplyCommand={onApplyCommand}
        />
      )}
      {summaryRows.length > 0 && (
        <details className="context-section" open>
          <summary><span>Decoded Fields</span><b>{summaryRows.length}</b></summary>
          <InfoGrid rows={summaryRows} />
        </details>
      )}
      <RelatedLinkSection
        title="Outgoing Links"
        links={links.outgoing}
        direction="outgoing"
        project={project}
        onSelectEntity={onSelectEntity}
      />
      <RelatedLinkSection
        title="Incoming Links"
        links={links.incoming}
        direction="incoming"
        project={project}
        onSelectEntity={onSelectEntity}
      />
    </div>
  );
}

function MapRecordEditor({
  map,
  record,
  semanticRecord,
  onSelectEntity,
  onApplyCommand
}: {
  map: MapEntity | null;
  record: MapRecord;
  semanticRecord: SemanticEntity;
  onSelectEntity: (entity: SelectedEntity) => void;
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  const update = (changes: Extract<ProjectCommand, { kind: "updateMapRecord" }>["changes"]) => {
    onApplyCommand({ kind: "updateMapRecord", label: `Update map record ${record.id}`, id: record.id, changes });
  };
  const targetMapId = `${record.isDungeon ? "dungeon" : "land"}:${record.level}`;
  return (
    <details className="context-section map-record-editor" open>
      <summary><span>Edit Map Record</span><b>Data MD2</b></summary>
      <MapDiagnostics diagnostics={mapRecordDiagnostics(record, map)} />
      <div className="map-authoring-form">
        <MapNumberField label="Start X" value={record.startX} min={0} max={89} onCommit={(startX) => update({ startX })} />
        <MapNumberField label="Start Y" value={record.startY} min={0} max={89} onCommit={(startY) => update({ startY })} />
        <MapNumberField label="Level" value={record.level} min={0} max={255} onCommit={(level) => update({ level })} />
        <MapNumberField label="Picture ID" value={record.pictId} onCommit={(pictId) => update({ pictId })} />
        <MapNumberField label="Icon Size" value={record.iconSize} onCommit={(iconSize) => update({ iconSize })} />
        <MapNumberField label="Show" value={record.show} onCommit={(show) => update({ show })} />
        <label className="map-check-field">
          <input type="checkbox" checked={record.isDungeon} onChange={(event) => update({ isDungeon: event.currentTarget.checked })} />
          <span>Dungeon record</span>
        </label>
      </div>
      <label className="context-field">
        <span>Note</span>
        <textarea value={record.note} maxLength={255} onChange={(event) => update({ note: event.currentTarget.value })} />
      </label>
      <details className="context-section">
        <summary><span>Display Rect</span><b>{record.rect.left},{record.rect.top}</b></summary>
        <div className="map-authoring-form">
          <MapNumberField label="Top" value={record.rect.top} onCommit={(top) => update({ rect: { ...record.rect, top } })} />
          <MapNumberField label="Left" value={record.rect.left} onCommit={(left) => update({ rect: { ...record.rect, left } })} />
          <MapNumberField label="Bottom" value={record.rect.bottom} onCommit={(bottom) => update({ rect: { ...record.rect, bottom } })} />
          <MapNumberField label="Right" value={record.rect.right} onCommit={(right) => update({ rect: { ...record.rect, right } })} />
        </div>
      </details>
      <div className="context-action-stack">
        <button className="btn btn-primary btn-xs context-action-button" type="button" onClick={() => onSelectEntity({ type: "map", id: `map:${targetMapId}` })}>
          Open Related Map
        </button>
        <button className="btn btn-ghost btn-xs context-action-button" type="button" onClick={() => navigator.clipboard?.writeText(`${record.startX},${record.startY}`)}>
          Copy Coordinates
        </button>
      </div>
      <p className="empty-copy compact">
        Names stay read-only because they are stored in the scenario resource data. Unknown icon-slot bytes are kept intact from {semanticRecord.recordRef ?? "Data MD2"}.
      </p>
    </details>
  );
}

function mapRecordForSemantic(project: Project | null, record: SemanticEntity) {
  if (record.type !== "map record") return null;
  const id = summaryNumber(record, "id") ?? Number(record.id.replace(/^map-record:/, ""));
  if (!Number.isInteger(id)) return null;
  return (project?.mapRecords ?? []).find((candidate) => candidate.id === id) ?? null;
}

function mapRecordDiagnostics(record: MapRecord, map: MapEntity | null) {
  const diagnostics: string[] = [];
  if (record.startX < 0 || record.startX >= 90 || record.startY < 0 || record.startY >= 90) {
    diagnostics.push("Start coordinate is outside the 90x90 map.");
  }
  if (record.rect.left > record.rect.right || record.rect.top > record.rect.bottom) {
    diagnostics.push("Display rectangle is inverted.");
  }
  if (map && (record.isDungeon !== (map.levelType === "dungeon") || record.level !== map.index)) {
    diagnostics.push(`This record points to ${record.isDungeon ? "dungeon" : "land"} ${record.level}, not the current map.`);
  }
  return diagnostics;
}

function RelatedLinkSection({
  title,
  links,
  direction,
  project,
  onSelectEntity
}: {
  title: string;
  links: ReturnType<typeof linksFor>["outgoing"];
  direction: "outgoing" | "incoming";
  project: Project | null;
  onSelectEntity: (entity: SelectedEntity) => void;
}) {
  return (
    <details className="context-section" open={links.length > 0}>
      <summary><span>{title}</span><b>{links.length}</b></summary>
      <div className="selection-link-list">
        {links.slice(0, 24).map((link) => {
          const id = direction === "outgoing" ? link.to : link.from;
          return (
            <button key={link.id} className="link-chip related" onClick={() => onSelectEntity(selectEntityFromId(id))}>
              <span>{link.kind.replace(/_/g, " ")}</span>
              <b>{semanticLabel(project, id)}</b>
            </button>
          );
        })}
        {links.length === 0 && <span className="empty-inline">No related records resolved.</span>}
      </div>
    </details>
  );
}

function labelizeKey(key: string) {
  return key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]/g, " ");
}

function selectionSummary(
  map: MapEntity | null,
  selectedEntity: SelectedEntity | null,
  selectedCell: { x: number; y: number; tile: number } | null,
  selectedRegion: MapRegionSelection | null,
  triggers: TriggerRecord[],
  randomLevel: RandomLevel | null,
  mapRecords: SemanticEntity[]
): Selection | null {
  if (map && selectedEntity?.id) {
    const trigger = triggers.find((candidate) => triggerEntityId(candidate.levelType, candidate.levelIndex, candidate.recordIndex, candidate.source) === selectedEntity.id);
    if (trigger) return { kind: "trigger", trigger };
    const rect = randomLevel?.rects.find((candidate) => selectedEntity.id === `random:${map.levelType}:${map.index}:${candidate.rectIndex}`);
    if (rect) return { kind: "random", rect };
    const record = mapRecords.find((candidate) => candidate.id === selectedEntity.id);
    if (record) return { kind: "record", record };
  }
  if (selectedRegion) return { kind: "region", region: selectedRegion };
  if (!selectedCell) return null;
  return {
    kind: "cell",
    cell: selectedCell,
    triggers: triggers.filter((trigger) => trigger.coordinate?.x === selectedCell.x && trigger.coordinate.y === selectedCell.y),
    rects: randomLevel?.rects.filter((rect) => selectedCell.x >= rect.left && selectedCell.x <= rect.right && selectedCell.y >= rect.top && selectedCell.y <= rect.bottom) ?? [],
    records: mapRecords.filter((record) => record.summary.startX === selectedCell.x && record.summary.startY === selectedCell.y)
  };
}

function toolLabel(tool: EditorTool) {
  if (tool === "trigger") return "Action Point";
  return tool[0].toUpperCase() + tool.slice(1);
}

function summaryNumber(entity: SemanticEntity, key: string) {
  const value = entity.summary[key];
  return typeof value === "number" ? value : null;
}

function userFacingEditState(state: string | null | undefined) {
  if (state === "editable") return "Editable";
  if (state === "blocked") return "Not editable yet";
  if (state === "inspect-only") return "Read-only";
  return state ?? "Read-only";
}

function userFacingConfidence(confidence: string | null | undefined) {
  if (confidence === "source-backed" || confidence === "fixture-backed") return "Verified";
  if (confidence === "inferred") return "Likely";
  if (confidence === "preserved") return "Imported";
  if (confidence === "unknown") return "Unknown";
  return confidence ?? "Unknown";
}

function attributeSourceLabel(attributes: ReturnType<typeof classifyTileValue>["attributes"]) {
  if (!attributes) return "Unknown";
  if (attributes.sourceKind === "mapstats") return "Realmz landlook table";
  if (attributes.sourceKind === "data-solids") return "Special tile table";
  if (attributes.sourceKind === "inferred") return "Inferred";
  if (attributes.sourceKind === "preserved") return "Imported";
  return attributes.source || "Unknown";
}

function tileAttributeLabel(flag: TileAttributeFlag) {
  switch (flag) {
    case "walkable": return "Walkable";
    case "solid": return "Solid / blocking";
    case "path": return "Path";
    case "shore": return "Shore / water";
    case "boat-required": return "Boat required";
    case "fly-float-required": return "Fly / float required";
    case "blocks-los": return "Blocks LOS";
    case "special-icon": return "Special / icon";
    case "unknown-metadata": return "Unknown";
    default: return flag;
  }
}

function nextAvailableRandomRectIndex(project: Project | null, levelType: MapEntity["levelType"], levelIndex: number) {
  const level = project?.randomLevels.find((candidate) => candidate.levelType === levelType && candidate.levelIndex === levelIndex);
  const used = new Set((level?.rects ?? []).map((rect) => rect.rectIndex));
  for (let index = 0; index < 20; index += 1) {
    if (!used.has(index)) return index;
  }
  return null;
}

function fillRegion(
  map: MapEntity | null,
  region: MapRegionSelection | null,
  selectedTile: number,
  onApplyCommand: (command: ProjectCommand) => void
) {
  if (!map || !region) return;
  const changes = buildPaintChanges(map, rectCells(map, region), selectedTile);
  if (changes.length === 0) return;
  onApplyCommand({
    kind: "paintTiles",
    label: `Fill region ${region.left},${region.top}-${region.right},${region.bottom}`,
    mapId: map.id,
    cells: changes
  });
}

function clearRegion(
  map: MapEntity | null,
  region: MapRegionSelection | null,
  selectedTileset: TilesetAsset | null,
  onApplyCommand: (command: ProjectCommand) => void
) {
  if (!map || !region) return;
  fillRegion(map, region, clearTileForMap(map, selectedTileset), onApplyCommand);
}

function replaceRegion(
  map: MapEntity,
  region: MapRegionSelection,
  fromTile: number,
  toTile: number,
  onApplyCommand: (command: ProjectCommand) => void
) {
  const changes = buildReplaceChanges(map, rectCells(map, region), fromTile, toTile);
  if (changes.length === 0) return;
  onApplyCommand({
    kind: "paintTiles",
    label: `Replace tile ${fromTile} with ${toTile} in region`,
    mapId: map.id,
    cells: changes
  });
}

function replaceWholeMap(
  map: MapEntity,
  fromTile: number,
  toTile: number,
  onApplyCommand: (command: ProjectCommand) => void
) {
  const changes = buildReplaceChanges(map, allMapCells(map), fromTile, toTile);
  if (changes.length === 0) return;
  onApplyCommand({
    kind: "paintTiles",
    label: `Replace tile ${fromTile} with ${toTile} on map`,
    mapId: map.id,
    cells: changes
  });
}

function clearTileForMap(map: MapEntity | null, selectedTileset: TilesetAsset | null) {
  return selectedTileset?.baseTile ?? map?.tiles[0] ?? 1;
}

function regionLabel(region: MapRegionSelection) {
  const { width, height } = regionDimensions(region);
  return `${region.left},${region.top} to ${region.right},${region.bottom} (${width}x${height})`;
}

function paintModeLabel(mode: MapPaintMode) {
  return PAINT_MODES.find((candidate) => candidate.id === mode)?.label ?? mode;
}

function MapNumberField({
  label,
  value,
  onCommit,
  min = -32768,
  max = 32767
}: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const next = clampNumber(Number(draft), min, max);
    setDraft(String(next));
    if (next !== value) onCommit(next);
  };
  return (
    <label className="map-number-field">
      <span>{label}</span>
      <input
        type="number"
        aria-label={label}
        min={min}
        max={max}
        value={draft}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            setDraft(String(value));
            event.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}

function clampNumber(value: number, min: number, max: number) {
  const numeric = Number.isFinite(value) ? Math.trunc(value) : 0;
  return Math.max(min, Math.min(max, numeric));
}

function actionSlotLabel(slot: SemanticEntity) {
  const usage = slot.summary.edcdUsage as { summary?: string } | undefined;
  return usage?.summary ?? String(slot.summary.label ?? `opcode ${slot.summary.code ?? "?"}`);
}
