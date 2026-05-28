import { useEffect, useMemo, useState } from "react";
import { EditorState } from "../../store";
import { IconEntry, MapEntity, Project, ProjectCommand, TilesetAsset } from "../../types";
import { tileValueAt } from "../../map/geometry";
import { InfoGrid } from "../InfoGrid";
import { drawTileSprite, tileColor } from "../TileSprite";

export type LandLayoutCellSelection = { row: number; col: number } | null;
const LAND_LAYOUT_ROWS = 8;
const LAND_LAYOUT_COLS = 16;

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
  const [previewMode, setPreviewMode] = useState<"compact" | "preview">(() => readStoredLandLayoutPreviewMode());
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
        <button className="btn btn-primary btn-sm" type="button" onClick={() => onApplyCommand({ kind: "createLandLayout", label: "Create land layout" })}>
          Create Layout Table
        </button>
      </div>
    );
  }
  return (
    <div className="land-layout-editor">
      <p className="empty-copy compact">
        Arrange outdoor levels in the grid. Realmz matches the party's current outdoor level in this table, then uses the neighboring cell when the party walks off a map edge.
      </p>
      <div className="land-layout-toolbar">
        <button className="btn btn-secondary btn-xs" type="button" onClick={() => onApplyCommand({ kind: "clearLandLayout", label: "Clear land layout" })}>
          Clear Layout
        </button>
        <div className="segmented-control compact" role="group" aria-label="Land layout display mode">
          <button className={previewMode === "preview" ? "active" : ""} type="button" onClick={() => setPreviewMode("preview")}>Preview</button>
          <button className={previewMode === "compact" ? "active" : ""} type="button" onClick={() => setPreviewMode("compact")}>Compact</button>
        </div>
        <button className={`btn btn-secondary btn-xs${showNeighbors ? " active" : ""}`} type="button" onClick={() => setShowNeighbors(!showNeighbors)}>
          {showNeighbors ? "Hide Neighbors" : "Show Neighbors"}
        </button>
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
                onSelectMap={onSelectMap}
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
        <span><b>-</b> No edge travel</span>
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
  onSelectMap,
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
  onSelectMap: (id: string) => void;
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
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onSelectMap(target.id);
          }}
          aria-label={`Open ${target.name}`}
        >
          Open
        </button>
      )}
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
        <span>Selected Cell</span>
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
        <button
          className="btn btn-primary btn-xs context-action-button"
          type="button"
          disabled={!selectedCell || currentLandValue == null}
          onClick={() => {
            if (!selectedCell || currentLandValue == null) return;
            onApplyCommand({ kind: "updateLandLayoutCell", label: "Place current land in layout", row: selectedCell.row, col: selectedCell.col, value: currentLandValue });
          }}
        >
          Place Current Land Here
        </button>
        <button
          className="btn btn-secondary btn-xs context-action-button"
          type="button"
          disabled={!selectedCell || detail.value === 0}
          onClick={() => {
            if (!selectedCell) return;
            onApplyCommand({ kind: "updateLandLayoutCell", label: "Clear land layout cell", row: selectedCell.row, col: selectedCell.col, value: 0 });
          }}
        >
          Clear Cell
        </button>
        <button
          className="btn btn-secondary btn-xs context-action-button"
          type="button"
          disabled={!detail.target}
          onClick={() => detail.target && onSelectMap(detail.target.id)}
        >
          Open Linked Map
        </button>
        <button className="btn btn-secondary btn-xs context-action-button" type="button" onClick={() => onSetShowNeighbors(!showNeighbors)}>
          {showNeighbors ? "Hide Neighbors" : "Show Neighbors"}
        </button>
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
        <span>Neighbor Preview</span>
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

  const width = Math.max(1, map.width || 90);
  const height = Math.max(1, map.height || 90);
  const cellWidth = LAND_LAYOUT_THUMBNAIL_SIZE / width;
  const cellHeight = LAND_LAYOUT_THUMBNAIL_SIZE / height;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "low";
  context.fillStyle = "#0b1117";
  context.fillRect(0, 0, LAND_LAYOUT_THUMBNAIL_SIZE, LAND_LAYOUT_THUMBNAIL_SIZE);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const tile = tileValueAt(map, x, y);
      const dx = Math.floor(x * cellWidth);
      const dy = Math.floor(y * cellHeight);
      const dw = Math.max(1, Math.ceil((x + 1) * cellWidth) - dx);
      const dh = Math.max(1, Math.ceil((y + 1) * cellHeight) - dy);
      const drew = drawTileSprite(context, atlas, tile, dx, dy, dw, dh, icons);
      if (!drew) {
        context.fillStyle = tileColor(tile);
        context.fillRect(dx, dy, dw, dh);
      }
    }
  }

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

function readStoredLandLayoutPreviewMode(): "compact" | "preview" {
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
