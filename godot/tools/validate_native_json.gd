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
	_check_live_pipe()
	print("PROVIDENCE_NATIVE_JSON_OK representable-control-characters-escaped-literal-backslashes-unicode-and-values-exact")
	quit()


func _check_live_pipe() -> void:
	var executable := ProvidenceNativeBridge.new()._adapter_path()
	var child := OS.execute_with_pipe(executable, PackedStringArray(["serve-demo"]), true)
	assert(not child.is_empty())
	var stream: FileAccess = child.stdio
	for request in [
		{"id":1,"method":"session.describe","params":{}},
		{"id":2,"method":"action-definition.list","params":{}},
		{"id":3,"method":"session.describe","params":{}}
	]: stream.store_line(preload("res://src/native_json.gd").stringify(request))
	var reader := preload("res://src/native_json_line_reader.gd").new()
	var small: Dictionary = JSON.parse_string(reader.read(stream))
	assert(small.ok and int(small.id) == 1)
	var large := reader.read(stream)
	assert(large.to_utf8_buffer().size() > 16 * 1024)
	var parsed: Dictionary = JSON.parse_string(large)
	assert(parsed.ok and int(parsed.id) == 2)
	assert(int(JSON.parse_string(reader.read(stream)).id) == 3)
	stream.close()
	var deadline := Time.get_ticks_msec() + 5000
	while OS.is_process_running(child.pid) and Time.get_ticks_msec() < deadline: OS.delay_msec(1)
	assert(not OS.is_process_running(child.pid), "JSON pipe fixture did not close")
	print("NATIVE_JSON_PIPE_OK live-producer small-large-small partial-chunks queued-frames bounded-reads")
