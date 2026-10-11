extends SceneTree


func _initialize() -> void:
	var text := "Élan · \"quoted\" \\ path \\v \\\\v"
	for code in range(1, 32): text += String.chr(code)
	var value := {"id": 7, "params": {"note": text, "name": "Élan\u0007"}}
	var encoded := preload("res://src/native_json.gd").stringify(value)
	var parsed: Dictionary = JSON.parse_string(encoded)
	assert(parsed.params.note == text and parsed.params.name == value.params.name and int(parsed.id) == 7)
	for code in range(1, 32): assert(not encoded.contains(String.chr(code)))
	assert(encoded.contains("\\u0007") and encoded.contains("Élan"))
	var path := "user://native-json-reader-%d.tmp" % OS.get_process_id()
	var writer := FileAccess.open(path, FileAccess.WRITE)
	writer.store_string(encoded + "\n" + "{\"id\":8}\n")
	writer.close()
	var reader := preload("res://src/native_json_line_reader.gd").new()
	var stream := FileAccess.open(path, FileAccess.READ)
	assert(reader.read(stream, func(): return false).is_empty() and stream.get_position() == 0)
	assert(reader.read(stream) == encoded)
	assert(reader.read(stream) == "{\"id\":8}")
	assert(reader.read(stream).is_empty())
	stream.close()
	assert(DirAccess.remove_absolute(path) == OK)
	print("PROVIDENCE_NATIVE_JSON_OK representable-control-characters-escaped-literal-backslashes-unicode-and-values-exact")
	quit()
