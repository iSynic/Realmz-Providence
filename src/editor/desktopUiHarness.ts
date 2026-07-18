import { invoke } from "@tauri-apps/api/core";
import { Dispatch } from "react";
import { tileAtlasRect } from "./components/TileSprite";
import { MAP_CELLS, tileValueAt } from "./map/geometry";
import { EditorAction } from "./store";
import { EditorTab, MapEntity, Project } from "./types";
import { selectEntityFromId, triggerEntityId } from "./utils";

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
  resourceProbes?: AssetResourceProbeRequest[];
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

type AssetResourceProbeRequest = {
  label: string;
  section: "project" | "realmz";
  kind: "picture" | "icon" | "sound" | "text" | "special-land-tile" | "all";
  resourceType?: string;
  expectedPreview?: "image" | "audio" | "text" | "any";
  searchByResourceId?: boolean;
  optional?: boolean;
};

type PrimaryWorkflowHarnessScript = {
  version: number;
  mode: "primary-workflow";
  name: string;
  sourceScenarioDir: string;
  projectName: string;
  projectDir: string;
  tabs?: EditorTab[];
};

type PrimaryWorkflowHarnessResult = {
  ok: boolean;
  mode: "primary-workflow";
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
  const script = await invoke<Partial<AssetPerformanceHarnessScript | PrimaryWorkflowHarnessScript | MapVisualHarnessScript>>("read_harness_script");
  if (script.mode === "map-visual") {
    return runMapVisualHarness({ dispatch, setProjectDir, onStatus, started, script });
  }
  if (script.mode === "primary-workflow") {
    return runPrimaryWorkflowHarness({ dispatch, setProjectDir, onStatus, started, script });
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

    const resourceProbes = script.resourceProbes?.length ? script.resourceProbes : defaultAssetResourceProbes();
    for (const request of resourceProbes) {
      const probe = await probeAssetResource(request);
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

async function runPrimaryWorkflowHarness({
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
  script: Partial<PrimaryWorkflowHarnessScript>;
}) {
  const result: PrimaryWorkflowHarnessResult = {
    ok: false,
    mode: "primary-workflow",
    name: script.name ?? "Primary workflow harness",
    projectDir: script.projectDir ?? "",
    sourceScenarioDir: script.sourceScenarioDir ?? "",
    timings: {},
    counts: {},
    probes: [],
    error: null
  };

  try {
    requirePrimaryWorkflowScript(script);
    onStatus?.(`Primary workflow harness: importing ${script.sourceScenarioDir}...`);
    const importStart = performance.now();
    const project = await invoke<Project>("import_scenario_into_project", {
      sourcePath: script.sourceScenarioDir,
      projectDir: script.projectDir,
      projectName: script.projectName
    });
    result.timings.importMs = elapsed(importStart);
    result.counts.maps = project.maps.length;
    result.counts.triggers = project.triggers.length;
    result.counts.messages = project.messages.length;
    result.counts.encounters =
      project.simpleEncounters.length +
      project.complexEncounters.length +
      project.thiefEncounters.length +
      project.timedEncounters.length;
    result.counts.battles = project.battles.length;
    result.counts.monsters = project.monsters.length;
    result.counts.treasures = project.treasures.length;
    result.counts.shops = project.shops.length;
    result.counts.assets =
      project.assets.length +
      (project.assetCatalog.icons?.length ?? 0) +
      (project.assetCatalog.pictures?.length ?? 0) +
      (project.assetCatalog.sounds?.length ?? 0) +
      (project.assetCatalog.tilesets?.length ?? 0);

    setProjectDir(script.projectDir);
    dispatch({ type: "setProject", project, selectedMapId: project.maps[0]?.id ?? null });
    dispatch({ type: "setActiveEditor", editor: "domain" });
    dispatch({ type: "setActiveDomain", domain: "maps" });
    await waitForPrimaryWorkflowTab("maps", 20_000);
    await settleFrames(3);

    const tabs = normalizePrimaryWorkflowTabs(script.tabs);
    for (const tab of tabs) {
      onStatus?.(`Primary workflow harness: opening ${tab}...`);
      const tabStart = performance.now();
      dispatch({ type: "setActiveEditor", editor: "domain" });
      dispatch({ type: "setTab", tab });
      try {
        await waitForPrimaryWorkflowTab(tab, 20_000);
        await settleFrames(tab === "maps" || tab === "combat" ? 6 : 3);
        result.probes.push({
          label: `Open ${tab}`,
          durationMs: elapsed(tabStart),
          ok: true,
          detail: primaryWorkflowTabDetail(tab)
        });
      } catch (error) {
        result.probes.push({
          label: `Open ${tab}`,
          durationMs: elapsed(tabStart),
          ok: false,
          detail: errorText(error)
        });
      }
    }
    await runPrimaryWorkflowRecordProbes({ project, dispatch, result, onStatus });

    result.timings.totalMs = elapsed(started);
    result.ok = result.probes.length > 0 && result.probes.every((probe) => probe.ok);
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

async function runPrimaryWorkflowRecordProbes({
  project,
  dispatch,
  result,
  onStatus
}: {
  project: Project;
  dispatch: Dispatch<EditorAction>;
  result: PrimaryWorkflowHarnessResult;
  onStatus?: (status: string) => void;
}) {
  const actionPoint = project.triggers.find((trigger) => trigger.source !== "Data ED3" && trigger.levelType) ?? null;
  if (actionPoint) {
    const entityId = triggerEntityId(actionPoint.levelType, actionPoint.levelIndex, actionPoint.recordIndex, actionPoint.source);
    await runPrimaryWorkflowProbe(result, "Open selected Action Point", async () => {
      onStatus?.("Primary workflow harness: opening selected Action Point...");
      dispatch({ type: "setActiveEditor", editor: "action-points" });
      dispatch({ type: "setTab", tab: "scripts" });
      dispatch({ type: "selectEntity", entity: selectEntityFromId(entityId) });
      await waitForElement(".scripts-workbench .script-record-header", 20_000);
      await settleFrames(3);
      return entityId;
    });
  } else {
    result.probes.push({ label: "Open selected Action Point", durationMs: 0, ok: true, detail: "skipped: no map Action Point records" });
  }

  const simpleEncounter = project.simpleEncounters[0] ?? null;
  if (simpleEncounter) {
    const entityId = `encounter:simple:${simpleEncounter.id}`;
    await runPrimaryWorkflowProbe(result, "Open selected Simple Encounter", async () => {
      onStatus?.("Primary workflow harness: opening selected Simple Encounter...");
      dispatch({ type: "setActiveEditor", editor: "simple" });
      dispatch({ type: "setTab", tab: "encounters" });
      dispatch({ type: "selectEntity", entity: selectEntityFromId(entityId) });
      await waitForElement(".simple-encounter-options-panel", 20_000);
      await settleFrames(3);
      return entityId;
    });
  } else {
    result.probes.push({ label: "Open selected Simple Encounter", durationMs: 0, ok: true, detail: "skipped: no Simple Encounter records" });
  }

  const complexEncounter = project.complexEncounters[0] ?? null;
  if (complexEncounter) {
    const entityId = `encounter:complex:${complexEncounter.id}`;
    await runPrimaryWorkflowProbe(result, "Open selected Complex Encounter", async () => {
      onStatus?.("Primary workflow harness: opening selected Complex Encounter...");
      dispatch({ type: "setActiveEditor", editor: "complex" });
      dispatch({ type: "setTab", tab: "encounters" });
      dispatch({ type: "selectEntity", entity: selectEntityFromId(entityId) });
      await waitForElement(".complex-encounter-authoring", 20_000);
      await settleFrames(3);
      return entityId;
    });
  } else {
    result.probes.push({ label: "Open selected Complex Encounter", durationMs: 0, ok: true, detail: "skipped: no Complex Encounter records" });
  }
}

async function runPrimaryWorkflowProbe(
  result: PrimaryWorkflowHarnessResult,
  label: string,
  action: () => Promise<string | null>
) {
  const probeStart = performance.now();
  try {
    const detail = await action();
    result.probes.push({ label, durationMs: elapsed(probeStart), ok: true, detail });
  } catch (error) {
    result.probes.push({ label, durationMs: elapsed(probeStart), ok: false, detail: errorText(error) });
  }
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
    dispatch({ type: "setMapViewFlag", flag: "showCombatClearingOverlays", value: false });
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

function requirePrimaryWorkflowScript(script: Partial<PrimaryWorkflowHarnessScript>): asserts script is PrimaryWorkflowHarnessScript {
  for (const key of ["sourceScenarioDir", "projectName", "projectDir"] as const) {
    if (!script[key] || typeof script[key] !== "string") {
      throw new Error(`Primary workflow harness script is missing ${key}.`);
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

const PRIMARY_WORKFLOW_TABS: EditorTab[] = ["maps", "scripts", "text", "encounters", "combat", "economy", "assets", "linter", "export"];

function normalizePrimaryWorkflowTabs(tabs: PrimaryWorkflowHarnessScript["tabs"]): EditorTab[] {
  if (!Array.isArray(tabs) || tabs.length === 0) return PRIMARY_WORKFLOW_TABS;
  return tabs.filter((tab): tab is EditorTab => PRIMARY_WORKFLOW_TABS.includes(tab as EditorTab));
}

function waitForPrimaryWorkflowTab(tab: EditorTab, timeoutMs: number) {
  return waitFor(() => primaryWorkflowTabReady(tab), timeoutMs, `Timed out waiting for ${tab} workbench.`);
}

function primaryWorkflowTabReady(tab: EditorTab) {
  if (tab === "maps") return Boolean(document.querySelector(".room-canvas-base"));
  if (tab === "scripts") return Boolean(document.querySelector(".scripts-workbench"));
  if (tab === "text") return Boolean(document.querySelector(".text-workbench"));
  if (tab === "scenario") return Boolean(document.querySelector(".scenario-workbench"));
  if (tab === "rules") return Boolean(document.querySelector(".rules-workbench"));
  if (tab === "encounters") return domainWorkbenchTitleIncludes("Encounters");
  if (tab === "combat") return Boolean(document.querySelector(".combat-workbench"));
  if (tab === "economy") return domainWorkbenchTitleIncludes("Economy");
  if (tab === "assets") return Boolean(document.querySelector(".asset-workbench"));
  if (tab === "records") return domainWorkbenchTitleIncludes("Records");
  if (tab === "linter") return Boolean(document.querySelector(".lint-workbench"));
  if (tab === "export") return Boolean(document.querySelector(".export-workbench"));
  return false;
}

function domainWorkbenchTitleIncludes(value: string) {
  const title = document.querySelector(".domain-workbench h1")?.textContent ?? "";
  return title.toLowerCase().includes(value.toLowerCase());
}

function primaryWorkflowTabDetail(tab: EditorTab) {
  if (tab === "maps") return document.querySelector(".room-canvas-base") ? "map canvas mounted" : null;
  if (tab === "scripts") return textContent(".scripts-workbench .script-editor-tabs") ?? "scripts mounted";
  if (tab === "text") return textContent(".text-workbench-header h1") ?? "text mounted";
  if (tab === "encounters" || tab === "economy" || tab === "records") return textContent(".domain-workbench h1") ?? `${tab} mounted`;
  if (tab === "combat") return textContent(".combat-workbench h1") ?? "combat mounted";
  if (tab === "assets") return textContent(".asset-workbench-header h1") ?? "assets mounted";
  if (tab === "linter") return textContent(".lint-workbench .panel-header") ?? "linter mounted";
  if (tab === "export") return textContent(".export-workbench .panel-header") ?? "export mounted";
  return `${tab} mounted`;
}

function textContent(selector: string) {
  const value = document.querySelector(selector)?.textContent?.trim() ?? "";
  return value || null;
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

function defaultAssetResourceProbes(): AssetResourceProbeRequest[] {
  return [
    { label: "Scenario picture selected preview", section: "project", kind: "picture", resourceType: "PICT", expectedPreview: "image", searchByResourceId: true },
    { label: "Scenario icon selected preview", section: "project", kind: "icon", resourceType: "cicn", expectedPreview: "image", searchByResourceId: true },
    { label: "Scenario sound selected preview", section: "project", kind: "sound", resourceType: "snd", expectedPreview: "audio", searchByResourceId: true },
    { label: "Realmz Gallery icon selected preview", section: "realmz", kind: "icon", resourceType: "cicn", expectedPreview: "image", searchByResourceId: true },
    { label: "Realmz Gallery sound selected preview", section: "realmz", kind: "sound", resourceType: "snd", expectedPreview: "audio", searchByResourceId: true }
  ];
}

async function probeAssetResource(request: AssetResourceProbeRequest) {
  const started = performance.now();
  try {
    await selectAssetSection(request.section);
    await setAssetKindFilter(request.kind);
    await setAssetSearch("");
    const initialCard = await waitForAssetCard(request, 10_000);
    const resourceId = initialCard.dataset.resourceId ?? "";
    if (request.searchByResourceId && resourceId) {
      await setAssetSearch(resourceId);
    }
    const card = await waitForAssetCard(request, 10_000);
    const label = card.querySelector("strong")?.textContent?.trim() || request.label;
    const resourceType = card.dataset.resourceType?.trim() || "";
    const resolvedResourceId = card.dataset.resourceId ?? "";
    card.scrollIntoView({ block: "center", inline: "nearest" });
    await settleFrames(2);
    card.click();
    await waitForElement(".asset-selection-inspector .resource-detail-view", 10_000);
    await waitFor(() => assetPreviewReady(".asset-selection-inspector", request.expectedPreview ?? "any"), 10_000, `Timed out waiting for ${request.label} inspector preview.`);
    const detailButton = inspectorOpenDetailButton();
    if (!detailButton) throw new Error("No inspector Open Detail button found.");
    detailButton.click();
    await waitForElement(".asset-resource-preview-window", 10_000);
    await waitFor(() => assetPreviewReady(".asset-resource-preview-window", request.expectedPreview ?? "any"), 10_000, `Timed out waiting for ${request.label} detail preview.`);
    await settleFrames(2);
    return {
      label: request.label,
      durationMs: elapsed(started),
      ok: true,
      detail: `${label} | ${resourceType} ${resolvedResourceId} | ${request.section}`
    };
  } catch (error) {
    const missing = errorText(error);
    return {
      label: request.label,
      durationMs: elapsed(started),
      ok: request.optional === true,
      detail: request.optional ? `Skipped optional probe: ${missing}` : missing
    };
  }
}

async function selectAssetSection(section: AssetResourceProbeRequest["section"]) {
  const label = section === "realmz" ? "Realmz Gallery" : "Scenario Assets";
  const tab = [...document.querySelectorAll<HTMLButtonElement>(".asset-section-tabs button")]
    .find((button) => button.textContent?.includes(label));
  if (!tab) throw new Error(`No Assets section tab found for ${label}.`);
  if (tab.getAttribute("aria-selected") !== "true") {
    tab.click();
    await waitFor(() => tab.getAttribute("aria-selected") === "true", 5_000, `Timed out switching to ${label}.`);
  }
  await settleFrames(2);
}

async function setAssetKindFilter(kind: AssetResourceProbeRequest["kind"]) {
  const select = document.querySelector<HTMLSelectElement>('select[aria-label="Asset kind filter"]');
  if (!select) throw new Error("No asset kind filter found.");
  if (select.value !== kind) {
    select.value = kind;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await waitFor(() => select.value === kind, 5_000, `Timed out setting asset kind filter to ${kind}.`);
  }
  await settleFrames(2);
}

async function setAssetSearch(query: string) {
  const input = document.querySelector<HTMLInputElement>(".asset-filter-row input");
  if (!input) throw new Error("No asset search input found.");
  if (input.value !== query) {
    input.focus();
    input.value = query;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }
  await settleFrames(2);
}

async function waitForAssetCard(request: AssetResourceProbeRequest, timeoutMs: number) {
  const card = await waitForValue(
    () => findAssetCard(request),
    timeoutMs,
    `Timed out waiting for ${request.label} card.`
  );
  return card;
}

function findAssetCard(request: AssetResourceProbeRequest) {
  const root = request.section === "realmz" ? ".library-asset-strip" : ".asset-gallery";
  const wantedType = request.resourceType?.trim().toLowerCase() ?? "";
  return [...document.querySelectorAll<HTMLElement>(`${root} .managed-asset-card`)]
    .find((card) => {
      if (request.kind !== "all" && card.dataset.assetKind !== request.kind) return false;
      if (wantedType && (card.dataset.resourceType ?? "").trim().toLowerCase() !== wantedType) return false;
      return true;
    }) ?? null;
}

function assetPreviewReady(rootSelector: string, expected: NonNullable<AssetResourceProbeRequest["expectedPreview"]>) {
  const root = document.querySelector(rootSelector);
  if (!root) return false;
  if (expected === "audio") return Boolean(root.querySelector("audio[src]"));
  if (expected === "text") return Boolean(root.querySelector(".resource-detail-text, .asset-text-preview-card"));
  if (expected === "image") {
    const image = root.querySelector<HTMLImageElement>(".asset-image-preview, .resource-detail-media img");
    return Boolean(image?.complete && image.naturalWidth > 0);
  }
  return Boolean(root.querySelector("audio[src], .asset-image-preview, .resource-detail-media img, .resource-detail-text, .asset-text-preview-card, .resource-fact-grid"));
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

async function waitForValue<T>(predicate: () => T | null | undefined, timeoutMs: number, message: string) {
  const started = performance.now();
  while (performance.now() - started < timeoutMs) {
    const value = predicate();
    if (value) return value;
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
