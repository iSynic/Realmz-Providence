extends RefCounted

const KINDS := {"text.messages":"message", "scripts.macros":"extra-action-point", "scripts.action-points":"action-point", "scripts.quests":"quest-flag", "encounters.simple":"simple-encounter", "encounters.complex":"complex-encounter", "encounters.rogue":"rogue-encounter", "encounters.timed":"timed-encounter", "combat.battles":"battle", "combat.monsters":"monster", "economy.shops":"shop", "economy.treasure":"treasure", "economy.items":"item", "maps.land":"map", "maps.dungeon":"map", "player-maps.map-records":"player-map", "rules.races":"race", "rules.castes":"caste", "rules.spells":"spell", "text.text-resources":"reference-string"}

static func record(view: Control, route: String) -> Dictionary:
	if view.has_method("discovery_selection"): return view.discovery_selection()
	var kind := str(KINDS.get(route, ""))
	var state: Dictionary = view.read_navigation_state() if view.has_method("read_navigation_state") else {}
	if state.is_empty() and view.has_method("read_state"): state = view.read_state()
	if state.get("flowSelection") is Dictionary and not state.flowSelection.is_empty():
		var contextual: Dictionary = state.flowSelection.duplicate(true)
		contextual.kind = "simple-encounter-result" if route == "encounters.simple" else "complex-encounter-result"
		return contextual
	if route == "text.messages": kind = str(state.get("mode", "message"))
	var id := str(state.get("id", state.get("nativeId", "")))
	var identity := str(state.get("identity", state.get("source", "")))
	if identity.is_empty() and view.has_method("selected_identity"): identity = view.selected_identity()
	if identity.is_empty() and view.has_method("current_applied_identity"): identity = view.current_applied_identity()
	if kind == "monster": identity = "monster:%d:%s" % [int(state.get("setId", 0)), id]
	if kind == "quest-flag": identity = "quest:" + id
	if id.is_empty() and not identity.is_empty(): id = str(preload("res://src/source_navigation.gd").last_integer(identity))
	var selection := {"kind":kind, "nativeId":id, "identity":identity, "scope":state.get("scope", "scenario")}
	for key in ["entryPosition", "throughPosition", "callerContext"]:
		if state.get(key) != null: selection[key] = state[key]
	if kind == "rogue-encounter" and int(state.get("owner", -1)) >= 0:
		selection.callerContext = "complex-encounter:%d" % int(state.owner)
	return selection

static func flow_selection(record: Dictionary) -> Dictionary:
	var result := {"identity":record.get("identity", ""), "scope":record.get("scope", "scenario")}
	for key in ["entryPosition", "throughPosition", "callerContext"]:
		if record.get(key) != null: result[key] = record[key]
	if not result.has("entryPosition") and record.get("tracePosition") != null: result.entryPosition = record.tracePosition
	if not result.has("callerContext") and record.get("traceCallerContext") != null: result.callerContext = record.traceCallerContext
	return result
