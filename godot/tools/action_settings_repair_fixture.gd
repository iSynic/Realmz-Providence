extends RefCounted

var bridge
var revision := 0
var error := ""


func create(native_bridge, path: String, shared_count := 1) -> bool:
	bridge = native_bridge
	var response: Dictionary = bridge.create_project("repair-workflow", path)
	if not response.get("ok", false):
		error = str(response.get("error", "Could not create disposable project"))
		return false
	revision = int(response.result.revision)
	for index in 2:
		if not mutate("map.create", {"levelType": "land"}): return false
	if not _add_area() or not _add_callers(shared_count): return false
	return mutate("extra-code.upsert", {"row": {"nativeId": 10, "values": [1, 3, 0, 250, 0]}})


func _add_area() -> bool:
	return mutate("random-rectangle.upsert", {"mapIdentity": "land:1", "randomRectangle": {
		"identity": "land:1:rect:3", "top": 1, "left": 2, "bottom": 3, "right": 4,
		"chanceTenThousand": 500, "battleRange": [0, 0], "randomDoors": [0, 0, 0], "randomDoorPercent": [0, 0, 0],
		"only": false, "option": 0, "soundId": 0, "textId": 0}})


func _add_callers(shared_count: int) -> bool:
	for index in shared_count:
		if not mutate("extra-action-point.create", {"nativeId": 158 + index}): return false
		var response: Dictionary = bridge.request("extra-action-point.open", {"identity": "extra-action-point:%d" % (158 + index)})
		if not response.get("ok", false): return false
		var record: Dictionary = response.result.extraActionPoint
		record.actions = [{"slot": 4, "rawOpcode": 92, "targetNativeId": 10}]
		if not mutate("extra-action-point.update", {"extraActionPoint": record}): return false
	return true


func create_exhausted(native_bridge, path: String) -> bool:
	if not create(native_bridge, path, 2): return false
	var source := path.path_join("capacity-source")
	if DirAccess.make_dir_recursive_absolute(source) != OK: return false
	# Synthetic native rows occupy every possible consecutive pair, including unused rows.
	for file in [["Data LD", 32400], ["Data DD", 8000], ["Data RD", 1288], ["Data SD2", 256], ["Data ED", 426], ["Data EDCD", 327690]]:
		var bytes := PackedByteArray()
		bytes.resize(file[1])
		if file[0] == "Data EDCD":
			# A nonzero word in every even row blocks every contiguous pair while
			# leaving stored all-zero rows available under the actual allocation rule.
			for native_id in range(0, 32769, 2): bytes[native_id * 10 + 1] = 1
			var words := [1, 3, 0, 250, 0, 9, 18, 13, 24, 512]
			for index in words.size():
				bytes[100 + index * 2] = (words[index] >> 8) & 255
				bytes[101 + index * 2] = words[index] & 255
		var output := FileAccess.open(source.path_join(file[0]), FileAccess.WRITE)
		if output == null: return false
		output.store_buffer(bytes)
		output.close()
	if not mutate("project.import-classic-land-slice", {"directory": source}) or not _add_area() or not _add_callers(2): return false
	var response: Dictionary = bridge.request("extra-action-point.open", {"identity": "extra-action-point:159"})
	if not response.get("ok", false): return false
	var record: Dictionary = response.result.extraActionPoint
	record.actions = [{"slot": 4, "rawOpcode": 2, "targetNativeId": 11}]
	return mutate("extra-action-point.update", {"extraActionPoint": record})


func mutate(method: String, params: Dictionary) -> bool:
	params["expectedRevision"] = revision
	var response: Dictionary = bridge.request(method, params)
	if not response.get("ok", false):
		error = "%s: %s" % [method, response.get("error", "Failed")]
		return false
	revision = int(response.result.revision)
	return true
