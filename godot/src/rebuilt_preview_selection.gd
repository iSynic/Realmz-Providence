class_name ProvidenceRebuiltPreviewSelection
extends RefCounted

var _scrolling_text_target: Dictionary = {}
var _generation := 0


func clear_scrolling_text() -> void:
	_generation += 1
	_scrolling_text_target.clear()


func select_scrolling_text(bridge: RefCounted, operations: ProvidenceEditorOperation, resource_id: int) -> Dictionary:
	return await operations.run_workflow(bridge, "Select scrolling text", _select_scrolling_text.bind(resource_id, _generation))


func _select_scrolling_text(operation: ProvidenceEditorOperation, resource_id: int, generation: int) -> Dictionary:
	var response := await operation.request("text-resource.resolve-exact", {"resourceId": resource_id})
	if response.get("outcomeUnknown", false): return response
	if generation != _generation:
		return {"ok": false, "stale": true, "error": "The scrolling-text selection changed while loading."}
	return apply_scrolling_text_resolution(resource_id, response)


func resolve_scrolling_text(bridge: RefCounted, resource_id: int) -> Dictionary:
	clear_scrolling_text()
	if resource_id == 0:
		return {"ok": false, "error": "Scrolling-text preview requires the exact signed scenario TEXT resource ID."}
	var response := bridge.request("text-resource.resolve-exact", {"resourceId": resource_id}) as Dictionary
	return apply_scrolling_text_resolution(resource_id, response)


func apply_scrolling_text_resolution(resource_id: int, response: Dictionary) -> Dictionary:
	clear_scrolling_text()
	if not bool(response.get("ok", false)):
		return response.duplicate(true)
	var result := response.get("result", {}) as Dictionary
	var resource := result.get("resource", {}) as Dictionary
	if (
		str(result.get("ownership", "")) != "scenario"
		or str(resource.get("resourceType", "")) != "TEXT"
		or int(resource.get("resourceId", 0)) != resource_id
		or str(resource.get("identity", "")).is_empty()
	):
		return {"ok": false, "error": "The selected value did not resolve to one exact scenario-owned TEXT resource."}
	_scrolling_text_target = {"kind": "scrolling-text", "id": resource_id}
	return {"ok": true, "target": _scrolling_text_target.duplicate(true)}


func resolve_player_map_text(bridge: RefCounted, player_map: Dictionary) -> Dictionary:
	var show_value: Variant = player_map.get("show")
	if not show_value is int or int(show_value) >= 0:
		clear_scrolling_text()
		return {"ok": false, "error": "The applied Player Map does not select scrolling TEXT."}
	return resolve_scrolling_text(bridge, int(show_value))


func current_target(
	route: String,
	map_identity: String,
	map_cell: Vector2i,
	encounter: Dictionary,
	action_point: Dictionary,
	action_point_map: String,
	battle_native_id := -1,
	treasure_native_id := -1,
	shop_native_id := -1,
	complex_native_id := -1,
	rogue_native_id := -1,
	rogue_owner_native_id := -1,
	extra_action_point_native_id := -1,
) -> Dictionary:
	if route in ["maps.land", "maps.dungeon"] and not map_identity.is_empty() and map_cell.x >= 0 and map_cell.y >= 0:
		return {"kind": "map-location", "id": map_identity, "mapId": map_identity, "x": map_cell.x, "y": map_cell.y}
	if route == "encounters.simple" and not encounter.is_empty() and int(encounter.get("nativeId", -1)) >= 0:
		return {"kind": "simple-encounter", "id": int(encounter.get("nativeId", -1))}
	var coordinate_value: Variant = action_point.get("coordinate")
	if route == "scripts.action-points" and not action_point.is_empty() and coordinate_value is Dictionary:
		var coordinate := coordinate_value as Dictionary
		var runtime_identity := _runtime_action_point_identity(action_point)
		if runtime_identity.is_empty():
			return {}
		return {
			"kind": "action-point",
			"id": runtime_identity,
			"mapId": action_point_map,
			"x": int(coordinate.get("x", 0)),
			"y": int(coordinate.get("y", 0)),
		}
	if route in ["player-maps.map-records", "text.text-resources"] and not _scrolling_text_target.is_empty():
		return _scrolling_text_target.duplicate(true)
	if route == "combat.battles" and battle_native_id >= 0:
		return {"kind": "battle", "id": battle_native_id}
	if route == "economy.treasure" and treasure_native_id >= 0:
		return {"kind": "treasure", "id": treasure_native_id}
	if route == "economy.shops" and shop_native_id >= 0:
		return {"kind": "shop", "id": shop_native_id}
	if route == "encounters.complex" and complex_native_id >= 0:
		return {"kind": "complex-encounter", "id": complex_native_id}
	if route == "encounters.rogue" and rogue_native_id >= 0 and rogue_owner_native_id >= 0:
		return {"kind": "thief-encounter", "id": rogue_native_id, "complexEncounterId": rogue_owner_native_id}
	if route == "scripts.macros" and extra_action_point_native_id >= 0:
		return {"kind": "extra-action-point-program", "id": extra_action_point_native_id}
	return {}


func _runtime_action_point_identity(point: Dictionary) -> String:
	var level_type := str(point.get("levelType", ""))
	var level_index := int(point.get("levelIndex", -1))
	var record_index := int(point.get("recordIndex", -1))
	if level_type not in ["land", "dungeon"] or level_index < 0 or record_index < 0 or record_index >= 100:
		return ""
	if str(point.get("identity", "")) != "action-point:%s:%d:%d" % [level_type, level_index, record_index]:
		return ""
	var source := "Data DD" if level_type == "land" else "Data DDD"
	return "%s:%d:%d" % [source, level_index, record_index]
