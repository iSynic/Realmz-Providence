extends RefCounted

# These are view dependencies, not command semantics. Include reference sources
# as well as record families: removing a link must invalidate the old Used By list
# even when the bounded delta contains only the source's new references.
const SCRIPTS := ["action-point", "extra-action-point", "extra-code", "simple-encounter",
	"complex-encounter", "rogue-encounter", "timed-encounter", "quest", "global-macro"]
const RULES := ["item", "spell", "race", "caste", "monster", "monster-description",
	"battle", "treasure", "shop", "option-label", "random-rectangle"]
const WORLD := ["land", "dungeon", "land-layout", "landlook", "player-map"]


static func for_route(route: String) -> Array:
	match route:
		"maps.land", "maps.dungeon": return WORLD + ["action-point", "asset"]
		"maps.layout": return ["land", "land-layout"]
		"maps.special-land", "assets.special-land": return ["asset", "land", "dungeon"]
		"player-maps.map-records": return ["player-map", "land", "dungeon", "asset"]
		"text.messages": return SCRIPTS + ["message", "option-label"]
		"text.text-resources": return SCRIPTS + ["asset", "player-map"]
		"scripts.action-points", "scripts.macros", "scripts.global-macros":
			return SCRIPTS + RULES + ["message", "asset", "land", "dungeon"]
		"scripts.quests": return SCRIPTS + ["option-label"]
		"encounters.simple", "encounters.complex", "encounters.rogue", "encounters.timed", \
		"economy.items", "economy.shops", "economy.treasure", \
		"rules.spells", "rules.races", "rules.castes", "combat.battles", "combat.monsters", "combat.scrapbook":
			return SCRIPTS + RULES + ["message", "asset"]
		"assets.pictures", "assets.sounds", "assets.icons":
			return SCRIPTS + RULES + WORLD + ["asset"]
		"scenario.startup": return ["scenario", "land", "dungeon", "asset"]
		"scenario.restrictions": return RULES + ["scenario"]
		"scenario.contact", "scenario.registration": return ["scenario"]
	# Issues, export checks and library aggregates conservatively observe the
	# project. Unknown routes keep this safe fallback until their dependencies exist.
	return []


static func family(identity: String) -> String:
	if identity.begins_with("classic."):
		var kind := identity.get_slice(".", 1)
		if kind in ["item", "spell", "race", "caste", "landlook"]: return kind
	if identity.begins_with("special-land."): return "asset"
	if identity == "dungeon-top-down-302": return "asset"
	var kind := identity.get_slice(":", 0)
	if kind in ["asset", "picture", "icon", "sound", "tileset", "classic-resource", "monster-appearance"]:
		return "asset"
	if kind in SCRIPTS or kind in RULES or kind in WORLD or kind in ["message", "scenario"]:
		return kind
	return ""
