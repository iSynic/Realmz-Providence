import { TilesetAsset } from "../types";

const KNOWN_REFERENCE_PICTS = new Set([300, 302, 303, 304, 305, 309, 310]);

export function browserReferenceAtlasToken(pictId: number | null) {
  if (pictId === null || !KNOWN_REFERENCE_PICTS.has(pictId)) return null;
  return `reference-picture:${pictId}`;
}

export function browserReferenceAtlasUrl(pictId: number | null) {
  return browserReferenceAtlasToken(pictId);
}

export function browserTilesetAtlasUrl(asset: TilesetAsset) {
  if (asset.imagePath && !isLegacyLocalReferencePath(asset.imagePath)) return asset.imagePath;
  return browserReferenceAtlasToken(asset.pictId);
}

export function browserReferenceIconUrl(iconId: number) {
  void iconId;
  return null;
}

export function hasBrowserReferenceAtlas(pictId: number | null) {
  return browserReferenceAtlasToken(pictId) !== null;
}

function isLegacyLocalReferencePath(value: string) {
  const normalized = value.replace(/\\/g, "/").toLowerCase();
  return normalized.startsWith("/@fs/")
    || normalized.includes("realmz scenario utility/")
    || normalized.includes("f:/realmz");
}
