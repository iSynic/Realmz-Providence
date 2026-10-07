class_name ProvidenceNativeBridge
extends RefCounted

const SETTINGS_SECTION := "reference_libraries"
const APPLICATION_LIBRARY_KEY := "realmz_classic_application"
const DEFAULT_APPLICATION_LIBRARY := "user://reference-libraries/realmz-classic"
const DIVINITY_CATALOG_KEY := "divinity_reference_catalog"
const DEFAULT_DIVINITY_CATALOG := "user://reference-libraries/divinity"
const ADAPTER_PATH_SETTING := "providence/native_adapter_path"
const CLI_PATH_SETTING := "providence/native_cli_path"
const APPLICATION_LIBRARY_PATH_SETTING := "providence/application_library_root"
const CLASSIC_DATA_PATH_SETTING := "providence/classic_application_data_root"
const BUNDLED_CLASSIC_DATA_DIRECTORY := "Realmz Data"
const BUNDLED_APPLICATION_LIBRARY := "reference-libraries/realmz-classic"
const MONSTER_LIBRARY_PATH_SETTING := "providence/monster_library_root"
const REQUIRED_ADAPTER_PROTOCOL := 2

var _process: Dictionary = {}
var _stdio: FileAccess
var _next_request_id := 1
var _project_backed := false
var _library_only := false
var _project_path := ""
var _application_library_root := ""
var _reference_catalog_root := ""
var _monster_library_root := ""
var _settings_path := "user://providence-settings.cfg"
var _request_metrics: Dictionary = {}
var measure_requests := false
var _connection_epoch := 0
var _request_worker: Thread
var _operation_owner := 0
var _connecting := false
var _requires_reopen := false
var _repair_intent: Dictionary = {}
var _repair_recovery_method := ""
var _repair_reconnected := false


func _init(settings_path_override: String = "") -> void:
	if not settings_path_override.strip_edges().is_empty():
		_settings_path = settings_path_override


func start_demo() -> Dictionary:
	if operation_busy(): return {"ok": false, "error": "Wait for the current operation to finish."}
	var project_path := OS.get_environment("PROVIDENCE_PROJECT_PATH").strip_edges()
	if not project_path.is_empty():
		return start_project(project_path)
	return _start_auxiliary("serve-demo")


func start_monster_library() -> Dictionary:
	if operation_busy(): return {"ok": false, "error": "Wait for the current operation to finish."}
	return _start_auxiliary("serve-library")


func _start_auxiliary(command: String) -> Dictionary:
	stop()
	var prepared := _prepare_auxiliary_start(command)
	_apply_connection_options(prepared)
	return _start(prepared.arguments)


func begin_monster_library_start() -> Dictionary:
	if operation_busy() or _stdio != null: return {"ok": false, "busy": true, "error": "Wait for the Library connection to finish."}
	var executable := _adapter_path()
	if executable.is_empty(): return {"ok": false, "error": "Providence native adapter was not found."}
	var prepared := _prepare_auxiliary_start("serve-library")
	return _begin_connection(prepared, _connect_prepared.bind(executable, prepared.arguments))


func _prepare_auxiliary_start(command: String, resume_library := false) -> Dictionary:
	var arguments := PackedStringArray([command])
	var application := _application_library_root if resume_library else configured_application_library_root()
	var reference := _reference_catalog_root if resume_library else configured_reference_catalog_root()
	for entry in [["--application-library-root", application], ["--reference-catalog-root", reference]]:
		if not str(entry[1]).is_empty():
			arguments.append(entry[0])
			arguments.append(entry[1])
	var monster := _append_monster_library(arguments, _monster_library_root if resume_library else "")
	_append_personal_library(arguments)
	preload("res://src/native_library_settings.gd").append_stock_items(arguments, bundled_classic_application_data_root())
	return {"ok": true, "arguments": arguments, "projectPath": "", "projectBacked": false, "libraryOnly": command == "serve-library",
		"applicationLibrary": application, "referenceCatalog": reference, "monsterLibrary": monster}


func create_project(project_id: String, project_path: String) -> Dictionary:
	if operation_busy(): return {"ok": false, "error": "Wait for the current operation to finish."}
	var executable := _cli_path()
	if executable.is_empty():
		return {"ok": false, "error": "Providence CLI was not found. Build the Rust workspace first."}
	var created := preload("res://src/native_project_creation.gd").create(executable, project_id, project_path, bundled_classic_application_data_root())
	if not created.get("ok", false): return created
	return start_project(project_path)


func start_project(project_path: String, application_library_root: String = "", reference_catalog_root: String = "", monster_library_root: String = "") -> Dictionary:
	if operation_busy(): return {"ok": false, "error": "Wait for the current operation to finish."}
	var prepared := _prepare_project_start(project_path, application_library_root, reference_catalog_root, monster_library_root)
	if not prepared.get("ok", false): return prepared
	stop()
	_apply_connection_options(prepared)
	var response := _start(prepared.arguments)
	if not response.get("ok", false): stop()
	return response


func fork_connection() -> ProvidenceNativeBridge:
	var candidate: ProvidenceNativeBridge = get_script().new(_settings_path)
	candidate.measure_requests = measure_requests
	return candidate


func begin_project_start(project_path: String, options: Dictionary = {}) -> Dictionary:
	if operation_busy() or _stdio != null:
		return {"ok": false, "error": "A new project needs an unused connection."}
	var executable := _adapter_path()
	if executable.is_empty():
		return {"ok": false, "error": "Providence native adapter was not found. Build the Rust workspace first."}
	var prepared := _prepare_project_start(project_path, str(options.get("applicationLibrary", "")), str(options.get("referenceCatalog", "")), str(options.get("monsterLibrary", "")))
	if not prepared.get("ok", false): return prepared
	return _begin_connection(prepared, _connect_prepared.bind(executable, prepared.arguments))


func begin_project_create(project_id: String, project_path: String) -> Dictionary:
	if operation_busy() or _stdio != null:
		return {"ok": false, "error": "A new project needs an unused connection."}
	var cli := _cli_path()
	var adapter := _adapter_path()
	if cli.is_empty() or adapter.is_empty():
		return {"ok": false, "error": "Providence CLI or native adapter was not found. Build the Rust workspace first."}
	var prepared := _prepare_project_start(project_path, "", "", "", false)
	if not prepared.get("ok", false): return prepared
	return _begin_connection(prepared, _create_and_connect.bind(cli, adapter, project_id, prepared))


func _create_and_connect(cli: String, adapter: String, project_id: String, prepared: Dictionary) -> Dictionary:
	var created := preload("res://src/native_project_creation.gd").create(cli, project_id, prepared.projectPath, bundled_classic_application_data_root())
	if not created.get("ok", false): return created
	var opened := _connect_prepared(adapter, prepared.arguments)
	# Creation is not retried if only opening the newly stored project failed.
	opened["createdProjectPath"] = prepared.projectPath
	return opened


func _begin_connection(prepared: Dictionary, worker: Callable) -> Dictionary:
	_apply_connection_options(prepared)
	_connection_epoch += 1
	_connecting = true
	_request_worker = Thread.new()
	var error := _request_worker.start(worker)
	if error == OK: return {"ok": true}
	_request_worker = null
	_connecting = false
	stop()
	return {"ok": false, "error": "The project connection could not start."}


func _prepare_project_start(project_path: String, application_library_root: String, reference_catalog_root: String, monster_library_root: String, require_snapshot: bool = true) -> Dictionary:
	var normalized := project_path.strip_edges()
	var snapshot_path := normalized.path_join("project.providence.json")
	if normalized.is_empty() or (require_snapshot and not FileAccess.file_exists(snapshot_path)):
		return {"ok": false, "error": "Selected directory does not contain project.providence.json: %s" % normalized}
	var arguments := PackedStringArray(["serve-project", normalized])
	var library_root := configured_application_library_root(application_library_root)
	if not library_root.is_empty():
		arguments.append("--application-library-root")
		arguments.append(library_root)
	var catalog_root := configured_reference_catalog_root(reference_catalog_root)
	if not catalog_root.is_empty():
		arguments.append("--reference-catalog-root")
		arguments.append(catalog_root)
	var monster_root := _append_monster_library(arguments, monster_library_root)
	_append_personal_library(arguments)
	preload("res://src/native_library_settings.gd").append_stock_items(arguments, bundled_classic_application_data_root())
	return {"ok": true, "arguments": arguments, "projectPath": normalized,
		"applicationLibrary": library_root, "referenceCatalog": catalog_root, "monsterLibrary": monster_root}


func _apply_connection_options(prepared: Dictionary) -> void:
	_project_backed = prepared.get("projectBacked", true)
	_library_only = prepared.get("libraryOnly", false)
	_project_path = prepared.projectPath
	_application_library_root = prepared.applicationLibrary
	_reference_catalog_root = prepared.referenceCatalog
	_monster_library_root = prepared.monsterLibrary


func _connect_prepared(executable: String, arguments: PackedStringArray) -> Dictionary:
	# Paths and settings are resolved on the UI thread. This candidate alone owns
	# its process and stream until joined; the current editor session stays intact.
	_process = OS.execute_with_pipe(executable, arguments, true)
	if _process.is_empty():
		return {"ok": false, "error": "Could not start the Providence native adapter."}
	_stdio = _process.get("stdio") as FileAccess
	if _stdio == null:
		return {"ok": false, "error": "Native adapter did not provide a standard-I/O pipe."}
	return _validate_startup_response(_request("session.describe", {}))



func save_project_as(project_path: String) -> Dictionary:
	if not _project_backed:
		return {"ok": false, "error": "Save As requires an open portable project."}
	var normalized := project_path.strip_edges().simplify_path()
	if normalized.is_empty():
		return {"ok": false, "error": "Choose a destination project directory."}
	var library_root := _application_library_root
	var catalog_root := _reference_catalog_root
	var monster_root := _monster_library_root
	var saved := request("project.save-as", {"path": normalized})
	if not bool(saved.get("ok", false)):
		return saved
	var save_result := saved.get("result", {}) as Dictionary
	var opened := start_project(str(save_result.get("projectPath", normalized)), library_root, catalog_root, monster_root)
	if not bool(opened.get("ok", false)):
		opened["saveAs"] = save_result
		return opened
	opened["saveAs"] = save_result
	return opened


func _start(arguments: PackedStringArray) -> Dictionary:
	var executable := _adapter_path()
	if executable.is_empty():
		return {"ok": false, "error": "Providence native adapter was not found. Build the Rust workspace first."}
	_process = OS.execute_with_pipe(executable, arguments, true)
	if _process.is_empty():
		return {"ok": false, "error": "Could not start the Providence native adapter."}
	_stdio = _process.get("stdio") as FileAccess
	if _stdio == null:
		return {"ok": false, "error": "Native adapter did not provide a standard-I/O pipe."}
	var response := _validate_startup_response(request("session.describe"))
	if not bool(response.get("ok", false)):
		stop()
	return response


func _validate_startup_response(response: Dictionary) -> Dictionary:
	if not response.get("ok", false): return response
	var result := response.get("result", {}) as Dictionary
	var reported := int(result.get("adapterProtocol", 0))
	if reported == REQUIRED_ADAPTER_PROTOCOL: return response
	return {"ok": false, "adapterProtocolMismatch": true,
		"error": "The selected native adapter does not match this editor (required protocol %d; reported %s). Restart Providence with a matching native build." % [REQUIRED_ADAPTER_PROTOCOL, "legacy" if reported == 0 else str(reported)]}


func is_project_backed() -> bool:
	return _project_backed


func current_project_path() -> String:
	return _project_path


func current_application_library_root() -> String:
	return _application_library_root


func current_reference_catalog_root() -> String:
	return _reference_catalog_root


func current_monster_library_root() -> String:
	return _monster_library_root


func configured_monster_library_root(explicit_root: String = "") -> String:
	return preload("res://src/native_library_settings.gd").monster_root(explicit_root)


func configured_personal_library_root() -> String:
	for candidate in [OS.get_environment("PROVIDENCE_PERSONAL_LIBRARY_ROOT"), ProjectSettings.get_setting("providence/personal_library_root", "")]:
		var path := str(candidate).strip_edges()
		if not path.is_empty():
			return ProjectSettings.globalize_path(path).simplify_path()
	return ProjectSettings.globalize_path(_settings_path.get_base_dir().path_join("personal-library")).simplify_path()


func _append_personal_library(arguments: PackedStringArray) -> void:
	arguments.append("--personal-library-root")
	arguments.append(configured_personal_library_root())


func _append_monster_library(arguments: PackedStringArray, explicit_root: String) -> String:
	return preload("res://src/native_library_settings.gd").append_monster(arguments, _settings_path, explicit_root)


func inspect_classic_scenario_import(directory: String, application_data_directory: String = "") -> Dictionary:
	var params := {"directory": directory}
	if not application_data_directory.strip_edges().is_empty():
		params["applicationDataDirectory"] = application_data_directory
	return request("project.inspect-classic-scenario-import", params)


func import_classic_scenario(directory: String, expected_revision: int, application_data_directory: String = "") -> Dictionary:
	var params := {
		"directory": directory,
		"expectedRevision": expected_revision,
	}
	if not application_data_directory.strip_edges().is_empty():
		params["applicationDataDirectory"] = application_data_directory
	return request("project.import-classic-scenario", params)


func configured_application_library_root(explicit_root: String = "") -> String:
	var normalized := explicit_root.strip_edges()
	if not normalized.is_empty():
		return normalized.simplify_path()
	var environment_root := OS.get_environment("PROVIDENCE_APPLICATION_LIBRARY_ROOT").strip_edges()
	if not environment_root.is_empty():
		return environment_root.simplify_path()
	var settings := ConfigFile.new()
	if settings.load(_settings_path) == OK:
		var saved_root := str(settings.get_value(SETTINGS_SECTION, APPLICATION_LIBRARY_KEY, "")).strip_edges()
		if not saved_root.is_empty():
			return saved_root.simplify_path()
	var development_root := str(ProjectSettings.get_setting(APPLICATION_LIBRARY_PATH_SETTING, "")).strip_edges()
	if not development_root.is_empty():
		return development_root.simplify_path()
	var adjacent_root := OS.get_executable_path().get_base_dir().path_join(BUNDLED_APPLICATION_LIBRARY)
	if FileAccess.file_exists(adjacent_root.path_join("classic-application-media.json")):
		return adjacent_root.simplify_path()
	var default_root := ProjectSettings.globalize_path(DEFAULT_APPLICATION_LIBRARY)
	if FileAccess.file_exists(default_root.path_join("classic-application-media.json")):
		return default_root.simplify_path()
	return ""


func bundled_classic_application_data_root() -> String:
	var environment_root := OS.get_environment("PROVIDENCE_CLASSIC_APPLICATION_DATA_ROOT").strip_edges()
	if not environment_root.is_empty() and _is_classic_data_root(environment_root):
		return environment_root.simplify_path()
	var development_root := str(ProjectSettings.get_setting(CLASSIC_DATA_PATH_SETTING, "")).strip_edges()
	if not development_root.is_empty() and _is_classic_data_root(development_root):
		return development_root.simplify_path()
	var adjacent_root := OS.get_executable_path().get_base_dir().path_join(BUNDLED_CLASSIC_DATA_DIRECTORY)
	if _is_classic_data_root(adjacent_root):
		return adjacent_root.simplify_path()
	var source_root := ProjectSettings.globalize_path("res://bundled/realmz-reference")
	if _is_classic_data_root(source_root):
		return source_root.simplify_path()
	return ""


func _is_classic_data_root(directory: String) -> bool:
	return (
		FileAccess.file_exists(directory.path_join("Data ID"))
		and FileAccess.file_exists(directory.path_join("Data ID.rsrc"))
		and FileAccess.file_exists(directory.path_join("Data P BD"))
		and FileAccess.file_exists(directory.path_join("Custom Names.rsrc"))
	)


func configured_reference_catalog_root(explicit_root: String = "") -> String:
	var normalized := explicit_root.strip_edges()
	if not normalized.is_empty():
		return normalized.simplify_path()
	var environment_root := OS.get_environment("PROVIDENCE_REFERENCE_CATALOG_ROOT").strip_edges()
	if not environment_root.is_empty():
		return environment_root.simplify_path()
	var settings := ConfigFile.new()
	if settings.load(_settings_path) == OK:
		var saved_root := str(settings.get_value(SETTINGS_SECTION, DIVINITY_CATALOG_KEY, "")).strip_edges()
		if not saved_root.is_empty():
			return saved_root.simplify_path()
	var project_root := str(ProjectSettings.get_setting("providence/reference_catalog_root", "")).strip_edges()
	if not project_root.is_empty():
		return project_root.simplify_path()
	var default_root := ProjectSettings.globalize_path(DEFAULT_DIVINITY_CATALOG)
	if FileAccess.file_exists(default_root.path_join("reference-catalog.providence.json")):
		return default_root.simplify_path()
	return ""


func configure_application_library_root(library_root: String) -> Dictionary:
	return _configure_library("application", library_root, _cli_path(), _stdio != null)


func clear_application_library_root() -> Dictionary:
	return _clear_library("application")


func configure_reference_catalog_root(catalog_root: String) -> Dictionary:
	return _configure_library("reference", catalog_root, _cli_path(), _stdio != null)


func clear_reference_catalog_root() -> Dictionary:
	return _clear_library("reference")


func _clear_library(kind: String) -> Dictionary:
	var response: Dictionary = preload("res://src/native_library_settings.gd").new(_settings_path).clear(kind)
	if response.get("ok", false): response["restartRequired"] = _stdio != null
	return response


func _configure_library(kind: String, directory: String, executable: String, restart_required: bool) -> Dictionary:
	var response: Dictionary = preload("res://src/native_library_settings.gd").new(_settings_path).configure(kind, directory, executable)
	if response.get("ok", false): response["restartRequired"] = restart_required
	return response


func begin_library_configuration(kind: String, directory: String) -> Dictionary:
	# Configuration uses an unused candidate while the operation leases the live
	# project. Only the worker validates and saves preferences; it never uses IPC.
	if operation_busy() or _stdio != null:
		return {"ok": false, "error": "Library configuration needs an unused connection."}
	var executable := _cli_path()
	_request_worker = Thread.new()
	var error := _request_worker.start(_configure_library.bind(kind, directory, executable, false))
	if error == OK: return {"ok": true}
	_request_worker = null
	return {"ok": false, "error": "Library configuration could not start."}


func request(method: String, params: Dictionary = {}) -> Dictionary:
	if _requires_reopen: return _reopen_required()
	if _request_worker != null or _operation_owner != 0:
		return {"ok": false, "busy": true, "error": "Wait for the current operation to finish."}
	return _observe_response(_request(method, params))


func begin_request(method: String, params: Dictionary, owner: int = 0) -> Dictionary:
	if _requires_reopen: return _reopen_required()
	if _request_worker != null or (_operation_owner != 0 and _operation_owner != owner):
		return {"ok": false, "error": "Wait for the current operation to finish."}
	_repair_intent.clear()
	_request_worker = Thread.new()
	# The worker exclusively owns the stream and metrics until it is joined.
	var error := _request_worker.start(_request.bind(method, params.duplicate(true)))
	if error != OK:
		_request_worker = null
		return {"ok": false, "error": "The operation could not start. Your draft is kept."}
	return {"ok": true}


func begin_repair(params: Dictionary, intent: Dictionary, owner: int = 0) -> Dictionary:
	var response := begin_request("action-settings.commit-repair", params, owner)
	if response.get("ok", false): _repair_intent = intent.duplicate(true)
	return response


func begin_repair_recovery(method: String, params: Dictionary, owner: int, reconnect: bool) -> Dictionary:
	if not preload("res://src/native_recovery_outcomes.gd").permitted(method):
		return {"ok": false, "error": "Only explicit repair recovery reads are permitted."}
	if _request_worker != null or _operation_owner != owner:
		return {"ok": false, "busy": true, "error": "Wait for the current operation to finish."}
	if method == "action-settings.reconcile-repair" and not _repair_intent.is_empty() and _repair_intent != params.get("intent", {}): return _reopen_required()
	if _requires_reopen and not reconnect:
		if method != "media.recovery.read" and (method != "action-settings.reconcile-repair" or _repair_intent.is_empty() or _repair_intent != params.get("intent", {})): return _reopen_required()
	var connection: Dictionary = {}
	if reconnect:
		connection = _prepare_repair_reconnect()
		if not connection.get("ok", false): return connection
	_repair_recovery_method = method
	_repair_reconnected = reconnect
	_request_worker = Thread.new()
	var error := _request_worker.start(_repair_recovery_read.bind(method, params.duplicate(true), connection))
	if error == OK: return {"ok": true}
	_request_worker = null
	_repair_recovery_method = ""
	return {"ok": false, "error": "The recovery check could not start. Your draft is kept."}


func _prepare_repair_reconnect() -> Dictionary:
	if not _project_backed and not _library_only:
		return {"ok": false, "error": "The temporary scenario cannot be reopened. Copy your draft before closing."}
	var connection := _prepare_auxiliary_start("serve-library", true) if _library_only else _prepare_project_start(_project_path, _application_library_root, _reference_catalog_root, _monster_library_root)
	if not connection.get("ok", false): return connection
	connection["executable"] = _adapter_path()
	if str(connection.executable).is_empty(): return {"ok": false, "error": "Providence native adapter was not found."}
	# The caller owns the idle stream. Preserve project identity and the submitted
	# intent across this explicit reopen; no mutation is replayed by recovery.
	var pid := int(_process.get("pid", -1))
	if pid > 0 and OS.is_process_running(pid): OS.kill(pid)
	_stdio = null
	_process.clear()
	_connection_epoch += 1
	return connection


func _repair_recovery_read(method: String, params: Dictionary, connection: Dictionary) -> Dictionary:
	if not connection.is_empty():
		var opened := _connect_prepared(str(connection.executable), connection.arguments)
		if not opened.get("ok", false): return opened
	return _request(method, params)


func _observe_repair_recovery(response: Dictionary) -> Dictionary:
	var confirmation: Dictionary = preload("res://src/native_recovery_outcomes.gd").classify(_repair_recovery_method, response, _repair_reconnected, _repair_intent.is_empty())
	if not confirmation.is_empty():
		_requires_reopen = false
		if confirmation.clearRepairIntent: _repair_intent.clear()
		response[confirmation.flag] = true
	_repair_recovery_method = ""
	_repair_reconnected = false
	return response


func reconcile_repair(params: Dictionary) -> Dictionary:
	if operation_busy():
		return {"ok": false, "busy": true, "error": "Wait for the current operation to finish."}
	if _requires_reopen and (_repair_intent.is_empty() or _repair_intent != params.get("intent", {})):
		return _reopen_required()
	# Only the submitted repair's full intent can reconcile a live uncertain stream.
	# This read cannot unlock unrelated history failures or retry any mutation.
	var response := _request("action-settings.reconcile-repair", params)
	if response.get("ok", false) and response.get("result", {}).get("outcome", "unknown") in ["not-applied", "matches-repair"]:
		_requires_reopen = false
		_repair_intent.clear()
	return _observe_response(response)


func claim_operation(owner: int) -> bool:
	if owner == 0 or _operation_owner != 0 or _request_worker != null: return false
	_operation_owner = owner
	return true


func release_operation(owner: int) -> void:
	if _operation_owner == owner: _operation_owner = 0


func operation_busy() -> bool:
	return _operation_owner != 0 or _request_worker != null


func poll_request() -> Dictionary:
	if _request_worker == null:
		return {"pending": false, "response": {"ok": false, "outcomeUnknown": true, "error": "The operation is no longer available."}}
	if _request_worker.is_alive(): return {"pending": true}
	var response: Dictionary = _request_worker.wait_to_finish()
	if not _repair_recovery_method.is_empty(): response = _observe_repair_recovery(response)
	response = _observe_response(response)
	_request_worker = null
	if _connecting:
		_connecting = false
		if not response.get("ok", false): stop()
	return {"pending": false, "response": response}


func _observe_response(response: Dictionary) -> Dictionary:
	if str(response.get("error", "")).begins_with("command could not be durably acknowledged"):
		response["outcomeUnknown"] = true
	_requires_reopen = _requires_reopen or bool(response.get("outcomeUnknown", false))
	if not _requires_reopen: _repair_intent.clear()
	return response


func _reopen_required() -> Dictionary:
	return {"ok": false, "outcomeUnknown": true, "error": "Reopen the project before making further requests; the previous operation outcome could not be confirmed."}


func reconnect_project() -> Dictionary:
	if not _project_backed:
		return {"ok": false, "error": "The temporary scenario cannot be reopened. Copy your draft before closing."}
	return start_project(_project_path, _application_library_root, _reference_catalog_root, _monster_library_root)


func connection_alive() -> bool:
	return _stdio != null and OS.is_process_running(int(_process.get("pid", -1)))


func _request(method: String, params: Dictionary) -> Dictionary:
	_request_metrics.clear()
	if _stdio == null:
		return {"ok": false, "error": "Native adapter is not connected."}
	var request_id := _next_request_id
	_next_request_id += 1
	var started := Time.get_ticks_usec()
	var request_params := params.duplicate() if measure_requests else params
	if measure_requests:
		request_params["measurePerformance"] = true
	_stdio.store_line(preload("res://src/native_json.gd").stringify({"id": request_id, "method": method, "params": request_params}))
	_stdio.flush()
	_request_metrics["writeUsec"] = Time.get_ticks_usec() - started
	started = Time.get_ticks_usec()
	var response_line := _stdio.get_line()
	_request_metrics["readWaitUsec"] = Time.get_ticks_usec() - started
	if response_line.is_empty():
		return {"ok": false, "outcomeUnknown": true, "error": "Native adapter closed the command stream."}
	started = Time.get_ticks_usec()
	var parsed: Variant = JSON.parse_string(response_line)
	_request_metrics["decodeUsec"] = Time.get_ticks_usec() - started
	if not parsed is Dictionary:
		return {"ok": false, "outcomeUnknown": true, "error": "Native adapter returned malformed JSON."}
	var response := parsed as Dictionary
	if measure_requests and response.get("result") is Dictionary:
		var performance: Dictionary = response.result.get("performance", {})
		if performance.has("dispatchMs"):
			_request_metrics["dispatchUsec"] = int(float(performance.dispatchMs) * 1000.0)
	if int(response.get("id", -1)) != request_id:
		return {"ok": false, "outcomeUnknown": true, "error": "Native adapter response sequence did not match the command."}
	return response


func request_metrics() -> Dictionary:
	if _request_worker != null: return {}
	return _request_metrics.duplicate()


func supports_validation_jobs() -> bool:
	return true


func connection_epoch() -> int:
	return _connection_epoch


func stop() -> void:
	_connection_epoch += 1
	_operation_owner = 0
	var pid := int(_process.get("pid", -1))
	if pid > 0 and OS.is_process_running(pid):
		OS.kill(pid)
	if _request_worker != null:
		_request_worker.wait_to_finish()
		_request_worker = null
	_connecting = false
	_requires_reopen = false
	_repair_intent.clear()
	_repair_recovery_method = ""
	_repair_reconnected = false
	_stdio = null
	_process.clear()
	_project_backed = false
	_library_only = false
	_project_path = ""
	_application_library_root = ""
	_reference_catalog_root = ""
	_monster_library_root = ""


func _adapter_path() -> String:
	var filename := "providence-native-adapter.exe" if OS.get_name() == "Windows" else "providence-native-adapter"
	return _native_binary_path("PROVIDENCE_ADAPTER_PATH", ADAPTER_PATH_SETTING, filename)


func _cli_path() -> String:
	var filename := "providence-cli.exe" if OS.get_name() == "Windows" else "providence-cli"
	return _native_binary_path("PROVIDENCE_CLI_PATH", CLI_PATH_SETTING, filename)


func _native_binary_path(environment_key: String, setting_key: String, filename: String) -> String:
	var configured := OS.get_environment(environment_key).strip_edges()
	if not configured.is_empty() and FileAccess.file_exists(configured):
		return configured.simplify_path()
	var project_configured := str(ProjectSettings.get_setting(setting_key, "")).strip_edges()
	if not project_configured.is_empty() and FileAccess.file_exists(project_configured):
		return project_configured.simplify_path()
	var adjacent := OS.get_executable_path().get_base_dir().path_join(filename)
	if FileAccess.file_exists(adjacent):
		return adjacent
	var cargo_target := OS.get_environment("CARGO_TARGET_DIR").strip_edges()
	if not cargo_target.is_empty():
		for profile in ["debug", "release"]:
			var cargo_candidate := cargo_target.path_join(profile).path_join(filename)
			if FileAccess.file_exists(cargo_candidate):
				return cargo_candidate.simplify_path()
	for profile in ["debug", "release"]:
		var repository_candidate := ProjectSettings.globalize_path("res://../target/%s/%s" % [profile, filename])
		if FileAccess.file_exists(repository_candidate):
			return repository_candidate.simplify_path()
	return ""
