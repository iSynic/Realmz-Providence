extends RefCounted

const KINDS := {"text.messages":"message", "scripts.macros":"extra-action-point", "scripts.action-points":"action-point", "scripts.quests":"quest-flag", "encounters.simple":"simple-encounter", "encounters.complex":"complex-encounter", "encounters.rogue":"rogue-encounter", "encounters.timed":"timed-encounter", "combat.battles":"battle", "combat.monsters":"monster", "economy.shops":"shop", "economy.treasure":"treasure", "economy.items":"item", "maps.land":"map", "maps.dungeon":"map", "player-maps.map-records":"player-map", "rules.races":"race", "rules.castes":"caste", "rules.spells":"spell", "text.text-resources":"reference-string"}

static func record(view: Control, route: String) -> Dictionary:
	if view.has_method("discovery_selection"): return view.discovery_selection()
	var kind := str(KINDS.get(route, ""))
	var state: Dictionary = view.read_navigation_state() if view.has_method("read_navigation_state") else {}
	if state.is_empty() and view.has_method("read_state"): state = view.read_state()
	if route == "text.messages": kind = str(state.get("mode", "message"))
	var id := str(state.get("id", state.get("nativeId", "")))
	var identity := str(state.get("identity", state.get("source", "")))
	if identity.is_empty() and view.has_method("selected_identity"): identity = view.selected_identity()
	if identity.is_empty() and view.has_method("current_applied_identity"): identity = view.current_applied_identity()
	if kind == "monster": identity = "monster:%d:%s" % [int(state.get("setId", 0)), id]
	if kind == "quest-flag": identity = "quest:" + id
	if id.is_empty() and not identity.is_empty(): id = str(preload("res://src/source_navigation.gd").last_integer(identity))
	return {"kind":kind, "nativeId":id, "identity":identity, "scope":state.get("scope", "scenario")}
