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
  130: { label: "Road bridge east/west over water", category: "road", confidence: "known" },
  131: { label: "Road bridge north/south over water", category: "road", confidence: "known" },
  132: { label: "Road east/west", category: "road", confidence: "known" },
  133: { label: "Road north/south", category: "road", confidence: "known" },
  134: { label: "Road four-way junction", category: "road", confidence: "known" },
  135: { label: "Road junction east/south/west", category: "road", confidence: "known" },
  136: { label: "Road junction north/east/west", category: "road", confidence: "known" },
  137: { label: "Road junction north/east/south", category: "road", confidence: "known" },
  138: { label: "Road junction north/south/west", category: "road", confidence: "known" },
  139: { label: "Road bend east/south", category: "road", confidence: "known" },
  140: { label: "Road bend north/west", category: "road", confidence: "known" },
  141: { label: "Road bend south/west", category: "road", confidence: "known" },
  142: { label: "Road bend north/east", category: "road", confidence: "known" },
  143: { label: "Road endpoint east", category: "road", confidence: "known" },
  144: { label: "Road endpoint south", category: "road", confidence: "known" },
  145: { label: "Road endpoint west", category: "road", confidence: "known" },
  146: { label: "Road endpoint north", category: "road", confidence: "known" },
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

const SWAMP_EXACT: Record<number, LandlookTileVisualSemantics> = {
  36: { label: "Open swamp ground", category: "open", confidence: "known", notes: "Plain brown swamp ground; unlike the aligned Plains slot, this is not a blank tile." },
  37: { label: "Open swamp ground", category: "open", confidence: "known", notes: "Alternate plain brown swamp ground; unused in the current scenario corpus." },
  52: { label: "Closed coffin with crucifix", category: "graves", confidence: "known" },
  53: { label: "Open coffin", category: "graves", confidence: "known" },
  54: { label: "Closed coffin without crucifix", category: "graves", confidence: "known", notes: "Can also serve visually as a closed chest." },
  55: { label: "Red bog patch", category: "terrain-prop", confidence: "likely", notes: "A solid red-brown patch replacing the aligned Plains cobblestone tile." },
  60: { label: "Full swamp water", category: "water-shore", confidence: "known", notes: "Normal full swamp-water center tile." },
  61: { label: "Solid bog bank", category: "mountain-land", confidence: "known", notes: "Full dark bog-bank or dense-growth fill aligned with the Plains mountain family." },
  115: { label: "Spiked barrier over swamp water", category: "buildings", confidence: "likely" },
  116: { label: "Spiked swamp barrier transition", category: "buildings", confidence: "likely", notes: "Bank-and-water variant of the spiked barrier family." },
  117: { label: "Spiked swamp barrier transition", category: "buildings", confidence: "likely", notes: "Mirrored bank-and-water variant of the spiked barrier family." },
  118: { label: "Lone swamp tree", category: "tree-detail", confidence: "known", notes: "Realmz marks this as swamp forest type 4." },
  119: { label: "Two swamp trees", category: "tree-detail", confidence: "known", notes: "Realmz marks this as swamp forest type 4." },
  120: { label: "Three swamp trees", category: "tree-detail", confidence: "known", notes: "Realmz marks this as swamp forest type 4." },
  149: { label: "Large dead swamp stump", category: "tree-detail", confidence: "known" },
  150: { label: "Tall yellow swamp grass", category: "tree-detail", confidence: "known" },
  151: { label: "Split dead swamp tree", category: "tree-detail", confidence: "known", notes: "Solid and line-of-sight blocking." },
  152: { label: "Dead swamp stump", category: "tree-detail", confidence: "known" },
  153: { label: "Large mossy swamp boulder", category: "rocks", confidence: "likely", notes: "Solid and line-of-sight blocking." },
  154: { label: "Large dead swamp tree", category: "tree-detail", confidence: "known" },
  155: { label: "Plain swamp ground", category: "open", confidence: "known" },
  156: { label: "Swamp ground with faint grass", category: "open", confidence: "likely" },
  157: { label: "Swamp ground with grass tufts", category: "open", confidence: "known" },
  158: { label: "Swamp ground with several grass tufts", category: "open", confidence: "known" },
  159: { label: "Swamp ground with one dark pool", category: "terrain-prop", confidence: "likely" },
  160: { label: "Swamp ground with two dark pools", category: "terrain-prop", confidence: "likely" },
  161: { label: "Small rock and dead brush", category: "rocks", confidence: "likely" },
  162: { label: "Small swamp branch", category: "terrain-prop", confidence: "likely" },
  163: { label: "Dead swamp stump and rock", category: "rocks", confidence: "likely" },
  164: { label: "Single small swamp rock", category: "rocks", confidence: "known" },
  165: { label: "Two swamp rocks", category: "rocks", confidence: "known" },
  166: { label: "Three swamp rocks", category: "rocks", confidence: "known" },
  167: { label: "Swamp rock pile", category: "rocks", confidence: "known" },
  168: { label: "Blank / unused swamp tile", category: "blank", confidence: "known" },
  169: { label: "Hidden walkable bog path", category: "road", confidence: "known", notes: "Dense bog artwork that Realmz marks walkable and as a runtime path, matching the aligned Plains hidden-walkable slot." },
  170: { label: "Swamp hut", category: "buildings", confidence: "known" },
  171: { label: "Swamp hut with green-capped tower", category: "buildings", confidence: "known" },
  172: { label: "Swamp hut with pink-capped tower", category: "buildings", confidence: "known" },
  173: { label: "Small tower hut with green window", category: "buildings", confidence: "known" },
  174: { label: "Small tower hut with red window", category: "buildings", confidence: "known" },
  175: { label: "Two connected tiny huts", category: "buildings", confidence: "known", notes: "Two connected huts with yellow windows." },
  176: { label: "Three connected tiny huts", category: "buildings", confidence: "known", notes: "Three connected huts with yellow windows." },
  177: { label: "Sturdy tent with lantern post", category: "buildings", confidence: "known" },
  178: { label: "Two sturdy tents", category: "buildings", confidence: "known" },
  179: { label: "Canopy-suspended swamp hut", category: "buildings", confidence: "known", notes: "Small hut suspended in a canopy of trees." },
  180: { label: "Combat-clearing bog wall", category: "buildings", confidence: "known", notes: "Solid dark bog terrain during land exploration; its Realmz combat build expands into non-solid swamp ground." },
  181: { label: "Combat-clearing bog wall, west edge", category: "buildings", confidence: "known", notes: "Solid during land exploration and open in Realmz combat expansion." },
  182: { label: "Combat-clearing bog wall transition", category: "buildings", confidence: "known", notes: "Solid during land exploration and open in Realmz combat expansion." },
  183: { label: "Combat-clearing bog wall, east edge", category: "buildings", confidence: "known", notes: "Solid during land exploration and open in Realmz combat expansion." },
  184: { label: "Combat-clearing north-south masonry path", category: "buildings", confidence: "known", notes: "Solid and line-of-sight blocking during land exploration; its Realmz combat build expands into non-solid terrain." },
  185: { label: "Combat-clearing east-west masonry path", category: "buildings", confidence: "known", notes: "Solid and line-of-sight blocking during land exploration; its Realmz combat build expands into non-solid terrain." },
  186: { label: "Small swamp hut", category: "buildings", confidence: "known" },
  187: { label: "Large swamp grave or tomb", category: "graves", confidence: "known" },
  188: { label: "Swamp grave or tomb cluster", category: "graves", confidence: "known" },
  189: { label: "Swamp grave or tomb cluster", category: "graves", confidence: "known" }
};

const SNOW_EXACT: Record<number, LandlookTileVisualSemantics> = {
  36: { label: "Open snow ground", category: "open", confidence: "known", notes: "Plain snow ground; unlike the aligned Plains slot, this is not a blank tile." },
  37: { label: "Open snow ground", category: "open", confidence: "known", notes: "Alternate plain snow ground; unused in the current scenario corpus." },
  60: { label: "Full icy water", category: "water-shore", confidence: "known", notes: "Normal full-water center tile for the Snow landlook." },
  61: { label: "Solid snowy ridge", category: "mountain-land", confidence: "known", notes: "Full snowy ridge or mountain fill aligned with the Plains mountain family." },
  115: { label: "Snow bridge over water", category: "road", confidence: "likely" },
  116: { label: "Snow bridge and shore transition", category: "road", confidence: "likely" },
  117: { label: "Snow bridge and shore transition", category: "road", confidence: "likely", notes: "Mirrored bridge-and-shore variant." },
  118: { label: "Lone snow tree", category: "tree-detail", confidence: "known", notes: "Realmz marks this as Snow forest type 5." },
  119: { label: "Two snow trees", category: "tree-detail", confidence: "known", notes: "Realmz marks this as Snow forest type 5." },
  120: { label: "Three snow trees", category: "tree-detail", confidence: "known", notes: "Realmz marks this as Snow forest type 5." },
  149: { label: "Snow-covered boulder", category: "rocks", confidence: "known" },
  150: { label: "Bare snow bush", category: "tree-detail", confidence: "known" },
  151: { label: "Large bare snow bush", category: "tree-detail", confidence: "known", notes: "Solid and line-of-sight blocking." },
  152: { label: "Leafless snow tree", category: "tree-detail", confidence: "known" },
  153: { label: "Tall snow-covered evergreen", category: "tree-detail", confidence: "known", notes: "Solid and line-of-sight blocking." },
  154: { label: "Broad snow-covered evergreen", category: "tree-detail", confidence: "known" },
  155: { label: "Plain decorative snow ground", category: "open", confidence: "known" },
  156: { label: "Decorative snow with light grass", category: "open", confidence: "known" },
  157: { label: "Decorative snow with grass", category: "open", confidence: "known" },
  158: { label: "Decorative snow with several grass patches", category: "open", confidence: "known" },
  159: { label: "Decorative snow with exposed ice", category: "open", confidence: "known", notes: "Walkable decoration in Snow's source-defined open-ground range, not the aligned Plains rock range." },
  160: { label: "Decorative icy snow with rocks", category: "open", confidence: "known", notes: "Walkable decoration in Snow's source-defined open-ground range, not the aligned Plains rock range." },
  161: { label: "Scattered snow-covered rocks", category: "rocks", confidence: "likely" },
  162: { label: "Two snow-covered boulders", category: "rocks", confidence: "likely" },
  163: { label: "Large and small snow-covered rocks", category: "rocks", confidence: "likely" },
  164: { label: "One snow-covered rock", category: "rocks", confidence: "known" },
  165: { label: "Two snow-covered rocks", category: "rocks", confidence: "known" },
  166: { label: "Several snow-covered rocks", category: "rocks", confidence: "known" },
  167: { label: "Large snow-covered rock", category: "rocks", confidence: "known" },
  168: { label: "Blank / unused snow tile", category: "blank", confidence: "known" },
  169: { label: "Hidden walkable snowy ridge", category: "road", confidence: "known", notes: "Dense icy ridge artwork that Realmz marks walkable and as a runtime path, matching the aligned Plains hidden-walkable slot." },
  170: { label: "Snow-covered hut", category: "buildings", confidence: "known" },
  171: { label: "Snow hut with small capped tower", category: "buildings", confidence: "likely" },
  172: { label: "Snow hut with colored-capped tower", category: "buildings", confidence: "likely" },
  173: { label: "Small snow tower hut with green window", category: "buildings", confidence: "likely" },
  174: { label: "Small snow tower hut with red window", category: "buildings", confidence: "likely" },
  175: { label: "Two connected tiny snow huts", category: "buildings", confidence: "known" },
  176: { label: "Three connected tiny snow huts", category: "buildings", confidence: "known" },
  177: { label: "Sturdy snow tent with post", category: "buildings", confidence: "likely" },
  178: { label: "Two sturdy snow tents", category: "buildings", confidence: "known" },
  179: { label: "Canopy-suspended snow hut", category: "buildings", confidence: "likely", notes: "Small snow-covered hut suspended among leafless trees." },
  180: { label: "Combat-clearing snowy mountain-to-land fill", category: "mountain-land", confidence: "known", notes: "Solid snowy mountain terrain during land exploration; its Realmz combat build expands into non-solid snow ground." },
  181: { label: "Combat-clearing snowy mountain-to-land west edge", category: "mountain-land", confidence: "known", notes: "Solid during land exploration and open in Realmz combat expansion." },
  182: { label: "Combat-clearing snowy mountain-to-land transition", category: "mountain-land", confidence: "known", notes: "Solid during land exploration and open in Realmz combat expansion." },
  183: { label: "Combat-clearing snowy mountain-to-land east edge", category: "mountain-land", confidence: "known", notes: "Solid during land exploration and open in Realmz combat expansion." },
  184: { label: "Combat-clearing north-south snow wall", category: "buildings", confidence: "known", notes: "Solid and line-of-sight blocking during land exploration; its Realmz combat build expands into non-solid terrain." },
  185: { label: "Combat-clearing east-west snow wall", category: "buildings", confidence: "known", notes: "Solid during land exploration but, uniquely, does not block line of sight; its Realmz combat build expands into non-solid terrain." }
};

const DESERT_EXACT: Record<number, LandlookTileVisualSemantics> = {
  36: { label: "Open desert sand", category: "open", confidence: "known", notes: "Walkable sand; unlike the aligned Plains slot, this is not blank." },
  52: { label: "Small oasis pool with central rock", category: "water-shore", confidence: "likely" },
  53: { label: "Round oasis pool", category: "water-shore", confidence: "known" },
  54: { label: "Small oasis pool", category: "water-shore", confidence: "known" },
  55: { label: "Elongated oasis pool", category: "water-shore", confidence: "known" },
  60: { label: "Full desert water", category: "water-shore", confidence: "known", notes: "Normal full-water center tile for the Desert landlook." },
  61: { label: "Solid desert ridge", category: "mountain-land", confidence: "known", notes: "Full dark desert ridge or mountain fill aligned with the Plains mountain family." },
  94: { label: "North-south desert briar wall", category: "buildings", confidence: "known", notes: "Solid and line-of-sight blocking." },
  95: { label: "East-west desert briar wall", category: "buildings", confidence: "known", notes: "Solid and line-of-sight blocking." },
  96: { label: "Desert briar wall junction", category: "buildings", confidence: "likely", notes: "Solid and line-of-sight blocking." },
  97: { label: "Desert briar wall junction", category: "buildings", confidence: "likely", notes: "Solid and line-of-sight blocking." },
  98: { label: "Desert briar wall corner", category: "buildings", confidence: "likely", notes: "Solid and line-of-sight blocking." },
  99: { label: "Desert briar wall corner", category: "buildings", confidence: "likely", notes: "Solid and line-of-sight blocking." },
  100: { label: "Desert briar wall cross-junction", category: "buildings", confidence: "known", notes: "Solid and line-of-sight blocking." },
  101: { label: "Desert briar wall junction", category: "buildings", confidence: "likely", notes: "Solid and line-of-sight blocking." },
  102: { label: "Desert briar wall junction", category: "buildings", confidence: "likely", notes: "Solid and line-of-sight blocking." },
  103: { label: "Desert briar wall end or corner", category: "buildings", confidence: "likely", notes: "Solid and line-of-sight blocking." },
  104: { label: "Desert briar wall end or corner", category: "buildings", confidence: "likely", notes: "Solid and line-of-sight blocking." },
  113: { label: "Walkable east-west desert briar passage", category: "buildings", confidence: "likely", notes: "Walkable but line-of-sight blocking." },
  114: { label: "Walkable north-south desert briar passage", category: "buildings", confidence: "likely", notes: "Walkable but line-of-sight blocking." },
  115: { label: "Wooden desert bridge over water", category: "road", confidence: "known" },
  116: { label: "Wooden desert bridge and east shore", category: "road", confidence: "likely" },
  117: { label: "Wooden desert bridge and west shore", category: "road", confidence: "likely" },
  118: { label: "Lone palm tree", category: "tree-detail", confidence: "known", notes: "Realmz marks this as Desert forest type 2." },
  119: { label: "Two palm trees", category: "tree-detail", confidence: "known", notes: "Realmz marks this as Desert forest type 2." },
  120: { label: "Three palm trees", category: "tree-detail", confidence: "known", notes: "Realmz marks this as Desert forest type 2." },
  121: { label: "Solid palm grove", category: "forest", confidence: "known", notes: "Center fill for the Desert palm-grove transition family." },
  130: { label: "Wooden bridge or dock over water", category: "road", confidence: "likely" },
  147: { label: "Desert sailing vessel", category: "watercraft", confidence: "known", notes: "Realmz mapstats marks this as boat-required movement." },
  148: { label: "Large desert palm cluster", category: "tree-detail", confidence: "known", notes: "Solid and line-of-sight blocking." },
  149: { label: "Tall desert reeds", category: "tree-detail", confidence: "known", notes: "Solid and line-of-sight blocking." },
  150: { label: "Large desert cactus", category: "tree-detail", confidence: "known", notes: "Solid and line-of-sight blocking." },
  151: { label: "Dense desert bush", category: "tree-detail", confidence: "known", notes: "Solid and line-of-sight blocking." },
  152: { label: "Dense desert scrub", category: "tree-detail", confidence: "known", notes: "Solid and line-of-sight blocking." },
  153: { label: "Large desert palm tree", category: "tree-detail", confidence: "known", notes: "Solid and line-of-sight blocking." },
  154: { label: "Dead desert tree", category: "tree-detail", confidence: "known", notes: "Walkable decorative vegetation." },
  155: { label: "Tall leafless desert tree", category: "tree-detail", confidence: "known", notes: "Walkable decorative vegetation." },
  156: { label: "Small dead desert tree", category: "tree-detail", confidence: "known", notes: "Walkable decorative vegetation." },
  157: { label: "Red-fruited desert tree", category: "tree-detail", confidence: "likely", notes: "Walkable decorative vegetation." },
  158: { label: "Dead desert tree with foliage", category: "tree-detail", confidence: "likely", notes: "Walkable decorative vegetation." },
  159: { label: "One small desert plant", category: "open", confidence: "known" },
  160: { label: "Three small desert plants", category: "open", confidence: "known" },
  161: { label: "One small desert rock", category: "rocks", confidence: "known" },
  162: { label: "Two small desert rocks", category: "rocks", confidence: "known" },
  163: { label: "Desert boulder with small plant", category: "rocks", confidence: "likely" },
  164: { label: "Large desert rock", category: "rocks", confidence: "known" },
  165: { label: "Two desert rocks", category: "rocks", confidence: "known" },
  166: { label: "Layered desert rock", category: "rocks", confidence: "likely" },
  167: { label: "Tall desert rock formation", category: "rocks", confidence: "known" },
  168: { label: "Desert stone gate or arch", category: "buildings", confidence: "likely", notes: "Walkable structure; unlike the aligned Plains slot, this is not blank." },
  169: { label: "Hidden walkable desert ridge", category: "road", confidence: "known", notes: "Dark ridge artwork that Realmz marks walkable and as a runtime path." },
  170: { label: "Desert hut", category: "buildings", confidence: "known" },
  171: { label: "Desert hut with green-capped tower", category: "buildings", confidence: "likely" },
  172: { label: "Desert hut with pink-capped tower", category: "buildings", confidence: "likely" },
  173: { label: "Small desert tower hut with red window", category: "buildings", confidence: "likely" },
  174: { label: "Small desert tower hut with green dome", category: "buildings", confidence: "likely" },
  175: { label: "Two connected tiny desert huts", category: "buildings", confidence: "known" },
  176: { label: "Three connected tiny desert huts", category: "buildings", confidence: "known" },
  177: { label: "Sturdy desert tent with post", category: "buildings", confidence: "likely" },
  178: { label: "Two sturdy desert tents", category: "buildings", confidence: "known" },
  179: { label: "Canopy-suspended desert hut", category: "buildings", confidence: "likely" },
  180: { label: "Combat-clearing desert mountain-to-land fill", category: "mountain-land", confidence: "known", notes: "Solid ridge terrain during land exploration; its Realmz combat build expands into non-solid desert ground." },
  181: { label: "Combat-clearing desert mountain-to-land west edge", category: "mountain-land", confidence: "known", notes: "Solid during land exploration and open in Realmz combat expansion." },
  182: { label: "Combat-clearing desert mountain-to-land transition", category: "mountain-land", confidence: "known", notes: "Solid during land exploration and open in Realmz combat expansion." },
  183: { label: "Combat-clearing desert mountain-to-land east edge", category: "mountain-land", confidence: "known", notes: "Solid during land exploration and open in Realmz combat expansion." },
  184: { label: "Hidden walkable north-south desert briar wall", category: "buildings", confidence: "known", notes: "Walkable path-marked wall that blocks line of sight; it is already open during land exploration rather than combat-clearing." },
  185: { label: "Combat-clearing east-west desert briar wall", category: "buildings", confidence: "known", notes: "Solid and line-of-sight blocking during land exploration; its Realmz combat build expands into non-solid terrain." },
  186: { label: "Small desert bush", category: "tree-detail", confidence: "known" },
  187: { label: "Large desert shrub", category: "tree-detail", confidence: "known" },
  188: { label: "Desert palm cluster", category: "tree-detail", confidence: "known" },
  189: { label: "Tall desert grass", category: "tree-detail", confidence: "known" },
  190: { label: "Low desert scrub", category: "tree-detail", confidence: "known" },
  191: { label: "Plain desert sand", category: "open", confidence: "known", notes: "Primary source-defined Desert base tile." },
  192: { label: "Alternate desert sand", category: "open", confidence: "known" },
  193: { label: "Round oasis pool", category: "water-shore", confidence: "known" },
  194: { label: "Paired oasis pools", category: "water-shore", confidence: "known" },
  195: { label: "Bright desert sand or heat shimmer", category: "open", confidence: "uncertain" },
  196: { label: "Round oasis pool", category: "water-shore", confidence: "known" },
  197: { label: "Bright desert sand or heat shimmer", category: "open", confidence: "uncertain" },
  198: { label: "Bright desert sand or heat shimmer", category: "open", confidence: "uncertain" },
  199: { label: "Connected oasis pools", category: "water-shore", confidence: "known" },
  200: { label: "Elongated oasis pool", category: "water-shore", confidence: "known" }
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
  40: { label: "Solid thick red-black wall", category: "buildings", confidence: "known", notes: "Solid thick red/black outer-wall fill with no land. Perspective filler may touch tile edges without indicating a traversable connection." },
  41: { label: "East-facing torch on thick wall", category: "buildings", confidence: "known", notes: "Thick red/black north-south wall with an east-facing gray facade and torch. Land or floor east." },
  42: { label: "South-facing torch on thick wall", category: "buildings", confidence: "known", notes: "Thick red/black east-west wall with a south-facing gray facade and torch. Land or floor south." },
  43: { label: "Purple curtains on thick south wall", category: "buildings", confidence: "known", notes: "Thick red/black east-west wall with purple curtains on its south-facing wall. Land or floor south." },
  44: { label: "Purple curtains on gray south wall", category: "buildings", confidence: "known", notes: "Gray east-west wall with purple curtains on its south face. Land north and south." },
  45: { label: "Red curtains on gray south wall", category: "buildings", confidence: "known", notes: "Gray east-west wall with red curtains on its south face. Land north and south." },
  46: { label: "Green curtains on gray south wall", category: "buildings", confidence: "known", notes: "Gray east-west wall with green curtains on its south face. Land north and south." },
  47: { label: "Gray wall with southwest thick-wall pocket", category: "buildings", confidence: "known", notes: "South-facing gray east-west wall with continuity west, east, and south. Thick red/black pocket southwest; land north." },
  48: { label: "Gray wall with southeast thick-wall pocket", category: "buildings", confidence: "known", notes: "Horizontal mirror of Castle tile 47. Thick red/black pocket southeast; land north." },
  49: { label: "Vertical mirror of southeast pocket wall", category: "buildings", confidence: "known", notes: "Vertical mirror of Castle tile 48." },
  50: { label: "Tunnel through thick south wall", category: "cave-transition", confidence: "known", notes: "Thick red/black east-west wall with a south-facing brick facade and tunnel. The tunnel enters from land to the south." },
  51: { label: "East-facing fountain wall", category: "buildings", confidence: "known", notes: "Thick red/black wall west with a gray north-south facade and fountain on its east side. Land east." },
  52: { label: "West-facing fountain wall", category: "buildings", confidence: "known", notes: "Horizontal mirror of Castle tile 51. Thick wall east, fountain on the west side, and land west." },
  53: { label: "North-facing teal fountain wall", category: "buildings", confidence: "known", notes: "Thick red/black wall south with a teal or green fountain facing north." },
  54: { label: "South-facing lava skull wall", category: "hazard", confidence: "known", notes: "Inset skull rock at the south midpoint of a thick red/black wall spews lava south. Land or lava south." },
  55: { label: "East-facing lava skull wall", category: "hazard", confidence: "known", notes: "Thick red/black north-south wall west with an inset skull rock spewing lava east." },
  56: { label: "West-facing lava skull wall", category: "hazard", confidence: "known", notes: "Horizontal mirror of Castle tile 55; the skull rock spews lava west." },
  57: { label: "North-facing lava skull wall", category: "hazard", confidence: "known", notes: "Vertical mirror of Castle tile 54; the skull rock spews lava north." },
  58: { label: "East-ascending stone stairway", category: "buildings", confidence: "known", notes: "Gray stone stairway running west-east; the east side ascends." }
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
  120: { label: "Cobblestone with blue magical effect", category: "terrain-prop", confidence: "known", notes: "Blue magical effect or stain on cobblestone floor." },
  121: { label: "Cobblestone with lever down", category: "terrain-prop", confidence: "known" },
  122: { label: "Cobblestone with lever up", category: "terrain-prop", confidence: "known" },
  123: { label: "Cobblestone with skeleton remains", category: "terrain-prop", confidence: "known" },
  124: { label: "Cobblestone with one sack", category: "terrain-prop", confidence: "known", notes: "One sack or bundle on cobblestone floor." },
  125: { label: "Cobblestone with three sacks", category: "terrain-prop", confidence: "known", notes: "Three sacks or bundles on cobblestone floor." },
  126: { label: "Cobblestone with east-facing wooden chair", category: "terrain-prop", confidence: "known" },
  127: { label: "Cobblestone with west-facing wooden chair", category: "terrain-prop", confidence: "known" },
  128: { label: "Cobblestone with small wooden stool", category: "terrain-prop", confidence: "known" },
  129: { label: "Empty weapon rack", category: "terrain-prop", confidence: "known" },
  130: { label: "Weapon rack with swords", category: "terrain-prop", confidence: "known" },
  131: { label: "Weapon rack with spears", category: "terrain-prop", confidence: "known" },
  132: { label: "Weapon rack with javelins", category: "terrain-prop", confidence: "known" },
  133: { label: "Weapon rack with long axes", category: "terrain-prop", confidence: "known" },
  134: { label: "Floor ladder leading up", category: "cave-transition", confidence: "known", notes: "Ladder lying on or emerging from the floor and leading upward." },
  135: { label: "Floor hole with ladder leading down", category: "cave-transition", confidence: "known" },
  136: { label: "Pile of sacks or supplies", category: "terrain-prop", confidence: "known" },
  137: { label: "Two wooden crates", category: "terrain-prop", confidence: "known" },
  138: { label: "Two barrels", category: "terrain-prop", confidence: "known" },
  139: { label: "Brown and gold jugs", category: "terrain-prop", confidence: "known", notes: "Several brown and gold jugs on the floor." },
  140: { label: "Colored equipment rack", category: "terrain-prop", confidence: "known", notes: "Rack of colored weapons, clothing, or banners." },
  141: { label: "Short round stone column", category: "terrain-prop", confidence: "known" },
  142: { label: "Top half of stone column", category: "terrain-prop", confidence: "known" },
  143: { label: "Bottom half of stone column", category: "terrain-prop", confidence: "known" },
  144: { label: "Unoccupied ornate throne", category: "terrain-prop", confidence: "known" },
  145: { label: "Wooden writing desk or workbench", category: "terrain-prop", confidence: "known" },
  146: { label: "Alchemy table with colored bottles", category: "terrain-prop", confidence: "known" },
  147: { label: "Plain wooden desk facing north", category: "terrain-prop", confidence: "known" },
  148: { label: "Plain wooden desk facing south", category: "terrain-prop", confidence: "known" },
  149: { label: "White chest facing south", category: "terrain-prop", confidence: "known", notes: "White chest or strongbox facing south." },
  150: { label: "Ornate closed chest facing south", category: "terrain-prop", confidence: "known" },
  151: { label: "Wooden chest facing west", category: "terrain-prop", confidence: "known", notes: "Side-profile wooden chest facing west." },
  152: { label: "Standing torch", category: "terrain-prop", confidence: "known" },
  153: { label: "Left half of sarcophagus", category: "terrain-prop", confidence: "known" },
  154: { label: "Right half of sarcophagus", category: "terrain-prop", confidence: "known" },
  155: { label: "Plain cobblestone floor", category: "open", confidence: "known" },
  156: { label: "Left half of bed", category: "terrain-prop", confidence: "known" },
  157: { label: "Right half of bed", category: "terrain-prop", confidence: "known" },
  158: { label: "Left end of long wooden table", category: "terrain-prop", confidence: "known" },
  159: { label: "Center of long wooden table", category: "terrain-prop", confidence: "known" },
  160: { label: "Long wooden table center with bottles", category: "terrain-prop", confidence: "known" },
  161: { label: "Long wooden table center with food", category: "terrain-prop", confidence: "known", notes: "Long table center with food or place settings." },
  162: { label: "Right end of long wooden table", category: "terrain-prop", confidence: "known" },
  163: { label: "Left side of torture rack", category: "terrain-prop", confidence: "known" },
  164: { label: "Right side of torture rack", category: "terrain-prop", confidence: "known" },
  165: { label: "Left half of yellow bed", category: "terrain-prop", confidence: "known" },
  166: { label: "Right half of yellow bed", category: "terrain-prop", confidence: "known" },
  167: { label: "Standing floor mirror", category: "terrain-prop", confidence: "known", notes: "Walkable floor fixture that blocks line of sight." },
  168: { label: "Pure white tile", category: "blank", confidence: "known", notes: "Likely unused and not intended for scenario authoring." },
  169: { label: "Short bookcase", category: "terrain-prop", confidence: "known" },
  170: { label: "Tall bookcase with skull", category: "terrain-prop", confidence: "known" },
  171: { label: "Wooden dresser", category: "terrain-prop", confidence: "known" },
  172: { label: "Wooden dresser with books", category: "terrain-prop", confidence: "known", notes: "Wooden dresser with books on top." },
  173: { label: "Green standing person statue", category: "terrain-prop", confidence: "known" },
  174: { label: "Blue standing person statue", category: "terrain-prop", confidence: "known" },
  175: { label: "White standing person statue", category: "terrain-prop", confidence: "known" },
  176: { label: "Brazier or fire bowl", category: "hazard", confidence: "known", notes: "Walkable floor fixture that blocks line of sight." },
  177: { label: "Top half of tall purple throne", category: "terrain-prop", confidence: "known", notes: "This half blocks line of sight." },
  178: { label: "Bottom half of tall purple throne", category: "terrain-prop", confidence: "known" },
  179: { label: "Top of west-facing stone gargoyle", category: "terrain-prop", confidence: "known", notes: "Top half of a stone dragon or gargoyle facing west." },
  180: { label: "Bottom of west-facing stone gargoyle", category: "terrain-prop", confidence: "known", notes: "Bottom half of a stone dragon or gargoyle facing west." },
  181: { label: "Stone platform surrounded by water", category: "water-shore", confidence: "known", notes: "Large gray stone platform surrounded by water." },
  182: { label: "Stone platform surrounded by acid", category: "hazard", confidence: "known", notes: "Large gray stone platform surrounded by acid." },
  183: { label: "Black stone platform surrounded by lava", category: "hazard", confidence: "known", notes: "Large black stone platform surrounded by lava." },
  184: { label: "Magic bubble with runes", category: "terrain-prop", confidence: "known", notes: "Runed magical bubble. Realmz marks this tile as blocking line of sight." },
  185: { label: "Left half of coffin", category: "terrain-prop", confidence: "known" },
  186: { label: "Right half of coffin", category: "terrain-prop", confidence: "known" },
  187: { label: "North-wall open door, upper left component", category: "buildings", confidence: "known", notes: "Left side of the upper half of a long open door swinging from a north wall. Used directly in authored maps and in Realmz's combat expansion for tiles 74 and 76." },
  188: { label: "North-wall open door, upper right component", category: "buildings", confidence: "known", notes: "Right side of the upper half where the open door meets the north wall. Used directly in authored maps and in Realmz's combat expansion for tiles 74 and 76." },
  189: { label: "North-wall east end cap", category: "buildings", confidence: "known", notes: "Right end cap terminating the north wall to the east. Used directly in authored maps and in Realmz's combat expansion for tiles 74 and 76." },
  190: { label: "North-wall open door, lower left component", category: "buildings", confidence: "known", notes: "Vertical counterpart of tile 187 and the lower paired half of the long open door. Used directly in authored maps and in Realmz's combat expansion for tiles 74 and 76." },
  191: { label: "North-wall open door, lower right component", category: "buildings", confidence: "known", notes: "Vertical counterpart of tile 188 and the lower paired half where the door meets the wall. Used directly in authored maps and in Realmz's combat expansion for tiles 74 and 76." },
  192: { label: "North-wall east end-cap counterpart", category: "buildings", confidence: "known", notes: "Vertical counterpart of tile 189. Used directly in authored maps and in Realmz's combat expansion for tiles 74 and 76." },
  193: { label: "West-wall open door, upper component", category: "buildings", confidence: "known", notes: "Upper half of a door swinging north from a west wall. Also commonly used as surrounding wall fill. Realmz uses it in the combat expansion for tiles 75 and 77." },
  194: { label: "East-wall open door, upper component", category: "buildings", confidence: "known", notes: "Upper half of a door swinging north from an east wall. Used directly in authored maps and in Realmz's combat expansion for tiles 75 and 77." },
  195: { label: "West-wall open door, lower component", category: "buildings", confidence: "known", notes: "Lower half of the open door where it meets the west wall. Used directly in authored maps and in Realmz's combat expansion for tiles 75 and 77." },
  196: { label: "East-wall open door, lower component", category: "buildings", confidence: "known", notes: "Lower half of the open door where it meets the east wall. Used directly in authored maps and in Realmz's combat expansion for tiles 75 and 77." },
  197: { label: "Cobblestone to east black wall", category: "buildings", confidence: "known", notes: "Cobblestone or land on the left transitions to thick black wall on the right. Used directly in authored maps and in Realmz's combat expansion for tiles 75 and 77." },
  198: { label: "Cobblestone to west black wall", category: "buildings", confidence: "known", notes: "Horizontal mirror of tile 197: thick black wall on the left and cobblestone or land on the right. Used directly in authored maps and in Realmz's combat expansion for tiles 75 and 77." },
  199: { label: "Left half of purple altar or sarcophagus", category: "terrain-prop", confidence: "likely", notes: "Left half of a purple altar, bench, or sarcophagus-like object." },
  200: { label: "Right half of purple altar or sarcophagus", category: "terrain-prop", confidence: "likely", notes: "Right half of the purple object paired with tile 199." }
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
      ...DESERT_EXACT
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
      ...SWAMP_EXACT,
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
      ...SNOW_EXACT,
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
