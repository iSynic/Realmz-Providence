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
};

const PLAINS_HIDDEN_WALKABLE_EXACT: Record<number, LandlookTileVisualSemantics> = {
  169: { label: "Hidden walkable path", category: "road", confidence: "known", notes: "Divinity marks this Plains path tile with the hidden-walkable symbol." },
  180: { label: "Combat-clearing structure", category: "buildings", confidence: "known", notes: "Solid during land exploration; its Realmz combat build expands entirely into non-solid ground." },
  181: { label: "Combat-clearing structure", category: "buildings", confidence: "known", notes: "Solid during land exploration; its Realmz combat build expands entirely into non-solid ground." },
  182: { label: "Combat-clearing structure", category: "buildings", confidence: "known", notes: "Solid during land exploration; its Realmz combat build expands entirely into non-solid ground." },
  183: { label: "Combat-clearing structure", category: "buildings", confidence: "known", notes: "Solid during land exploration; its Realmz combat build expands entirely into non-solid ground." },
  184: { label: "Combat-clearing structure", category: "buildings", confidence: "known", notes: "Solid during land exploration; its Realmz combat build expands entirely into non-solid ground." },
  185: { label: "Combat-clearing structure", category: "buildings", confidence: "known", notes: "Solid during land exploration; its Realmz combat build expands entirely into non-solid ground." }
};

const CASTLE_WALL_EXACT: Record<number, LandlookTileVisualSemantics> = {
  1: { label: "Straight north-south gray wall", category: "buildings", confidence: "known", notes: "Gray brick wall with north-south continuity; land west and east." },
  2: { label: "South-facing east-west gray wall", category: "buildings", confidence: "known", notes: "Gray brick wall with east-west continuity; land north. The projected south-facing brick facade extends through the southern part of the tile." },
  3: { label: "Gray wall to southeast thick wall", category: "buildings", confidence: "known", notes: "Gray wall runs north-south and branches east from the center into thick red/black wall in the southeast. Land west with a small northeast corner pocket." },
  4: { label: "Gray wall to southwest thick wall", category: "buildings", confidence: "known", notes: "Gray wall runs north-south and branches west from the center into thick red/black wall in the southwest. Land east with a small northwest corner pocket." },
  5: { label: "Gray wall with southwest thick-wall junction", category: "buildings", confidence: "known", notes: "Gray wall runs north-south and branches west from the center into thick red/black wall in the southwest. Land west with a small northwest corner pocket." },
  6: { label: "Gray wall with southwest room corner", category: "buildings", confidence: "known", notes: "Gray north-south wall with red/black rock in the small northwest corner; the southwest corner is the northeast corner of a room. Land east." },
  7: { label: "East-facing wall lever", category: "buildings", confidence: "known", notes: "Gray north-south wall facing east with a lever or switch slot at the east midpoint. Land east and west." },
  8: { label: "South-facing wall lever", category: "buildings", confidence: "known", notes: "Gray east-west wall facing south with a lever or switch slot at the south midpoint. Land north." },
  9: { label: "East-facing wall torch", category: "buildings", confidence: "known", notes: "Gray north-south wall facing east with a torch at the east midpoint. Land east and west." },
  10: { label: "South-facing wall torch", category: "buildings", confidence: "known", notes: "Gray east-west wall facing south with a torch at the south midpoint. Land north." },
  11: { label: "Gray southeast wall junction", category: "buildings", confidence: "known", notes: "Topology matches tile 3, but a south-facing east-west gray wall occupies the southeast corner instead of thick red/black wall. Land west with a small northeast corner pocket." },
  12: { label: "Gray southwest wall junction", category: "buildings", confidence: "known", notes: "Topology matches tile 4, but a south-facing east-west gray wall occupies the southwest corner instead of thick red/black wall. Land east with a small northwest corner pocket." },
  13: { label: "Gray north-east wall corner", category: "buildings", confidence: "known", notes: "Gray wall runs from the north midpoint to center, then from center to the east midpoint. South-facing wall perspective; land west with a small northeast corner pocket." },
  14: { label: "Gray north-west wall corner", category: "buildings", confidence: "known", notes: "Horizontal mirror of tile 13: wall runs from the north midpoint to center, then west. South-facing wall perspective; land east with a small northwest corner pocket." },
  15: { label: "Gray south-east wall corner", category: "buildings", confidence: "known", notes: "Gray wall runs from the south midpoint to center, then east. South-facing wall perspective; land north and west." },
  16: { label: "Gray south-west wall corner", category: "buildings", confidence: "known", notes: "Horizontal mirror of tile 15: wall runs from the south midpoint to center, then west. South-facing wall perspective; land north and east." },
  17: { label: "Gray north-east-west wall junction", category: "buildings", confidence: "known", notes: "Three-way wall with continuity north, east, and west. South-facing wall perspective; land in small northwest and northeast corner pockets." },
  18: { label: "Gray east-west-south wall junction", category: "buildings", confidence: "known", notes: "South-facing gray east-west wall with continuity east, west, and south. Land north." },
  19: { label: "Gray four-way wall junction", category: "buildings", confidence: "known", notes: "Cross wall with north, east, south, and west continuity. South-facing wall perspective; land in small northwest and northeast corner pockets." },
  20: { label: "South end-cap for north-south gray wall", category: "buildings", confidence: "known", notes: "Wall connects north and terminates south; the expected southern neighbor is land. Land east and west. Perspective masonry reaches the south edge despite not continuing south." },
  21: { label: "West end-cap for east-west gray wall", category: "buildings", confidence: "known", notes: "South-facing wall extends from the east midpoint to center and terminates west. Land north and west; projected facade may extend to the tile edge without logical continuity." },
  22: { label: "North end-cap for north-south gray wall", category: "buildings", confidence: "known", notes: "Wall connects south and terminates north. Land west, north, and east; the oblique projection emphasizes the east side of the wall." },
  23: { label: "East end-cap for east-west gray wall", category: "buildings", confidence: "known", notes: "Horizontal mirror of tile 21: south-facing wall extends from the west midpoint to center and terminates east. Land north and east." },
  24: { label: "Thick wall west, land east", category: "buildings", confidence: "known", notes: "Thick red/black wall region west with a gray east-facing boundary and land east. Wall continuity north, south, and west." },
  25: { label: "Thick wall north, land south", category: "buildings", confidence: "known", notes: "Thick red/black wall region north with a gray south-facing boundary and land south. Wall continuity north, east, and west." },
  26: { label: "Northwest land pocket with southwest wall", category: "buildings", confidence: "known", notes: "Based on tile 24, but land is limited to a small northwest corner pocket and a south-facing east-west gray wall occupies the southwest corner." },
  27: { label: "Northeast land pocket with southeast wall", category: "buildings", confidence: "known", notes: "Horizontal mirror of tile 26: land is limited to a small northeast corner pocket and a south-facing east-west gray wall occupies the southeast corner." },
  28: { label: "Thick wall northeast, land southwest", category: "buildings", confidence: "known", notes: "Thick red/black northeast outside corner with gray west- and south-facing boundaries. Land southwest; wall continuity north and east." },
  29: { label: "Thick wall northwest, land southeast", category: "buildings", confidence: "known", notes: "Horizontal mirror of tile 28: thick red/black northwest outside corner with gray east- and south-facing boundaries. Land southeast; wall continuity north and west." },
  30: { label: "Thick wall southeast, land northwest", category: "buildings", confidence: "known", notes: "Thick red/black southeast outside corner with gray north- and west-facing boundaries. Land northwest; wall continuity south and east." },
  31: { label: "Thick wall southwest, land northeast", category: "buildings", confidence: "known", notes: "Thick red/black southwest outside corner with gray north- and east-facing boundaries. Land northeast; wall continuity south and west." },
  32: { label: "Thick wall south with north junction", category: "buildings", confidence: "known", notes: "Thick red/black wall fills the bottom half. Gray wall continuity west, east, and north." },
  33: { label: "Thick wall north with south junction", category: "buildings", confidence: "known", notes: "Vertical counterpart of tile 32: thick red/black wall fills the top half with gray wall continuity west, east, and south. South-facing projection shows wall rather than floor in the southwest and southeast corners." },
  34: { label: "Southwest thick wall with northeast pocket", category: "buildings", confidence: "known", notes: "Thick red/black wall southwest meets gray walls with north and east continuity. Land in a small northeast corner pocket." },
  35: { label: "Southeast thick wall with northwest pocket", category: "buildings", confidence: "known", notes: "Horizontal mirror of tile 34: thick red/black wall southeast meets gray walls with north and west continuity. Land in a small northwest corner pocket." },
  36: { label: "Northwest thick wall with projected southeast face", category: "buildings", confidence: "known", notes: "Vertical counterpart of tile 34: thick red/black wall northwest meets gray walls with south and east continuity. South-facing projection shows wall in the southeast corner instead of floor." },
  37: { label: "Northeast thick wall with projected southwest face", category: "buildings", confidence: "known", notes: "Horizontal mirror of tile 36: thick red/black wall northeast meets gray walls with south and west continuity. South-facing projection shows wall in the southwest corner instead of floor." },
  38: { label: "Deep thick wall south, land north", category: "buildings", confidence: "known", notes: "Thick red/black wall region south with a gray north-facing boundary and land north; a deeper projected variant of the south wall boundary." },
  39: { label: "Deep thick wall east, land west", category: "buildings", confidence: "known", notes: "Thick red/black wall region east with a gray west-facing boundary and land west; a deeper projected wall variant." },
  40: { label: "Solid thick red-black wall", category: "buildings", confidence: "known", notes: "Solid thick red/black outer-wall fill with no land. Perspective filler may touch tile edges without indicating a traversable connection." }
};

const CASTLE_FEATURE_EXACT: Record<number, LandlookTileVisualSemantics> = {
  66: { label: "Mirrored masonry wall transition", category: "buildings", confidence: "known", notes: "Horizontal mirror of Castle tile 49. Realmz marks the tile solid and line-of-sight blocking." },
  67: { label: "Pure white tile", category: "blank", confidence: "known", notes: "Pure white atlas tile, probably not intended for scenario authoring despite having walkable runtime metadata." },
  68: { label: "Pit", category: "hazard", confidence: "known", notes: "Pit terrain. Realmz requires flight or floating movement." },
  69: { label: "Stairway descending underground", category: "buildings", confidence: "known", notes: "Gray masonry stairway descending into the ground. Realmz marks the tile walkable." },
  70: { label: "Dark acid pit", category: "hazard", confidence: "known", notes: "Dark pit with acid at the bottom. Realmz requires flight or floating movement." },
  71: { label: "Lava", category: "hazard", confidence: "known", notes: "Lava hazard requiring special movement or flight." },
  72: { label: "Acid pool", category: "hazard", confidence: "likely", notes: "Green liquid hazard, likely acid. It uses the same restricted movement behavior as lava." },
  73: { label: "Shallow water", category: "water-shore", confidence: "known", notes: "Shallow blue water that Realmz marks normally walkable." },
  74: { label: "North-south portcullis passage", category: "buildings", confidence: "known", notes: "Walk-through masonry passage running north-south with a portcullis. Walkable, but blocks line of sight." },
  75: { label: "East-west portcullis passage", category: "buildings", confidence: "known", notes: "Walk-through masonry passage running east-west with a portcullis. Walkable, but blocks line of sight." },
  76: { label: "North-south wooden-door passage", category: "buildings", confidence: "known", notes: "Walk-through masonry passage running north-south with a wooden door. Walkable, but blocks line of sight." },
  77: { label: "East-west wooden-door passage", category: "buildings", confidence: "known", notes: "Walk-through masonry passage running east-west with a wooden door. Walkable, but blocks line of sight." },
  78: { label: "Red rug center", category: "terrain-prop", confidence: "known", notes: "Center fill for the red rug family." },
  79: { label: "Red rug northwest outside edge", category: "terrain-prop", confidence: "known", notes: "Northwest rug tile with gold embroidery on the outside left and top edges." },
  80: { label: "Red rug northwest inside corner", category: "terrain-prop", confidence: "known", notes: "Northwest rug tile with gold embroidery on the inside bottom and right corners." },
  81: { label: "Red rug southwest outside corner", category: "terrain-prop", confidence: "known", notes: "Southwest outside rug corner with gold embroidery on the left and bottom edges." },
  82: { label: "Red rug southwest inside corner", category: "terrain-prop", confidence: "known", notes: "Southwest inside rug corner with gold embroidery on the top and right edges." },
  83: { label: "Red rug southeast outside corner", category: "terrain-prop", confidence: "known", notes: "Southeast outside rug corner with gold embroidery on the right and bottom edges." },
  84: { label: "Red rug southeast inside corner", category: "terrain-prop", confidence: "known", notes: "Southeast inside rug corner with gold embroidery on the top and left edges." },
  85: { label: "Red rug northeast outside corner", category: "terrain-prop", confidence: "known", notes: "Northeast outside rug corner with gold embroidery on the top and right edges." },
  86: { label: "Red rug northeast inside corner", category: "terrain-prop", confidence: "known", notes: "Northeast inside rug corner with gold embroidery on the bottom and left edges." },
  87: { label: "Red rug east edge", category: "terrain-prop", confidence: "known", notes: "Straight rug edge with gold embroidery on the right side." },
  88: { label: "Red rug north edge", category: "terrain-prop", confidence: "known", notes: "Straight rug edge with gold embroidery on the top side." },
  89: { label: "Red rug south edge", category: "terrain-prop", confidence: "known", notes: "Straight rug edge with gold embroidery on the bottom side." },
  90: { label: "Red rug west edge", category: "terrain-prop", confidence: "known", notes: "Straight rug edge with gold embroidery on the left side." },
  91: { label: "Square floor hatch or covered pit", category: "hazard", confidence: "known", notes: "Square hatch set into stone floor. Its Realmz combat expansion places pit tile 68 in the center." },
  92: { label: "Double wooden door", category: "buildings", confidence: "known", notes: "Double wooden door set into stone floor." },
  93: { label: "Horizontal wooden floor or bridge", category: "terrain-prop", confidence: "known", notes: "Horizontal wooden floor or bridge section." },
  94: { label: "Vertical wooden floor or bridge", category: "terrain-prop", confidence: "known", notes: "Vertical wooden floor or bridge section." },
  95: { label: "Gray marble floor", category: "open", confidence: "known" },
  97: { label: "Broken stone floor", category: "rocks", confidence: "known", notes: "Stone floor with broken stones." },
  98: { label: "Stained stone floor", category: "terrain-prop", confidence: "known", notes: "Stone floor with stains." },
  99: { label: "Cobblestone with west white feature", category: "terrain-prop", confidence: "likely", notes: "Likely a white bench on the west side; it may instead be one segment of a joinable decorative inlay." },
  100: { label: "Cobblestone with east white feature", category: "terrain-prop", confidence: "likely", notes: "Likely a white bench on the east side; it may instead be one segment of a joinable decorative inlay." },
  101: { label: "Cobblestone with north white feature", category: "terrain-prop", confidence: "likely", notes: "Likely a white bench on the north side; it may instead be one segment of a joinable decorative inlay." },
  102: { label: "Cobblestone with south white feature", category: "terrain-prop", confidence: "likely", notes: "Likely a white bench on the south side; it may instead be one segment of a joinable decorative inlay." },
  103: { label: "Cobblestone with southwest white feature", category: "terrain-prop", confidence: "likely", notes: "Likely a white stool in the southwest; it may instead be part of a joinable decorative inlay." },
  104: { label: "Cobblestone with northwest white feature", category: "terrain-prop", confidence: "likely", notes: "Likely a white stool in the northwest; it may instead be part of a joinable decorative inlay." },
  105: { label: "Cobblestone with southeast white feature", category: "terrain-prop", confidence: "likely", notes: "White stool or decorative inlay in the southeast." },
  106: { label: "Cobblestone with northeast white feature", category: "terrain-prop", confidence: "likely", notes: "White stool or decorative inlay in the northeast." },
  107: { label: "Cobblestone with north-east white feature", category: "terrain-prop", confidence: "likely", notes: "Joined white bench or decorative inlay on the north and east sides." },
  108: { label: "Cobblestone with north-west white feature", category: "terrain-prop", confidence: "likely", notes: "Joined white bench or decorative inlay on the north and west sides." },
  109: { label: "Cobblestone with south-east white feature", category: "terrain-prop", confidence: "likely", notes: "Joined white bench or decorative inlay on the south and east sides." },
  110: { label: "Cobblestone with south-west white feature", category: "terrain-prop", confidence: "likely", notes: "Joined white bench or decorative inlay on the south and west sides." },
  111: { label: "Plain cobblestone floor", category: "open", confidence: "known" },
  112: { label: "Cobblestone with single bloodstain", category: "terrain-prop", confidence: "known" },
  113: { label: "Cobblestone with multiple bloodstains", category: "terrain-prop", confidence: "known" },
  114: { label: "Cobblestone with green stains", category: "hazard", confidence: "known", notes: "Green slime or acid stains on cobblestone floor." },
  115: { label: "Cobblestone with single scroll", category: "terrain-prop", confidence: "known" },
  116: { label: "Cobblestone with single skull", category: "terrain-prop", confidence: "known" },
  117: { label: "Cobblestone with equipment pile", category: "terrain-prop", confidence: "known", notes: "Pile of equipment, treasure, or miscellaneous items on cobblestone floor." },
  118: { label: "Large machine, lever up", category: "buildings", confidence: "known", notes: "Large solid machine with its lever in the up position. Blocks line of sight." },
  119: { label: "Large machine, lever down", category: "buildings", confidence: "known", notes: "Large solid machine with its lever in the down position. Blocks line of sight." },
  120: { label: "Cobblestone with blue magical effect", category: "terrain-prop", confidence: "known", notes: "Blue magical effect or stain on cobblestone floor." }
};

const CASTLE_HIDDEN_WALKABLE_EXACT: Record<number, LandlookTileVisualSemantics> = {
  59: { label: "Combat-clearing castle wall", category: "buildings", confidence: "known", notes: "Solid during land exploration; its Realmz combat build expands entirely into non-solid ground." },
  60: { label: "Combat-clearing castle wall", category: "buildings", confidence: "known", notes: "Solid during land exploration; its Realmz combat build expands entirely into non-solid ground." },
  61: { label: "Combat-clearing castle wall", category: "buildings", confidence: "known", notes: "Solid during land exploration; its Realmz combat build expands entirely into non-solid ground." },
  62: { label: "Combat-clearing castle wall", category: "buildings", confidence: "known", notes: "Solid during land exploration; its Realmz combat build expands entirely into non-solid ground." },
  63: { label: "Combat-clearing castle wall", category: "buildings", confidence: "known", notes: "Solid during land exploration; its Realmz combat build expands entirely into non-solid ground." },
  64: { label: "Combat-clearing castle wall", category: "buildings", confidence: "known", notes: "Solid during land exploration; its Realmz combat build expands entirely into non-solid ground." },
  65: { label: "Combat-clearing castle wall", category: "buildings", confidence: "known", notes: "Solid during land exploration; its Realmz combat build expands entirely into non-solid ground." },
  96: { label: "Hidden walkable thick red-black wall", category: "buildings", confidence: "known", notes: "Thick red/black wall artwork that Realmz marks walkable and as a runtime path." }
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
  0: { exact: { ...PLAINS_EXACT, ...PLAINS_HIDDEN_WALKABLE_EXACT }, ranges: PLAINS_RANGES },
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
      ...CASTLE_WALL_EXACT,
      ...CASTLE_FEATURE_EXACT,
      61: { label: "Solid masonry / wall fill", category: "mountain-land", confidence: "likely", notes: "Castle atlas slot aligned with the terrain-wall family, not literal mountains." },
      147: { label: "Moat boat / watercraft", category: "watercraft", confidence: "known" },
      ...CASTLE_HIDDEN_WALKABLE_EXACT
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
