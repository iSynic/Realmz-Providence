extends "res://tools/action_settings_repair_fixture.gd"


func create_messages(native_bridge, path: String, shared_count := 1, last_message := 9) -> bool:
	if not create(native_bridge, path, shared_count): return false
	for id in range(1, last_message + 1):
		if not mutate("message.create", {"nativeId": id, "text": "Authored message %d\n  café, preserved spacing  " % id}): return false
	for index in shared_count:
		var response: Dictionary = bridge.request("extra-action-point.open", {"identity": "extra-action-point:%d" % (158 + index)})
		if not response.get("ok", false): return false
		var record: Dictionary = response.result.extraActionPoint
		record.actions = [{"slot": 4, "rawOpcode": 19, "targetNativeId": 10}]
		if not mutate("extra-action-point.update", {"extraActionPoint": record}): return false
	return true
