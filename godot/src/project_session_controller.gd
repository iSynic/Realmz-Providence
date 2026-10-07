extends RefCounted

signal status_changed(message: String)
signal failed(message: String)
signal assets_save_state(message: String, unsaved: bool, failed: bool)
signal item_save_state(message: String, unsaved: bool, failed: bool)
signal project_saved(revision: int)

var bridge := preload("res://src/native_bridge.gd").new()
var _operations: ProvidenceEditorOperation
var _activate: Callable
var _read_context: Callable
var _has_draft: Callable


func initialize(operations: ProvidenceEditorOperation, activate: Callable, read_context: Callable, has_draft: Callable = Callable()) -> void:
	_operations = operations
	_activate = activate
	_read_context = read_context
	_has_draft = has_draft


func save_as(project_path: String) -> void:
	if not _operations.begin(bridge, "Save As"): return
	var candidate := bridge.fork_connection()
	var response: Dictionary = await _operations.save_as(candidate, project_path)
	_operations.finish(response, false, false)
	if not bool(response.get("ok", false)):
		candidate.stop()
		var detail := str(response.get("error", "Save As failed."))
		if response.get("outcomeUnknown", false):
			detail = "Save As could not be confirmed. Reopen the source and inspect the destination before trying again. " + detail
		elif response.has("saveAs"):
			detail = "The copy was saved, but could not be opened. Your source project remains open. " + detail
		else:
			detail = "Could not save · Your changes are still open. " + detail
		assets_save_state.emit(detail, true, not response.get("outcomeUnknown", false))
		failed.emit(detail)
		_operations.notify_completed(response)
		return
	bridge.stop()
	bridge = candidate
	var activated := await _activate_opened(response)
	_operations.call_deferred("notify_completed", response)
	if not activated: return
	if not bool(_read_context.call().get("connected", false)): return
	assets_save_state.emit("Project saved · No unsaved changes", false, false)
	status_changed.emit("Saved snapshot as %s · revision %d" % [bridge.current_project_path(), int(_read_context.call().get("revision", 0))])


func create_project(project_id: String, project_path: String) -> void:
	if not _operations.begin(bridge, "New Project"): return
	var candidate := bridge.fork_connection()
	var response: Dictionary = await _operations.create_project(candidate, project_id, project_path)
	_operations.finish(response, false, false)
	if not bool(response.get("ok", false)):
		candidate.stop()
		var detail := str(response.get("error", "Project creation failed."))
		if response.has("createdProjectPath"):
			detail = "The project was created, but could not be opened. Open %s to try again. %s" % [response.createdProjectPath, detail]
		failed.emit(detail)
		_operations.notify_completed(response)
		return
	bridge.stop()
	bridge = candidate
	var activated := await _activate_opened(response)
	_operations.call_deferred("notify_completed", response)
	if not activated: return
	if bool(_read_context.call().get("connected", false)):
		status_changed.emit("Created %s · revision 0 · %s" % [project_id, bridge.current_project_path()])


func open_project(project_path: String) -> void:
	if _operations.busy: return
	# Reopening is also the recovery path after an unconfirmed mutation.
	var was_recovery := _operations.requires_reopen
	_operations.reset_session()
	if not _operations.begin(bridge, "Open"): return
	var candidate := bridge.fork_connection()
	var response: Dictionary = await _operations.open_project(candidate, project_path)
	_operations.finish(response, false, false)
	if not bool(response.get("ok", false)):
		_operations.requires_reopen = _operations.requires_reopen or was_recovery
		candidate.stop()
		failed.emit(str(response.get("error", "Project open failed.")))
		_operations.notify_completed(response)
		return
	bridge.stop()
	bridge = candidate
	var activated := await _activate_opened(response)
	_operations.call_deferred("notify_completed", response)
	if not activated: return
	if bool(_read_context.call().get("connected", false)):
		status_changed.emit("Opened %s · revision %d" % [bridge.current_project_path(), int(_read_context.call().get("revision", 0))])


func _activate_opened(response: Dictionary) -> bool:
	var refreshed: Dictionary = await _activate.call(response)
	if refreshed.get("ok", false): return true
	failed.emit("The project is open, but its view could not load. " + str(refreshed.get("error", "Reopen the project before continuing.")))
	return false


func configure_application_library(directory: String) -> Dictionary:
	var normalized := directory.strip_edges().simplify_path()
	if normalized.is_empty():
		return {"ok": false, "error": "Choose a validated Realmz Classic application-media library before checking readiness."}
	if _operations.busy or _operations.requires_reopen:
		return {"ok": false, "error": "Reopen the project before continuing." if _operations.requires_reopen else "Wait for the current operation to finish."}
	if normalized == bridge.current_application_library_root(): return {"ok": true}
	if _has_draft.is_valid() and _has_draft.call():
		return {"ok": false, "error": "Apply or discard the current edits before changing the application library. Your draft is kept."}
	if not bridge.is_project_backed():
		return {"ok": false, "error": "Open a portable project before configuring its application-media library."}
	if not _operations.begin(bridge, "Configure application library"):
		return {"ok": false, "error": "Wait for the current operation to finish."}
	var candidate := bridge.fork_connection()
	var response: Dictionary = await _operations.configure_library(candidate, "application", normalized)
	if response.get("ok", false):
		response = await _operations.open_project(candidate, bridge.current_project_path(), {
			"applicationLibrary": normalized, "referenceCatalog": bridge.current_reference_catalog_root(),
			"monsterLibrary": bridge.current_monster_library_root()})
		if not response.get("ok", false):
			response["error"] = "The library preference was saved, but the project could not open with it. Your current project remains open. " + str(response.get("error", ""))
	_operations.finish(response, false, false)
	if not response.get("ok", false):
		candidate.stop()
		_operations.notify_completed(response)
		return response
	# Settings validation and the replacement adapter succeeded before retiring
	# the live session. A failed candidate never discards the current connection.
	bridge.stop()
	bridge = candidate
	var activated := await _activate_opened(response)
	_operations.call_deferred("notify_completed", response)
	if not activated:
		return {"ok": false, "error": "The application library was configured, but the project view could not load. Reopen the project before continuing."}
	return {"ok": true}


func save() -> void:
	if not _operations.begin(bridge, "Save"): return
	var response: Dictionary
	if bridge.is_project_backed():
		response = await _operations.request("project.save")
	else:
		var demo_path := ProjectSettings.globalize_path("user://ashen-crown.providence.json")
		response = await _operations.request("project.export-snapshot", {"path": demo_path})
	_operations.finish(response)
	if response.get("outcomeUnknown", false):
		assets_save_state.emit("Save could not be confirmed · Reopen this project before making more changes.", true, true)
		item_save_state.emit("Save could not be confirmed. Reopen this project before making more changes.", true, true)
		return
	if not bool(response.get("ok", false)):
		assets_save_state.emit("Could not save · Your changes are still open. " + str(response.get("error", "The destination could not be written.")), true, true)
		item_save_state.emit("Not saved. Your changes remain open. Retry Save or choose Save As.", true, true)
		failed.emit("Not saved. Keep this project open and retry Save, or use File > Save As. " + str(response.get("error", "The destination could not be written.")))
		return
	if response.get("ok", false):
		var result := response.result as Dictionary
		status_changed.emit("Saved revision %d · %s" % [
			int(result.get("revision", int(_read_context.call().get("revision", 0)))),
			str(result.get("path", "portable snapshot")),
		])
		item_save_state.emit("Saved", false, false)
		assets_save_state.emit("Project saved · No unsaved changes", false, false)
		project_saved.emit(int(_read_context.call().get("revision", 0)))
