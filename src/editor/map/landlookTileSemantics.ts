export type LandlookTileVisualCategory =
  | "water-shore"
  | "mountain-land"
  | "mountain-water"
  | "road"
  | "watercraft"
  | "forest"
  | "tree-detail"
  | "rocks"
  | "graves"
  | "buildings"
  | "terrain-prop"
  | "cave-transition"
  | "hazard"
  | "open"
  | "blank"
  | "uncertain";

export type LandlookTileVisualConfidence = "known" | "likely" | "uncertain";

export type LandlookTileVisualSemantics = {
  label: string;
  category: LandlookTileVisualCategory;
  confidence: LandlookTileVisualConfidence;
  notes?: string;
};

type SemanticRange = {
  first: number;
  last: number;
  label: string;
  category: LandlookTileVisualCategory;
  confidence?: LandlookTileVisualConfidence;
  notes?: string;
};

const PLAINS_EXACT: Record<number, LandlookTileVisualSemantics> = {
  1: { label: "Shoreline, land west", category: "water-shore", confidence: "known" },
  2: { label: "Shoreline, land east", category: "water-shore", confidence: "known" },
  3: { label: "Shoreline, land north", category: "water-shore", confidence: "known" },
  4: { label: "Shoreline, land south", category: "water-shore", confidence: "known" },
  5: { label: "Sloped shoreline, land southwest", category: "water-shore", confidence: "known", notes: "Boundary runs from top midpoint to bottom-right." },
  6: { label: "Sloped shoreline, land southwest", category: "water-shore", confidence: "known", notes: "Boundary runs from top-left to bottom midpoint." },
  7: { label: "Sloped shoreline, land southeast", category: "water-shore", confidence: "known", notes: "Boundary runs from top-right to bottom midpoint." },
  8: { label: "Sloped shoreline, land southeast", category: "water-shore", confidence: "known", notes: "Boundary runs from top midpoint to bottom-left." },
  9: { label: "Sloped shoreline, land northwest", category: "water-shore", confidence: "known", notes: "Boundary runs from bottom midpoint to top-right." },
  10: { label: "Sloped shoreline, land northwest", category: "water-shore", confidence: "known", notes: "Boundary runs from bottom-left to top midpoint." },
  11: { label: "Sloped shoreline, land northeast", category: "water-shore", confidence: "known", notes: "Boundary runs from top-left to bottom midpoint." },
  12: { label: "Sloped shoreline, land northeast", category: "water-shore", confidence: "known", notes: "Boundary runs from top midpoint to bottom-right." },
  13: { label: "Sloped shoreline, land northeast", category: "water-shore", confidence: "known", notes: "Boundary runs from top-left to right midpoint." },
  14: { label: "Sloped shoreline, land northeast", category: "water-shore", confidence: "known", notes: "Boundary runs from left midpoint to bottom-right." },
  15: { label: "Sloped shoreline, land southeast", category: "water-shore", confidence: "known", notes: "Boundary runs from bottom-left to right midpoint." },
  16: { label: "Sloped shoreline, land southeast", category: "water-shore", confidence: "known", notes: "Boundary runs from left midpoint to top-right." },
  17: { label: "Sloped shoreline, land northwest", category: "water-shore", confidence: "known", notes: "Boundary runs from bottom-left to right midpoint." },
  18: { label: "Sloped shoreline, land northwest", category: "water-shore", confidence: "known", notes: "Boundary runs from left midpoint to top-right." },
  19: { label: "Sloped shoreline, land southwest", category: "water-shore", confidence: "known", notes: "Boundary runs from top-left to right midpoint." },
  20: { label: "Sloped shoreline, land southwest", category: "water-shore", confidence: "known", notes: "Boundary runs from left midpoint to bottom-right." },
  21: { label: "Open water to narrow stream south", category: "water-shore", confidence: "known" },
  22: { label: "Open water to narrow stream west", category: "water-shore", confidence: "known" },
  23: { label: "Open water to narrow stream east", category: "water-shore", confidence: "known" },
  24: { label: "Open water to narrow stream north", category: "water-shore", confidence: "known" },
  25: { label: "Quarter water southeast", category: "water-shore", confidence: "known" },
  26: { label: "Quarter water southwest", category: "water-shore", confidence: "known" },
  27: { label: "Quarter water northeast", category: "water-shore", confidence: "known" },
  28: { label: "Quarter water northwest", category: "water-shore", confidence: "known" },
  29: { label: "Inward shoreline corner, land northeast", category: "water-shore", confidence: "known" },
  30: { label: "Inward shoreline corner, land northwest", category: "water-shore", confidence: "known" },
  31: { label: "Inward shoreline corner, land southeast", category: "water-shore", confidence: "known" },
  32: { label: "Inward shoreline corner, land southwest", category: "water-shore", confidence: "known" },
  36: { label: "Blank / unused land tile", category: "blank", confidence: "likely" },
  37: { label: "Blank / unused land tile", category: "blank", confidence: "likely" },
  61: { label: "Solid mountain", category: "mountain-land", confidence: "known", notes: "Full-looking mountain region fill tile for the Plains landlook." },
  66: { label: "Mountain to land", category: "mountain-land", confidence: "known", notes: "Runtime-solid mountain transition tile with visible grass cutout." },
  85: { label: "Mountain to land", category: "mountain-land", confidence: "known", notes: "End of the mountain-to-land atlas run." },
  86: { label: "Mountain to water", category: "mountain-water", confidence: "known", notes: "Start of the mountain-to-water atlas run." },
  93: { label: "Mountain to water", category: "mountain-water", confidence: "known", notes: "End of the mountain-to-water atlas run." },
  33: { label: "One rock in water", category: "rocks", confidence: "known", notes: "Optional decorative full-water tile." },
  34: { label: "Two rocks in water", category: "rocks", confidence: "known", notes: "Optional decorative full-water tile." },
  35: { label: "Several rocks in water", category: "rocks", confidence: "known", notes: "Optional decorative full-water tile." },
  38: { label: "Narrow stream north/south", category: "water-shore", confidence: "known" },
  39: { label: "Narrow stream east/west", category: "water-shore", confidence: "known" },
  40: { label: "Narrow stream to land, land south", category: "water-shore", confidence: "known" },
  41: { label: "Narrow stream to land, land west", category: "water-shore", confidence: "known" },
  42: { label: "Narrow stream to land, land north", category: "water-shore", confidence: "known" },
  43: { label: "Narrow stream to land, land east", category: "water-shore", confidence: "known" },
  44: { label: "Narrow stream trifork north/west/east", category: "water-shore", confidence: "known", notes: "Land transition is south." },
  45: { label: "Narrow stream trifork north/east/south", category: "water-shore", confidence: "known", notes: "Land transition is west." },
  46: { label: "Narrow stream trifork west/south/east", category: "water-shore", confidence: "known", notes: "Land transition is north." },
  47: { label: "Narrow stream trifork north/west/south", category: "water-shore", confidence: "known", notes: "Land transition is east." },
  48: { label: "Narrow stream bend south/east", category: "water-shore", confidence: "known" },
  49: { label: "Narrow stream bend south/west", category: "water-shore", confidence: "known" },
  50: { label: "Narrow stream bend north/east", category: "water-shore", confidence: "known" },
  51: { label: "Narrow stream bend north/west", category: "water-shore", confidence: "known" },
  52: { label: "Grave", category: "graves", confidence: "known" },
  53: { label: "Grave", category: "graves", confidence: "known" },
  54: { label: "Grave", category: "graves", confidence: "known" },
  55: { label: "Solid cobblestones", category: "road", confidence: "known" },
  56: { label: "Single-tile island in water", category: "terrain-prop", confidence: "known" },
  57: { label: "Single-tile island in water", category: "terrain-prop", confidence: "known" },
  58: { label: "Single-tile island in water", category: "terrain-prop", confidence: "known" },
  59: { label: "Single-tile island in water", category: "terrain-prop", confidence: "known" },
  60: { label: "Full water", category: "water-shore", confidence: "known", notes: "Normal full-water center tile." },
  105: { label: "Stream to cave, cave west", category: "cave-transition", confidence: "known" },
  106: { label: "Stream to cave, cave east", category: "cave-transition", confidence: "known" },
  107: { label: "Stream to cave, cave south", category: "cave-transition", confidence: "known" },
  108: { label: "Stream to cave, cave north", category: "cave-transition", confidence: "known" },
  109: { label: "Land to cave, cave east", category: "cave-transition", confidence: "known" },
  110: { label: "Land to cave, cave west", category: "cave-transition", confidence: "known" },
  111: { label: "Land to cave, cave south", category: "cave-transition", confidence: "known" },
  112: { label: "Land to cave, cave north", category: "cave-transition", confidence: "known" },
  147: { label: "Boat", category: "watercraft", confidence: "known", notes: "Realmz mapstats marks this as boat-required movement." },
  148: { label: "Well / small landmark", category: "terrain-prop", confidence: "uncertain" },
  149: { label: "Fallen log", category: "terrain-prop", confidence: "likely" },
  168: { label: "Blank / unused land tile", category: "blank", confidence: "likely" },
  169: { label: "Hidden walkable path", category: "road", confidence: "known", notes: "Divinity marks this stock path tile with the hidden-walkable symbol." },
  180: { label: "Hidden walkable path segment", category: "road", confidence: "known", notes: "Divinity marks stock tiles 180-185 with the hidden-walkable symbol." },
  181: { label: "Hidden walkable path segment", category: "road", confidence: "known", notes: "Divinity marks stock tiles 180-185 with the hidden-walkable symbol." },
  182: { label: "Hidden walkable path segment", category: "road", confidence: "known", notes: "Divinity marks stock tiles 180-185 with the hidden-walkable symbol." },
  183: { label: "Hidden walkable path segment", category: "road", confidence: "known", notes: "Divinity marks stock tiles 180-185 with the hidden-walkable symbol." },
  184: { label: "Hidden walkable path segment", category: "road", confidence: "known", notes: "Divinity marks stock tiles 180-185 with the hidden-walkable symbol." },
  185: { label: "Hidden walkable path segment", category: "road", confidence: "known", notes: "Divinity marks stock tiles 180-185 with the hidden-walkable symbol." }
};

const PLAINS_RANGES: SemanticRange[] = [
  { first: 1, last: 35, label: "Water and shore transition", category: "water-shore", confidence: "likely" },
  { first: 38, last: 60, label: "Water and shore transition", category: "water-shore", confidence: "likely" },
  { first: 61, last: 85, label: "Mountain to land", category: "mountain-land", confidence: "known" },
  { first: 86, last: 93, label: "Mountain to water", category: "mountain-water", confidence: "known" },
  { first: 94, last: 104, label: "Road / wall transition", category: "road", confidence: "likely" },
  { first: 105, last: 112, label: "Terrain edge transition", category: "uncertain", confidence: "uncertain" },
  { first: 113, last: 114, label: "Gate / structure", category: "buildings", confidence: "likely" },
  { first: 115, last: 117, label: "Fire / hazard", category: "hazard", confidence: "likely" },
  { first: 118, last: 129, label: "Forest transition", category: "forest", confidence: "likely", notes: "Primary contiguous forest tiles used by the smart forest brush." },
  { first: 130, last: 146, label: "Road / bridge / path art", category: "road", confidence: "likely", notes: "Visual road art is distinct from Realmz's runtime path flag." },
  { first: 150, last: 154, label: "Tree detail", category: "tree-detail", confidence: "known", notes: "Decorative tree/detail pieces, not contiguous smart-forest fill tiles." },
  { first: 155, last: 158, label: "Open land / clear terrain", category: "open", confidence: "known" },
  { first: 159, last: 167, label: "Rocks / rubble / terrain prop", category: "rocks", confidence: "known" },
  { first: 170, last: 179, label: "Large structure / landmark piece", category: "buildings", confidence: "likely" },
  { first: 180, last: 183, label: "Large structure / terrain piece", category: "buildings", confidence: "uncertain" },
  { first: 184, last: 185, label: "Structure / bridge segment", category: "buildings", confidence: "likely" },
  { first: 186, last: 186, label: "Small building / landmark", category: "buildings", confidence: "likely" },
  { first: 187, last: 189, label: "Graves / graveyard", category: "graves", confidence: "known" },
  { first: 190, last: 200, label: "House / settlement building", category: "buildings", confidence: "known" }
];

type LandlookVisualProfile = {
  exact?: Record<number, LandlookTileVisualSemantics>;
  ranges?: SemanticRange[];
};

const STANDARD_LANDLOOK_VISUAL_PROFILES: Record<number, LandlookVisualProfile> = {
  0: { exact: PLAINS_EXACT, ranges: PLAINS_RANGES },
  2: { exact: PLAINS_EXACT, ranges: PLAINS_RANGES },
  3: {
    exact: {
      ...PLAINS_EXACT,
      61: { label: "Solid cave wall", category: "mountain-land", confidence: "likely", notes: "Subterranean atlas slot aligned with the Plains mountain fill family." },
      147: { label: "Boat / raft", category: "watercraft", confidence: "known" }
    },
    ranges: relabelRanges(PLAINS_RANGES, {
      "water-shore": "Underground water / shore",
      "mountain-land": "Cave wall to floor",
      "mountain-water": "Cave wall to water",
      "road": "Cavern path / bridge art",
      "forest": "Underground growth transition",
      "tree-detail": "Underground growth detail",
      "rocks": "Cave rocks / rubble",
      "buildings": "Underground structures"
    })
  },
  4: {
    exact: {
      ...PLAINS_EXACT,
      61: { label: "Solid masonry / wall fill", category: "mountain-land", confidence: "likely", notes: "Castle atlas slot aligned with the terrain-wall family, not literal mountains." },
      147: { label: "Moat boat / watercraft", category: "watercraft", confidence: "known" }
    },
    ranges: relabelRanges(PLAINS_RANGES, {
      "water-shore": "Moat / water transition",
      "mountain-land": "Masonry wall to floor",
      "mountain-water": "Masonry wall to water",
      "road": "Castle road / wall art",
      "forest": "Courtyard vegetation transition",
      "tree-detail": "Courtyard vegetation detail",
      "rocks": "Stone rubble / courtyard prop",
      "graves": "Tomb / memorial tiles",
      "buildings": "Castle structures"
    })
  },
  5: {
    exact: {
      ...PLAINS_EXACT,
      61: { label: "Solid desert ridge", category: "mountain-land", confidence: "likely", notes: "Desert atlas slot aligned with the mountain/ridge fill family." },
      147: { label: "Desert boat / watercraft", category: "watercraft", confidence: "known" }
    },
    ranges: relabelRanges(PLAINS_RANGES, {
      "water-shore": "Oasis / shore transition",
      "mountain-land": "Rock / dune to sand",
      "mountain-water": "Rock / dune to water",
      "road": "Desert road / trail art",
      "forest": "Desert scrub transition",
      "tree-detail": "Desert scrub detail",
      "rocks": "Desert rocks / rubble",
      "buildings": "Desert structures"
    })
  },
  9: {
    exact: {
      ...PLAINS_EXACT,
      61: { label: "Solid bog bank", category: "mountain-land", confidence: "likely", notes: "Swamp atlas slot aligned with the raised-terrain fill family." },
      147: { label: "Swamp boat / skiff", category: "watercraft", confidence: "known" }
    },
    ranges: relabelRanges(PLAINS_RANGES, {
      "water-shore": "Swamp water / bog shore",
      "mountain-land": "Bog bank to ground",
      "mountain-water": "Bog bank to water",
      "road": "Swamp path / bridge art",
      "forest": "Swamp tree transition",
      "tree-detail": "Swamp tree detail",
      "rocks": "Swamp rocks / muck prop",
      "buildings": "Swamp structures"
    })
  },
  10: {
    exact: {
      ...PLAINS_EXACT,
      61: { label: "Solid snowy ridge", category: "mountain-land", confidence: "likely", notes: "Snow atlas slot aligned with the mountain/ridge fill family." },
      147: { label: "Snow boat / watercraft", category: "watercraft", confidence: "known" }
    },
    ranges: relabelRanges(PLAINS_RANGES, {
      "water-shore": "Ice / water transition",
      "mountain-land": "Snowy ridge to snow",
      "mountain-water": "Snowy ridge to water",
      "road": "Snow road / trail art",
      "forest": "Snow forest transition",
      "tree-detail": "Snow tree detail",
      "rocks": "Snow rocks / rubble",
      "buildings": "Snow structures"
    })
  }
};

export function landlookTileVisualSemantics(tile: number, landlook?: number | null): LandlookTileVisualSemantics | null {
  const profile = STANDARD_LANDLOOK_VISUAL_PROFILES[landlook ?? 0] ?? STANDARD_LANDLOOK_VISUAL_PROFILES[0];
  const exact = profile.exact?.[tile];
  if (exact) return exact;
  const range = (profile.ranges ?? PLAINS_RANGES).find((entry) => tile >= entry.first && tile <= entry.last);
  if (!range) return null;
  return {
    label: range.label,
    category: range.category,
    confidence: range.confidence ?? "likely",
    notes: range.notes
  };
}

function relabelRanges(ranges: SemanticRange[], labels: Partial<Record<LandlookTileVisualCategory, string>>) {
  return ranges.map((range) => ({
    ...range,
    label: labels[range.category] ?? range.label
  }));
}

export function landlookVisualCategoryLabel(category: LandlookTileVisualCategory, landlook?: number | null) {
  const profile = STANDARD_LANDLOOK_VISUAL_PROFILES[landlook ?? -1];
  const rangeLabel = profile?.ranges?.find((range) => range.category === category)?.label;
  if (rangeLabel) return rangeLabel;
  switch (category) {
    case "water-shore": return "Water / shore";
    case "mountain-land": return "Mountain to land";
    case "mountain-water": return "Mountain to water";
    case "road": return "Road / path art";
    case "watercraft": return "Boat / watercraft";
    case "forest": return "Forest transition";
    case "tree-detail": return "Tree detail";
    case "rocks": return "Rocks / rubble";
    case "graves": return "Graves";
    case "buildings": return "Buildings";
    case "terrain-prop": return "Terrain prop";
    case "cave-transition": return "Cave transition";
    case "hazard": return "Hazard / ruin";
    case "open": return "Open land";
    case "blank": return "Blank / unused";
    case "uncertain": return "Uncertain";
    default: return category;
  }
}
