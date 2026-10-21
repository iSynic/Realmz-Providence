extends SceneTree

class IsolatedBridge extends ProvidenceNativeBridge:
	func configured_application_library_root(_explicit_root: String = "") -> String: return ""
	func configured_reference_catalog_root(_explicit_root: String = "") -> String: return ""

var _failed := false


func _initialize() -> void: _run.call_deferred()


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 1: quit(1); return
	var task_root := args[0]
	var project := task_root.path_join("project")
	var missing := task_root.path_join("missing-monster-library")
	var source := project.path_join("project.providence.json")
	var before := FileAccess.get_sha256(source)
	var previous := OS.get_environment("PROVIDENCE_MONSTER_LIBRARY_ROOT")
	OS.set_environment("PROVIDENCE_MONSTER_LIBRARY_ROOT", missing)
	var sync := IsolatedBridge.new(task_root.path_join("settings.cfg"))
	_check_failure(sync.start_project(project), "Synchronous")
	sync.stop()
	var candidate := IsolatedBridge.new(task_root.path_join("settings.cfg"))
	var started := candidate.begin_project_start(project)
	_check(started.get("ok", false), "Asynchronous connection did not start.")
	if started.get("ok", false):
		var deadline := Time.get_ticks_msec() + 10000
		while Time.get_ticks_msec() < deadline:
			await process_frame
			var polled := candidate.poll_request()
			if polled.get("pending", false): continue
			_check_failure(polled.response, "Asynchronous")
			break
		_check(not candidate.operation_busy(), "Failed startup left its worker or lease pending.")
	candidate.stop()
	if previous.is_empty(): OS.unset_environment("PROVIDENCE_MONSTER_LIBRARY_ROOT")
	else: OS.set_environment("PROVIDENCE_MONSTER_LIBRARY_ROOT", previous)
	_check(FileAccess.get_sha256(source) == before, "Failed startup changed the portable project.")
	var validator = preload("res://src/native_connection_startup.gd")
	var mismatch: Dictionary = validator.validate({"ok": true, "result": {"adapterProtocol": 999}}, {}, 2)
	_check(not mismatch.get("ok", true) and mismatch.get("adapterProtocolMismatch", false), "Wrong adapter protocol was accepted.")
	var valid := {"ok": true, "result": {"adapterProtocol": 2}}
	_check(validator.validate(valid, {}, 2) == valid, "Valid handshake was altered.")
	_check_diagnostic_boundary(task_root)
	await _check_closed_pipe()
	if not _failed: print("PROVIDENCE_CONNECTION_STARTUP_OK sync=precise async=precise source=unchanged")
	quit(1 if _failed else 0)


func _check_diagnostic_boundary(task_root: String) -> void:
	var path := task_root.path_join("bounded-stderr.txt")
	var output := FileAccess.open(path, FileAccess.WRITE)
	output.store_string("x".repeat(9000))
	output.close()
	var stderr := FileAccess.open(path, FileAccess.READ)
	var validator = preload("res://src/native_connection_startup.gd")
	var closed := {"ok": false, "outcomeUnknown": true, "error": "Native adapter closed the command stream."}
	var explained: Dictionary = validator.validate(closed, {"stderr": stderr}, 2)
	_check(explained.error.length() == 8192 and closed.outcomeUnknown, "Startup diagnostic was unbounded or changed its input.")
	stderr.seek(0)
	var explicit := {"ok": false, "error": "Explicit startup rejection"}
	_check(validator.validate(explicit, {"stderr": stderr}, 2) == explicit, "Unrelated stderr replaced a structured rejection.")
	_check(stderr.get_position() == 0, "Structured rejection consumed unrelated stderr.")
	stderr.close()


func _check_failure(response: Dictionary, kind: String) -> void:
	_check(not response.get("ok", true), kind + " startup unexpectedly succeeded.")
	_check(not response.get("outcomeUnknown", false), kind + " startup was confused with an unconfirmed authoring write.")
	var error := str(response.get("error", ""))
	_check(error.contains("could not open Monster Library") and error.contains("monster-library.providence.json"), kind + " startup lost the configured library diagnostic: " + error)


func _check_closed_pipe() -> void:
	var executable := IsolatedBridge.new()._adapter_path()
	var child := OS.execute_with_pipe(executable, PackedStringArray(["build-identity"]), true)
	_check(not child.is_empty(), "Could not start the closed-pipe probe.")
	if child.is_empty(): return
	var deadline := Time.get_ticks_msec() + 10000
	while OS.is_process_running(child.pid) and Time.get_ticks_msec() < deadline: await process_frame
	_check(not OS.is_process_running(child.pid), "Closed-pipe probe did not exit.")
	if OS.is_process_running(child.pid): OS.kill(child.pid); return
	var closed := {"ok":false,"outcomeUnknown":true,"error":"Native adapter closed the command stream."}
	var response: Dictionary = preload("res://src/native_connection_startup.gd").validate(closed, child, 2)
	_check(response.error == closed.error and not response.get("outcomeUnknown", false), "An empty exited stderr pipe changed the startup rejection.")
	print("CONNECTION_CLOSED_PIPE_OK empty-exited-producer bounded-diagnostics no-uncertain-write")


func _check(value: bool, message: String) -> void:
	if not value: _failed = true; push_error(message)
