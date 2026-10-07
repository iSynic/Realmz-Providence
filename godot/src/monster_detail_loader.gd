extends RefCounted

const RewardView = preload("res://src/monster_reward_view.gd")
const AppearanceView = preload("res://src/monster_appearance_view.gd")


static func load_scenario(request: Callable, result: Dictionary, current: Callable) -> Dictionary:
	var record: Dictionary = result.get("monster", {})
	var normal_flag: Variant = record.get("notOnMenu") if int(result.get("setId", 0)) == 0 else null
	if result.has("normalNotOnMenu"):
		normal_flag = result.normalNotOnMenu
	elif int(result.get("setId", 0)) != 0:
		var native_id := int(record.get("nativeId", -1))
		var normal: Dictionary = await request.call("monster.open", {"setId": 0, "nativeId": native_id})
		if normal.get("outcomeUnknown", false): return normal
		if not current.call(): return _changed()
		var normal_record: Dictionary = normal.get("result", {}).get("monster", {})
		if normal.get("ok", false) and int(normal_record.get("hitDice", 0)) != 0 and str(normal_record.get("identity", "")) == "monster:0:%d" % native_id:
			normal_flag = normal_record.get("notOnMenu")
	var art := await load_art(request, int(result.get("revision", -1)), int(record.get("iconId", 0)), current)
	art["normalFlag"] = normal_flag
	return art


static func load_art(request: Callable, revision: int, icon_id: int, current: Callable) -> Dictionary:
	var rewards: Dictionary = await request.call("monster-rewards.preview", {})
	if rewards.get("outcomeUnknown", false): return rewards
	if not current.call(): return _changed()
	var portrait: Dictionary = await request.call("monster-appearance.open", {"iconId": icon_id})
	if portrait.get("outcomeUnknown", false): return portrait
	if not current.call(): return _changed()
	return {"ok": true,
		"rewards": RewardView.from_projection(rewards.get("result", {}), revision) if rewards.get("ok", false) else [],
		"portrait": AppearanceView.from_projection(portrait.get("result", {}), icon_id) if portrait.get("ok", false) else {"texture": null, "status": str(portrait.get("error", "Appearance unavailable."))}}


static func _changed() -> Dictionary:
	return {"ok": false, "stale": true, "error": "The monster selection changed while loading its artwork."}
