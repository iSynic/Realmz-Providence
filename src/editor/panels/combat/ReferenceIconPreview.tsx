import { useEffect, useState } from "react";
import { findLibraryResourceAsset } from "../../resourceResolver";
import { useResolvedPreviewUrl, type PreviewRuntimeContext } from "../../previewUrls";
import type { IconEntry, LibraryCatalog } from "../../types";
import type { CombatLookups } from "./combatLookups";

export function ReferenceIconPreview({
  iconId,
  fallbackValue,
  iconEntries,
  catalog,
  lookups,
  previewContext,
  preferLibraryIcon = false
}: {
  iconId: number | null;
  fallbackValue: number;
  iconEntries: Record<number, IconEntry>;
  catalog: LibraryCatalog | null;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
  preferLibraryIcon?: boolean;
}) {
  const normalizedIconId = iconId ? Math.abs(iconId) : 0;
  const decoded = iconId ? iconEntries[iconId] ?? iconEntries[normalizedIconId] ?? iconEntries[-normalizedIconId] : null;
  const lookupAsset = normalizedIconId ? lookups.iconAssetsByAbsId.get(normalizedIconId) ?? null : null;
  const libraryAsset = iconId
    ? findLibraryResourceAsset(catalog?.assets ?? [], "cicn", iconId, "icon")
      ?? (normalizedIconId !== iconId ? findLibraryResourceAsset(catalog?.assets ?? [], "cicn", normalizedIconId, "icon") : null)
    : null;
  const directPath = preferLibraryIcon && libraryAsset ? null : decoded?.url ?? lookupAsset?.previewPath ?? null;
  const url = useResolvedPreviewUrl(directPath, null, libraryAsset, previewContext);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  useEffect(() => setFailedUrl(null), [url]);
  const usableUrl = url && url !== failedUrl ? url : null;
  return (
    <span className="scrapbook-reference-icon" title={iconId ? `cicn ${iconId}` : `Raw ID ${fallbackValue}`}>
      {usableUrl ? <img src={usableUrl} alt="" loading="lazy" decoding="async" onError={() => setFailedUrl(usableUrl)} /> : <b>{fallbackValue}</b>}
    </span>
  );
}
