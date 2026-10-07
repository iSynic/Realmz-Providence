extends SceneTree

class Bridge extends "res://tools/validate_map_document_controller.gd".Bridge:
	var revision := 0
	var target := 20
	var mutations := 0
	func _request(method: String, params: Dictionary) -> Dictionary:
		if method in ["action-point.open", "action-reference.retarget"]:
			OS.delay_msec(25)
			calls.append(method)
			if method == fail_method: return {"ok": false, "outcomeUnknown": unknown, "error": "Controlled reference rejection"}
			if method == "action-reference.retarget":
				assert(params == {"expectedRevision": revision, "source": "action-point:land:0:4", "slot": 2, "targetNativeId": 30})
				revision += 1
				mutations += 1
				target = params.targetNativeId
				return {"ok": true, "result": {"revision": revision, "changedEntities": [params.source]}}
			return {"ok": true, "result": {"references": [
				{"source": "other", "field": "actions[0].target", "targetId": "message:99", "resolution": "missing"},
				{"source": params.identity, "field": "actions[2].target", "targetId": "message:%d" % target, "targetKind": "message", "resolution": "missing"}]}}
		var response := super._request(method, params)
		if method == "map.open" and response.ok:
			response.result["actionPoints"] = [{"identity": "action-point:land:0:4", "recordIndex": 4, "coordinate": {"x": 40, "y": 40}}]
		return response

var _bridge := Bridge.new()
var _operations := ProvidenceEditorOperation.new()
var _map := ProvidenceMapDocumentController.new()
var _controller := preload("res://src/map_inspector_controller.gd").new()
var _land: ProvidenceLandEditor
var _view: ProvidenceMapInspector
var _views: Array = []
var _errors: Array = []
var _applied := 0
var _frames := 0


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	root.add_child(_operations)
	_land = _scene("land_editor")
	_view = _scene("map_inspector")
	_map.initialize(_land, _scene("dungeon_editor"), _view, _scene("map_context_sidebar"), _operations)
	_controller.initialize(_view, _map, _operations, func(): return {"revision": _bridge.revision}, func(): return [])
	_map.attach_session(_bridge)
	_controller.attach_session(_bridge)
	_controller.failed.connect(func(message): _errors.append(message))
	_controller.projection_applied.connect(func(_projection): _applied += 1)
	_land.cell_selected.connect(_select)
	process_frame.connect(func(): _frames += 1)
	await _map.load_first()
	await _check_read_and_repair()
	await _check_borrowed_and_late_selection()
	await _check_hidden_details()
	await _check_failures()
	await _check_released_completion_owner()
	await process_frame
	_bridge.stop()
	for view in _views: view.free()
	_operations.free()
	print("PROVIDENCE_MAP_INSPECTOR_CONTROLLER_OK immediate-cell responsive-read tile-draft exact-source borrowed-history retained-pan-zoom single-repair rejection unknown teardown")
	quit()


func _scene(name: String) -> Control:
	var view: Control = load("res://src/" + name + ".tscn").instantiate()
	root.add_child(view)
	_views.append(view)
	return view


func _check_released_completion_owner() -> void:
	var pending := preload("res://src/map_inspector_controller.gd").new()
	pending.initialize(_view, _map, _operations, func(): return {"revision": 0}, func(): return [])
	pending._queued = true
	pending._operation_completed({"ok": true})
	var observer: WeakRef = weakref(pending)
	_map.refresh_selection = _controller.refresh_selection
	pending = null
	assert(observer.get_ref() == null, "A scheduled notification retained a discarded workbench owner")
	# The next frame must not resume a coroutine on the released instance.
	await process_frame
	await process_frame


func _select(x: int, y: int, tile: int, action_point: Dictionary) -> void:
	_map.select_cell(x, y, tile, action_point)
	await _controller.select_cell()


func _settle() -> void:
	var idle_frames := 0
	for frame in range(40):
		await process_frame
		idle_frames = 0 if _operations.busy else idle_frames + 1
		if idle_frames >= 3: return
	assert(false, "The reference workflow did not finish")


func _check_read_and_repair() -> void:
	var canvas = _land.get_node("%LandMapCanvas")
	canvas.zoom_in()
	_land.select_cell(40, 40)
	assert(_operations.busy and _view.get_node("%SelectedCoordinate").text == "CELL 40, 40")
	_view.set_tile_value(72)
	var frames := _frames
	await _settle()
	assert(_frames > frames + 1 and _view.tile_value() == 72)
	assert(_view.get_node("%MapReferenceSource").text == "action-point:land:0:4")
	assert(_view.get_node("%CurrentMapReferenceTarget").text.contains("20"))
	var zoom: int = canvas.zoom_percent()
	var pan: Vector2 = canvas.pan_offset()
	_bridge.calls.clear()
	_controller.repair_reference(30)
	assert(_operations.busy)
	await _controller.repair_reference(30)
	await _settle()
	assert(_bridge.mutations == 1 and _applied == 1)
	assert(_bridge.calls == ["action-reference.retarget", "map.catalog", "map.open", "action-point.open"])
	assert(canvas.zoom_percent() == zoom and canvas.pan_offset() == pan)
	assert(_map.selected_cell == Vector2i(40, 40) and _view.tile_value() == 72)
	assert(_view.get_node("%CurrentMapReferenceTarget").text.contains("30"))


func _check_borrowed_and_late_selection() -> void:
	_bridge.calls.clear()
	assert(_operations.begin(_bridge, "Undo"))
	var response := await _map.refresh_history(_operations)
	assert(response.ok and _operations.busy)
	_operations.finish(response)
	await _settle()
	assert(_bridge.calls == ["map.catalog", "map.open", "action-point.open"])
	_land.select_cell(40, 40)
	assert(_operations.busy)
	_land.select_cell(41, 40)
	await _settle()
	assert(_view.get_node("%SelectedCoordinate").text == "CELL 41, 40")
	assert(_view.get_node("%MapReferenceSource").text == "—")
	_land.select_cell(40, 40)
	_land.select_cell(41, 40)
	_land.select_cell(40, 40)
	await _settle()
	assert(_view.get_node("%MapReferenceSource").text == "action-point:land:0:4")


func _check_hidden_details() -> void:
	_view.hide()
	var count := _bridge.calls.size()
	_land.select_cell(40, 40)
	await _settle()
	assert(_bridge.calls.size() == count and not _operations.busy)
	assert(_operations.begin(_bridge, "Undo"))
	var response := await _map.refresh_history(_operations)
	_operations.finish(response)
	await _settle()
	assert(_bridge.calls.slice(count) == ["map.catalog", "map.open"])
	_view.show()
	await _settle()
	assert(_view.get_node("%MapReferenceSource").text == "action-point:land:0:4")


func _check_failures() -> void:
	_bridge.fail_method = "action-reference.retarget"
	await _controller.repair_reference(30)
	assert(_applied == 1 and _bridge.mutations == 1)
	_bridge.fail_method = "map.open"
	await _controller.repair_reference(30)
	assert(_applied == 2 and _errors.back().begins_with("The map reference was repaired"))
	_bridge.fail_method = ""
	_land.select_cell(40, 40)
	await _settle()
	_bridge.fail_method = "action-reference.retarget"
	_bridge.unknown = true
	await _controller.repair_reference(30)
	assert(_operations.requires_reopen)
	var count := _bridge.calls.size()
	await _controller.repair_reference(30)
	assert(_bridge.calls.size() == count and _applied == 2)
	_bridge.stop()
	_operations.reset_session()
	_bridge.fail_method = ""
	_bridge.unknown = false
	_land.select_cell(40, 40)
	assert(_operations.busy)
	_controller.teardown()
	_controller.show_overview()
	await _settle()
	assert(_view.get_node("%SelectedCoordinate").text == "No cell selected")
	assert(_view.get_node("%MapReferenceSource").text == "—")
