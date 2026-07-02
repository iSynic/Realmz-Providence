import { invoke } from "@tauri-apps/api/core";
import { Dispatch, useEffect } from "react";
import { browserReferenceIconUrl, browserTilesetAtlasUrl } from "../browser/atlasPaths";
import {
  createBrowserWorkspace,
  loadBrowserBundledLibraryAssetPreview,
  loadBundledLibraryCatalog
} from "../browser/library";
import { ensureBrowserReferenceTileAttributes } from "../browser/project";
import { loadImage } from "../components/TileSprite";
import { buildPendingBrowserSemanticSchema } from "../browser/project";
import {
  PAINTABLE_REFERENCE_SPECIAL_ICON_VALUES,
  referencedMapIconIds,
  tileIconCandidates
} from "../map/renderValues";
import { runProvidenceHarness } from "../harness";
import { runDesktopUiHarness } from "../desktopUiHarness";
import { isActorOrCreatureIconId } from "../resourceResolver";
import { BROWSER_PREVIEW_STATUS, EditorAction, EditorState } from "../store";
import { AtlasEntry, IconEntry, Project, ProvidenceWorkspace, TilesetAsset } from "../types";
import { commandError } from "../utils";
import { isPaintableSpecialLandLibraryAsset } from "./appUtils";

const BROWSER_ICON_OVERLAY_PRELOAD_LIMIT = 180;

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
    const benchmarkProjectUrl = new URLSearchParams(window.location.search).get("benchmarkProject");
    if (!benchmarkProjectUrl) return;
    const url = benchmarkProjectUrl;
    let disposed = false;
    async function loadBenchmarkProject() {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const project = (await response.json()) as Project;
        if (!disposed) {
          setProjectDir(`browser-benchmark://${url}`);
          dispatch({ type: "setProject", project, selectedMapId: project.maps[0]?.id ?? null });
          dispatch({ type: "setTab", tab: "scripts" });
          dispatch({ type: "setStatus", status: `Loaded benchmark project ${project.scenario.name}` });
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
    let disposed = false;
    async function loadWorkspace() {
      if (!desktopRuntime) {
        try {
          const catalog = await loadBundledLibraryCatalog();
          if (!disposed) {
            dispatch({ type: "setWorkspace", workspace: createBrowserWorkspace(catalog) });
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
    if ((state.project.semanticSchema?.schemaVersion ?? 0) > 0) return;
    if (!shouldBuildSemanticSchemaForTab(state.activeTab)) return;
    let disposed = false;
    const project = state.project;
    dispatch({ type: "setStatus", status: "Mapping scenario links..." });
    const mapping = desktopRuntime
      ? invoke<{ semanticSchema: Project["semanticSchema"]; validation: Project["validation"] }>("build_project_semantic_schema", { projectDir, project })
      : waitForBrowserPaint().then(async () => {
          const result = await buildPendingBrowserSemanticSchema(project);
          if (!result) throw new Error("No browser scenario buffers are available for mapping.");
          return result;
        });
    mapping
      .then((result) => {
        if (disposed) return;
        const schema = result.semanticSchema;
        dispatch({ type: "setSemanticSchema", schema, validation: result.validation });
        dispatch({
          type: "setStatus",
          status: `Scenario mapping ready: ${schema.summary.entityCount.toLocaleString()} entities, ${schema.summary.linkCount.toLocaleString()} links`
        });
      })
      .catch((error) => {
        if (!disposed) dispatch({ type: "setStatus", status: `Scenario mapping failed: ${commandError(error)}` });
      });
    return () => {
      disposed = true;
    };
  }, [desktopRuntime, dispatch, projectDir, state.activeTab, state.project]);

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
        dispatch({ type: "setIcons", entries: {}, status: "No icon overlays loaded" });
        return;
      }
      if (!shouldLoadIconOverlaysForTab(state.activeTab)) return;
      const projectStampAssets = (state.project.assets ?? []).filter((asset) => asset.kind === "special-land-tile" && asset.resourceType === "cicn");
      const projectCatalogIconAssets = (state.project.assetCatalog.icons ?? []).filter((asset) => asset.resourceType === "cicn");
      const libraryIconAssets = (state.libraryCatalog?.assets ?? []).filter(isPaintableSpecialLandLibraryAsset);
      const realmzActorIconAssets = (state.libraryCatalog?.assets ?? []).filter((asset) => isRealmzActorOrCreatureIconLibraryAsset(asset));
      const mapIconIds = state.project.maps.flatMap((map) => referencedMapIconIds(map.tiles));
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
        dispatch({ type: "setIcons", entries: {}, status: "No icon overlays in maps" });
        return;
      }
      dispatch({
        type: "setIcons",
        entries: {},
        status: `Loading ${ids.length}${ids.length < rawIds.length ? `/${rawIds.length}` : ""} map icon overlay${ids.length === 1 ? "" : "s"}...`
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
            const preferredLibraryAsset = isActorOrCreatureIconId(Math.abs(id))
              ? realmzActorIconAsset ?? libraryAsset
              : libraryAsset;
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
      dispatch({
        type: "setIcons",
        entries,
        status: `Loaded ${Object.keys(entries).length}/${ids.length} map icon overlays`
      });
    }
    loadIcons();
    return () => {
      disposed = true;
    };
  }, [desktopRuntime, dispatch, iconLoadKey, projectDir, state.activeTab, workspaceDir]);
}

function waitForBrowserPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => window.setTimeout(resolve, 0));
  });
}

function shouldBuildSemanticSchemaForTab(tab: EditorState["activeTab"]) {
  return ["encounters", "combat", "economy", "rules", "assets", "records", "linter"].includes(tab);
}

function shouldHydrateBrowserReferenceTileAttributesForTab(tab: EditorState["activeTab"]) {
  return tab === "maps" || tab === "linter";
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
  return tab === "maps";
}

function shouldLoadIconOverlaysForTab(tab: EditorState["activeTab"]) {
  return tab === "maps" || tab === "combat";
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
    ...tileIconCandidates(-resourceId),
    resourceId > 200 ? resourceId : null
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

function isRealmzActorOrCreatureIconLibraryAsset(asset: { source?: string; resourceType?: string | null; resourceId?: number | null; type?: string; label?: string; relativePath?: string }) {
  if (asset.resourceType !== "cicn" || asset.resourceId == null) return false;
  if (!isActorOrCreatureIconId(Math.abs(asset.resourceId))) return false;
  if (isMonsterMashLibraryAsset(asset)) return false;
  const text = `${asset.source ?? ""} ${asset.type ?? ""} ${asset.label ?? ""} ${asset.relativePath ?? ""}`.toLowerCase();
  return text.includes(":realmz:") || text.includes("realmz-reference") || text.includes("the family jewels");
}

function isMonsterMashLibraryAsset(asset: { source?: string; resourceType?: string | null; resourceId?: number | null; type?: string; label?: string; relativePath?: string }) {
  if (asset.resourceType !== "cicn" || asset.resourceId == null) return false;
  const text = `${asset.source ?? ""} ${asset.type ?? ""} ${asset.label ?? ""} ${asset.relativePath ?? ""}`.toLowerCase();
  return text.includes("monster mash");
}
