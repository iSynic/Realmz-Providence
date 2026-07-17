import { useEffect, useState } from "react";
import { useResolvedPreviewUrl, type PreviewRuntimeContext } from "../../previewUrls";
import type { LibraryAsset } from "../../types";
export { bytesToBase64, loadLibraryResourceBase64 } from "../../libraryResourceData";

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
