import type { LibraryAsset } from "./types";

export type AuthoringLibraryCollection = "realmz-gallery" | "built-in-custom" | "excluded";

export function authoringLibraryCollection(asset: LibraryAsset): AuthoringLibraryCollection {
  const resourceType = (asset.resourceType ?? "").trim();
  const source = asset.source.toLowerCase();
  const relativePath = asset.relativePath.toLowerCase().replace(/\//g, "\\");
  const realmzSource = source.includes(":realmz:") || source.includes("realmz data") || source === "realmz";
  const divinitySource = source.includes(":divinity:") || source.includes("divinity");

  if (resourceType === "PICT" || isTextResourceType(resourceType)) return "excluded";

  if (resourceType === "cicn") {
    if (isStockSpecialLandTile(asset, relativePath)) return "realmz-gallery";
    if (realmzSource) return "realmz-gallery";
    if (!divinitySource || !isBundledCustomIconSource(relativePath)) return "excluded";
    if (asset.resourceId != null && asset.resourceId >= 10000 && asset.resourceId <= 10999) return "excluded";
    return "built-in-custom";
  }

  if (resourceType === "snd") {
    if (realmzSource) return "realmz-gallery";
    if (divinitySource && relativePath.startsWith("divinity data\\")) return "built-in-custom";
  }

  return "excluded";
}

export function isAuthoringLibraryAsset(asset: LibraryAsset) {
  return authoringLibraryCollection(asset) !== "excluded";
}

function isTextResourceType(resourceType: string) {
  return resourceType === "TEXT" || resourceType === "STR#" || resourceType === "styl";
}

function isStockSpecialLandTile(asset: LibraryAsset, relativePath: string) {
  return asset.type === "special-land-tile" || relativePath.includes("land archive");
}

function isBundledCustomIconSource(relativePath: string) {
  return relativePath.startsWith("divinity data\\monster mash") ||
    relativePath.startsWith("divinity data\\vault of arcana") ||
    relativePath.startsWith("divinity data\\bag of holding");
}
