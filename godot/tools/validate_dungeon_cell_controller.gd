extends SceneTree

class Bridge extends "res://src/native_bridge.gd":
	var calls: Array = []
	var revision := 0
	var failure := ""
	var unknown := false
	func _request(method: String, params: Dictionary) -> Dictionary:
		OS.delay_msec(25)
		calls.append(method)
		if method == failure: return {"ok": false, "outcomeUnknown": unknown, "error": "Controlled dungeon rejection"}
		if method == "dungeon-cell.open": return {"ok": true, "result": {"x": params.x, "y": params.y, "primitivePolicies": []}}
		if method == "dungeon-cell.update-primitive":
			assert(params.expectedRevision == revision)
			revision += 1
			return {"ok": true, "result": {"revision": revision}}
		assert(method == "map.open")
		return {"ok": true, "result": {}}

class Map extends ProvidenceMapDocumentController:
	func refresh_history(
		operation: ProvidenceEditorOperation = null,
		_projection: Dictionary = {},
	) -> Dictionary:
		assert(operation != null and operation.busy)
		return await operation.request("map.open", {"identity": identity})

var _bridge := Bridge.new()
var _map := Map.new()
var _controller := preload("res://src/dungeon_cell_controller.gd").new()
var _operations := ProvidenceEditorOperation.new()
var _view: ProvidenceDungeonEditor
var _applied := 0
var _frames := 0
var _errors: Array = []


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	root.add_child(_operations)
	_view = load("res://src/dungeon_editor.tscn").instantiate()
	root.add_child(_view)
	_map.identity = "dungeon:0"
	_map.is_dungeon = true
	_controller.initialize(_view, _map, _operations, func(): return {"revision": _bridge.revision})
	_controller.projection_applied.connect(func(_projection): _applied += 1)
	_controller.failed.connect(func(message): _errors.append(message))
	_controller.attach_session(_bridge)
	process_frame.connect(func(): _frames += 1)
	await _controller.open_cell(3, 4)
	assert(_frames > 2 and _view.selected_coordinate() == Vector2i(3, 4))
	await _controller.update_primitive(3, 4, "wall", true)
	assert(_applied == 1 and _bridge.calls == ["dungeon-cell.open", "dungeon-cell.update-primitive", "map.open"])
	await _check_failures()
	_bridge.stop()
	_view.free()
	_operations.free()
	print("PROVIDENCE_DUNGEON_CELL_CONTROLLER_OK responsive bounded-read late-selection retained-failed-read mutation-acknowledged borrowed-refresh unknown teardown")
	quit()


func _check_failures() -> void:
	call("_start_open")
	assert(_operations.busy)
	_view.set_cell_projection({"x": 7, "y": 8})
	await _operations.completed
	await process_frame
	assert(_view.selected_coordinate() == Vector2i(7, 8))
	_bridge.failure = "dungeon-cell.open"
	await _controller.open_cell(1, 2)
	assert(_view.selected_coordinate() == Vector2i(7, 8))
	_bridge.failure = "map.open"
	await _controller.update_primitive(3, 4, "wall", false)
	assert(_applied == 2 and _errors.back().begins_with("The dungeon cell was changed"))
	_bridge.failure = ""
	call("_start_open")
	_controller.teardown()
	_view.set_document({})
	await _operations.completed
	await process_frame
	assert(_view.selected_coordinate() == Vector2i(-1, -1))
	_controller.attach_session(_bridge)
	_bridge.failure = "dungeon-cell.update-primitive"
	_bridge.unknown = true
	await _controller.update_primitive(3, 4, "wall", false)
	assert(_operations.requires_reopen)
	var count := _bridge.calls.size()
	await _controller.update_primitive(3, 4, "wall", false)
	assert(_bridge.calls.size() == count)


func _start_open() -> void:
	await _controller.open_cell(1, 2)
