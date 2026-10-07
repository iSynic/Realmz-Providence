extends SceneTree

class Bridge extends "res://src/native_bridge.gd":
	var calls: Array = []
	var revision := 0
	var failure := ""
	var unknown := false
	var catalog: Array = []
	func _request(method: String, params: Dictionary) -> Dictionary:
		OS.delay_msec(25)
		calls.append(method)
		if method == failure: return {"ok": false, "outcomeUnknown": unknown, "error": "Controlled map failure"}
		if method in ["map.create", "map.duplicate"]:
			assert(params.expectedRevision == revision)
			revision += 1
			catalog.append({"identity": "land:%d" % catalog.size()})
			return {"ok": true, "result": {"revision": revision}}
		if method == "map.catalog": return {"ok": true, "result": {"items": catalog.duplicate(true)}}
		assert(method == "map.open")
		return {"ok": true, "result": {"identity": params.identity}}

class Map extends ProvidenceMapDocumentController:
	func reload_catalog(operation: ProvidenceEditorOperation = null) -> Dictionary:
		assert(operation != null and operation.busy)
		var response := await operation.request("map.catalog")
		if response.get("ok", false): maps = response.result.items
		return response
	func load_map(map_identity: String, operation: ProvidenceEditorOperation = null) -> Dictionary:
		assert(operation != null and operation.busy)
		var response := await operation.request("map.open", {"identity": map_identity})
		if response.get("ok", false): identity = map_identity
		return response

var _bridge := Bridge.new()
var _map := Map.new()
var _controller := preload("res://src/map_lifecycle_controller.gd").new()
var _operations := ProvidenceEditorOperation.new()
var _applied := 0
var _frames := 0
var _shown: Array = []
var _errors: Array = []


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	root.add_child(_operations)
	_controller.initialize(_map, _operations, func(): return {"revision": _bridge.revision}, _show_map)
	_controller.projection_applied.connect(func(_projection): _applied += 1)
	_controller.failed.connect(func(message): _errors.append(message))
	_controller.attach_session(_bridge)
	process_frame.connect(func(): _frames += 1)
	assert((await _controller.create_map("land")).ok)
	assert(_frames > 2 and _applied == 1 and _shown == ["land:0"])
	assert(_bridge.calls == ["map.create", "map.catalog", "map.open"])
	assert((await _controller.duplicate_map("land:0")).ok and _shown == ["land:0", "land:1"])
	await _check_failures()
	_bridge.stop()
	_operations.free()
	print("PROVIDENCE_MAP_LIFECYCLE_CONTROLLER_OK responsive single-mutation borrowed-catalog-and-open acknowledged-read-failure ignored-busy unknown-no-retry teardown")
	quit()


func _show_map(identity: String) -> bool:
	assert(not _operations.busy and identity == _map.identity)
	_shown.append(identity)
	return true


func _check_failures() -> void:
	_bridge.failure = "map.create"
	assert(not (await _controller.create_map("land")).ok and _applied == 2)
	_bridge.failure = "map.open"
	var result: Dictionary = await _controller.create_map("land")
	assert(result.ok and result.has("viewRefreshError") and _applied == 3 and _shown.size() == 2)
	assert(_errors.back().begins_with("The map was created"))
	_bridge.failure = ""
	call("_start_create")
	assert(_operations.busy)
	assert(not (await _controller.create_map("land")).ok)
	_controller.teardown()
	await _operations.completed
	await process_frame
	assert(_applied == 3 and _shown.size() == 2)
	_controller.attach_session(_bridge)
	_bridge.failure = "map.create"
	_bridge.unknown = true
	assert(not (await _controller.create_map("land")).ok and _operations.requires_reopen)
	var count := _bridge.calls.size()
	await _controller.create_map("land")
	assert(_bridge.calls.size() == count)


func _start_create() -> void:
	await _controller.create_map("land")
