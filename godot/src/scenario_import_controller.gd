extends RefCounted

signal projection_applied(projection: Dictionary)
signal failed(message: String)
signal status_changed(message: String)


var _view: ProvidenceScenarioImportDialog
var _operations: ProvidenceEditorOperation
var _context: Callable
var _after_import: Callable
var _bridge: RefCounted
var _generation := 0


func initialize(view: ProvidenceScenarioImportDialog, operations: ProvidenceEditorOperation, context: Callable, after_import: Callable) -> void:
	_view = view
	_operations = operations
	_context = context
	_after_import = after_import


func attach_session(bridge: RefCounted) -> void:
	_generation += 1
	_bridge = bridge


func teardown() -> void:
	attach_session(null)


func inspect_scenario(directory: String, application_directory: String) -> void:
	if _bridge == null: return
	var params := _scenario_params(directory, application_directory)
	var response := await _operations.run_workflow(_bridge, "Inspect scenario", _inspect.bind(params, _generation))
	if not response.get("ok", false) and not response.get("stale", false):
		_view.apply_classic_preflight_error(str(response.get("error", "Classic scenario source-set inspection failed.")))


func _inspect(operation: ProvidenceEditorOperation, params: Dictionary, generation: int) -> Dictionary:
	var response := await operation.request("project.inspect-classic-scenario-import", params)
	if not response.get("ok", false): return response
	if generation != _generation: return _stale()
	_view.apply_classic_preflight(response.result)
	return response


func import_scenario(directory: String, application_directory: String) -> bool:
	return await _import("scenario", "project.import-classic-scenario", _scenario_params(directory, application_directory))


func import_land(directory: String) -> bool:
	return await _import("land", "project.import-classic-land-slice", {"directory": directory})


func import_items(path: String, text_path: String) -> bool:
	var params := {"path": path}
	if not text_path.is_empty(): params["textPath"] = text_path
	return await _import("items", "item-rules.import-scenario", params)


func _import(kind: String, method: String, params: Dictionary) -> bool:
	if _bridge == null: return false
	params["expectedRevision"] = int(_context.call().revision)
	var generation := _generation
	var response := await _operations.run_workflow(_bridge, "Import " + kind, _submit.bind(kind, method, params, generation))
	if not response.get("ok", false):
		if response.get("stale", false): return false
		_report_failure(response)
		return false
	if generation != _generation: return false
	var refreshed: Dictionary = await _after_import.call(kind, response.result, response.get("session", {}))
	if not refreshed.get("ok", false):
		refreshed["importApplied"] = true
		_report_failure(refreshed)
		return false
	_view.hide()
	_present_summary(kind, response.result)
	return true


func _report_failure(response: Dictionary) -> void:
	var message := str(response.get("error", "Classic import failed."))
	if response.get("importApplied", false): message = "The import was applied, but its view could not refresh. Reopen the project before importing again. " + message
	_view.apply_classic_preflight_error(message)
	failed.emit(message)


func _submit(operation: ProvidenceEditorOperation, kind: String, method: String, params: Dictionary, generation: int) -> Dictionary:
	_view.apply_import_started()
	var response := await operation.request(method, params)
	if not response.get("ok", false): return response
	if generation != _generation: return _stale()
	projection_applied.emit(response.result)
	if kind == "items": return response
	# A successful import is never retried when only the following read fails.
	var session := await operation.request("session.describe")
	if not session.get("ok", false):
		session["importApplied"] = true
		return session
	if generation != _generation: return _stale()
	response["session"] = session
	return response


func _scenario_params(directory: String, application_directory: String) -> Dictionary:
	var params := {"directory": directory}
	if not application_directory.strip_edges().is_empty(): params["applicationDataDirectory"] = application_directory
	return params


func _stale() -> Dictionary:
	return {"ok": false, "stale": true, "error": "The project changed while importing."}


func _present_summary(kind: String, projection: Dictionary) -> void:
	var counts: Dictionary = projection.get("counts", {})
	match kind:
		"scenario":
			status_changed.emit("Imported %s · %d maps · %d messages · %d items · %d source files · revision %d" % [
				str(projection.get("scenarioName", "Classic scenario")), int(counts.get("maps", 0)),
				int(counts.get("messages", 0)), int(counts.get("scenarioItems", 0)),
				int(projection.get("sourceFiles", 0)), int(_context.call().revision)])
		"land":
			status_changed.emit("Imported %d land map%s · %d placed AP rows · %d Extra AP rows · %d messages · revision %d" % [
				int(counts.get("maps", 0)), "" if int(counts.get("maps", 0)) == 1 else "s",
				int(counts.get("actionPoints", 0)), int(counts.get("extraActionPoints", 0)), int(counts.get("messages", 0)), int(_context.call().revision)])
		"items":
			status_changed.emit("Imported 200 scenario items · revision %d · %d source warnings" % [int(_context.call().revision), (projection.get("sourceWarnings", []) as Array).size()])
