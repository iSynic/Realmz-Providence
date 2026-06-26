import { invoke } from "@tauri-apps/api/core";
import { Dispatch } from "react";
import { tileAtlasRect } from "./components/TileSprite";
import { MAP_CELLS, tileValueAt } from "./map/geometry";
import { EditorAction } from "./store";
import { MapEntity, Project } from "./types";

type ProvidenceHarnessConfig = {
  enabled: boolean;
  scriptPath: string | null;
  resultPath: string | null;
  batchPath: string | null;
};

type AssetPerformanceHarnessScript = {
  version: number;
  mode: "asset-performance";
  name: string;
  sourceScenarioDir: string;
  projectName: string;
  projectDir: string;
  detailClicks?: number;
};

type AssetPerformanceHarnessResult = {
  ok: boolean;
  mode: "asset-performance";
  name: string;
  projectDir: string;
  sourceScenarioDir: string;
  timings: Record<string, number>;
  counts: Record<string, number>;
  probes: Array<{ label: string; durationMs: number; ok: boolean; detail?: string | null }>;
  error: string | null;
};

type MapVisualHarnessScript = {
  version: number;
  mode: "map-visual";
  name: string;
  sourceScenarioDir?: string;
  projectName?: string;
  projectDir?: string;
  openProjectDir?: string;
  mapId?: string;
  mapName?: string;
  zoom?: number;
  cropCells?: { left: number; top: number; width: number; height: number };
  sampleCells?: Array<{ x: number; y: number }>;
};

type MapVisualHarnessResult = {
  ok: boolean;
  mode: "map-visual";
  name: string;
  projectDir: string;
  sourceScenarioDir: string;
  projectSourcePath: string | null;
  openedExistingProject: boolean;
  selectedMapId: string | null;
  selectedMapName: string | null;
  selectedTilesetId: string | null;
  timings: Record<string, number>;
  counts: Record<string, number>;
  canvas: {
    width: number;
    height: number;
    cropCells: MapVisualHarnessScript["cropCells"] | null;
    cropDataUrl: string | null;
  };
  samples: Array<{
    x: number;
    y: number;
    tile: number | null;
    atlasColumn: number | null;
    atlasRow: number | null;
    pixelHash: string | null;
    centerRgba: [number, number, number, number] | null;
  }>;
  error: string | null;
};

export async function runDesktopUiHarness({
  dispatch,
  setProjectDir,
  onStatus
}: {
  dispatch: Dispatch<EditorAction>;
  setProjectDir: (value: string) => void;
  onStatus?: (status: string) => void;
}) {
  let config: ProvidenceHarnessConfig;
  try {
    config = await invoke<ProvidenceHarnessConfig>("get_harness_config");
  } catch {
    return false;
  }
  if (config.batchPath || !config.scriptPath || !config.resultPath) return false;

  const started = performance.now();
  const script = await invoke<Partial<AssetPerformanceHarnessScript | MapVisualHarnessScript>>("read_harness_script");
  if (script.mode === "map-visual") {
    return runMapVisualHarness({ dispatch, setProjectDir, onStatus, started, script });
  }
  if (script.mode !== "asset-performance") return false;

  const result: AssetPerformanceHarnessResult = {
    ok: false,
    mode: "asset-performance",
    name: script.name ?? "Asset performance harness",
    projectDir: script.projectDir ?? "",
    sourceScenarioDir: script.sourceScenarioDir ?? "",
    timings: {},
    counts: {},
    probes: [],
    error: null
  };

  try {
    requireAssetPerformanceScript(script);
    onStatus?.(`UI harness: importing ${script.sourceScenarioDir}...`);
    const importStart = performance.now();
    const project = await invoke<Project>("import_scenario_into_project", {
      sourcePath: script.sourceScenarioDir,
      projectDir: script.projectDir,
      projectName: script.projectName
    });
    result.timings.importMs = elapsed(importStart);
    result.counts.maps = project.maps.length;
    result.counts.icons = project.assetCatalog.icons?.length ?? 0;
    result.counts.pictures = project.assetCatalog.pictures?.length ?? 0;
    result.counts.sounds = project.assetCatalog.sounds?.length ?? 0;
    result.counts.tilesets = project.assetCatalog.tilesets?.length ?? 0;
    result.counts.projectAssets = project.assets.length;

    onStatus?.("UI harness: opening Assets...");
    const renderStart = performance.now();
    setProjectDir(script.projectDir);
    dispatch({ type: "setProject", project, selectedMapId: project.maps[0]?.id ?? null });
    dispatch({ type: "setActiveEditor", editor: "domain" });
    dispatch({ type: "setTab", tab: "assets" });
    await waitForElement(".asset-workbench", 20_000);
    await settleFrames(3);
    result.timings.assetsOpenMs = elapsed(renderStart);
    captureAssetCounts(result);

    const clicks = Math.max(0, Math.min(10, script.detailClicks ?? 3));
    for (let index = 0; index < clicks; index += 1) {
      const probe = await clickAssetDetail(index);
      result.probes.push(probe);
      await closeAssetDetail();
    }

    result.timings.totalMs = elapsed(started);
    result.ok = result.probes.every((probe) => probe.ok);
  } catch (error) {
    result.error = errorText(error);
  }

  try {
    await invoke("write_harness_result", { result });
  } finally {
    window.setTimeout(() => {
      void invoke("harness_exit", { code: result.ok ? 0 : 1 });
    }, 250);
  }
  return true;
}

async function runMapVisualHarness({
  dispatch,
  setProjectDir,
  onStatus,
  started,
  script
}: {
  dispatch: Dispatch<EditorAction>;
  setProjectDir: (value: string) => void;
  onStatus?: (status: string) => void;
  started: number;
  script: Partial<MapVisualHarnessScript>;
}) {
  const result: MapVisualHarnessResult = {
    ok: false,
    mode: "map-visual",
    name: script.name ?? "Map visual harness",
    projectDir: script.openProjectDir ?? script.projectDir ?? "",
    sourceScenarioDir: script.sourceScenarioDir ?? "",
    projectSourcePath: null,
    openedExistingProject: Boolean(script.openProjectDir),
    selectedMapId: null,
    selectedMapName: null,
    selectedTilesetId: null,
    timings: {},
    counts: {},
    canvas: {
      width: 0,
      height: 0,
      cropCells: script.cropCells ?? null,
      cropDataUrl: null
    },
    samples: [],
    error: null
  };

  try {
    requireMapVisualScript(script);
    const harnessProjectDir = (script.openProjectDir ?? script.projectDir) as string;
    onStatus?.(
      script.openProjectDir
        ? `Map visual harness: opening ${script.openProjectDir}...`
        : `Map visual harness: importing ${script.sourceScenarioDir}...`
    );
    const importStart = performance.now();
    const project = script.openProjectDir
      ? await invoke<Project>("open_project", { projectDir: script.openProjectDir })
      : await invoke<Project>("import_scenario_into_project", {
          sourcePath: script.sourceScenarioDir as string,
          projectDir: script.projectDir as string,
          projectName: script.projectName as string
        });
    result.timings.importMs = elapsed(importStart);
    result.projectDir = harnessProjectDir;
    result.sourceScenarioDir = script.sourceScenarioDir ?? project.source.sourcePath ?? "";
    result.projectSourcePath = project.source.sourcePath || null;
    result.counts.maps = project.maps.length;
    result.counts.tilesets = project.assetCatalog.tilesets?.length ?? 0;
    result.counts.icons = project.assetCatalog.icons?.length ?? 0;

    const selectedMap = selectHarnessMap(project, script);
    if (!selectedMap) throw new Error(`No map matched ${script.mapId ?? script.mapName ?? "first map"}.`);
    result.selectedMapId = selectedMap.id;
    result.selectedMapName = selectedMap.name;
    result.selectedTilesetId = selectedMap.render.tilesetId ?? null;

    const tileset = project.assetCatalog.tilesets.find((asset) => asset.id === selectedMap.render.tilesetId) ?? null;
    result.samples = collectMapSamples(selectedMap, tileset, script);

    onStatus?.(`Map visual harness: rendering ${selectedMap.name}...`);
    const renderStart = performance.now();
    setProjectDir(harnessProjectDir);
    dispatch({ type: "setProject", project, selectedMapId: selectedMap.id });
    dispatch({ type: "setActiveEditor", editor: "domain" });
    dispatch({ type: "setTab", tab: "maps" });
    dispatch({ type: "setSelectedMap", id: selectedMap.id });
    dispatch({ type: "setTool", tool: "select" });
    dispatch({ type: "setZoom", zoom: script.zoom ?? 1 });
    dispatch({ type: "setMapViewFlag", flag: "showRealTiles", value: true });
    dispatch({ type: "setMapViewFlag", flag: "showRealmzCoordinates", value: false });
    dispatch({ type: "setMapViewFlag", flag: "showSecretOverlays", value: false });
    dispatch({ type: "setShowTriggers", value: false });
    dispatch({ type: "setShowRandomRects", value: false });
    dispatch({ type: "setShowMapRecords", value: false });
    await waitForElement(".room-canvas-base", 20_000);
    await waitForMapCanvasRender(20_000);
    const canvas = document.querySelector<HTMLCanvasElement>(".room-canvas-base");
    if (!canvas) throw new Error("No map base canvas found after render.");
    await waitForMapIconOverlaySamples(canvas, result.samples, 20_000);
    result.timings.mapRenderMs = elapsed(renderStart);

    result.canvas.width = canvas.width;
    result.canvas.height = canvas.height;
    result.canvas.cropDataUrl = cropMapCells(canvas, script.cropCells ?? defaultCropCells(script)) ?? canvas.toDataURL("image/png");
    result.samples = addRenderedSampleData(canvas, result.samples);
    result.timings.totalMs = elapsed(started);
    result.ok = true;
  } catch (error) {
    result.error = errorText(error);
  }

  try {
    await invoke("write_harness_result", { result });
  } finally {
    window.setTimeout(() => {
      void invoke("harness_exit", { code: result.ok ? 0 : 1 });
    }, 250);
  }
  return true;
}

function requireAssetPerformanceScript(script: Partial<AssetPerformanceHarnessScript>): asserts script is AssetPerformanceHarnessScript {
  for (const key of ["sourceScenarioDir", "projectName", "projectDir"] as const) {
    if (!script[key] || typeof script[key] !== "string") {
      throw new Error(`Asset performance harness script is missing ${key}.`);
    }
  }
}

function requireMapVisualScript(script: Partial<MapVisualHarnessScript>): asserts script is MapVisualHarnessScript {
  if (script.openProjectDir) {
    if (typeof script.openProjectDir !== "string") {
      throw new Error("Map visual harness script has an invalid openProjectDir.");
    }
    return;
  }
  for (const key of ["sourceScenarioDir", "projectName", "projectDir"] as const) {
    if (!script[key] || typeof script[key] !== "string") {
      throw new Error(`Map visual harness script is missing ${key}.`);
    }
  }
}

function selectHarnessMap(project: Project, script: Partial<MapVisualHarnessScript>) {
  if (script.mapId) {
    const byId = project.maps.find((map) => map.id === script.mapId);
    if (byId) return byId;
  }
  if (script.mapName) {
    const expected = script.mapName.toLowerCase();
    const byName = project.maps.find((map) => map.name.toLowerCase().includes(expected));
    if (byName) return byName;
  }
  return project.maps[0] ?? null;
}

function collectMapSamples(
  map: MapEntity,
  tileset: Project["assetCatalog"]["tilesets"][number] | null,
  script: Partial<MapVisualHarnessScript>
) {
  const cells = script.sampleCells ?? sampleCellsFromCrop(script.cropCells);
  return cells.map(({ x, y }) => {
    const tile = tileValueAtHarnessCell(map, x, y);
    const rect = tileset && tile != null ? tileAtlasRect(tileset, tile) : null;
    return {
      x,
      y,
      tile,
      atlasColumn: rect?.column ?? null,
      atlasRow: rect?.row ?? null,
      pixelHash: null,
      centerRgba: null
    };
  });
}

function sampleCellsFromCrop(crop: MapVisualHarnessScript["cropCells"]) {
  if (!crop) return [];
  const cells: Array<{ x: number; y: number }> = [];
  const maxX = Math.min(MAP_CELLS, crop.left + crop.width);
  const maxY = Math.min(MAP_CELLS, crop.top + crop.height);
  for (let y = Math.max(0, crop.top); y < maxY; y += 1) {
    for (let x = Math.max(0, crop.left); x < maxX; x += 1) {
      cells.push({ x, y });
    }
  }
  return cells;
}

function tileValueAtHarnessCell(map: MapEntity, x: number, y: number) {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return null;
  return tileValueAt(map, x, y);
}

function defaultCropCells(script: Partial<MapVisualHarnessScript>) {
  if (script.sampleCells && script.sampleCells.length > 0) {
    const xs = script.sampleCells.map((cell) => cell.x);
    const ys = script.sampleCells.map((cell) => cell.y);
    const left = Math.max(0, Math.min(...xs) - 1);
    const top = Math.max(0, Math.min(...ys) - 1);
    const right = Math.min(MAP_CELLS - 1, Math.max(...xs) + 1);
    const bottom = Math.min(MAP_CELLS - 1, Math.max(...ys) + 1);
    return { left, top, width: right - left + 1, height: bottom - top + 1 };
  }
  return { left: 0, top: 0, width: MAP_CELLS, height: MAP_CELLS };
}

function cropMapCells(canvas: HTMLCanvasElement, crop: MapVisualHarnessScript["cropCells"] | null | undefined) {
  if (!crop) return null;
  const cell = canvas.width / MAP_CELLS;
  const sx = Math.max(0, Math.floor(crop.left * cell));
  const sy = Math.max(0, Math.floor(crop.top * cell));
  const sw = Math.min(canvas.width - sx, Math.ceil(crop.width * cell));
  const sh = Math.min(canvas.height - sy, Math.ceil(crop.height * cell));
  if (sw <= 0 || sh <= 0) return null;
  const output = document.createElement("canvas");
  output.width = sw;
  output.height = sh;
  const context = output.getContext("2d");
  if (!context) return null;
  context.imageSmoothingEnabled = false;
  context.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
  return output.toDataURL("image/png");
}

function addRenderedSampleData(
  canvas: HTMLCanvasElement,
  samples: MapVisualHarnessResult["samples"]
): MapVisualHarnessResult["samples"] {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return samples;
  const cell = canvas.width / MAP_CELLS;
  return samples.map((sample) => {
    const sx = Math.max(0, Math.floor(sample.x * cell));
    const sy = Math.max(0, Math.floor(sample.y * cell));
    const sw = Math.max(1, Math.min(canvas.width - sx, Math.ceil(cell)));
    const sh = Math.max(1, Math.min(canvas.height - sy, Math.ceil(cell)));
    if (sx >= canvas.width || sy >= canvas.height || sw <= 0 || sh <= 0) return sample;
    const image = context.getImageData(sx, sy, sw, sh);
    const center = context.getImageData(
      Math.min(canvas.width - 1, Math.floor(sx + sw / 2)),
      Math.min(canvas.height - 1, Math.floor(sy + sh / 2)),
      1,
      1
    ).data;
    return {
      ...sample,
      pixelHash: hashImageData(image.data),
      centerRgba: [center[0], center[1], center[2], center[3]]
    };
  });
}

function hashImageData(data: Uint8ClampedArray) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < data.length; index += 1) {
    hash ^= data[index];
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

async function waitForMapCanvasRender(timeoutMs: number) {
  await waitFor(asyncCanvasHasPixels, timeoutMs, "Timed out waiting for map canvas pixels.");
  await settleFrames(8);
  await waitFor(asyncCanvasHasPixels, timeoutMs, "Timed out waiting for final map canvas pixels.");
}

async function waitForMapIconOverlaySamples(
  canvas: HTMLCanvasElement,
  samples: MapVisualHarnessResult["samples"],
  timeoutMs: number
) {
  const overlaySamples = samples.filter((sample) => typeof sample.tile === "number" && sample.tile > 200);
  if (overlaySamples.length < 2) {
    await settleFrames(8);
    return;
  }
  await waitFor(() => {
    const rendered = addRenderedSampleData(canvas, overlaySamples);
    const hashes = new Set(rendered.map((sample) => sample.pixelHash).filter(Boolean));
    return hashes.size > 1;
  }, timeoutMs, "Timed out waiting for map icon overlay samples to render distinctly.");
  await settleFrames(4);
}

function asyncCanvasHasPixels() {
  const canvas = document.querySelector<HTMLCanvasElement>(".room-canvas-base");
  if (!canvas || canvas.width <= 0 || canvas.height <= 0) return false;
  const context = canvas.getContext("2d");
  if (!context) return false;
  const sample = context.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data;
  return sample[3] !== 0;
}

function captureAssetCounts(result: AssetPerformanceHarnessResult) {
  result.counts.assetCards = document.querySelectorAll(".managed-asset-card").length;
  result.counts.selectedInspector = document.querySelectorAll(".asset-selection-inspector").length;
  result.counts.previewImages = document.querySelectorAll(".asset-image-preview").length;
  result.counts.previewPlaceholders = document.querySelectorAll(".asset-preview-placeholder").length;
  result.counts.openDetailButtons = openDetailButtons().length;
}

async function clickAssetDetail(index: number) {
  const cards = [...document.querySelectorAll<HTMLElement>(".managed-asset-card")];
  const card = cards[index] ?? cards[0] ?? null;
  if (!card) return { label: `Open asset detail ${index + 1}`, durationMs: 0, ok: false, detail: "No asset card found." };
  card.scrollIntoView({ block: "center", inline: "nearest" });
  await settleFrames(2);
  const started = performance.now();
  card.click();
  try {
    await waitForElement(".asset-selection-inspector .resource-detail-view", 10_000);
    const detailButton = inspectorOpenDetailButton();
    if (!detailButton) throw new Error("No inspector Open Detail button found.");
    detailButton.click();
    await waitForElement(".asset-resource-preview-window", 10_000);
    await settleFrames(2);
    return {
      label: `Open asset detail ${index + 1}`,
      durationMs: elapsed(started),
      ok: true,
      detail: card.querySelector("strong")?.textContent ?? null
    };
  } catch (error) {
    return {
      label: `Open asset detail ${index + 1}`,
      durationMs: elapsed(started),
      ok: false,
      detail: errorText(error)
    };
  }
}

async function closeAssetDetail() {
  const close = document.querySelector<HTMLButtonElement>(".asset-resource-preview-window button[aria-label='Close resource preview']");
  close?.click();
  await settleFrames(2);
}

function openDetailButtons() {
  return [...document.querySelectorAll<HTMLButtonElement>(".managed-asset-card button")]
    .filter((button) => button.textContent?.trim() === "Open Detail");
}

function inspectorOpenDetailButton() {
  return [...document.querySelectorAll<HTMLButtonElement>(".asset-selection-inspector button")]
    .find((button) => button.textContent?.trim() === "Open Detail") ?? null;
}

function waitForElement(selector: string, timeoutMs: number) {
  return waitFor(() => Boolean(document.querySelector(selector)), timeoutMs, `Timed out waiting for ${selector}.`);
}

async function waitFor(predicate: () => boolean, timeoutMs: number, message: string) {
  const started = performance.now();
  while (performance.now() - started < timeoutMs) {
    if (predicate()) return;
    await settleFrames(1);
  }
  throw new Error(message);
}

function settleFrames(count: number) {
  return new Promise<void>((resolve) => {
    const step = (remaining: number) => {
      if (remaining <= 0) {
        window.setTimeout(resolve, 0);
        return;
      }
      requestAnimationFrame(() => step(remaining - 1));
    };
    step(count);
  });
}

function elapsed(start: number) {
  return Math.round(performance.now() - start);
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
