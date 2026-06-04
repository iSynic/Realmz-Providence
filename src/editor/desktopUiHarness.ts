import { invoke } from "@tauri-apps/api/core";
import { Dispatch } from "react";
import { EditorAction } from "./store";
import { Project } from "./types";

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

  const script = await invoke<Partial<AssetPerformanceHarnessScript>>("read_harness_script");
  if (script.mode !== "asset-performance") return false;

  const started = performance.now();
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

function requireAssetPerformanceScript(script: Partial<AssetPerformanceHarnessScript>): asserts script is AssetPerformanceHarnessScript {
  for (const key of ["sourceScenarioDir", "projectName", "projectDir"] as const) {
    if (!script[key] || typeof script[key] !== "string") {
      throw new Error(`Asset performance harness script is missing ${key}.`);
    }
  }
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
