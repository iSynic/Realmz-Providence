class_name ProvidenceRouteCatalog
extends RefCounted

const LEGACY_ROUTE_DESTINATIONS := {"economy.bag": -1, "economy.vault": 32}
const VALIDATE_PUBLISH_ROUTES := [
	["IS  Issues", 33, "", "linter.issues"],
	["RD  Readiness", 34, "", "linter.readiness"],
	["EP  Export Plan", 35, "", "export.export-plan"],
	["BM  Benchmark", 36, "", "export.benchmark"],
	["DR  Decoded Records", 37, "", "records.decoded-records"],
	["TD  Technical Details", 38, "", "records.evidence"],
]

const ROUTES := {
	"maps": {
		"heading": "LAND / DUNGEON MAPS",
		"subtitle": "Land levels, dungeon levels, layout, and tile painting.",
		"routes": [
			["LD  Land Editor", 1, "first-land-map", "maps.land"],
			["DG  Dungeon Editor", 11, "first-dungeon-map", "maps.dungeon"],
			["LL  Land Layout", 12, "", "maps.layout"],
			["SL  Special Land Tiles", 10, "special-land-world", "maps.special-land"],
		],
	},
	"player-maps": {
		"heading": "PLAYER MAPS",
		"subtitle": "Maps and Notes entries, names, pictures, markers, and text.",
		"routes": [["PM  Player Maps", 13, "", "player-maps.map-records"]],
	},
	"scripts": {
		"heading": "STORY SCRIPTS",
		"subtitle": "Map scripts, reusable behavior, global hooks, and quests.",
		"routes": [
			["AP  Action Points", 5, "", "scripts.action-points"],
			["EX  Extra Action Points", 3, "", "scripts.macros"],
			["GM  Global Macros", 6, "", "scripts.global-macros"],
			["QU  Quests", 14, "", "scripts.quests"],
		],
	},
	"text": {
		"heading": "STRINGS",
		"subtitle": "Scenario strings, reference tables, and export checks.",
		"routes": [
			["ST  String Editor", 0, "", "text.messages"],
			["RS  Reference Strings", 15, "", "text.text-resources"],
			["EC  Export Check", 16, "", "text.spell-check"],
		],
	},
	"encounters": {
		"heading": "ENCOUNTERS",
		"subtitle": "Simple, complex, rogue, and timed encounters.",
		"routes": [
			["SE  Simple Encounters", 2, "", "encounters.simple"],
			["CE  Complex Encounters", 17, "", "encounters.complex"],
			["RE  Rogue Encounters", 18, "", "encounters.rogue"],
			["TE  Timed Encounters", 19, "", "encounters.timed"],
		],
	},
	"scenario": {
		"heading": "SCENARIO",
		"subtitle": "Startup information, restrictions, contact metadata, and security.",
		"routes": [
			["SI  Startup Info", 26, "", "scenario.startup"],
			["RT  Restrictions", 27, "", "scenario.restrictions"],
			["CI  Contact Info", 28, "", "scenario.contact"],
			["SC  Security", 29, "", "scenario.registration"],
		],
	},
	"rules": {
		"heading": "CHARACTERS & MAGIC",
		"subtitle": "Spells, races and castes for scenario characters.",
		"routes": [
			["SP  Spell Editor", 23, "", "rules.spells"],
			["RA  Race Editor", 24, "", "rules.races"],
			["CA  Caste Editor", 25, "", "rules.castes"],
		],
	},
	"combat": {
		"heading": "COMBAT",
		"subtitle": "Battles, scenario monsters, and the Monster Library.",
		"routes": [
			["BA  Battle Editor", 20, "", "combat.battles"],
			["MO  Monster Editor", 30, "", "combat.monsters"],
			["ML  Monster Library", 31, "", "combat.scrapbook"],
		],
	},
	"economy": {
		"heading": "ECONOMY",
		"subtitle": "Scenario treasure, items, and shops.",
		"routes": [
			["TR  Treasure", 21, "", "economy.treasure"],
			["IT  Items", 4, "", "economy.items"],
			["SH  Shops", 22, "", "economy.shops"],
		],
	},
	"assets": {
		"heading": "ASSETS",
		"subtitle": "Scenario media, previews, and reference libraries.",
		"routes": [
			["AS  Scenario Assets", -1, "asset-scenario", "assets.project-assets"],
			["PI  Scenario Pictures", 7, "", "assets.pictures"],
			["SO  Scenario Sounds", 8, "", "assets.sounds"],
			["IC  Scenario Icons", 9, "", "assets.icons"],
			["TX  Text Resources", -1, "", "assets.text-resources"],
			["SL  Special Land Tiles", 10, "special-land-media", "assets.special-land"],
			["RL  Reference Libraries", -1, "asset-stock", "assets.library-assets"],
			["DR  Decoded Records", 37, "", "assets.decoded-records"],
			["AR  Advanced Resources", -1, "", "assets.resource-forks"],
		],
	},
	"linter": {
		"heading": "VALIDATE & PUBLISH",
		"subtitle": "Find issues, verify readiness, and publish deterministic targets.",
		"sidebarRoutes": VALIDATE_PUBLISH_ROUTES,
		"routes": [
			VALIDATE_PUBLISH_ROUTES[4],
			VALIDATE_PUBLISH_ROUTES[5],
			VALIDATE_PUBLISH_ROUTES[0],
			VALIDATE_PUBLISH_ROUTES[1],
		],
	},
	"export": {
		"heading": "VALIDATE & PUBLISH",
		"subtitle": "Find issues, verify readiness, and publish deterministic targets.",
		"sidebarRoutes": VALIDATE_PUBLISH_ROUTES,
		"routes": [
			VALIDATE_PUBLISH_ROUTES[2],
			VALIDATE_PUBLISH_ROUTES[3],
		],
	},
}

static func domain_for_tab(tab: int, fallback: String) -> String:
	var matches: Array[String] = []
	for domain in ROUTES:
		for route in ROUTES[domain].routes:
			if tab >= 0 and int(route[1]) == tab and not matches.has(domain):
				matches.append(domain)
	# Shared documents retain the activity from which the author opened them.
	if matches.has(fallback) or matches.is_empty(): return fallback
	return matches[0]


static func document_identity(tab: int) -> String:
	for domain in ROUTES.values():
		for route in domain.routes:
			if int(route[1]) == tab and tab >= 0: return str(route[3])
	for identity in LEGACY_ROUTE_DESTINATIONS:
		if int(LEGACY_ROUTE_DESTINATIONS[identity]) == tab: return identity
	return "assets.project-assets"


static func tab_for_route(identity: String) -> int:
	for domain in ROUTES.values():
		for route in domain.routes:
			if str(route[3]) == identity: return int(route[1])
	return int(LEGACY_ROUTE_DESTINATIONS.get(identity, -1))


static func tabs_for_domain(domain: String) -> Array[int]:
	var tabs: Array[int] = []
	for route in ROUTES.get(domain, {}).get("routes", []):
		var destination := int(route[1])
		if destination >= 0 and not tabs.has(destination):
			tabs.append(destination)
	var preferred := tab_for_route(str({"scripts": "scripts.macros", "economy": "economy.items", "linter":"linter.issues"}.get(domain, "")))
	if tabs.has(preferred):
		tabs.erase(preferred)
		tabs.push_front(preferred)
	return tabs


static func destination_summary(tab_count: int) -> Dictionary:
	var mapped := 0
	var unavailable: Array[String] = []
	var invalid: Array[String] = []
	for domain in ROUTES.values():
		for route in domain["routes"]:
			var destination := int(route[1])
			if destination == -1:
				unavailable.append(str(route[3]))
			elif destination < -1 or destination >= tab_count:
				invalid.append(str(route[3]))
			else:
				mapped += 1
	for identity in LEGACY_ROUTE_DESTINATIONS:
		var destination := int(LEGACY_ROUTE_DESTINATIONS[identity])
		if destination == -1:
			unavailable.append(identity)
		elif destination < -1 or destination >= tab_count:
			invalid.append(identity)
		else:
			mapped += 1
	unavailable.sort()
	invalid.sort()
	return {"mappedRoutes": mapped, "unavailableRoutes": unavailable, "invalidDestinations": invalid, "scope": "tab-destinations-only-not-fidelity-or-functional-parity"}
