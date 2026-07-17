import { invoke } from "@tauri-apps/api/core";
import { loadBrowserBundledLibraryResourceData } from "./browser/library";
import { iconLibraryAssetResourceBase64 } from "./iconLibrary";
import type { PreviewRuntimeContext } from "./previewUrls";
import type { LibraryAsset, LibraryCatalog } from "./types";

export async function loadLibraryResourceBase64(
  asset: LibraryAsset,
  previewContext: PreviewRuntimeContext,
  catalog?: LibraryCatalog | null
) {
  const providenceBase64 = iconLibraryAssetResourceBase64(catalog, asset);
  if (providenceBase64) return providenceBase64;
  if (previewContext.desktopRuntime) {
    if (!previewContext.workspaceDir) throw new Error("Workspace directory is required to load library resource data.");
    return invoke<string>("load_library_resource_data", {
      workspaceDir: previewContext.workspaceDir,
      source: asset.source,
      relativePath: asset.relativePath
    });
  }
  const data = await loadBrowserBundledLibraryResourceData(asset);
  return data ? bytesToBase64(data) : null;
}

export function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}
