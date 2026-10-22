extends RefCounted


# Godot's Windows process launch drops empty arguments, shifting the next
# option into the previous option's value; the adapter would then open or
# create a store at a path named after that option. Refuse the launch instead.
static func launch(executable: String, arguments: PackedStringArray) -> Dictionary:
	var empty := arguments.find("")
	if empty >= 0:
		return {"error": "Native adapter argument %s has an empty value." % (arguments[empty - 1] if empty > 0 else "0")}
	var process := OS.execute_with_pipe(executable, arguments, true)
	return process if not process.is_empty() else {"error": "Could not start the Providence native adapter."}


static func validate(response: Dictionary, process: Dictionary, required_protocol: int) -> Dictionary:
	if not response.get("ok", false):
		var rejected := response.duplicate(true)
		# This is only the initial session.describe handshake, never an authoring write.
		rejected.erase("outcomeUnknown")
		var stderr: FileAccess = process.get("stderr")
		if stderr != null and rejected.get("error", "") == "Native adapter closed the command stream.":
			var detail := _stderr_detail(stderr, process)
			if not detail.is_empty(): rejected.error = detail
		return rejected
	var result := response.get("result", {}) as Dictionary
	var reported := int(result.get("adapterProtocol", 0))
	if reported == required_protocol: return response
	return {"ok": false, "adapterProtocolMismatch": true,
		"error": "The selected native adapter does not match this editor (required protocol %d; reported %s). Restart Providence with a matching native build." % [required_protocol, "legacy" if reported == 0 else str(reported)]}


static func _stderr_detail(stderr: FileAccess, process: Dictionary) -> String:
	if not stderr.get_path().is_empty():
		return stderr.get_buffer(mini(8192, int(stderr.get_length()))).get_string_from_utf8().strip_edges()
	var pid := int(process.get("pid", -1))
	if pid <= 0 or OS.is_process_running(pid): return ""
	# Godot's pipe length query logs an engine error after an empty producer
	# exits. A bounded read at EOF is quiet; never block on a live producer.
	return stderr.get_buffer(8192).get_string_from_utf8().strip_edges()
