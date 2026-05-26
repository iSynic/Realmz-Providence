import { normalizeAtlasTile, normalizeIconId, normalizeTile } from "./renderValues";
import { TilesetAsset } from "../types";

export type TileValueKind =
  | "standard-atlas"
  | "dungeon-bitfield"
  | "special-negative"
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
  flags: {
    markerBit: boolean;
    pathBit: boolean;
    noteBit: boolean;
  };
  compatibility: string;
};

export function classifyTileValue(tile: number, tileset: TilesetAsset | null): TileValueMetadata {
  const normalized = normalizeTile(tile);
  const baseTile = tileset?.baseTile ?? 1;
  const renderTile = normalizeAtlasTile(tile, baseTile);
  const capacity = tileset ? Math.max(0, tileset.columns * tileset.rows) : 0;
  const isDungeon = Boolean(tileset && (tileset.id === "dungeon-top-down-302" || tileset.pictId === 302));
  const iconId = normalizeIconId(tile);
  const markerBit = Math.abs(tile) >= 1000;
  const pathBit = Boolean(tile & 4);
  const noteBit = Boolean(tile & 2);
  const canRenderFromAtlas = Boolean(tileset?.available && tileset.imagePath && capacity > 0);

  let kind: TileValueKind = "unknown";
  let label = `Tile ${tile}`;
  let compatibility = "Raw tile value is preserved.";

  if (isDungeon) {
    kind = "dungeon-bitfield";
    label = `Dungeon cell ${tile}`;
    compatibility = "Dungeon values are bitfields rendered through the dungeon atlas.";
  } else if (markerBit) {
    kind = "marker-bit";
    label = `Marked tile ${tile}`;
    compatibility = "Realmz marker bits are preserved while rendering from the normalized base tile.";
  } else if (tile < 0) {
    kind = "special-negative";
    label = `Special tile ${tile}`;
    compatibility = iconId != null
      ? "Negative values may reference icon-backed or special land tile overlays."
      : "Special negative tile value is preserved.";
  } else if (capacity > 0 && tile >= 1 && tile <= capacity) {
    kind = "standard-atlas";
    label = `Landlook tile ${tile}`;
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
    flags: { markerBit, pathBit, noteBit },
    compatibility
  };
}

export function standardTileValues(tileset: TilesetAsset | null) {
  const capacity = tileset ? Math.max(0, tileset.columns * tileset.rows) : 0;
  if (capacity <= 0) return [];
  return Array.from({ length: capacity }, (_, index) => index + 1);
}
