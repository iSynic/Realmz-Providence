extends RefCounted

# Route identities preserve the existing workbench headers and Apply affordances.
const HEADERS := {
	"text.messages": ["  STORY  /  STRING EDITOR", "Commit Edit", true],
	"maps.land": ["  WORLD  /  LAND EDITOR", "Commit Edit", false],
	"encounters.simple": ["  STORY  /  SIMPLE ENCOUNTERS", "Apply Encounter", true],
	"scripts.macros": ["  STORY  /  EXTRA ACTION POINTS", "Apply Extra AP", true],
	"economy.items": ["  ACTORS & SYSTEMS  /  ITEMS", "Commit Item Edit", true],
	"rules.spells": ["  CHARACTERS & MAGIC  /  SPELLS", "Apply Spell", true],
	"scripts.action-points": ["  STORY  /  ACTION POINTS", "Apply Action Point", true],
	"scripts.global-macros": ["  STORY  /  GLOBAL MACROS", "Apply Hook", true],
	"assets.pictures": ["  MEDIA  /  SCENARIO PICTURES", "Apply Picture", true],
	"assets.sounds": ["  MEDIA  /  SCENARIO SOUNDS", "Apply Sound", true],
	"assets.icons": ["  MEDIA  /  SCENARIO ICONS", "Apply Icon", true],
	"maps.dungeon": ["  WORLD  /  DUNGEON EDITOR", "Apply Dungeon Flag", false],
	"maps.layout": ["  WORLD  /  LAND LAYOUT", "Apply Layout", false],
	"player-maps.map-records": ["  WORLD  /  PLAYER MAPS", "Apply Player Map", true],
	"scripts.quests": ["  STORY  /  QUESTS", "Apply Quest Label", false],
	"text.text-resources": ["  STORY  /  REFERENCE STRINGS", "Apply Text Resource", false],
	"text.spell-check": ["  STORY  /  EXPORT CHECK", "No Edit", false],
	"encounters.complex": ["  STORY  /  COMPLEX ENCOUNTERS", "Apply Complex Encounter", false],
	"encounters.rogue": ["  STORY  /  ROGUE ENCOUNTERS", "Apply Rogue Encounter", false],
	"encounters.timed": ["  STORY  /  TIMED ENCOUNTERS", "Apply Timed Encounter", false],
	"economy.vault": ["  ECONOMY  /  VAULT OF ARCANA", "", false],
	"assets.project-assets": ["  MEDIA  /  ASSETS", "", false],
	"assets.library-assets": ["  MEDIA  /  ASSETS", "", false],
	"linter.readiness": ["  VALIDATE  /  READINESS", "", false],
	"export.export-plan": ["  PUBLISH  /  EXPORT PLAN", "", false],
	"export.benchmark": ["  PUBLISH  /  BENCHMARK", "", false],
}


static func describe(identity: String, view: Control, special_land_world: bool) -> Dictionary:
	var header: Array = HEADERS.get(identity, [])
	if identity in ["maps.special-land", "assets.special-land"]:
		header = ["  %s  /  SPECIAL LAND TILES" % ("WORLD" if special_land_world else "MEDIA"), "Apply Tile", not special_land_world]
	elif header.is_empty() and view.has_method("workbench_title"):
		header = [view.workbench_title(), view.apply_label(), false]
	assert(not header.is_empty(), "Every mapped document needs its existing header")
	if identity == "text.messages": header = [header[0],view.apply_label(),header[2]]
	return {"title": header[0], "applyLabel": header[1], "canApply": header[2],
		"showApply": not (identity in ["maps.special-land","assets.special-land"] and special_land_world) and identity not in ["scenario.startup", "scenario.restrictions", "scenario.contact", "scenario.registration", "player-maps.map-records", "economy.treasure", "economy.shops", "economy.items", "rules.spells", "rules.races", "rules.castes", "economy.vault", "assets.project-assets", "assets.library-assets", "linter.readiness", "export.export-plan", "export.benchmark"],
		"compactApply": identity in ["economy.items", "scripts.action-points", "scripts.macros", "scripts.quests", "text.messages"]}
