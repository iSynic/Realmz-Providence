import { atlasBaseTile, normalizeAtlasTile, normalizeIconId, normalizeTile, tileIconCandidates } from "./renderValues";
import { LandlookTileVisualSemantics, landlookTileVisualSemantics } from "./landlookTileSemantics";
import { IconEntry, TileAttributeFlag, TileAttributeProfile, TileRenderResolution, TilesetAsset } from "../types";

export type TileValueKind =
  | "standard-atlas"
  | "dungeon-bitfield"
  | "special-negative"
  | "special-positive"
  | "marker-bit"
  | "path-bit"
  | "raw-preserved"
  | "unknown";

export type TileValueMetadata = {
  raw: number;
  normalized: number;
  renderTile: number;
  kind: TileValueKind;
  label: string;
  atlasAvailable: boolean;
  iconId: number | null;
  iconCandidates: number[];
  iconAvailable: boolean;
  attributes: TileAttributeProfile | null;
  attributeFlags: TileAttributeFlag[];
  visual: LandlookTileVisualSemantics | null;
  flags: {
    markerBit: boolean;
    pathBit: boolean;
    noteBit: boolean;
  };
  compatibility: string;
};

export type MapFieldValueProfile = TileValueMetadata;

export function classifyTileValue(
  tile: number,
  tileset: TilesetAsset | null,
  attributes: TileAttributeProfile[] = [],
  icons?: Record<number, IconEntry>
): TileValueMetadata {
  const normalized = normalizeTile(tile);
  const baseTile = atlasBaseTile(tileset?.baseTile, tileset?.custom);
  const renderTile = normalizeAtlasTile(tile, baseTile);
  const capacity = tileset ? Math.max(0, tileset.columns * tileset.rows) : 0;
  const isDungeon = Boolean(tileset && (tileset.id === "dungeon-top-down-302" || tileset.pictId === 302));
  const iconId = normalizeIconId(tile);
  const iconCandidates = tileIconCandidates(tile);
  const iconAvailable = iconCandidates.some((candidate) => Boolean(icons?.[candidate]?.image));
  const markerBit = tile > 999;
  const pathBit = tile > 0 && Boolean(tile & 4);
  const noteBit = tile > 0 && Boolean(tile & 2);
  const canRenderFromAtlas = Boolean(tileset?.available && tileset.imagePath && capacity > 0);
  const attribute = attributeProfileForTile(tile, tileset, attributes);
  const attributeFlags = tileAttributeGroup(attribute, tile, tileset);
  const visual = !isDungeon && tile > 0 ? landlookTileVisualSemantics(renderTile, tileset?.landlook ?? null) : null;

  let kind: TileValueKind = "unknown";
  let label = `Tile ${tile}`;
  let compatibility = "Raw tile value is preserved.";

  if (isDungeon) {
    kind = "dungeon-bitfield";
    label = `Dungeon cell ${tile}`;
    compatibility = "Dungeon values are bitfields rendered through the dungeon atlas.";
  } else if (tile < 0) {
    kind = "special-negative";
    label = `Special tile ${tile}`;
    compatibility = iconId != null
      ? "Negative values may reference icon-backed or special land tile overlays."
      : "Special negative tile value is preserved.";
  } else if (iconCandidates.length > 0) {
    kind = "special-positive";
    label = `Icon tile ${tile}`;
    compatibility = "Realmz renders positive values above 200 as landlook base terrain with a cicn/icon overlay.";
  } else if (markerBit) {
    kind = "marker-bit";
    label = `Marked tile ${tile}`;
    compatibility = "Positive thousand-band Realmz field state is preserved while rendering from the normalized base tile.";
  } else if (capacity > 0 && tile >= 1 && tile <= capacity) {
    kind = "standard-atlas";
    label = visual ? `${visual.label} (tile ${tile})` : `Landlook tile ${tile}`;
    compatibility = "Standard Realmz landlook atlas tile.";
  } else if (pathBit) {
    kind = "path-bit";
    label = `Flagged tile ${tile}`;
    compatibility = "Path/flag bits are preserved; rendering uses the normalized tile.";
  } else if (tile === 0 || tile > capacity) {
    kind = "raw-preserved";
    label = `Raw tile ${tile}`;
    compatibility = "Outside the normal visible atlas range; Providence preserves the raw value.";
  }

  return {
    raw: tile,
    normalized,
    renderTile,
    kind,
    label,
    atlasAvailable: canRenderFromAtlas,
    iconId,
    iconCandidates,
    iconAvailable,
    attributes: attribute,
    attributeFlags,
    visual,
    flags: { markerBit, pathBit, noteBit },
    compatibility
  };
}

export function standardTileValues(tileset: TilesetAsset | null) {
  const capacity = tileset ? Math.max(0, tileset.columns * tileset.rows) : 0;
  if (capacity <= 0) return [];
  return Array.from({ length: capacity }, (_, index) => index + 1);
}

export function resolveTileRender(
  tile: number,
  tileset: TilesetAsset | null,
  attributes: TileAttributeProfile[] = [],
  icons?: Record<number, IconEntry>
): TileRenderResolution {
  const baseTile = atlasBaseTile(tileset?.baseTile, tileset?.custom);
  const terrainTile = normalizeAtlasTile(tile, baseTile);
  const iconCandidates = tileIconCandidates(tile);
  const iconId = iconCandidates.find((candidate) => Boolean(icons?.[candidate]?.image)) ?? iconCandidates[0] ?? null;
  const iconAvailable = iconId !== null && Boolean(icons?.[iconId]?.image);
  const attribute = attributeProfileForTile(tile, tileset, attributes);
  return {
    raw: tile,
    terrainTile,
    iconCandidates,
    iconId,
    iconAvailable,
    fallbackReason: iconCandidates.length > 0 && !iconAvailable
      ? tile > 200
        ? "Positive Realmz map overlay value has no loaded scenario/project cicn; rendering base terrain only."
        : "Missing cicn/icon preview for this special tile value."
      : null,
    confidence: attribute?.confidence ?? (iconCandidates.length > 0 ? "preserved" : "unknown")
  };
}

export function attributeProfileForTile(tile: number, tileset: TilesetAsset | null, attributes: TileAttributeProfile[] = []) {
  if (tile < 0) {
    const specialIndex = Math.abs(normalizeIconId(tile) ?? tile);
    return attributes.find((profile) =>
      tileAttributeSourceKind(profile) === "data-solids" &&
      profile.tile === specialIndex
    ) ?? null;
  }
  const normalized = normalizeAtlasTile(tile, atlasBaseTile(tileset?.baseTile, tileset?.custom));
  const landlook = tileset?.landlook ?? null;
  return attributes.find((profile) =>
    profile.tile === normalized &&
    tileAttributeSourceKind(profile) === "mapstats" &&
    profile.landlook === landlook
  ) ?? attributes.find((profile) =>
    profile.tile === normalized &&
    tileAttributeSourceKind(profile) !== "data-solids" &&
    (profile.landlook === landlook || profile.landlook === null)
  ) ?? null;
}

function tileAttributeSourceKind(profile: TileAttributeProfile) {
  return profile.sourceKind ?? (profile.source === "Data Solids" ? "data-solids" : "unknown");
}

export function tileAttributeGroup(profile: TileAttributeProfile | null, tile: number, tileset: TilesetAsset | null = null): TileAttributeFlag[] {
  if (tile < 0) {
    const flags: TileAttributeFlag[] = ["special-icon"];
    if (profile?.flags.includes("solid")) flags.push("solid");
    return flags;
  }
  const flags = profile?.flags.length ? [...profile.flags] : ["unknown-metadata" as TileAttributeFlag];
  if (tileIconCandidates(tile).length > 0 && !flags.includes("special-icon")) {
    flags.push("special-icon");
  }
  if (isDivinityVisualPathTile(tile, tileset) && !flags.includes("path")) {
    flags.push("visual-path");
  }
  return flags;
}

export function isDivinityVisualPathTile(tile: number, tileset: TilesetAsset | null = null) {
  if (tile < 0) return false;
  const normalized = normalizeAtlasTile(tile, atlasBaseTile(tileset?.baseTile, tileset?.custom));
  return normalized >= 132 && normalized <= 146;
}
