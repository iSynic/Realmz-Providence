extends RefCounted

static func open(navigation, reference: Dictionary) -> bool:
	var epoch: int = navigation.session_epoch()
	var source := str(reference.get("source", ""))
	var field := str(reference.get("field", ""))
	var destination := preload("res://src/diagnostic_destination.gd").describe(reference)
	if destination.get("route", "").begins_with("scenario."):
		await navigation.select_route(destination.route)
		if navigation.session_epoch()!=epoch or navigation.current_route()!=destination.route: return false
		await _focus(navigation, source, -1, field)
		return navigation.session_epoch()==epoch
	if source == "land-layout" or (source.begins_with("land:") or source.begins_with("dungeon:")) and not source.contains(":rect:"):
		if source == "land-layout": await navigation.select_route("maps.layout")
		elif not await navigation.open_map(source): return false
		if navigation.session_epoch()!=epoch or navigation.current_route()!=destination.get("route",""): return false
		await _focus(navigation, source, -1, field)
		return navigation.session_epoch()==epoch
	if source == "global" or field.begins_with("scenarioApplication.hooks."):
		await navigation.select_route("scripts.global-macros")
		var view: Control = navigation.current_view()
		if navigation.session_epoch()!=epoch or navigation.current_route()!="scripts.global-macros": return false
		if view.has_method("focus_source"): await view.focus_source(source, -1, field)
		return navigation.session_epoch()==epoch
	if source.contains(":rect:"):
		return await navigation.open_script_target("random-rectangle", 0, source, {"levelType":"dungeon" if source.begins_with("dungeon") else "land"})
	var kind := source.get_slice(":", 0)
	if source.begins_with("classic."): kind = source.get_slice(".", 1)
	var slot := int(reference.get("slot", action_slot(field)))
	var id := last_integer(source)
	if kind == "action-point": kind = "same-map-action-point"
	if kind == "icon": kind = "monster-appearance"
	if kind == "monster-description": kind = "monster"; source = "monster:0:%d" % id
	if kind == "text-resource":
		return await navigation.open_diagnostic_asset(source, "scenario")
	if kind not in ["simple-encounter", "extra-action-point", "same-map-action-point", "complex-encounter", "rogue-encounter", "timed-encounter", "battle", "treasure", "shop", "player-map", "monster", "caste", "race", "item", "spell", "message", "option-label", "picture", "sound", "monster-appearance"] or (id < 0 and kind not in ["picture", "sound", "monster-appearance"]):
		navigation.status_changed.emit("No exact authoring destination is available for %s · %s" % [source, field])
		return false
	if not await navigation.open_script_target(kind, id, source, {}): return false
	if navigation.session_epoch()!=epoch: return false
	await _focus(navigation, source, slot, field)
	if kind == "rogue-encounter" and reference.get("callerContext") != null:
		await navigation.current_view().select_calling_owner(str(reference.callerContext))
	return navigation.session_epoch()==epoch

static func _focus(navigation, source: String, slot: int, field: String) -> void:
	var view: Control = navigation.current_view()
	if field.is_empty(): return
	if view.has_method("focus_authoring_field"):
		view.focus_authoring_field(field); return
	if not view.has_method("focus_source"):
		navigation.status_changed.emit("Opened owning record; exact field navigation is unavailable for " + field)
		return
	var focused = await view.focus_source(source, slot, field)
	if focused is bool and not focused:
		navigation.status_changed.emit("Opened owning record; exact field navigation is unavailable for " + field)

static func unavailable_reason(reference: Dictionary) -> String:
	var source := str(reference.get("source", ""))
	var field := str(reference.get("field", ""))
	if field == "runtime.landlook": return "Map tileset selection is not yet an authoring control."
	if field == "partyMarker": return "The party marker is a fixed presentation resource; its appearance has no authoring control."
	return ""

static func action_slot(field: String) -> int:
	var regex := RegEx.new()
	regex.compile("(?:results\\[(\\d+)\\].*)?actions\\[(\\d+)\\]")
	var match := regex.search(field)
	return int(match.get_string(2)) + (int(match.get_string(1)) * 8 if not match.get_string(1).is_empty() else 0) if match != null else -1

static func last_integer(identity: String) -> int:
	for index in range(identity.get_slice_count(":") - 1, -1, -1):
		var part := identity.get_slice(":", index)
		if part.is_valid_int(): return int(part)
	var tail := identity.get_slice(".", identity.get_slice_count(".") - 1)
	return int(tail) if tail.is_valid_int() else -1
