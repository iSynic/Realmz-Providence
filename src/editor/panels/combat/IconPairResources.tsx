import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { loadBrowserBundledLibraryResourceData } from "../../browser/library";
import { iconLibraryAssetResourceBase64 } from "../../iconLibrary";
import { useResolvedPreviewUrl, type PreviewRuntimeContext } from "../../previewUrls";
import type { LibraryAsset, LibraryCatalog } from "../../types";

export function IconPairPreview({
  baseAsset,
  pairedAsset,
  previewContext
}: {
  baseAsset: LibraryAsset | null;
  pairedAsset: LibraryAsset | null;
  previewContext: PreviewRuntimeContext;
}) {
  return (
    <span className="icon-pair-preview" aria-hidden="true">
      <LibraryIconSwatch asset={baseAsset} previewContext={previewContext} />
      <LibraryIconSwatch asset={pairedAsset} previewContext={previewContext} />
    </span>
  );
}

function LibraryIconSwatch({
  asset,
  previewContext
}: {
  asset: LibraryAsset | null;
  previewContext: PreviewRuntimeContext;
}) {
  const resourceId = asset?.resourceId ?? 0;
  const url = useResolvedPreviewUrl(asset?.previewPath ?? null, null, asset, previewContext);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  useEffect(() => setFailedUrl(null), [url]);
  const usableUrl = url && url !== failedUrl ? url : null;
  return (
    <span className="icon-pair-swatch" title={asset?.label ?? (resourceId ? `cicn ${resourceId}` : "Missing paired icon")}>
      {usableUrl ? <img src={usableUrl} alt="" loading="lazy" decoding="async" onError={() => setFailedUrl(usableUrl)} /> : <b>{resourceId || "?"}</b>}
    </span>
  );
}

export async function loadLibraryResourceBase64(
  asset: LibraryAsset,
  previewContext: PreviewRuntimeContext,
  catalog?: LibraryCatalog | null
) {
  const providenceBase64 = iconLibraryAssetResourceBase64(catalog, asset);
  if (providenceBase64) return providenceBase64;
  if (previewContext.desktopRuntime) {
    if (!previewContext.workspaceDir) throw new Error("Workspace directory is required to load Monster Mash resource data.");
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
