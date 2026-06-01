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
import {
  PAINTABLE_REFERENCE_SPECIAL_ICON_VALUES,
  referencedMapIconIds,
  tileIconCandidates
} from "../map/renderValues";
import { runProvidenceHarness } from "../harness";
import { BROWSER_PREVIEW_STATUS, EditorAction, EditorState } from "../store";
import { AtlasEntry, IconEntry, Project, ProvidenceWorkspace, TilesetAsset } from "../types";
import { commandError } from "../utils";
import { isPaintableSpecialLandLibraryAsset } from "./appUtils";

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
    void runProvidenceHarness((status) => {
      if (!disposed) dispatch({ type: "setStatus", status });
    });
    return () => {
      disposed = true;
    };
  }, [desktopRuntime, dispatch]);

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
        const project = await ensureBrowserReferenceTileAttributes((await response.json()) as Project);
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
      const loadable = state.project.assetCatalog.tilesets
        .map((asset) => ({ asset, url: desktopRuntime ? asset.imagePath : browserTilesetAtlasUrl(asset) }))
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
              ? await invoke<string>("load_project_asset", { projectDir, relativePath: assetUrl })
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
  }, [atlasLoadKey, desktopRuntime, dispatch, projectDir]);

  useEffect(() => {
    let disposed = false;
    async function loadIcons() {
      if (!state.project) {
        dispatch({ type: "setIcons", entries: {}, status: "No icon overlays loaded" });
        return;
      }
      const projectStampAssets = (state.project.assets ?? []).filter((asset) => asset.kind === "special-land-tile" && asset.resourceType === "cicn");
      const projectCatalogIconAssets = (state.project.assetCatalog.icons ?? []).filter((asset) => asset.resourceType === "cicn");
      const libraryIconAssets = (state.libraryCatalog?.assets ?? []).filter(isPaintableSpecialLandLibraryAsset);
      const ids = [
        ...new Set([
          ...state.project.maps.flatMap((map) => referencedMapIconIds(map.tiles)),
          ...(state.project.assetCatalog.icons ?? [])
            .filter((asset) => asset.resourceType === "cicn")
            .flatMap((asset) => tileIconCandidates(asset.resourceId < 0 ? asset.resourceId : -asset.resourceId)),
          ...projectStampAssets.flatMap((asset) => tileIconCandidates(asset.resourceId)),
          ...libraryIconAssets.flatMap((asset) => asset.resourceId == null ? [] : tileIconCandidates(asset.resourceId < 0 ? asset.resourceId : -asset.resourceId)),
          ...(!desktopRuntime ? PAINTABLE_REFERENCE_SPECIAL_ICON_VALUES.flatMap(tileIconCandidates) : [])
        ])
      ].sort((a, b) => a - b);
      if (ids.length === 0) {
        dispatch({ type: "setIcons", entries: {}, status: "No icon overlays in maps" });
        return;
      }
      dispatch({
        type: "setIcons",
        entries: {},
        status: `Loading ${ids.length} map icon overlay${ids.length === 1 ? "" : "s"}...`
      });
      const pairs = await Promise.all(
        ids.map(async (id) => {
          try {
            const projectStamp = projectStampAssets.find((asset) => asset.resourceId === id || tileIconCandidates(asset.resourceId).includes(id));
            const projectCatalogIcon = projectCatalogIconAssets.find((asset) => {
              const resourceId = asset.resourceId < 0 ? asset.resourceId : -asset.resourceId;
              return tileIconCandidates(resourceId).includes(id);
            });
            const libraryAsset = libraryIconAssets.find((asset) => {
              if (asset.resourceId == null) return false;
              return tileIconCandidates(asset.resourceId < 0 ? asset.resourceId : -asset.resourceId).includes(id);
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
            } else if (libraryAsset) {
              try {
                urls.push(desktopRuntime
                  ? await invoke<string>("load_library_asset_preview", { workspaceDir, source: libraryAsset.source, relativePath: libraryAsset.relativePath })
                  : (await loadBrowserBundledLibraryAssetPreview(libraryAsset)) ?? browserReferenceIconUrl(id));
              } catch {
                // Fall through to project/reference icon paths.
              }
            }
            if (desktopRuntime) {
              try {
                urls.push(await invoke<string>("load_project_asset", { projectDir, relativePath: `assets/icons/icon_${id}.png` }));
              } catch {
                // Older projects may not have a local overlay for every reference icon.
              }
            }
            urls.push(browserReferenceIconUrl(id));
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
  }, [desktopRuntime, dispatch, iconLoadKey, projectDir, workspaceDir]);
}

function isInlineAssetUrl(value: string) {
  return value.startsWith("data:") || value.startsWith("blob:") || value.startsWith("http:") || value.startsWith("https:") || value.startsWith("/");
}
