import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { loadBrowserBundledLibraryAssetPreview } from "./browser/library";
import { browserReferenceIconUrl } from "./browser/atlasPaths";
import { loadBrowserScenarioResourcePreview } from "./browser/project";
import { LibraryAsset, LibraryCatalog, Project } from "./types";

export type PreviewRuntimeContext = {
  desktopRuntime?: boolean;
  projectDir?: string;
  workspaceDir?: string;
  project?: Project | null;
  resourceType?: string | null;
  resourceId?: number | null;
};

export function isDirectPreviewUrl(path: string) {
  return /^(data:|blob:|https?:\/\/|\/)/i.test(path);
}

export function findIconLibraryAsset(catalog: LibraryCatalog | null | undefined, iconId: number | null) {
  if (!iconId) return null;
  const absId = Math.abs(iconId);
  return catalog?.assets.find((asset) =>
    (asset.type === "icon" || asset.type.includes("icon") || asset.resourceType === "cicn") &&
    asset.resourceId != null &&
    Math.abs(asset.resourceId) === absId
  ) ?? null;
}

export function findIconProjectAsset(project: Project | null | undefined, iconId: number | null) {
  if (!project || !iconId) return null;
  const absId = Math.abs(iconId);
  return project.assetCatalog.icons?.find((asset) => Math.abs(asset.resourceId) === absId && asset.previewPath) ?? null;
}

export async function resolvePreviewUrl(
  directPath: string | null | undefined,
  managedAsset: Project["assets"][number] | null | undefined,
  libraryAsset: LibraryAsset | null | undefined,
  context: PreviewRuntimeContext
) {
  if (directPath && isDirectPreviewUrl(directPath)) return directPath;
  if (managedAsset?.previewPath) {
    if (context.desktopRuntime && context.projectDir) {
      return invoke<string>("load_project_asset_preview", { projectDir: context.projectDir, relativePath: managedAsset.previewPath });
    }
    return managedAsset.previewPath;
  }
  if (directPath && context.desktopRuntime && context.projectDir) {
    return invoke<string>("load_project_asset_preview", { projectDir: context.projectDir, relativePath: directPath });
  }
  if (!context.desktopRuntime && context.project && context.resourceType && context.resourceId != null) {
    const browserScenarioPreview = loadBrowserScenarioResourcePreview(context.project, context.resourceType, context.resourceId);
    if (browserScenarioPreview) return browserScenarioPreview;
  }
  if (libraryAsset) {
    if (context.desktopRuntime && context.workspaceDir) {
      return invoke<string>("load_library_asset_preview", {
        workspaceDir: context.workspaceDir,
        source: libraryAsset.source,
        relativePath: libraryAsset.relativePath
      });
    }
    return loadBrowserBundledLibraryAssetPreview(libraryAsset) ?? libraryAsset.previewPath ?? null;
  }
  if (directPath) return directPath;
  return null;
}

export async function resolveIconPreviewUrl(
  iconId: number | null,
  project: Project | null | undefined,
  catalog: LibraryCatalog | null | undefined,
  context: PreviewRuntimeContext
) {
  if (!iconId) return null;
  const projectAsset = findIconProjectAsset(project, iconId);
  const libraryAsset = findIconLibraryAsset(catalog, iconId);
  const resolved = await resolvePreviewUrl(projectAsset?.previewPath ?? null, null, libraryAsset, context);
  return resolved ?? browserReferenceIconUrl(Math.abs(iconId));
}

export function useIconPreviewUrl(
  iconId: number | null,
  project: Project | null | undefined,
  catalog: LibraryCatalog | null | undefined,
  context: PreviewRuntimeContext
) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let disposed = false;
    setUrl(null);
    if (!iconId) return;
    resolveIconPreviewUrl(iconId, project, catalog, context)
      .then((resolved) => {
        if (!disposed) setUrl(resolved);
      })
      .catch(() => {
        if (!disposed) setUrl(null);
      });
    return () => {
      disposed = true;
    };
  }, [catalog, context.desktopRuntime, context.projectDir, context.workspaceDir, iconId, project]);
  return url;
}

export function useResolvedPreviewUrl(
  directPath: string | null | undefined,
  managedAsset: Project["assets"][number] | null | undefined,
  libraryAsset: LibraryAsset | null | undefined,
  context: PreviewRuntimeContext
) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let disposed = false;
    setUrl(null);
    resolvePreviewUrl(directPath, managedAsset, libraryAsset, context)
      .then((resolved) => {
        if (!disposed) setUrl(resolved);
      })
      .catch(() => {
        if (!disposed) setUrl(null);
      });
    return () => {
      disposed = true;
    };
  }, [context.desktopRuntime, context.project, context.projectDir, context.resourceId, context.resourceType, context.workspaceDir, directPath, libraryAsset, managedAsset]);
  return url;
}

export function playPreviewUrl(url: string) {
  const audio = new Audio(url);
  audio.preload = "auto";
  void audio.play();
}
