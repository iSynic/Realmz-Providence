extends SceneTree

class Bridge extends "res://src/native_bridge.gd":
	var revision := 0
	var failure := ""
	var unknown := false
	var calls: Array = []
	func _request(method: String, params: Dictionary) -> Dictionary:
		OS.delay_msec(25)
		calls.append(method)
		if method == failure: return {"ok": false, "outcomeUnknown": unknown, "error": "Controlled import failure"}
		if method == "session.describe": return {"ok": true, "result": {"revision": revision}}
		assert(method in ["project.import-classic-scenario", "project.import-classic-land-slice", "item-rules.import-scenario"])
		assert(params.expectedRevision == revision)
		revision += 1
		return {"ok": true, "result": {"revision": revision}}

var _bridge := Bridge.new()
var _operations := ProvidenceEditorOperation.new()
var _controller := preload("res://src/scenario_import_controller.gd").new()
var _view: ProvidenceScenarioImportDialog
var _completed: Array = []
var _projections: Array = []
var _pending := false
var _frames := 0
var _activation_failure := false


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	root.add_child(_operations)
	_view = load("res://src/scenario_import_dialog.tscn").instantiate()
	root.add_child(_view)
	_controller.initialize(_view, _operations, func(): return {"revision": _bridge.revision}, _complete)
	_controller.projection_applied.connect(func(projection): _projections.append(projection))
	_controller.attach_session(_bridge)
	process_frame.connect(func(): _frames += 1)
	assert(await _controller.import_items("Data NI", "Data NI.rsrc"))
	assert(_frames > 2 and _bridge.calls == ["item-rules.import-scenario"] and _completed == ["items"])
	assert(await _controller.import_land("scenario"))
	assert(_bridge.calls.slice(1) == ["project.import-classic-land-slice", "session.describe"])
	assert(await _controller.import_scenario("scenario", "application"))
	assert(_completed == ["items", "land", "scenario"] and _projections.size() == 3)
	await _check_failures()
	_controller.teardown()
	_bridge.stop()
	_view.free()
	_operations.free()
	print("PROVIDENCE_SCENARIO_IMPORT_CONTROLLER_OK three-imports responsive one-mutation acknowledged-refresh-failure no-retry unknown teardown")
	quit()


func _complete(kind: String, projection: Dictionary, session: Dictionary) -> Dictionary:
	assert(not _operations.busy and projection.revision == _bridge.revision)
	if kind != "items": assert(session.result.revision == _bridge.revision)
	if _activation_failure: return {"ok": false, "error": "Controlled post-import view failure"}
	_completed.append(kind)
	return {"ok": true}


func _check_failures() -> void:
	_bridge.failure = "project.import-classic-land-slice"
	assert(not await _controller.import_land("scenario") and _projections.size() == 3)
	assert(not _operations.requires_reopen)
	_bridge.failure = "session.describe"
	assert(not await _controller.import_land("scenario"))
	assert(_projections.size() == 4 and _completed.size() == 3)
	assert(_view.get_node("%ScenarioImportValidation").text.begins_with("The import was applied"))
	_bridge.failure = ""
	_activation_failure = true
	assert(not await _controller.import_land("scenario"))
	assert(_projections.size() == 5 and _completed.size() == 3)
	assert(_view.get_node("%ScenarioImportValidation").text.contains("Controlled post-import view failure"))
	_activation_failure = false
	call("_start_import")
	assert(_operations.busy)
	assert(not await _controller.import_land("scenario"))
	_controller.teardown()
	await _operations.completed
	await process_frame
	assert(not _pending and _completed.size() == 3)
	_controller.attach_session(_bridge)
	_bridge.failure = "project.import-classic-land-slice"
	_bridge.unknown = true
	assert(not await _controller.import_land("scenario") and _operations.requires_reopen)
	var count := _bridge.calls.size()
	assert(not await _controller.import_land("scenario") and _bridge.calls.size() == count)


func _start_import() -> void:
	_pending = await _controller.import_land("scenario")
