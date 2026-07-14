import { invoke } from "@tauri-apps/api/core";
import { Dispatch, useEffect, useRef } from "react";
import { browserReferenceIconUrl, browserTilesetAtlasUrl } from "../browser/atlasPaths";
import {
  createBrowserWorkspace,
  loadBrowserBundledLibraryAssetPreview,
  loadBundledLibraryCatalog
} from "../browser/library";
import { loadBrowserCustomAssets } from "../browser/workspaceStore";
import {
  buildBrowserSemanticSchemaForProject,
  ensureBrowserReferenceTileAttributes,
  normalizeBrowserProject
} from "../browser/project";
import { loadActiveBrowserProject } from "../browser/projectStore";
import { loadImage } from "../components/TileSprite";
import {
  PAINTABLE_REFERENCE_SPECIAL_ICON_VALUES,
  referencedMapIconIds,
  tileIconCandidates
} from "../map/renderValues";
import { runProvidenceHarness } from "../harness";
import { runDesktopUiHarness } from "../desktopUiHarness";
import { isManualCapturePresetId, manualCaptureActions, uiAuditCaptureActions, uiAuditCaptureTarget } from "../docs/manualCapture";
import { isActorOrCreatureIconId } from "../resourceResolver";
import { BROWSER_PREVIEW_STATUS, EditorAction, EditorState } from "../store";
import { AtlasEntry, IconEntry, Project, ProvidenceWorkspace, TilesetAsset, type SemanticMappingProgress } from "../types";
import { commandError } from "../utils";
import { isPaintableSpecialLandLibraryAsset, isSemanticMappingPending, playerMapMarkerIconIds } from "./appUtils";
import type { BrowserSemanticBuildProgress } from "../browser/semantic";

const BROWSER_ICON_OVERLAY_PRELOAD_LIMIT = 1024;
const PLAYER_MAP_DEFAULT_MARKER_ICON_IDS = [137, 139] as const;
const SEMANTIC_MAPPING_PHASE_TOTAL = 11;
const DESKTOP_SEMANTIC_MAPPING_STAGES = [
  { afterMs: 0, phase: "sources", label: "Preparing Source Snapshot", completed: 0 },
  { afterMs: 1800, phase: "records", label: "Reading Scenario Records", completed: 2 },
  { afterMs: 4200, phase: "action-points", label: "Mapping Action Points", completed: 5 },
  { afterMs: 7600, phase: "links", label: "Connecting Script Links", completed: 8 },
  { afterMs: 12000, phase: "finalize", label: "Finalizing Index", completed: 10 }
];

export function useAppBootstrapEffects({
  state,
  dispatch,
  desktopRuntime,
  workspaceDir,
  projectDir,
  setProjectDir,
  atlasLoadKey,
  iconLoadKey
}: {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  desktopRuntime: boolean;
  workspaceDir: string;
  projectDir: string;
  setProjectDir: (value: string) => void;
  atlasLoadKey: string;
  iconLoadKey: string;
}) {
  const loadedIconOverlayKeyRef = useRef("");
  const loadingIconOverlayKeyRef = useRef("");
  useEffect(() => {
    if (!desktopRuntime) return;
    let disposed = false;
    const onStatus = (status: string) => {
      if (!disposed) dispatch({ type: "setStatus", status });
    };
    void runDesktopUiHarness({ dispatch, setProjectDir, onStatus }).then((handled) => {
      if (handled || disposed) return;
      void runProvidenceHarness(onStatus);
    });
    return () => {
      disposed = true;
    };
  }, [desktopRuntime, dispatch, setProjectDir]);

  useEffect(() => {
    if (desktopRuntime) return;
    const searchParams = new URLSearchParams(window.location.search);
    const benchmarkProjectUrl = searchParams.get("benchmarkProject");
    const manualCapturePreset = searchParams.get("manualCapture");
    const uiAuditCaptureId = searchParams.get("uiAuditCapture");
    if (!benchmarkProjectUrl) return;
    const url = benchmarkProjectUrl;
    let disposed = false;
    async function loadBenchmarkProject() {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const project = normalizeBrowserProject((await response.json()) as Project);
        if (!disposed) {
          setProjectDir(`browser-benchmark://${url}`);
          dispatch({ type: "setProject", project, selectedMapId: project.maps[0]?.id ?? null });
          const auditTarget = uiAuditCaptureTarget(uiAuditCaptureId);
          if (auditTarget) {
            for (const action of uiAuditCaptureActions(project, auditTarget)) dispatch(action);
            document.documentElement.dataset.uiAuditCapture = auditTarget.key;
            dispatch({ type: "setStatus", status: `UI audit capture ready: ${auditTarget.label}` });
          } else if (isManualCapturePresetId(manualCapturePreset)) {
            for (const action of manualCaptureActions(project, manualCapturePreset)) dispatch(action);
            document.documentElement.dataset.manualCapture = manualCapturePreset;
            dispatch({ type: "setStatus", status: `Manual capture ready: ${manualCapturePreset}` });
          } else {
            dispatch({ type: "setTab", tab: "scripts" });
            dispatch({ type: "setStatus", status: `Loaded benchmark project ${project.scenario.name}` });
          }
        }
      } catch (error) {
        if (!disposed) dispatch({ type: "setStatus", status: `Benchmark project load failed: ${commandError(error)}` });
      }
    }
    void loadBenchmarkProject();
    return () => {
      disposed = true;
    };
  }, [desktopRuntime, dispatch, setProjectDir]);

  useEffect(() => {
    if (desktopRuntime || state.project) return;
    const benchmarkProjectUrl = new URLSearchParams(window.location.search).get("benchmarkProject");
    if (benchmarkProjectUrl) return;
    let disposed = false;
    async function restoreBrowserProject() {
      try {
        const snapshot = await loadActiveBrowserProject();
        if (!snapshot || disposed) return;
        setProjectDir(snapshot.key);
        dispatch({ type: "setProject", project: snapshot.project, selectedMapId: snapshot.project.maps[0]?.id ?? null });
        dispatch({ type: "setTab", tab: "maps" });
        dispatch({ type: "setStatus", status: `Restored browser project ${snapshot.project.scenario.name}` });
      } catch (error) {
        if (!disposed) dispatch({ type: "setStatus", status: `Browser project restore skipped: ${commandError(error)}` });
      }
    }
    void restoreBrowserProject();
    return () => {
      disposed = true;
    };
  }, [desktopRuntime, dispatch, setProjectDir, state.project]);

  useEffect(() => {
    let disposed = false;
    async function loadWorkspace() {
      if (!desktopRuntime) {
        try {
          const catalog = await loadBundledLibraryCatalog();
          const customAssets = await loadBrowserCustomAssets();
          if (!disposed) {
            dispatch({ type: "setWorkspace", workspace: createBrowserWorkspace(catalog, customAssets) });
            dispatch({ type: "setLibraryCatalog", catalog });
            dispatch({ type: "setStatus", status: "Bundled Divinity and Realmz libraries ready" });
          }
        } catch (error) {
          if (!disposed) {
            dispatch({ type: "setWorkspace", workspace: createBrowserWorkspace() });
            dispatch({ type: "setStatus", status: `Bundled library load failed: ${commandError(error)}` });
          }
        }
        return;
      }
      try {
        const workspace = await invoke<ProvidenceWorkspace>("open_workspace", { workspaceDir });
        if (!disposed) {
          dispatch({ type: "setWorkspace", workspace });
          dispatch({ type: "setStatus", status: "Workspace ready" });
        }
      } catch (error) {
        if (!disposed) {
          dispatch({ type: "setStatus", status: `Workspace open failed: ${commandError(error)}` });
        }
      }
    }
    loadWorkspace();
    return () => {
      disposed = true;
    };
  }, [desktopRuntime, dispatch, workspaceDir]);

  useEffect(() => {
    document.documentElement.dataset.tutorial = state.tutorialEnabled ? "on" : "off";
  }, [state.tutorialEnabled]);

  useEffect(() => {
    if (!state.project || !projectDir) return;
    if (!isSemanticMappingPending(state.project)) return;
    if (!shouldBuildSemanticSchemaForTab(state.activeTab)) return;
    let disposed = false;
    const project = state.project;
    const startedAt = Date.now();
    dispatch({
      type: "setSemanticMappingProgress",
      progress: semanticMappingStarted(project, desktopRuntime ? "desktop" : "browser", startedAt)
    });
    dispatch({ type: "setStatus", status: "Mapping scenario links: preparing source snapshot..." });
    const desktopProgressTimer = desktopRuntime
      ? window.setInterval(() => {
          if (disposed) return;
          const progress = desktopSemanticMappingProgress(project, startedAt, Date.now());
          dispatch({
            type: "setSemanticMappingProgress",
            progress
          });
          dispatch({ type: "setStatus", status: `Mapping scenario links: ${progress.label.toLowerCase()}...` });
        }, 1000)
      : null;
    const useSavedDesktopProject = desktopRuntime && !state.dirty;
    const mapping = desktopRuntime
      ? useSavedDesktopProject
        ? invoke<{ semanticSchema: Project["semanticSchema"]; validation: Project["validation"] }>("build_saved_project_semantic_schema", { projectDir })
        : invoke<{ semanticSchema: Project["semanticSchema"]; validation: Project["validation"] }>("build_project_semantic_schema", { projectDir, project })
      : waitForBrowserPaint().then(async () => {
          const result = await buildBrowserSemanticSchemaForProject(project, (progress) => {
            if (!disposed) {
              const nextProgress = browserSemanticMappingProgress(project, progress, startedAt);
              dispatch({
                type: "setSemanticMappingProgress",
                progress: nextProgress
              });
              dispatch({ type: "setStatus", status: `Mapping scenario links: ${nextProgress.label.toLowerCase()}...` });
            }
          });
          if (!result) throw new Error("No browser scenario buffers are available for mapping.");
          return result;
        });
    mapping
      .then((result) => {
        if (disposed) return;
        if (desktopProgressTimer != null) window.clearInterval(desktopProgressTimer);
        const schema = result.semanticSchema;
        dispatch({ type: "setSemanticSchema", schema, validation: result.validation });
        dispatch({
          type: "setStatus",
          status: `Scenario mapping ready: ${schema.summary.entityCount.toLocaleString()} entities, ${schema.summary.linkCount.toLocaleString()} links`
        });
      })
      .catch((error) => {
        if (desktopProgressTimer != null) window.clearInterval(desktopProgressTimer);
        if (!disposed) {
          dispatch({ type: "setSemanticMappingProgress", progress: null });
          dispatch({ type: "setStatus", status: `Scenario mapping failed: ${commandError(error)}` });
        }
      });
    return () => {
      disposed = true;
      if (desktopProgressTimer != null) window.clearInterval(desktopProgressTimer);
    };
  }, [desktopRuntime, dispatch, projectDir, state.activeTab, state.dirty, state.project]);

  useEffect(() => {
    if (desktopRuntime || !state.project) return;
    if (!shouldHydrateBrowserReferenceTileAttributesForTab(state.activeTab)) return;
    if (hasBrowserReferenceTileAttributes(state.project)) return;
    let disposed = false;
    const project = cloneProjectForReferenceTileAttributes(state.project);
    void ensureBrowserReferenceTileAttributes(project)
      .then((hydrated) => {
        if (disposed) return;
        dispatch({
          type: "setReferenceTileAttributes",
          tileAttributes: hydrated.tileAttributes,
          assetCatalog: hydrated.assetCatalog,
          validation: hydrated.validation
        });
      })
      .catch((error) => {
        if (!disposed) dispatch({ type: "setStatus", status: `Reference tile metadata load failed: ${commandError(error)}` });
      });
    return () => {
      disposed = true;
    };
  }, [desktopRuntime, dispatch, state.activeTab, state.project]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (event.key === "Escape" && state.groupLabel) {
        event.preventDefault();
        dispatch({ type: "cancelCommandGroup" });
        return;
      }
      if (!event.ctrlKey && !event.metaKey) return;
      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        dispatch({ type: event.shiftKey ? "redo" : "undo" });
      } else if (key === "y") {
        event.preventDefault();
        dispatch({ type: "redo" });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dispatch, state.groupLabel]);

  useEffect(() => {
    let disposed = false;
    async function loadAtlases() {
      if (!state.project) {
        dispatch({ type: "setAtlases", entries: {}, status: "No atlases loaded" });
        return;
      }
      if (!shouldLoadTileAtlasesForTab(state.activeTab)) return;
      const loadable = state.project.assetCatalog.tilesets
        .map((asset) => ({
          asset,
          url: desktopRuntime
            ? asset.imagePath ?? (asset.pictId != null ? `reference-picture:${asset.pictId}` : null)
            : browserTilesetAtlasUrl(asset)
        }))
        .filter((entry): entry is { asset: TilesetAsset; url: string } => Boolean(entry.url));
      if (loadable.length === 0) {
        dispatch({ type: "setAtlases", entries: {}, status: "No tile atlases available" });
        return;
      }
      dispatch({
        type: "setAtlases",
        entries: {},
        status: `Loading ${loadable.length} tile atlas${loadable.length === 1 ? "" : "es"}...`
      });
      const pairs = await Promise.all(
        loadable.map(async ({ asset, url: assetUrl }) => {
          try {
            const url = desktopRuntime
              ? assetUrl.startsWith("reference-picture:")
                ? await invoke<string>("load_reference_picture_asset", { pictId: Number(assetUrl.replace("reference-picture:", "")) })
                : await invoke<string>("load_project_asset", { projectDir, relativePath: assetUrl })
              : assetUrl.startsWith("reference-picture:")
                ? await loadBrowserReferencePictureAsset(state.libraryCatalog, Number(assetUrl.replace("reference-picture:", "")))
                : assetUrl;
            const image = await loadImage(url);
            return [asset.id, { image, url, asset }] as const;
          } catch (error) {
            console.error(`Failed to load atlas ${asset.id}`, error);
            return null;
          }
        })
      );
      if (disposed) return;
      const entries: Record<string, AtlasEntry> = {};
      for (const pair of pairs) {
        if (pair) entries[pair[0]] = pair[1];
      }
      dispatch({
        type: "setAtlases",
        entries,
        status: `Loaded ${Object.keys(entries).length}/${loadable.length} tile atlases`
      });
    }
    loadAtlases();
    return () => {
      disposed = true;
    };
  }, [atlasLoadKey, desktopRuntime, dispatch, projectDir, state.activeTab, state.libraryCatalog]);

  useEffect(() => {
    let disposed = false;
    async function loadIcons() {
      if (!state.project) {
        loadedIconOverlayKeyRef.current = "";
        loadingIconOverlayKeyRef.current = "";
        dispatch({ type: "setIcons", entries: {}, status: "No icon overlays loaded", forTab: null });
        return;
      }
      if (!shouldLoadIconOverlaysForTab(state.activeTab)) return;
      const requestedIconOverlayKey = [
        desktopRuntime ? "desktop" : "browser",
        state.activeTab,
        projectDir,
        workspaceDir,
        iconLoadKey
      ].join("\n");
      if (loadedIconOverlayKeyRef.current === requestedIconOverlayKey) return;
      if (loadingIconOverlayKeyRef.current === requestedIconOverlayKey) return;
      loadingIconOverlayKeyRef.current = requestedIconOverlayKey;
      const projectStampAssets = (state.project.assets ?? []).filter((asset) => asset.kind === "special-land-tile" && asset.resourceType === "cicn");
      const projectCatalogIconAssets = (state.project.assetCatalog.icons ?? []).filter((asset) => asset.resourceType === "cicn");
      const libraryIconAssets = (state.libraryCatalog?.assets ?? []).filter(isPaintableSpecialLandLibraryAsset);
      const realmzActorIconAssets = (state.libraryCatalog?.assets ?? []).filter((asset) => isRealmzActorOrCreatureIconLibraryAsset(asset));
      const realmzReferenceIconAssets = (state.libraryCatalog?.assets ?? []).filter((asset) => isRealmzReferenceIconLibraryAsset(asset));
      const mapIconIds = state.project.maps.flatMap((map) => referencedMapIconIds(map.tiles));
      const playerMapIconIds = [
        ...(state.activeTab === "player-maps" ? PLAYER_MAP_DEFAULT_MARKER_ICON_IDS : []),
        ...(state.project.mapRecords ?? []).flatMap(playerMapMarkerIconIds)
      ];
      const projectIconIds = [
        ...(state.project.assetCatalog.icons ?? [])
          .filter((asset) => asset.resourceType === "cicn")
          .flatMap((asset) => iconCandidateIdsForResource(asset.resourceId)),
        ...(state.project.scenarioIconResources ?? []).flatMap((resource) => iconCandidateIdsForResource(resource.resourceId)),
        ...projectStampAssets.flatMap((asset) => tileIconCandidates(asset.resourceId))
      ];
      const specialReferenceIconIds = !desktopRuntime ? PAINTABLE_REFERENCE_SPECIAL_ICON_VALUES.flatMap(tileIconCandidates) : [];
      const specialLibraryIconIds = libraryIconAssets
        .filter((asset) => asset.resourceId != null && !isActorOrCreatureIconId(Math.abs(asset.resourceId)))
        .flatMap((asset) => asset.resourceId == null ? [] : iconCandidateIdsForResource(asset.resourceId));
      const playerMapIconIdSet = new Set(playerMapIconIds.flatMap(iconCandidateIdsForResource));
      const mapIconIdSet = new Set(mapIconIds.flatMap(iconCandidateIdsForResource));
      const monsterIconIds = [
        ...(state.project.monsters ?? []).flatMap((monster) => iconCandidateIdsForResource(monster.iconId)),
        ...(state.project.monsterSets ?? []).flatMap((set) => set.monsters.flatMap((monster) => iconCandidateIdsForResource(monster.iconId)))
      ];
      const monsterOverrideSourceIds = new Set(
        (state.project.monsterIconOverrides ?? []).flatMap((override) => [
          ...iconCandidateIdsForResource(override.sourceBaseIconId),
          ...iconCandidateIdsForResource(override.sourceBaseIconId + 308)
        ])
      );
      const monsterOverrideIconIds = (state.project.monsterIconOverrides ?? []).flatMap((override) => [
        ...iconCandidateIdsForResource(override.targetBaseIconId),
        ...iconCandidateIdsForResource(override.targetBaseIconId + 308),
        ...iconCandidateIdsForResource(override.sourceBaseIconId),
        ...iconCandidateIdsForResource(override.sourceBaseIconId + 308)
      ]);
      const actorIconIds = [
        ...realmzActorIconAssets.flatMap((asset) => asset.resourceId == null ? [] : iconCandidateIdsForResource(asset.resourceId)),
        ...libraryIconAssets
          .filter((asset) => asset.resourceId != null && isActorOrCreatureIconId(Math.abs(asset.resourceId)))
          .flatMap((asset) => asset.resourceId == null ? [] : iconCandidateIdsForResource(asset.resourceId))
      ];
      const rawIds = uniqueIconIds([
        ...playerMapIconIds,
        ...mapIconIds,
        ...projectIconIds,
        ...specialReferenceIconIds,
        ...specialLibraryIconIds,
        ...monsterIconIds,
        ...monsterOverrideIconIds,
        ...actorIconIds
      ]);
      const ids = desktopRuntime ? rawIds : rawIds.slice(0, BROWSER_ICON_OVERLAY_PRELOAD_LIMIT);
      if (ids.length === 0) {
        loadedIconOverlayKeyRef.current = requestedIconOverlayKey;
        loadingIconOverlayKeyRef.current = "";
        dispatch({ type: "setIcons", entries: {}, status: "No icon overlays in maps", forTab: state.activeTab });
        return;
      }
      dispatch({
        type: "setIcons",
        entries: {},
        status: `Loading ${ids.length}${ids.length < rawIds.length ? `/${rawIds.length}` : ""} map icon overlay${ids.length === 1 ? "" : "s"}...`,
        forTab: state.activeTab
      });
      const pairs = await Promise.all(
        ids.map(async (id) => {
          try {
            const projectStamp = projectStampAssets.find((asset) => asset.resourceId === id || tileIconCandidates(asset.resourceId).includes(id));
            const projectCatalogIcon = projectCatalogIconAssets.find((asset) => {
              return iconCandidateIdsForResource(asset.resourceId).includes(id);
            });
            const libraryAsset = libraryIconAssets.find((asset) => {
              if (asset.resourceId == null) return false;
              if (isMonsterMashLibraryAsset(asset) && !monsterOverrideSourceIds.has(Math.abs(asset.resourceId))) return false;
              return iconCandidateIdsForResource(asset.resourceId).includes(id);
            });
            const realmzActorIconAsset = realmzActorIconAssets.find((asset) => {
              if (asset.resourceId == null) return false;
              if (isMonsterMashLibraryAsset(asset) && !monsterOverrideSourceIds.has(Math.abs(asset.resourceId))) return false;
              return iconCandidateIdsForResource(asset.resourceId).includes(id);
            });
            const realmzReferenceIconAsset = realmzReferenceIconAssets.find((asset) => {
              if (asset.resourceId == null) return false;
              return iconCandidateIdsForResource(asset.resourceId).includes(id);
            });
            const urls: string[] = [];
            if (projectStamp) {
              const relativePath = projectStamp.previewPath ?? `assets/icons/icon_${id}.png`;
              if (desktopRuntime && !isInlineAssetUrl(relativePath)) {
                try {
                  urls.push(await invoke<string>("load_project_asset", { projectDir, relativePath }));
                } catch {
                  // Fall through to the generic project icon path and reference PNG.
                }
              } else {
                urls.push(relativePath);
              }
            } else if (projectCatalogIcon?.previewPath) {
              const relativePath = projectCatalogIcon.previewPath;
              if (desktopRuntime && !isInlineAssetUrl(relativePath)) {
                try {
                  urls.push(await invoke<string>("load_project_asset", { projectDir, relativePath }));
                } catch {
                  // Fall through to the generic project icon path and reference PNG.
                }
              } else {
                urls.push(relativePath);
              }
            }
            if (desktopRuntime) {
              try {
                urls.push(await invoke<string>("load_project_asset", { projectDir, relativePath: `assets/icons/icon_${id}.png` }));
              } catch {
                // Older projects may not have a local overlay for every reference icon.
              }
            }
            if (id < 0) {
              const referenceUrl = browserReferenceIconUrl(id);
              if (referenceUrl) urls.push(referenceUrl);
            }
            const allowReferenceIconAsset = iconIdMatchesSet(playerMapIconIdSet, id) || iconIdMatchesSet(mapIconIdSet, id) || isActorOrCreatureIconId(Math.abs(id));
            const preferredLibraryAsset = isActorOrCreatureIconId(Math.abs(id))
              ? realmzActorIconAsset ?? (allowReferenceIconAsset ? realmzReferenceIconAsset : null) ?? libraryAsset
              : (allowReferenceIconAsset ? realmzReferenceIconAsset : null) ?? libraryAsset;
            if (preferredLibraryAsset) {
              try {
                const libraryUrl = desktopRuntime
                  ? await invoke<string>("load_library_asset_preview", { workspaceDir, source: preferredLibraryAsset.source, relativePath: preferredLibraryAsset.relativePath })
                  : (await loadBrowserBundledLibraryAssetPreview(preferredLibraryAsset)) ?? browserReferenceIconUrl(id);
                if (libraryUrl) urls.push(libraryUrl);
              } catch {
                // Fall through to any remaining project/reference icon paths.
              }
            }
            for (const url of [...new Set(urls)]) {
              try {
                const image = await loadImage(url);
                return [id, { id, image, url }] as const;
              } catch {
                // Try the next source: project-local icons, library previews, then reference PNGs.
              }
            }
            throw new Error(`No preview source could load for map icon overlay ${id}`);
          } catch (error) {
            console.warn(`Failed to load map icon overlay ${id}`, error);
            return null;
          }
        })
      );
      if (disposed) return;
      const entries: Record<number, IconEntry> = {};
      for (const pair of pairs) {
        if (pair) entries[pair[0]] = pair[1];
      }
      loadedIconOverlayKeyRef.current = requestedIconOverlayKey;
      loadingIconOverlayKeyRef.current = "";
      dispatch({
        type: "setIcons",
        entries,
        status: `Loaded ${Object.keys(entries).length}/${ids.length} map icon overlays`,
        forTab: state.activeTab
      });
    }
    loadIcons();
    return () => {
      disposed = true;
      if (loadingIconOverlayKeyRef.current === [
        desktopRuntime ? "desktop" : "browser",
        state.activeTab,
        projectDir,
        workspaceDir,
        iconLoadKey
      ].join("\n")) {
        loadingIconOverlayKeyRef.current = "";
      }
    };
  }, [desktopRuntime, dispatch, iconLoadKey, projectDir, state.activeTab, workspaceDir]);
}

function semanticMappingStarted(project: Project, source: SemanticMappingProgress["source"], startedAt: number): SemanticMappingProgress {
  return {
    active: true,
    source,
    phase: "queued",
    label: "Preparing Source Snapshot",
    detail: semanticMappingScenarioSummary(project),
    completed: 0,
    total: SEMANTIC_MAPPING_PHASE_TOTAL,
    startedAt,
    updatedAt: startedAt,
    indeterminate: source === "desktop"
  };
}

function browserSemanticMappingProgress(
  project: Project,
  progress: BrowserSemanticBuildProgress,
  startedAt: number
): SemanticMappingProgress {
  return {
    active: true,
    source: "browser",
    phase: progress.phase,
    label: progress.label,
    detail: `${progress.detail} | ${semanticMappingScenarioSummary(project)}`,
    completed: progress.completed,
    total: progress.total,
    startedAt,
    updatedAt: Date.now()
  };
}

function desktopSemanticMappingProgress(project: Project, startedAt: number, now: number): SemanticMappingProgress {
  const elapsed = now - startedAt;
  const stage = [...DESKTOP_SEMANTIC_MAPPING_STAGES].reverse().find((candidate) => elapsed >= candidate.afterMs) ?? DESKTOP_SEMANTIC_MAPPING_STAGES[0];
  return {
    active: true,
    source: "desktop",
    phase: stage.phase,
    label: stage.label,
    detail: `${semanticMappingScenarioSummary(project)} | desktop command is still running`,
    completed: stage.completed,
    total: SEMANTIC_MAPPING_PHASE_TOTAL,
    startedAt,
    updatedAt: now,
    indeterminate: true
  };
}

function semanticMappingScenarioSummary(project: Project) {
  const extraActionCount = project.triggers.filter((trigger) => trigger.source === "Data ED3").length;
  const mapActionCount = project.triggers.length - extraActionCount;
  return [
    `${project.maps.length.toLocaleString()} map(s)`,
    `${mapActionCount.toLocaleString()} Action Point(s)`,
    `${extraActionCount.toLocaleString()} Extra Action Point(s)`,
    `${project.extracodes.length.toLocaleString()} Action Settings row(s)`
  ].join(", ");
}

function waitForBrowserPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => window.setTimeout(resolve, 0));
  });
}

function shouldBuildSemanticSchemaForTab(tab: EditorState["activeTab"]) {
  return ["player-maps", "scripts", "strings", "encounters", "combat", "economy", "rules", "assets", "records", "linter"].includes(tab);
}

function shouldHydrateBrowserReferenceTileAttributesForTab(tab: EditorState["activeTab"]) {
  return tab === "maps" || tab === "player-maps" || tab === "linter";
}

function hasBrowserReferenceTileAttributes(project: Project) {
  return (project.tileAttributes ?? []).some((profile) => profile.sourceKind === "mapstats" && profile.source === "Data P BD");
}

function cloneProjectForReferenceTileAttributes(project: Project): Project {
  return {
    ...project,
    tileAttributes: [...(project.tileAttributes ?? [])],
    assetCatalog: {
      ...project.assetCatalog,
      tilesets: [...(project.assetCatalog?.tilesets ?? [])],
      pictures: [...(project.assetCatalog?.pictures ?? [])],
      icons: [...(project.assetCatalog?.icons ?? [])],
      sounds: [...(project.assetCatalog?.sounds ?? [])]
    }
  };
}

function shouldLoadTileAtlasesForTab(tab: EditorState["activeTab"]) {
  return tab === "maps" || tab === "player-maps";
}

function shouldLoadIconOverlaysForTab(tab: EditorState["activeTab"]) {
  return tab === "maps" || tab === "player-maps" || tab === "combat";
}

function isInlineAssetUrl(value: string) {
  return value.startsWith("data:") || value.startsWith("blob:") || value.startsWith("http:") || value.startsWith("https:") || value.startsWith("/");
}

async function loadBrowserReferencePictureAsset(catalog: EditorState["libraryCatalog"], pictId: number) {
  const asset = catalog?.assets.find((candidate) => {
    return candidate.resourceType === "PICT"
      && candidate.resourceId === pictId
      && `${candidate.source} ${candidate.relativePath}`.toLowerCase().includes("realmz");
  });
  if (!asset) throw new Error(`Bundled Realmz PICT ${pictId} is not available.`);
  const preview = await loadBrowserBundledLibraryAssetPreview(asset);
  if (!preview) throw new Error(`Bundled Realmz PICT ${pictId} did not produce a preview.`);
  return preview;
}

function iconCandidateIdsForResource(resourceId: number) {
  return [...new Set([
    ...tileIconCandidates(resourceId),
    resourceId
  ].filter((id): id is number => typeof id === "number"))];
}

function uniqueIconIds(ids: number[]) {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function iconIdMatchesSet(ids: Set<number>, id: number) {
  const absId = Math.abs(id);
  return ids.has(id) || ids.has(absId) || ids.has(-absId);
}

function isRealmzActorOrCreatureIconLibraryAsset(asset: { source?: string; resourceType?: string | null; resourceId?: number | null; type?: string; label?: string; relativePath?: string }) {
  if (asset.resourceType !== "cicn" || asset.resourceId == null) return false;
  if (!isActorOrCreatureIconId(Math.abs(asset.resourceId))) return false;
  if (isMonsterMashLibraryAsset(asset)) return false;
  const text = `${asset.source ?? ""} ${asset.type ?? ""} ${asset.label ?? ""} ${asset.relativePath ?? ""}`.toLowerCase();
  return text.includes(":realmz:") || text.includes("realmz-reference") || text.includes("the family jewels");
}

function isRealmzReferenceIconLibraryAsset(asset: { source?: string; resourceType?: string | null; resourceId?: number | null; type?: string; label?: string; relativePath?: string }) {
  if (asset.resourceType !== "cicn" || asset.resourceId == null) return false;
  const text = `${asset.source ?? ""} ${asset.type ?? ""} ${asset.label ?? ""} ${asset.relativePath ?? ""}`.toLowerCase();
  return text.includes(":realmz:") || text.includes("realmz-reference") || text.includes("the family jewels");
}

function isMonsterMashLibraryAsset(asset: { source?: string; resourceType?: string | null; resourceId?: number | null; type?: string; label?: string; relativePath?: string }) {
  if (asset.resourceType !== "cicn" || asset.resourceId == null) return false;
  const text = `${asset.source ?? ""} ${asset.type ?? ""} ${asset.label ?? ""} ${asset.relativePath ?? ""}`.toLowerCase();
  return text.includes("monster mash");
}
