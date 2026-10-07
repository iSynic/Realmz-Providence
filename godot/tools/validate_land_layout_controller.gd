extends SceneTree

class Bridge extends "res://src/native_bridge.gd":
	var revision := 0
	var cells: Array = []
	var failure := ""
	var calls: Array = []
	func _request(method: String, params: Dictionary) -> Dictionary:
		OS.delay_msec(25)
		calls.append(method)
		if method == failure: return {"ok": false, "error": "Controlled layout failure"}
		if method == "land-layout.open":
			return {"ok": true, "result": {"layout": {"cells": cells}, "landMaps": [{"identity": "land:0", "nativeIndex": 0}, {"identity": "land:1", "nativeIndex": 1}]}}
		if method == "map.thumbnail":
			return {"ok": true, "result": {"available": false, "reason": "Controlled absent map artwork"}}
		assert(params.expectedRevision == revision)
		var index := int(params.row) * 16 + int(params.column)
		var value := 1 if params.target != null else 0
		if method == "land-layout.preview-cell":
			return {"ok": true, "result": {"canApply": cells[index] != value, "placement": {
				"row": params.row, "column": params.column, "target": {"name": "Land 1"} if value else null,
				"replaced": null, "changes": [{"row": params.row, "column": params.column}] if cells[index] != value else []}}}
		assert(method == "land-layout.apply-cell")
		cells[index] = value
		revision += 1
		return {"ok": true, "result": {"revision": revision}}

var _bridge := Bridge.new()
var _controller := preload("res://src/land_layout_controller.gd").new()
var _operations := ProvidenceEditorOperation.new()
var _view: ProvidenceLandLayoutEditor
var _review: Window
var _applied := 0
var _frames := 0
var _pending := {}


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	_bridge.cells.resize(128)
	_bridge.cells.fill(0)
	root.add_child(_operations)
	_view = load("res://src/land_layout_editor.tscn").instantiate()
	root.add_child(_view)
	_review = _view.get_node("%LayoutPlacementReview")
	_controller.initialize(_view, _operations, func(): return {"revision": _bridge.revision})
	_controller.projection_applied.connect(func(_projection): _applied += 1)
	_controller.attach_session(_bridge)
	process_frame.connect(func(): _frames += 1)
	assert((await _controller.reload()).ok and _frames > 2)
	_view.get_node("%LandMapPalette").select(1)
	_view.get_node("%LayoutGrid").cell_selected.emit(1,3)
	await _check_accept_and_cancel()
	await _check_failure_and_teardown()
	_bridge.stop()
	_view.free()
	_operations.free()
	print("PROVIDENCE_LAND_LAYOUT_CONTROLLER_OK worker-read explicit-review preview-pure cancel-escape-close focus-restored no-op borrowed-history rejection teardown-read teardown-write")
	quit()


func _check_accept_and_cancel() -> void:
	await _controller.set_cell(1, 3, "land:1")
	assert(_review.visible and _applied == 0 and _bridge.revision == 0)
	_review.get_node("%CancelPlacement").pressed.emit()
	assert(not _view.has_unapplied_changes() and not _review.visible)
	assert(_view.get_viewport().gui_get_focus_owner() == _view.get_node("%PlaceCurrentLand"))
	await _controller.set_cell(1, 3, "land:1")
	var escape := InputEventKey.new()
	escape.keycode = KEY_ESCAPE
	escape.pressed = true
	_review._input(escape)
	assert(not _review.visible and _bridge.revision == 0)
	await _controller.set_cell(1, 3, "land:1")
	assert((await _controller.apply_review()).ok)
	assert(_applied == 1 and _view.get_node("%LayoutGrid").cells[19].identity == "land:1")
	assert(_view.get_node("%LandMapPalette").get_selected_items()[0] == 1)
	assert(_view.get_node("%SelectedLayoutCell").text == "ROW 2 · COLUMN 4")
	await _controller.set_cell(1, 3, "land:1")
	assert(_review.get_node("%AcceptPlacement").disabled and not _view.has_unapplied_changes())
	_review.close_requested.emit()
	assert(_bridge.revision == 1)
	assert(_operations.begin(_bridge, "Undo"))
	var result: Dictionary = await _controller.reload(_operations)
	assert(result.ok and _operations.busy)
	_operations.finish(result)


func _check_failure_and_teardown() -> void:
	await _controller.set_cell(1, 3, null)
	_bridge.failure = "land-layout.apply-cell"
	assert(not (await _controller.apply_review()).ok)
	assert(_view.has_unapplied_changes() and _review.visible and _applied == 1 and _bridge.revision == 1)
	assert(not _review.get_node("%AcceptPlacement").disabled)
	_view.discard_draft()
	assert(not _view.has_unapplied_changes())
	_bridge.failure = ""
	call("_start_reload")
	assert(_operations.busy)
	_controller.teardown()
	await _operations.completed
	await process_frame
	assert(_pending.get("stale", false) and _view.get_node("%LandMapPalette").item_count == 0)
	_controller.attach_session(_bridge)
	await _controller.reload()
	await _controller.set_cell(1, 3, null)
	call("_start_apply")
	assert(_operations.busy)
	_controller.teardown()
	await _operations.completed
	await process_frame
	assert(_pending.get("stale", false) and _applied == 1 and not _view.has_unapplied_changes() and not _review.visible)


func _start_reload() -> void:
	_pending = await _controller.reload()


func _start_apply() -> void:
	_pending = await _controller.apply_review()
