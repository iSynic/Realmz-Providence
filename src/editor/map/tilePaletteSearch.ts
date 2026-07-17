import { IconEntry, TileAttributeProfile, TilesetAsset } from "../types";
import { landlookVisualCategoryLabel } from "./landlookTileSemantics";
import { namedLandTileVariants, SCENARIO_SEED_NAMED_TILE_NAMES } from "./namedLandTiles";
import { classifyTileValue } from "./tileMetadata";

export function tileMatchesPaletteQuery(
  tile: number,
  query: string,
  tileset: TilesetAsset | null,
  attributes: TileAttributeProfile[] = [],
  icons?: Record<number, IconEntry>
) {
  const terms = searchTerms(query);
  if (terms.length === 0) return true;
  const searchable = tilePaletteSearchText(tile, tileset, attributes, icons);
  return terms.every((term) => searchable.includes(term));
}

export function tilePaletteSearchText(
  tile: number,
  tileset: TilesetAsset | null,
  attributes: TileAttributeProfile[] = [],
  icons?: Record<number, IconEntry>
) {
  const metadata = classifyTileValue(tile, tileset, attributes, icons);
  const visual = metadata.visual;
  const aliases = tileset
    ? SCENARIO_SEED_NAMED_TILE_NAMES.filter((name) => namedLandTileVariants(tileset.landlook, name).includes(metadata.renderTile))
    : [];
  return normalizeSearchText([
    tile,
    metadata.normalized,
    metadata.renderTile,
    metadata.label,
    metadata.kind,
    visual?.label,
    visual?.category,
    visual ? landlookVisualCategoryLabel(visual.category, tileset?.landlook) : null,
    visual?.notes,
    ...metadata.attributeFlags,
    ...aliases
  ].filter((value): value is string | number => value !== null && value !== undefined).join(" "));
}

function searchTerms(query: string) {
  return normalizeSearchText(query).split(" ").filter(Boolean);
}

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
