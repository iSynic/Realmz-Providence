extends RefCounted

static func _write_bytes(shell: Control, path: String, bytes: PackedByteArray) -> bool:
	var file := FileAccess.open(path, FileAccess.WRITE)
	if file == null:
		return false
	file.store_buffer(bytes)
	file.close()
	return true

static func _array_has_int(shell: Control, values: Array, expected: int) -> bool:
	for value in values:
		if int(value) == expected:
			return true
	return false

static func _find_action_point(shell: Control, opened_map: Dictionary, record_index: int) -> Dictionary:
	for item in opened_map.get("actionPoints", []) as Array:
		var action_point := item as Dictionary
		if int(action_point.get("recordIndex", -1)) == record_index:
			return action_point
	return {}

static func _action_target(shell: Control, action_point: Dictionary, slot: int) -> int:
	for item in action_point.get("actions", []) as Array:
		var action := item as Dictionary
		if int(action.get("slot", -1)) == slot:
			return int(action.get("targetNativeId", -1))
	return -1

static func _encounter_action_target(shell: Control, encounter: Dictionary, slot: int) -> int:
	for item in encounter.get("actions", []) as Array:
		var action := item as Dictionary
		if int(action.get("slot", -1)) == slot:
			return int(action.get("targetNativeId", -1))
	return -1


static func _smoke_fail(shell: Control, message: String) -> void:
	push_error("PROVIDENCE_UI_SMOKE_FAILED: %s" % message)
	shell.get_tree().quit(1)
