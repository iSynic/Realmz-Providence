import { TilesetAsset } from "../types";

export const BROWSER_REFERENCE_PICTURES_DEV_URL =
  "/@fs/F:/Realmz Scenario Utility/assets/realmz/resources/pictures";
export const BROWSER_REFERENCE_ICONS_DEV_URL =
  "/@fs/F:/Realmz Scenario Utility/assets/realmz/resources/icons";

const KNOWN_REFERENCE_PICTS = new Set([300, 302, 303, 304, 305, 309, 310]);

export function browserReferenceAtlasUrl(pictId: number | null) {
  if (pictId === null || !KNOWN_REFERENCE_PICTS.has(pictId)) return null;
  return encodeURI(`${BROWSER_REFERENCE_PICTURES_DEV_URL}/picture_${pictId}.png`);
}

export function browserTilesetAtlasUrl(asset: TilesetAsset) {
  return asset.imagePath ?? browserReferenceAtlasUrl(asset.pictId);
}

export function browserReferenceIconUrl(iconId: number) {
  return encodeURI(`${BROWSER_REFERENCE_ICONS_DEV_URL}/icon_${iconId}.png`);
}

export function hasBrowserReferenceAtlas(pictId: number | null) {
  return browserReferenceAtlasUrl(pictId) !== null;
}
