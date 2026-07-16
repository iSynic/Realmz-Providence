import { useEffect, useMemo, useState } from "react";
import { EditorState } from "../../store";
import { IconEntry, MapEntity, Project, ProjectCommand, TilesetAsset } from "../../types";
import { tileValueAt } from "../../map/geometry";
import { InfoGrid } from "../InfoGrid";
import { TutorialTip } from "../TutorialTip";
import { drawTileSprite, tileColor } from "../TileSprite";
import { SegmentedControl, type SegmentedControlOption } from "../../ui";

export type LandLayoutCellSelection = { row: number; col: number } | null;
type LandLayoutPreviewMode = "compact" | "preview";
const LAND_LAYOUT_ROWS = 8;
const LAND_LAYOUT_COLS = 16;
const LAND_LAYOUT_PREVIEW_OPTIONS: ReadonlyArray<SegmentedControlOption<LandLayoutPreviewMode>> = [
  { value: "preview", label: "Preview" },
  { value: "compact", label: "Compact" }
];
const LAND_LAYOUT_HELP =
  "The Land Layout table is Realmz's outdoor edge-travel map. When the party exits a land level at an edge, Realmz looks up that level in this grid and moves to the neighboring filled cell.";
const CREATE_LAYOUT_HELP =
  "Create the scenario Layout table. Without it, outdoor maps can still exist, but Realmz will not automatically connect them by walking off map edges.";
const CLEAR_LAYOUT_HELP =
  "Clear every layout cell back to no edge travel. This is a broad structural edit because it removes automatic outdoor adjacency for the whole scenario.";
const LAYOUT_DISPLAY_HELP =
  "Preview mode draws miniature map thumbnails; Compact mode favors dense editing. Both modes edit the same 8 by 16 Realmz layout table.";
const LAYOUT_NEIGHBORS_HELP =
  "Neighbor Preview shows the north, south, east, and west cells around the selected layout slot. Those are the exits Realmz checks for edge travel.";
const LAYOUT_GRID_HELP =
  "Each cell stores a land level reference. Blank means no automatic edge travel, -1 means land level 0, and positive values refer to matching land level indices.";
const LAYOUT_CELL_VALUE_HELP =
  "Choose which outdoor land level occupies this layout cell. Realmz stores land level 0 as -1, so Providence keeps that legacy value visible.";
const LAYOUT_DETAIL_HELP =
  "Selected Cell explains the raw stored value, linked map, current map, missing-map warnings, and neighbor travel context for the active layout slot.";
const PLACE_CURRENT_LAND_HELP =
  "Write the currently selected land map into this layout cell. Use this when placing a newly authored land map into the outdoor world grid.";
const CLEAR_CELL_HELP =
  "Set this layout cell to blank/no edge travel. Adjacent maps will stop using this cell as an automatic outdoor transition.";
const OPEN_LINKED_MAP_HELP =
  "Open the land level referenced by this layout cell so you can paint or inspect the destination map.";
const LAYOUT_LEGEND_HELP =
  "Layout values are legacy Realmz references: dash means no edge travel, -1 means land level 0, and positive values match their land level index.";

export function LandLayoutEditor({
  project,
  selectedMap,
  atlasEntries,
  icons,
  selectedCell,
  onSetSelectedCell,
  onSelectMap,
  onApplyCommand
}: {
  project: Project | null;
  selectedMap: MapEntity | null;
  atlasEntries: EditorState["atlasEntries"];
  icons: Record<number, IconEntry>;
  selectedCell: LandLayoutCellSelection;
  onSetSelectedCell: (cell: LandLayoutCellSelection) => void;
  onSelectMap: (id: string) => void;
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  const [previewMode, setPreviewMode] = useState<LandLayoutPreviewMode>(() => readStoredLandLayoutPreviewMode());
  const [showNeighbors, setShowNeighbors] = useState(() => readStoredBoolean("providence.landLayout.showNeighbors.v1", true));
  const showPreviews = previewMode === "preview";
  const landMaps = (project?.maps ?? []).filter((map) => map.levelType === "land").sort((a, b) => a.index - b.index);
  const layout = project?.landLayout ?? null;
  const cells = normalizeLayoutCells(layout?.cells ?? []);
  const stats = landLayoutStats(cells, landMaps, selectedMap);
  const tilesetByMapId = useMemo(() => {
    const table = new Map<string, TilesetAsset>();
    if (!project) return table;
    for (const map of landMaps) {
      const tileset =
        project.assetCatalog.tilesets.find((candidate) => candidate.id === map.render.tilesetId) ??
        project.assetCatalog.tilesets.find((candidate) => candidate.landlook === map.render.landlook) ??
        null;
      if (tileset) table.set(map.id, tileset);
    }
    return table;
  }, [landMaps, project]);

  useEffect(() => {
    if (!selectedCell) {
      const firstFilled = cells.findIndex((value) => value !== 0);
      if (firstFilled >= 0) {
        onSetSelectedCell({ row: Math.floor(firstFilled / LAND_LAYOUT_COLS), col: firstFilled % LAND_LAYOUT_COLS });
      }
    }
  }, [cells, onSetSelectedCell, selectedCell]);

  useEffect(() => {
    localStorage.setItem("providence.landLayout.previewMode.v1", previewMode);
  }, [previewMode]);

  useEffect(() => {
    storeBoolean("providence.landLayout.showNeighbors.v1", showNeighbors);
  }, [showNeighbors]);

  if (!project) {
    return <p className="empty-copy compact">Open or import a scenario to edit outdoor level layout.</p>;
  }
  if (!layout) {
    return (
      <div className="land-layout-editor">
        <p className="empty-copy compact">
          This scenario has no Layout file yet. Realmz will not automatically move between outdoor levels when the party walks off a map edge.
        </p>
        <TutorialTip title="Create Layout Table" body={CREATE_LAYOUT_HELP} side="below">
          <button className="btn btn-primary btn-sm" type="button" onClick={() => onApplyCommand({ kind: "createLandLayout", label: "Create land layout" })}>
            Create Layout Table
          </button>
        </TutorialTip>
      </div>
    );
  }
  return (
    <div className="land-layout-editor">
      <p className="empty-copy compact">
        <TutorialTip title="Land Layout" body={LAND_LAYOUT_HELP} side="below">
          <span>
            Arrange outdoor levels in the grid. Realmz matches the party's current outdoor level in this table, then uses the neighboring cell when the party walks off a map edge.
          </span>
        </TutorialTip>
      </p>
      <div className="land-layout-toolbar">
        <TutorialTip title="Layout Grid" body={LAYOUT_GRID_HELP} side="below">
          <span className="map-help-anchor">Layout Grid</span>
        </TutorialTip>
        <TutorialTip title="Clear Layout" body={CLEAR_LAYOUT_HELP} side="below">
          <button className="btn btn-secondary btn-xs" type="button" onClick={() => onApplyCommand({ kind: "clearLandLayout", label: "Clear land layout" })}>
            Clear Layout
          </button>
        </TutorialTip>
        <TutorialTip title="Layout Display Mode" body={LAYOUT_DISPLAY_HELP} side="below">
          <span className="map-help-anchor">Display</span>
        </TutorialTip>
        <SegmentedControl
          ariaLabel="Land layout display mode"
          value={previewMode}
          options={LAND_LAYOUT_PREVIEW_OPTIONS}
          onChange={setPreviewMode}
        />
        <TutorialTip title="Neighbor Preview" body={LAYOUT_NEIGHBORS_HELP} side="below">
          <button className={`btn btn-secondary btn-xs${showNeighbors ? " active" : ""}`} type="button" onClick={() => setShowNeighbors(!showNeighbors)}>
            {showNeighbors ? "Hide Neighbors" : "Show Neighbors"}
          </button>
        </TutorialTip>
        {selectedMap?.levelType === "land" && <span>Current: {selectedMap.name}</span>}
      </div>
      {stats.warnings.length > 0 && (
        <div className="inline-diagnostics">
          {stats.warnings.map((warning) => <div key={warning} className="diagnostic warning">{warning}</div>)}
        </div>
      )}
      <div className="land-layout-body">
        <div
          className={`land-layout-grid${showPreviews ? " preview-grid" : " compact-grid"}`}
          style={{ gridTemplateColumns: `repeat(${LAND_LAYOUT_COLS}, minmax(${showPreviews ? "72px" : "48px"}, 1fr))` }}
        >
          {Array.from({ length: LAND_LAYOUT_ROWS }, (_, row) =>
            Array.from({ length: LAND_LAYOUT_COLS }, (_, col) => (
              <LandLayoutGridCell
                key={`${row}:${col}`}
                row={row}
                col={col}
                cells={cells}
                landMaps={landMaps}
                selectedMap={selectedMap}
                selected={selectedCell?.row === row && selectedCell.col === col}
                showPreviews={showPreviews}
                atlasEntries={atlasEntries}
                tilesetByMapId={tilesetByMapId}
                icons={icons}
                onSetSelectedCell={onSetSelectedCell}
                onApplyCommand={onApplyCommand}
              />
            ))
          )}
        </div>
        <LandLayoutDetailPanel
          cells={cells}
          landMaps={landMaps}
          selectedMap={selectedMap}
          selectedCell={selectedCell}
          atlasEntries={atlasEntries}
          tilesetByMapId={tilesetByMapId}
          icons={icons}
          showNeighbors={showNeighbors}
          onSetShowNeighbors={setShowNeighbors}
          onSetSelectedCell={onSetSelectedCell}
          onSelectMap={onSelectMap}
          onApplyCommand={onApplyCommand}
        />
      </div>
      <div className="land-layout-legend">
        <TutorialTip title="Layout Values" body={LAYOUT_LEGEND_HELP} side="below">
          <span><b>-</b> No edge travel</span>
        </TutorialTip>
        <span><b>-1</b> Land level 0</span>
        <span><b>1+</b> Matching land level</span>
      </div>
    </div>
  );
}

function LandLayoutGridCell({
  row,
  col,
  cells,
  landMaps,
  selectedMap,
  selected,
  showPreviews,
  atlasEntries,
  tilesetByMapId,
  icons,
  onSetSelectedCell,
  onApplyCommand
}: {
  row: number;
  col: number;
  cells: number[];
  landMaps: MapEntity[];
  selectedMap: MapEntity | null;
  selected: boolean;
  showPreviews: boolean;
  atlasEntries: EditorState["atlasEntries"];
  tilesetByMapId: Map<string, TilesetAsset>;
  icons: Record<number, IconEntry>;
  onSetSelectedCell: (cell: LandLayoutCellSelection) => void;
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  const index = row * LAND_LAYOUT_COLS + col;
  const value = cells[index] ?? 0;
  const target = mapForLayoutValue(value, landMaps);
  const targetTileset = target ? tilesetByMapId.get(target.id) ?? null : null;
  const targetAtlas = targetTileset ? atlasEntries[targetTileset.id] ?? null : null;
  const currentMapHere = selectedMap?.levelType === "land" && layoutValueForMapIndex(selectedMap.index) === value;
  const warnings = landLayoutCellWarnings(value, cells, landMaps);
  return (
    <div
      className={`land-layout-cell${showPreviews ? " with-preview" : ""}${value !== 0 ? " filled" : ""}${currentMapHere ? " current" : ""}${selected ? " selected" : ""}${warnings.length > 0 ? " warning" : ""}${value !== 0 && !target ? " missing" : ""}`}
      title={layoutCellTitle(value, target)}
      role="button"
      tabIndex={0}
      onClick={() => onSetSelectedCell({ row, col })}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSetSelectedCell({ row, col });
        }
      }}
    >
      <div className="land-layout-cell-topline">
        <span>{row + 1},{col + 1}</span>
        {warnings.length > 0 && <b>{warnings.length}</b>}
      </div>
      {showPreviews && value !== 0 && (
        <LandLayoutCellPreview map={target} atlas={targetAtlas} icons={icons} value={value} />
      )}
      {showPreviews && value === 0 && <span className="land-layout-preview empty-preview">No travel</span>}
      <select
        value={String(value)}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => onApplyCommand({ kind: "updateLandLayoutCell", label: "Update land layout", row, col, value: Number(event.currentTarget.value) })}
        title={LAYOUT_CELL_VALUE_HELP}
      >
        <option value="0">-</option>
        {landMaps.map((map) => (
          <option key={map.id} value={String(layoutValueForMapIndex(map.index))}>{map.index}</option>
        ))}
        {value !== 0 && !landMaps.some((map) => layoutValueForMapIndex(map.index) === value) && (
          <option value={String(value)}>{value}</option>
        )}
      </select>
    </div>
  );
}

function LandLayoutDetailPanel({
  cells,
  landMaps,
  selectedMap,
  selectedCell,
  atlasEntries,
  tilesetByMapId,
  icons,
  showNeighbors,
  onSetShowNeighbors,
  onSetSelectedCell,
  onSelectMap,
  onApplyCommand
}: {
  cells: number[];
  landMaps: MapEntity[];
  selectedMap: MapEntity | null;
  selectedCell: LandLayoutCellSelection;
  atlasEntries: EditorState["atlasEntries"];
  tilesetByMapId: Map<string, TilesetAsset>;
  icons: Record<number, IconEntry>;
  showNeighbors: boolean;
  onSetShowNeighbors: (show: boolean) => void;
  onSetSelectedCell: (cell: LandLayoutCellSelection) => void;
  onSelectMap: (id: string) => void;
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  const detail = layoutCellDetail(cells, landMaps, selectedCell);
  const currentLandValue = selectedMap?.levelType === "land" ? layoutValueForMapIndex(selectedMap.index) : null;
  const targetTileset = detail.target ? tilesetByMapId.get(detail.target.id) ?? null : null;
  const targetAtlas = targetTileset ? atlasEntries[targetTileset.id] ?? null : null;
  return (
    <aside className="land-layout-detail-panel">
      <div className="panel-header">
        <TutorialTip title="Selected Layout Cell" body={LAYOUT_DETAIL_HELP} side="below">
          <span>Selected Cell</span>
        </TutorialTip>
        <small>{detail.label}</small>
      </div>
      <div className="land-layout-detail-hero">
        <LandLayoutCellPreview map={detail.target} atlas={targetAtlas} icons={icons} value={detail.value} />
        <InfoGrid
          rows={[
            ["Grid Cell", detail.label],
            ["Stored Value", layoutValueLabel(detail.value)],
            ["Linked Land", detail.target ? `${detail.target.index}: ${detail.target.name}` : detail.value === 0 ? "No edge travel" : "Missing map"],
            ["Current Map", selectedMap?.levelType === "land" ? `${selectedMap.index}: ${selectedMap.name}` : "none"]
          ]}
        />
      </div>
      {detail.warnings.length > 0 && (
        <div className="inline-diagnostics">
          {detail.warnings.map((warning) => <div key={warning} className="diagnostic warning">{warning}</div>)}
        </div>
      )}
      <div className="context-action-stack compact">
        <TutorialTip title="Place Current Land" body={PLACE_CURRENT_LAND_HELP} side="left">
          <button
            className="btn btn-primary btn-xs context-action-button context-action-button-narrow"
            type="button"
            disabled={!selectedCell || currentLandValue == null}
            onClick={() => {
              if (!selectedCell || currentLandValue == null) return;
              onApplyCommand({ kind: "updateLandLayoutCell", label: "Place current land in layout", row: selectedCell.row, col: selectedCell.col, value: currentLandValue });
            }}
          >
            Place Current Land Here
          </button>
        </TutorialTip>
        <TutorialTip title="Clear Layout Cell" body={CLEAR_CELL_HELP} side="left">
          <button
            className="btn btn-secondary btn-xs context-action-button context-action-button-narrow"
            type="button"
            disabled={!selectedCell || detail.value === 0}
            onClick={() => {
              if (!selectedCell) return;
              onApplyCommand({ kind: "updateLandLayoutCell", label: "Clear land layout cell", row: selectedCell.row, col: selectedCell.col, value: 0 });
            }}
          >
            Clear Cell
          </button>
        </TutorialTip>
        <TutorialTip title="Open Linked Map" body={OPEN_LINKED_MAP_HELP} side="left">
          <button
            className="btn btn-secondary btn-xs context-action-button context-action-button-narrow"
            type="button"
            disabled={!detail.target}
            onClick={() => detail.target && onSelectMap(detail.target.id)}
          >
            Open Linked Map
          </button>
        </TutorialTip>
        <TutorialTip title="Neighbor Preview" body={LAYOUT_NEIGHBORS_HELP} side="left">
          <button className="btn btn-secondary btn-xs context-action-button context-action-button-narrow" type="button" onClick={() => onSetShowNeighbors(!showNeighbors)}>
            {showNeighbors ? "Hide Neighbors" : "Show Neighbors"}
          </button>
        </TutorialTip>
      </div>
      {showNeighbors && (
        <LandLayoutNeighborPreview
          cells={cells}
          landMaps={landMaps}
          selectedCell={selectedCell}
          atlasEntries={atlasEntries}
          tilesetByMapId={tilesetByMapId}
          icons={icons}
          onSetSelectedCell={onSetSelectedCell}
          onSelectMap={onSelectMap}
        />
      )}
    </aside>
  );
}

function LandLayoutNeighborPreview({
  cells,
  landMaps,
  selectedCell,
  atlasEntries,
  tilesetByMapId,
  icons,
  onSetSelectedCell,
  onSelectMap
}: {
  cells: number[];
  landMaps: MapEntity[];
  selectedCell: LandLayoutCellSelection;
  atlasEntries: EditorState["atlasEntries"];
  tilesetByMapId: Map<string, TilesetAsset>;
  icons: Record<number, IconEntry>;
  onSetSelectedCell: (cell: LandLayoutCellSelection) => void;
  onSelectMap: (id: string) => void;
}) {
  const neighborCells = neighborPreviewCells(selectedCell);
  return (
    <section className="land-layout-neighbor-panel">
      <div className="panel-header compact">
        <TutorialTip title="Neighbor Preview" body={LAYOUT_NEIGHBORS_HELP} side="below">
          <span>Neighbor Preview</span>
        </TutorialTip>
        <small>N / S / E / W</small>
      </div>
      <div className="land-layout-neighbor-grid">
        {neighborCells.map((neighbor, slotIndex) => {
          if (!neighbor) return <span key={`spacer:${slotIndex}`} className="land-layout-neighbor-cell spacer" />;
          const detail = layoutCellDetail(cells, landMaps, neighbor);
          const targetTileset = detail.target ? tilesetByMapId.get(detail.target.id) ?? null : null;
          const targetAtlas = targetTileset ? atlasEntries[targetTileset.id] ?? null : null;
          return (
            <button
              key={`${neighbor.row}:${neighbor.col}`}
              className={`land-layout-neighbor-cell${selectedCell?.row === neighbor.row && selectedCell.col === neighbor.col ? " selected" : ""}${detail.value !== 0 && !detail.target ? " missing" : ""}`}
              type="button"
              onClick={() => onSetSelectedCell(neighbor)}
              onDoubleClick={() => detail.target && onSelectMap(detail.target.id)}
              title={layoutCellTitle(detail.value, detail.target)}
            >
              <LandLayoutCellPreview map={detail.target} atlas={targetAtlas} icons={icons} value={detail.value} />
              <span>{detail.label}</span>
            </button>
          );
        })}
      </div>
      <p className="empty-copy compact">Double-click a filled neighbor to open its map.</p>
    </section>
  );
}

function LandLayoutCellPreview({
  map,
  atlas,
  icons,
  value
}: {
  map: MapEntity | null;
  atlas: EditorState["atlasEntries"][string] | null;
  icons: Record<number, IconEntry>;
  value: number;
}) {
  const previewUrl = useMemo(() => {
    if (!map) return null;
    return renderLandLayoutThumbnail(map, atlas, icons);
  }, [atlas, icons, map]);

  if (value === 0) {
    return <span className="land-layout-preview empty-preview">No travel</span>;
  }

  if (!map) {
    return <span className="land-layout-preview missing-preview">Missing {value === -1 ? 0 : value}</span>;
  }

  return (
    <span className="land-layout-preview" aria-hidden="true">
      {previewUrl ? <img src={previewUrl} alt="" /> : <span>{map.index}</span>}
    </span>
  );
}

const LAND_LAYOUT_THUMBNAIL_SIZE = 96;
const landLayoutThumbnailCache = new Map<string, string>();

function renderLandLayoutThumbnail(
  map: MapEntity,
  atlas: EditorState["atlasEntries"][string] | null,
  icons: Record<number, IconEntry>
) {
  if (typeof document === "undefined") return null;
  const key = `${map.id}:${map.width}x${map.height}:${atlas?.url ?? "no-atlas"}:${Object.keys(icons).length}:${checksumMapTiles(map.tiles)}`;
  const cached = landLayoutThumbnailCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = LAND_LAYOUT_THUMBNAIL_SIZE;
  canvas.height = LAND_LAYOUT_THUMBNAIL_SIZE;
  const context = canvas.getContext("2d");
  if (!context) return null;

  context.fillStyle = "#0b1117";
  context.fillRect(0, 0, LAND_LAYOUT_THUMBNAIL_SIZE, LAND_LAYOUT_THUMBNAIL_SIZE);

  const width = Math.max(1, map.width || 90);
  const height = Math.max(1, map.height || 90);
  const sourceTileSize = Math.max(4, Math.min(32, atlas?.asset.tileWidth ?? 16));
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = width * sourceTileSize;
  sourceCanvas.height = height * sourceTileSize;
  const sourceContext = sourceCanvas.getContext("2d");
  if (!sourceContext) return null;

  sourceContext.imageSmoothingEnabled = false;
  sourceContext.fillStyle = "#0b1117";
  sourceContext.fillRect(0, 0, sourceCanvas.width, sourceCanvas.height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const tile = tileValueAt(map, x, y);
      const dx = x * sourceTileSize;
      const dy = y * sourceTileSize;
      const drew = drawTileSprite(sourceContext, atlas, tile, dx, dy, sourceTileSize, sourceTileSize, icons);
      if (!drew) {
        sourceContext.fillStyle = tileColor(tile);
        sourceContext.fillRect(dx, dy, sourceTileSize, sourceTileSize);
      }
    }
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(sourceCanvas, 0, 0, LAND_LAYOUT_THUMBNAIL_SIZE, LAND_LAYOUT_THUMBNAIL_SIZE);

  const url = canvas.toDataURL("image/png");
  landLayoutThumbnailCache.set(key, url);
  return url;
}

function checksumMapTiles(tiles: number[]) {
  let hash = 2166136261;
  for (const tile of tiles) {
    hash = Math.imul(hash ^ (tile & 0xffff), 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function readStoredBoolean(key: string, fallback: boolean) {
  if (typeof localStorage === "undefined") return fallback;
  const stored = localStorage.getItem(key);
  if (stored === "1") return true;
  if (stored === "0") return false;
  return fallback;
}

export function storeBoolean(key: string, value: boolean) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(key, value ? "1" : "0");
}

function readStoredLandLayoutPreviewMode(): LandLayoutPreviewMode {
  if (typeof localStorage === "undefined") return "preview";
  const stored = localStorage.getItem("providence.landLayout.previewMode.v1");
  return stored === "compact" ? "compact" : "preview";
}

export function normalizeLayoutCells(cells: number[]) {
  const normalized = new Array(LAND_LAYOUT_ROWS * LAND_LAYOUT_COLS).fill(0);
  for (let index = 0; index < normalized.length; index += 1) {
    normalized[index] = Number.isFinite(cells[index]) ? Math.trunc(cells[index]) : 0;
  }
  return normalized;
}

export function layoutValueForMapIndex(index: number) {
  return index === 0 ? -1 : index;
}

export function mapForLayoutValue(value: number, landMaps: MapEntity[]) {
  if (value === 0) return null;
  const mapIndex = value === -1 ? 0 : value;
  return landMaps.find((map) => map.index === mapIndex) ?? null;
}

function layoutCellTitle(value: number, target: MapEntity | null) {
  if (value === 0) return "Blank cell: no automatic edge travel.";
  if (target) return `Opens ${target.name}.`;
  return `References missing land level ${value === -1 ? 0 : value}.`;
}

function layoutValueLabel(value: number) {
  if (value === 0) return "- (no edge travel)";
  if (value === -1) return "-1 (land level 0)";
  return String(value);
}

function layoutCellDetail(cells: number[], landMaps: MapEntity[], selectedCell: LandLayoutCellSelection) {
  const row = selectedCell?.row ?? 0;
  const col = selectedCell?.col ?? 0;
  const index = row * LAND_LAYOUT_COLS + col;
  const value = cells[index] ?? 0;
  const target = mapForLayoutValue(value, landMaps);
  return {
    row,
    col,
    index,
    value,
    target,
    label: `${row + 1},${col + 1}`,
    warnings: landLayoutCellWarnings(value, cells, landMaps)
  };
}

function neighborPreviewCells(selectedCell: LandLayoutCellSelection): Array<LandLayoutCellSelection> {
  if (!selectedCell) return [null, null, null, null, { row: 0, col: 0 }, null, null, null, null];
  const { row, col } = selectedCell;
  const inRange = (candidate: LandLayoutCellSelection) => {
    if (!candidate) return null;
    return candidate.row >= 0 && candidate.row < LAND_LAYOUT_ROWS && candidate.col >= 0 && candidate.col < LAND_LAYOUT_COLS ? candidate : null;
  };
  return [
    null,
    inRange({ row: row - 1, col }),
    null,
    inRange({ row, col: col - 1 }),
    selectedCell,
    inRange({ row, col: col + 1 }),
    null,
    inRange({ row: row + 1, col }),
    null
  ];
}

function landLayoutCellWarnings(value: number, cells: number[], landMaps: MapEntity[]) {
  const warnings: string[] = [];
  if (value === 0) return warnings;
  const knownValues = new Set(landMaps.map((map) => layoutValueForMapIndex(map.index)));
  if (!knownValues.has(value)) warnings.push(`Missing land level ${value === -1 ? 0 : value}.`);
  const count = cells.filter((cellValue) => cellValue === value).length;
  if (count > 1) warnings.push(`Land level ${value === -1 ? 0 : value} appears ${count} times.`);
  return warnings;
}

export function landLayoutStats(cells: number[], landMaps: MapEntity[], selectedMap?: MapEntity | null) {
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
  if (selectedMap?.levelType === "land" && !counts.has(layoutValueForMapIndex(selectedMap.index))) {
    warnings.push(`${selectedMap.name} is not placed in the layout grid.`);
  }
  return { warnings: [...new Set(warnings)] };
}
