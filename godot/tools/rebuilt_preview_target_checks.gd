extends RefCounted

static func exercise(controller: Node, fail: Callable) -> bool:
	if not _exercise_native_action_point(controller, fail):
		return false
	if not _exercise_encounters_and_programs(controller, fail):
		return false
	if not _exercise_presentation_and_economy(controller, fail):
		return false
	if not _exercise_invalid_targets(controller, fail):
		return false
	return true


static func _exercise_native_action_point(controller: Node, fail: Callable) -> bool:
	var selection := ProvidenceRebuiltPreviewSelection.new()
	var point := {"identity": "action-point:land:0:4", "levelType": "land", "levelIndex": 0, "recordIndex": 4, "coordinate": {"x": 5, "y": 11}}
	var action_point := controller._target_arguments(selection.current_target("scripts.action-points", "", Vector2i(-1, -1), {}, point, "land:0")) as Dictionary
	point["levelType"] = "dungeon"
	point["identity"] = "action-point:dungeon:0:4"
	var dungeon_target := selection.current_target("scripts.action-points", "", Vector2i(-1, -1), {}, point, "dungeon:0")
	point["identity"] = "Data DDD:0:4"
	if dungeon_target.get("id") != "Data DDD:0:4" or not selection.current_target("scripts.action-points", "", Vector2i(-1, -1), {}, point, "dungeon:0").is_empty():
		fail.call("AP runtime identity did not preserve native ownership or accepted a noncanonical editor identity")
		return false
	if (
		not bool(action_point.get("ok", false))
		or str(action_point.get("command", "")) != "prepare-action-point"
		or (action_point.get("arguments", PackedStringArray()) as PackedStringArray) != PackedStringArray(["Data DD:0:4", "land:0", "5", "11"])
	):
		fail.call("typed target argument mapping changed")
		return false
	return true


static func _exercise_encounters_and_programs(controller: Node, fail: Callable) -> bool:
	var encounter := controller._target_arguments({"kind": "simple-encounter", "id": 7}) as Dictionary
	var complex := controller._target_arguments({"kind": "complex-encounter", "id": 3}) as Dictionary
	var thief := controller._target_arguments({"kind": "thief-encounter", "id": 1, "complexEncounterId": 3}) as Dictionary
	var extra_action_point := controller._target_arguments({"kind": "extra-action-point-program", "id": 80}) as Dictionary
	var maximum_extra_action_point := controller._target_arguments({"kind": "extra-action-point-program", "id": 4294967295}) as Dictionary
	if (
		not bool(encounter.get("ok", false))
		or str(encounter.get("command", "")) != "prepare-simple-encounter"
		or not bool(complex.get("ok", false))
		or str(complex.get("command", "")) != "prepare-complex-encounter"
		or (complex.get("arguments", PackedStringArray()) as PackedStringArray) != PackedStringArray(["3"])
		or not bool(thief.get("ok", false))
		or str(thief.get("command", "")) != "prepare-thief-encounter"
		or (thief.get("arguments", PackedStringArray()) as PackedStringArray) != PackedStringArray(["1", "3"])
		or not bool(extra_action_point.get("ok", false))
		or str(extra_action_point.get("command", "")) != "prepare-extra-action-point-program"
		or (extra_action_point.get("arguments", PackedStringArray()) as PackedStringArray) != PackedStringArray(["80"])
		or not bool(maximum_extra_action_point.get("ok", false))
		or (maximum_extra_action_point.get("arguments", PackedStringArray()) as PackedStringArray) != PackedStringArray(["4294967295"])
	):
		fail.call("typed target argument mapping changed")
		return false
	return true


static func _exercise_presentation_and_economy(controller: Node, fail: Callable) -> bool:
	var map_location := controller._target_arguments({
		"kind": "map-location", "id": "dungeon:2", "mapId": "dungeon:2", "x": 17, "y": 41,
	}) as Dictionary
	var map_location_topology_deferred := controller._target_arguments({
		"kind": "map-location", "id": "land:0", "mapId": "land:0", "x": 120, "y": 95,
	}) as Dictionary
	var scrolling_text := controller._target_arguments({"kind": "scrolling-text", "id": -201}) as Dictionary
	var battle := controller._target_arguments({"kind": "battle", "id": 2}) as Dictionary
	var treasure := controller._target_arguments({"kind": "treasure", "id": 1}) as Dictionary
	var shop := controller._target_arguments({"kind": "shop", "id": 1}) as Dictionary
	if (
		not bool(map_location.get("ok", false))
		or str(map_location.get("command", "")) != "prepare-map-location"
		or (map_location.get("arguments", PackedStringArray()) as PackedStringArray) != PackedStringArray(["dungeon:2", "dungeon:2", "17", "41"])
		or not bool(map_location_topology_deferred.get("ok", false))
		or not bool(scrolling_text.get("ok", false))
		or str(scrolling_text.get("command", "")) != "prepare-scrolling-text"
		or (scrolling_text.get("arguments", PackedStringArray()) as PackedStringArray) != PackedStringArray(["-201"])
		or not bool(battle.get("ok", false))
		or str(battle.get("command", "")) != "prepare-battle"
		or (battle.get("arguments", PackedStringArray()) as PackedStringArray) != PackedStringArray(["2"])
		or not bool(treasure.get("ok", false))
		or str(treasure.get("command", "")) != "prepare-treasure"
		or (treasure.get("arguments", PackedStringArray()) as PackedStringArray) != PackedStringArray(["1"])
		or not bool(shop.get("ok", false))
		or str(shop.get("command", "")) != "prepare-shop"
		or (shop.get("arguments", PackedStringArray()) as PackedStringArray) != PackedStringArray(["1"])
	):
		fail.call("typed target argument mapping changed")
		return false
	return true


static func _exercise_invalid_targets(controller: Node, fail: Callable) -> bool:
	var negative_battle := controller._target_arguments({"kind": "battle", "id": -1}) as Dictionary
	var string_battle := controller._target_arguments({"kind": "battle", "id": "2"}) as Dictionary
	var negative_treasure := controller._target_arguments({"kind": "treasure", "id": -1}) as Dictionary
	var string_shop := controller._target_arguments({"kind": "shop", "id": "1"}) as Dictionary
	var missing_thief_owner := controller._target_arguments({"kind": "thief-encounter", "id": 1}) as Dictionary
	var string_thief_owner := controller._target_arguments({"kind": "thief-encounter", "id": 1, "complexEncounterId": "3"}) as Dictionary
	var negative_extra_action_point := controller._target_arguments({"kind": "extra-action-point-program", "id": -1}) as Dictionary
	var string_extra_action_point := controller._target_arguments({"kind": "extra-action-point-program", "id": "80"}) as Dictionary
	var overflow_extra_action_point := controller._target_arguments({"kind": "extra-action-point-program", "id": 4294967296}) as Dictionary
	var mismatched_map := controller._target_arguments({
		"kind": "map-location", "id": "land:0", "mapId": "land:1", "x": 4, "y": 9,
	}) as Dictionary
	var noncanonical_map := controller._target_arguments({
		"kind": "map-location", "id": "land:00", "mapId": "land:00", "x": 4, "y": 9,
	}) as Dictionary
	var zero_text := controller._target_arguments({"kind": "scrolling-text", "id": 0}) as Dictionary
	var unsupported := controller._target_arguments({"kind": "message", "id": 4}) as Dictionary
	if (
		bool(negative_battle.get("ok", true))
		or bool(string_battle.get("ok", true))
		or bool(negative_treasure.get("ok", true))
		or bool(string_shop.get("ok", true))
		or bool(missing_thief_owner.get("ok", true))
		or bool(string_thief_owner.get("ok", true))
		or bool(negative_extra_action_point.get("ok", true))
		or bool(string_extra_action_point.get("ok", true))
		or bool(overflow_extra_action_point.get("ok", true))
		or bool(mismatched_map.get("ok", true))
		or bool(noncanonical_map.get("ok", true))
		or bool(zero_text.get("ok", true))
		or bool(unsupported.get("ok", true))
	):
		fail.call("typed target argument mapping changed")
		return false
	return true
