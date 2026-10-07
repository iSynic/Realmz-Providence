class_name ProvidenceRebuiltPreviewController
extends Node

signal status_changed(message: String)
signal preview_ready(result: Dictionary)
signal preview_failed(error: Dictionary)
signal preview_finished

const PREVIEW_PATH_SETTING := "providence/rebuilt_preview_path"
const REBUILT_ROOT_SETTING := "providence/rebuilt_root"
const GODOT_PATH_SETTING := "providence/rebuilt_godot_path"
const HEADLESS_SETTING := "providence/rebuilt_preview_headless"
const READY_TIMEOUT_SETTING := "providence/rebuilt_preview_ready_timeout_seconds"
const RNG_SEED_SETTING := "providence/rebuilt_preview_rng_seed"
const TEMP_PREFIX := "providence-preview-"
const PACKAGE_FILE := "scenario.realmz2"
const REQUEST_FILE := "preview-request.json"
const RESULT_FILE := "preview-result.json"
const DEFAULT_READY_TIMEOUT_SECONDS := 90.0
const DEFAULT_RNG_SEED := 1741
const MAX_U32 := 4294967295

var _active := false
var _process_id := -1
var _started_msec := 0
var _ready_received := false
var _temp_root := ""
var _request_path := ""
var _result_path := ""
var _preview_executable := ""
var _target_kind := ""
var _operations: ProvidenceEditorOperation
var _preparing := false
var _cancel_requested := false
var _inspecting := false
var _helper_worker: Thread
var _preparing_bridge


func configure_operations(operations: ProvidenceEditorOperation) -> void:
	_operations = operations


func _exit_tree() -> void:
	_cancel_requested = true
	# Join writers before removing their private package, including shutdown
	# between dispatch and completion. The runtime never shares editor storage.
	if _preparing and _preparing_bridge != null: _preparing_bridge.stop()
	if _helper_worker != null and _helper_worker.is_started(): _helper_worker.wait_to_finish()
	_terminate_owned_process()
	_cleanup_temp_root()
	_reset_state()


func is_active() -> bool:
	return _active or _preparing or _inspecting


func availability() -> Dictionary:
	if is_active():
		return {"available": false, "reason": "A Rebuilt preview is already running."}
	var configuration := _resolve_configuration()
	if not bool(configuration.get("ok", false)):
		return {"available": false, "reason": str(configuration.get("error", "Rebuilt preview is not configured."))}
	return {"available": true, "reason": ""}


func availability_for_target(target: Dictionary) -> Dictionary:
	if target.is_empty():
		return availability()
	var target_arguments := _target_arguments(target)
	if not bool(target_arguments.get("ok", false)):
		return {"available": false, "reason": str(target_arguments.get("error", "Select a supported preview target."))}
	return availability()


func start_preview(bridge, target: Dictionary, expected_revision: int) -> Dictionary:
	if is_active():
		return _reject("preview.already-running", "A Rebuilt preview is already running.")
	var target_arguments := _target_arguments(target)
	if not bool(target_arguments.get("ok", false)):
		return _reject("preview.target-unsupported", str(target_arguments.get("error", "Select a supported preview target.")))
	var configuration := _resolve_configuration()
	if not bool(configuration.get("ok", false)):
		return _reject("preview.configuration-missing", str(configuration.get("error", "Rebuilt preview is not configured.")))
	_preparing = true
	_cancel_requested = false
	_preparing_bridge = bridge
	_target_kind = str(target.get("kind", ""))
	var response: Dictionary
	if _operations == null:
		response = await _prepare_and_launch(bridge.request, configuration, target_arguments, expected_revision)
	else:
		response = await _operations.run_workflow(bridge, "Prepare Rebuilt preview", func(operation):
			return await _prepare_and_launch(operation.request, configuration, target_arguments, expected_revision))
	_preparing = false
	_preparing_bridge = null
	if _cancel_requested:
		_finish()
		return {"ok": false, "cancelled": true, "error": "Rebuilt preview cancelled."}
	return response


func _prepare_and_launch(request: Callable, configuration: Dictionary, target_arguments: Dictionary, expected_revision: int) -> Dictionary:
	var scratch := _create_temp_root()
	if not bool(scratch.get("ok", false)):
		return _reject("preview.temp-create-failed", str(scratch.get("error", "Could not create isolated preview storage.")))
	_temp_root = str(scratch.root)
	_request_path = _temp_root.path_join(REQUEST_FILE)
	_result_path = _temp_root.path_join(RESULT_FILE)
	_preview_executable = str(configuration.previewExecutable)
	var package_path := _temp_root.path_join(PACKAGE_FILE)
	status_changed.emit(_compile_status(_target_kind))
	var compiler: Dictionary = await request.call("compiler.describe")
	if _cancel_requested: return compiler
	if not bool(compiler.get("ok", false)):
		return _abort_native("compile.compiler-identity", compiler)
	var compiler_identity := compiler.get("result", {}) as Dictionary
	var support := ProvidenceRebuiltPackageContext.resolve(_preparing_bridge.current_application_library_root())
	if not support.get("ok", false): return _abort_native("compile.application-support", support)
	var params := {
		"path": package_path,
		"compilerCommit": str(compiler_identity.get("commit", "unavailable")),
		"minimumEngineVersion": "0.1.0",
		"expectedRevision": expected_revision,
	}
	params.merge(support.parameters)
	var compiled: Dictionary = await request.call("project.compile-rebuilt-package", params)
	if _cancel_requested: return compiled
	if not bool(compiled.get("ok", false)):
		return _abort_native("compile.rebuilt-package", compiled)
	var compiled_result := compiled.get("result", {}) as Dictionary
	if int(compiled_result.get("revision", expected_revision)) != expected_revision:
		return _abort("compile.revision-mismatch", "The project changed while its preview package was being compiled.")
	var prepare_arguments := PackedStringArray([str(target_arguments.command), package_path, _request_path, _result_path])
	prepare_arguments.append_array(target_arguments.arguments as PackedStringArray)
	prepare_arguments.append(str(ProjectSettings.get_setting(RNG_SEED_SETTING, DEFAULT_RNG_SEED)))
	var prepared := await _execute_json_async(_preview_executable, prepare_arguments)
	if _cancel_requested: return {"ok": false, "cancelled": true}
	if not bool(prepared.get("ok", false)):
		return _abort("request.prepare-failed", str(prepared.get("error", "The preview request could not be prepared.")))
	var launch_plan := await _execute_json_async(_preview_executable, PackedStringArray([
		"interactive-arguments",
		str(configuration.rebuiltRoot),
		_request_path,
	]))
	if _cancel_requested: return {"ok": false, "cancelled": true}
	if not bool(launch_plan.get("ok", false)):
		return _abort("launch.plan-failed", str(launch_plan.get("error", "Rebuilt launch arguments could not be validated.")))
	return _launch_runtime(configuration, launch_plan)


func _launch_runtime(configuration: Dictionary, launch_plan: Dictionary) -> Dictionary:
	var launch_values := ((launch_plan.get("result", {}) as Dictionary).get("arguments", []) as Array)
	var launch_arguments := PackedStringArray()
	for value in launch_values:
		if not value is String or str(value).is_empty():
			return _abort("launch.plan-invalid", "The preview bridge returned an invalid launch argument.")
		launch_arguments.append(str(value))
	if bool(ProjectSettings.get_setting(HEADLESS_SETTING, false)):
		launch_arguments.insert(0, "--headless")
	_process_id = OS.create_process(str(configuration.godotExecutable), launch_arguments, false)
	if _process_id <= 0:
		return _abort("launch.failed", "Rebuilt could not be launched as a separate process.")
	_active = true
	_ready_received = false
	_started_msec = Time.get_ticks_msec()
	set_process(true)
	status_changed.emit("Rebuilt preview launched · waiting for the isolated runtime handshake…")
	return {"ok": true, "processId": _process_id, "scratchRoot": _temp_root}


func cancel_preview(reason := "Rebuilt preview stopped by the editor.") -> void:
	if _preparing:
		_cancel_requested = true
		status_changed.emit(reason)
		return
	if not _active:
		return
	_terminate_owned_process()
	status_changed.emit(reason)
	_finish()


func _process(_delta: float) -> void:
	if not _active or _inspecting:
		return
	if not _ready_received and FileAccess.file_exists(_result_path):
		_inspecting = true
		var inspected := await _execute_json_async(_preview_executable, PackedStringArray(["inspect-result", _request_path, _result_path]))
		_inspecting = false
		if not _active: return
		if not bool(inspected.get("ok", false)):
			_fail_running("runtime.result-invalid", str(inspected.get("error", "Rebuilt returned an invalid preview result.")))
			return
		var result := inspected.get("result", {}) as Dictionary
		if str(result.get("status", "")) == "failed":
			_fail_running(str(result.get("errorCode", "runtime.failed")), str(result.get("errorMessage", "Rebuilt rejected the preview request.")))
			return
		_ready_received = true
		preview_ready.emit(result)
		status_changed.emit(_ready_status(_target_kind))
	var timeout_seconds := float(ProjectSettings.get_setting(READY_TIMEOUT_SETTING, DEFAULT_READY_TIMEOUT_SECONDS))
	if not _ready_received and Time.get_ticks_msec() - _started_msec > int(maxf(timeout_seconds, 1.0) * 1000.0):
		_fail_running("runtime.ready-timeout", "Rebuilt did not confirm preview readiness before the configured timeout.")
		return
	if _process_id <= 0 or not OS.is_process_running(_process_id):
		if _ready_received:
			status_changed.emit("Rebuilt preview closed · temporary package removed")
			_finish()
		else:
			_abort("runtime.exited-before-ready", "Rebuilt exited before confirming that the selected target was ready.")
		return


func _target_arguments(target: Dictionary) -> Dictionary:
	match str(target.get("kind", "")):
		"action-point":
			var identity := str(target.get("id", "")).strip_edges()
			var map_identity := str(target.get("mapId", "")).strip_edges()
			if identity.is_empty() or map_identity.is_empty():
				return {"ok": false, "error": "Select a placed Action Point before previewing."}
			return {
				"ok": true,
				"command": "prepare-action-point",
				"arguments": PackedStringArray([identity, map_identity, str(int(target.get("x", 0))), str(int(target.get("y", 0)))]),
			}
		"simple-encounter":
			if not target.has("id") or int(target.get("id", -1)) < 0:
				return {"ok": false, "error": "Select a Simple Encounter before previewing."}
			return {
				"ok": true,
				"command": "prepare-simple-encounter",
				"arguments": PackedStringArray([str(int(target.id))]),
			}
		"complex-encounter":
			return _native_record_target_arguments(target, "Complex Encounter", "prepare-complex-encounter")
		"thief-encounter":
			return _owner_bound_native_record_target_arguments(target)
		"extra-action-point-program":
			return _native_record_target_arguments(target, "standalone Extra Action Point program", "prepare-extra-action-point-program")
		"map-location":
			return _map_target_arguments(target)
		"scrolling-text":
			var resource_id: Variant = target.get("id")
			if not resource_id is int or int(resource_id) == 0:
				return {"ok": false, "error": "Select an exact scenario-owned scrolling TEXT resource before previewing."}
			return {
				"ok": true,
				"command": "prepare-scrolling-text",
				"arguments": PackedStringArray([str(resource_id)]),
			}
		"battle":
			var battle_id: Variant = target.get("id")
			if not battle_id is int or int(battle_id) < 0:
				return {"ok": false, "error": "Select an exact applied Battle record before previewing."}
			return {
				"ok": true,
				"command": "prepare-battle",
				"arguments": PackedStringArray([str(battle_id)]),
			}
		"treasure":
			return _native_record_target_arguments(target, "Treasure", "prepare-treasure")
		"shop":
			return _native_record_target_arguments(target, "Shop", "prepare-shop")
	return {"ok": false, "error": "Select an applied Map cell, Action Point, standalone Extra AP program, Simple/Complex/Rogue Encounter, scrolling TEXT resource, Battle, Treasure, or Shop."}


func _map_target_arguments(target: Dictionary) -> Dictionary:
	var identity_value: Variant = target.get("id")
	var map_identity_value: Variant = target.get("mapId")
	var x_value: Variant = target.get("x")
	var y_value: Variant = target.get("y")
	if (
		not identity_value is String
		or not map_identity_value is String
		or identity_value != map_identity_value
		or not _is_canonical_map_identity(identity_value)
		or not x_value is int
		or not y_value is int
		or int(x_value) < 0
		or int(y_value) < 0
	):
		return {"ok": false, "error": "Select an applied cell on a canonical Land or Dungeon map before previewing."}
	return {
		"ok": true,
		"command": "prepare-map-location",
		"arguments": PackedStringArray([identity_value, map_identity_value, str(x_value), str(y_value)]),
	}


func _native_record_target_arguments(target: Dictionary, label: String, command: String) -> Dictionary:
	var native_id: Variant = target.get("id")
	if not native_id is int or int(native_id) < 0 or int(native_id) > MAX_U32:
		return {"ok": false, "error": "Select an exact applied %s record before previewing." % label}
	return {
		"ok": true,
		"command": command,
		"arguments": PackedStringArray([str(native_id)]),
	}


func _compile_status(target_kind: String) -> String:
	if target_kind == "extra-action-point-program":
		return "Compiling current revision for isolated standalone Extra AP program preview…"
	return "Compiling current revision for isolated Rebuilt preview…"


func _ready_status(target_kind: String) -> String:
	if target_kind == "extra-action-point-program":
		return "Rebuilt standalone Extra AP program ready · caller-specific eligibility was not evaluated · editor state remains isolated"
	return "Rebuilt preview ready · editor state remains isolated"


func _owner_bound_native_record_target_arguments(target: Dictionary) -> Dictionary:
	var native_id: Variant = target.get("id")
	var owner_id: Variant = target.get("complexEncounterId")
	if not native_id is int or int(native_id) < 0 or not owner_id is int or int(owner_id) < 0:
		return {"ok": false, "error": "Select an exact applied Rogue Encounter and its resolved Complex owner before previewing."}
	return {
		"ok": true,
		"command": "prepare-thief-encounter",
		"arguments": PackedStringArray([str(native_id), str(owner_id)]),
	}


func _is_canonical_map_identity(identity: String) -> bool:
	var separator := identity.find(":")
	if separator <= 0 or separator != identity.rfind(":"):
		return false
	var kind := identity.left(separator)
	var native_index := identity.substr(separator + 1)
	if kind not in ["land", "dungeon"] or native_index.is_empty() or not native_index.is_valid_int():
		return false
	var parsed := native_index.to_int()
	return parsed >= 0 and identity == "%s:%d" % [kind, parsed]


func _resolve_configuration() -> Dictionary:
	var preview_executable := _resolve_file(
		"PROVIDENCE_REBUILT_PREVIEW_PATH",
		PREVIEW_PATH_SETTING,
		["providence-rebuilt-preview.exe", "providence-rebuilt-preview"]
	)
	if preview_executable.is_empty():
		return {"ok": false, "error": "The Providence–Rebuilt preview bridge was not found. Build or install providence-rebuilt-preview."}
	var rebuilt_root := _resolve_rebuilt_root()
	if rebuilt_root.is_empty():
		return {"ok": false, "error": "Configure the Rebuilt project root before previewing."}
	var godot_executable := _resolve_godot_executable()
	if godot_executable.is_empty():
		return {"ok": false, "error": "Configure the Godot executable used to launch the separate Rebuilt process."}
	return {
		"ok": true,
		"previewExecutable": preview_executable,
		"rebuiltRoot": rebuilt_root,
		"godotExecutable": godot_executable,
	}


func _resolve_file(environment_key: String, setting_key: String, adjacent_names: Array[String]) -> String:
	var candidates: Array[String] = []
	var environment_path := OS.get_environment(environment_key).strip_edges()
	if not environment_path.is_empty():
		candidates.append(environment_path)
	var setting_path := str(ProjectSettings.get_setting(setting_key, "")).strip_edges()
	if not setting_path.is_empty():
		candidates.append(setting_path)
	for file_name in adjacent_names:
		candidates.append(OS.get_executable_path().get_base_dir().path_join(file_name))
	var cargo_target := OS.get_environment("CARGO_TARGET_DIR").strip_edges()
	if not cargo_target.is_empty():
		for profile in ["debug", "release"]:
			for file_name in adjacent_names:
				candidates.append(cargo_target.path_join(profile).path_join(file_name))
	for profile in ["debug", "release"]:
		for file_name in adjacent_names:
			candidates.append(ProjectSettings.globalize_path("res://../target/%s/%s" % [profile, file_name]))
	for candidate in candidates:
		var normalized := candidate.simplify_path()
		if FileAccess.file_exists(normalized):
			return normalized
	return ""


func _resolve_rebuilt_root() -> String:
	var candidates: Array[String] = []
	var environment_root := OS.get_environment("PROVIDENCE_REBUILT_ROOT").strip_edges()
	if not environment_root.is_empty():
		candidates.append(environment_root)
	var setting_root := str(ProjectSettings.get_setting(REBUILT_ROOT_SETTING, "")).strip_edges()
	if not setting_root.is_empty():
		candidates.append(setting_root)
	candidates.append(ProjectSettings.globalize_path("res://../../Realmz Remake 2.0"))
	for candidate in candidates:
		var normalized := candidate.simplify_path()
		if (
			FileAccess.file_exists(normalized.path_join("project.godot"))
			and FileAccess.file_exists(normalized.path_join("tools/development_preview_host.tscn"))
		):
			return normalized
	return ""


func _resolve_godot_executable() -> String:
	var configured := _resolve_file("PROVIDENCE_REBUILT_GODOT_PATH", GODOT_PATH_SETTING, [])
	if not configured.is_empty():
		return configured
	var running_executable := OS.get_executable_path().simplify_path()
	if running_executable.get_file().to_lower().contains("godot") and FileAccess.file_exists(running_executable):
		return running_executable
	return ""


func _create_temp_root() -> Dictionary:
	var base := OS.get_temp_dir().simplify_path()
	for attempt in range(8):
		var candidate := base.path_join("%s%d-%d" % [TEMP_PREFIX, Time.get_ticks_usec(), attempt])
		if not DirAccess.dir_exists_absolute(candidate) and DirAccess.make_dir_absolute(candidate) == OK:
			return {"ok": true, "root": candidate}
	return {"ok": false, "error": "Could not allocate a unique Providence preview directory."}


func _execute_json_async(executable: String, arguments: PackedStringArray) -> Dictionary:
	_helper_worker = Thread.new()
	var started := _helper_worker.start(_execute_json.bind(executable, arguments))
	if started != OK:
		_helper_worker = null
		return {"ok": false, "error": "The preview helper worker could not start."}
	while _helper_worker.is_alive(): await get_tree().process_frame
	var response: Dictionary = _helper_worker.wait_to_finish()
	_helper_worker = null
	return response


static func _execute_json(executable: String, arguments: PackedStringArray) -> Dictionary:
	var output: Array = []
	var exit_code := OS.execute(executable, arguments, output, true)
	var text_output := "\n".join(PackedStringArray(output)).strip_edges()
	if exit_code != 0:
		return {"ok": false, "error": text_output if not text_output.is_empty() else "Preview helper exited with code %d." % exit_code}
	var parsed: Variant = JSON.parse_string(text_output)
	if not parsed is Dictionary:
		return {"ok": false, "error": "Preview helper returned malformed JSON."}
	return {"ok": true, "result": parsed as Dictionary}


func _reject(code: String, message: String) -> Dictionary:
	var error := {"stage": "preview", "code": code, "message": message}
	preview_failed.emit(error)
	return {"ok": false, "error": message, "detail": error}


func _abort(code: String, message: String) -> Dictionary:
	var error := {"stage": code.get_slice(".", 0), "code": code, "message": message}
	preview_failed.emit(error)
	_cleanup_temp_root()
	_reset_state()
	return {"ok": false, "error": message, "detail": error}


func _abort_native(code: String, response: Dictionary) -> Dictionary:
	var failed := _abort(code, str(response.get("error", "Preview compilation failed.")))
	for flag in ["outcomeUnknown", "connectionChanged"]:
		if response.has(flag): failed[flag] = response[flag]
	return failed


func _fail_running(code: String, message: String) -> void:
	_terminate_owned_process()
	_abort(code, message)


func _finish() -> void:
	_cleanup_temp_root()
	_reset_state()
	preview_finished.emit()


func _reset_state() -> void:
	_active = false
	_process_id = -1
	_started_msec = 0
	_ready_received = false
	_temp_root = ""
	_request_path = ""
	_result_path = ""
	_preview_executable = ""
	_target_kind = ""
	set_process(false)


func _terminate_owned_process() -> void:
	if _process_id > 0 and OS.is_process_running(_process_id):
		OS.kill(_process_id)


func _cleanup_temp_root() -> void:
	if not _is_owned_temp_root(_temp_root):
		return
	for file_name in [RESULT_FILE, REQUEST_FILE, PACKAGE_FILE]:
		var path := _temp_root.path_join(file_name)
		if FileAccess.file_exists(path):
			DirAccess.remove_absolute(path)
	DirAccess.remove_absolute(_temp_root)


func _is_owned_temp_root(path: String) -> bool:
	if path.is_empty():
		return false
	var normalized := path.simplify_path()
	var temp := OS.get_temp_dir().simplify_path()
	return normalized.get_base_dir().to_lower() == temp.to_lower() and normalized.get_file().begins_with(TEMP_PREFIX)
