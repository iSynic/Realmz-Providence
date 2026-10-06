import { createStoredZip } from "../browser/zip";
import {
  semanticMapRecordsForMap,
  semanticRandomLevelForMap,
  semanticTilesetForMap,
  semanticTriggersForMap
} from "../semanticGraph";
import type {
  AtlasEntry,
  IconEntry,
  MapEntity,
  MapPreviewFocalPoint,
  MapPreviewMode,
  MapViewOptions,
  Project,
  SelectedEntity,
  TilesetAsset
} from "../types";
import {
  drawBaseMap,
  drawCombatClearingOverlay,
  drawCoordinateLabels,
  drawMapRecords,
  drawMapVisibilityPreview,
  drawRandomRectangles,
  drawSecretTileOverlay,
  drawTriggers
} from "./drawMapCanvas";
import { MAP_CELLS } from "./geometry";
import { filterVisibleMapRecords, filterVisibleRandomLevel } from "../panels/maps/useMapCanvasVisibility";

export const MAP_EDITOR_BASE_PIXELS = 900;
export const MAP_EXPORT_JPEG_QUALITY = 0.7;

export type MapImageExportOptions = {
  project: Project;
  atlasEntries: Record<string, AtlasEntry>;
  icons: Record<number, IconEntry>;
  viewOptions: MapViewOptions;
  smoothTiles: boolean;
  selectedEntity: SelectedEntity | null;
  visibleRandomRectIds: string[];
  visibleMapRecordIds: number[];
  previewMode: MapPreviewMode;
  previewFocalPoint: MapPreviewFocalPoint;
};

export type ScenarioMapArchiveProgress = {
  completed: number;
  total: number;
  map: MapEntity;
};

export function nativeMapPixelSize(tileset: TilesetAsset | null) {
  const tileSize = Math.max(1, Math.round(tileset?.tileWidth ?? MAP_EDITOR_BASE_PIXELS / MAP_CELLS));
  return MAP_CELLS * tileSize;
}

export function currentMapPixelSize(zoom: number) {
  return Math.max(1, Math.round(MAP_EDITOR_BASE_PIXELS * zoom));
}

export function mapExportDimensions(mapPixelSize: number, showRealmzCoordinates: boolean) {
  const mapSize = Math.max(1, Math.round(mapPixelSize));
  const cell = mapSize / MAP_CELLS;
  const gutter = showRealmzCoordinates ? cell : 0;
  return {
    mapSize,
    cell,
    gutter,
    width: Math.ceil(mapSize + gutter * 2),
    height: Math.ceil(mapSize + gutter * 2)
  };
}

export async function renderMapJpeg(
  options: MapImageExportOptions,
  map: MapEntity,
  mapPixelSize: number
) {
  const canvas = document.createElement("canvas");
  const dimensions = mapExportDimensions(mapPixelSize, options.viewOptions.showRealmzCoordinates);
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("The browser could not create a map export canvas.");

  const tileset = semanticTilesetForMap(options.project, map);
  const atlas = tileset ? options.atlasEntries[tileset.id] ?? null : null;
  const triggers = options.viewOptions.showTriggers ? semanticTriggersForMap(options.project, map) : [];
  const randomLevel = filterVisibleRandomLevel(
    map,
    semanticRandomLevelForMap(options.project, map),
    options.viewOptions.showRandomRects,
    options.visibleRandomRectIds
  );
  const mapRecords = filterVisibleMapRecords(
    semanticMapRecordsForMap(options.project, map),
    options.viewOptions.showMapRecords,
    options.visibleMapRecordIds
  );

  ctx.clearRect(0, 0, dimensions.width, dimensions.height);
  ctx.save();
  ctx.translate(dimensions.gutter, dimensions.gutter);
  drawBaseMap(ctx, {
    map,
    atlas,
    icons: options.icons,
    smoothTiles: options.smoothTiles,
    viewOptions: options.viewOptions,
    size: dimensions.mapSize
  });
  ctx.restore();
  if (options.viewOptions.showRealmzCoordinates) {
    drawCoordinateLabels(ctx, dimensions.cell, dimensions.width, dimensions.gutter);
  }

  ctx.save();
  ctx.translate(dimensions.gutter, dimensions.gutter);
  if (randomLevel) drawRandomRectangles(ctx, map, randomLevel, options.selectedEntity, dimensions.cell);
  if (options.viewOptions.showSecretOverlays) drawSecretTileOverlay(ctx, map, dimensions.cell, options.icons, options.project.tileAttributes);
  if (options.viewOptions.showCombatClearingOverlays) drawCombatClearingOverlay(ctx, map, dimensions.cell);
  if (options.previewMode !== "off") {
    drawMapVisibilityPreview(
      ctx,
      map,
      tileset,
      options.project.tileAttributes,
      dimensions.cell,
      options.previewMode,
      options.previewFocalPoint
    );
  }
  drawTriggers(ctx, triggers, options.selectedEntity, dimensions.cell);
  if (mapRecords.length > 0) drawMapRecords(ctx, map, mapRecords, options.selectedEntity, dimensions.cell);
  ctx.restore();

  return encodeMapCanvasJpeg(canvas);
}

export async function createScenarioMapArchive(
  options: MapImageExportOptions,
  zoom: number,
  onProgress?: (progress: ScenarioMapArchiveProgress) => void
) {
  const maps = [...options.project.maps].sort(compareMaps);
  const entries: Array<{ path: string; bytes: Uint8Array }> = [];
  const mapPixelSize = currentMapPixelSize(zoom);

  for (let index = 0; index < maps.length; index += 1) {
    const map = maps[index];
    const jpeg = await renderMapJpeg(options, map, mapPixelSize);
    entries.push({ path: mapExportFileName(map), bytes: new Uint8Array(await jpeg.arrayBuffer()) });
    onProgress?.({ completed: index + 1, total: maps.length, map });
    await yieldToBrowser();
  }

  return new Blob([createStoredZip(entries)], { type: "application/zip" });
}

export function mapExportFileName(map: MapEntity) {
  const index = String(Math.max(0, map.index)).padStart(2, "0");
  return `${map.levelType}-${index}-${safeFileStem(map.name || `${map.levelType}-${map.index}`)}.jpg`;
}

export function scenarioMapArchiveFileName(project: Project, zoom: number) {
  const scale = Math.round(zoom * 100);
  return `${safeFileStem(project.scenario.name || "scenario")}-maps-${scale}pct.zip`;
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function encodeMapCanvasJpeg(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The browser could not encode the rendered map as JPEG."));
    }, "image/jpeg", MAP_EXPORT_JPEG_QUALITY);
  });
}

function compareMaps(left: MapEntity, right: MapEntity) {
  const family = left.levelType === right.levelType ? 0 : left.levelType === "land" ? -1 : 1;
  return family || left.index - right.index || left.name.localeCompare(right.name);
}

function safeFileStem(value: string) {
  const stem = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return stem || "map";
}

function yieldToBrowser() {
  return new Promise<void>((resolve) => window.setTimeout(resolve, 0));
}
