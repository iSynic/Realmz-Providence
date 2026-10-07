extends SceneTree

class Bridge extends "res://src/native_bridge.gd":
	var calls: Array = []
	var fail_method := ""
	var unknown := false
	var empty := false
	var removed := false
	func _request(method: String, params: Dictionary) -> Dictionary:
		OS.delay_msec(25)
		calls.append(method)
		if method == fail_method: return {"ok": false, "outcomeUnknown": unknown, "error": "Controlled map rejection"}
		if method == "map.catalog":
			assert(params == {"offset": 0, "limit": 128, "levelType": "all", "includeDiagnostics": false, "includeReferences": false})
			return {"ok": true, "result": {"items": [] if empty else [{"identity": "land:1" if removed else "land:0", "levelType": "land", "name": "Test map"}]}}
		if method == "map.open":
			assert(params.includeDiagnostics == false)
			assert(params.includeReferences == false)
			if removed and params.identity == "land:0": return {"ok": false, "error": "Map was removed"}
			var tiles: Array = []
			tiles.resize(8100)
			tiles.fill(1)
			return {"ok": true, "result": {"map": {"identity": params.identity, "levelType": "land", "name": "Test map", "tiles": tiles}}}
		if method == "map.render-atlas": return {"ok": true, "result": {"available": false, "reason": "Controlled fallback colors"}}
		return {"ok": false, "error": "Unexpected request"}

class PagedBridge extends Bridge:
	var change_revision := false
	var fail_second := false
	var offsets: Array = []
	func _request(method: String, params: Dictionary) -> Dictionary:
		if method != "map.catalog": return super._request(method, params)
		OS.delay_msec(15)
		offsets.append(params.offset)
		if fail_second and params.offset > 0: return {"ok": false, "error": "Controlled later-page failure"}
		var items: Array = []
		for index in range(params.offset, mini(params.offset + params.limit, 257)):
			items.append({"identity": "land:%d" % index, "levelType": "land", "name": "Level %d" % index})
		return {"ok": true, "result": {"items": items, "total": 257, "offset": params.offset,
			"revision": 2 if change_revision and params.offset > 0 else 1}}

var _bridge := Bridge.new()
var _operations := ProvidenceEditorOperation.new()
var _controller := ProvidenceMapDocumentController.new()
var _land: ProvidenceLandEditor
var _pending: Dictionary = {}
var _frames := 0
var _errors: Array = []


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	root.add_child(_operations)
	_land = _scene("land_editor")
	var dungeon := _scene("dungeon_editor")
	var inspector := _scene("map_inspector")
	var sidebar := _scene("map_context_sidebar")
	_controller.initialize(_land, dungeon, inspector, sidebar, _operations)
	_controller.attach_session(_bridge)
	_controller.failed.connect(func(message): _errors.append(message))
	process_frame.connect(func(): _frames += 1)
	await _controller.load_first()
	assert(_bridge.calls == ["map.catalog", "map.open", "map.render-atlas"] and _frames > 4)
	assert(_controller.identity == "land:0" and _land.get_node("%LandMapCanvas")._tiles.size() == 8100)
	await _check_refresh()
	await _check_failures()
	await _check_removed_map_fallback()
	await _check_teardown()
	await _check_paged_catalog()
	_bridge.stop()
	for view in [_land, dungeon, inspector, sidebar]: view.free()
	_operations.free()
	print("PROVIDENCE_MAP_DOCUMENT_CONTROLLER_OK worker-load bounded-catalog all-pages atomic-later-failure revision-bound semantic-history removed-map-fallback view-retained fallback-colors known-rejection unknown teardown")
	quit()


func _scene(name: String) -> Control:
	var view: Control = load("res://src/" + name + ".tscn").instantiate()
	root.add_child(view)
	return view


func _check_refresh() -> void:
	var canvas = _land.get_node("%LandMapCanvas")
	canvas.zoom_in()
	canvas.reveal_cell(40, 40)
	_controller.select_cell(40, 40, 1, {})
	var zoom: int = canvas.zoom_percent()
	var pan: Vector2 = canvas.pan_offset()
	_bridge.calls.clear()
	assert(_operations.begin(_bridge, "Undo"))
	var response := await _controller.refresh_history(_operations, {
		"changedEntities": ["land:0"], "changedEntitiesTotal": 1,
		"affectedEntities": ["land:0"], "affectedEntitiesTotal": 1,
		"referenceChanges": [], "affectedDiagnostics": [], "referencesUnchanged": true, "truncated": false})
	assert(response.ok and _operations.busy)
	_operations.finish(response)
	assert(_bridge.calls == ["map.open"])
	assert(canvas.zoom_percent() == zoom and canvas.pan_offset() == pan and _controller.selected_cell == Vector2i(40, 40))


func _check_removed_map_fallback() -> void:
	_bridge.calls.clear()
	_bridge.removed = true
	assert(_operations.begin(_bridge, "Undo Create Map"))
	var response := await _controller.refresh_history(_operations, {
		"changedEntities": ["land:0"], "changedEntitiesTotal": 1,
		"affectedEntities": ["land:0"], "affectedEntitiesTotal": 1,
		"referenceChanges": [], "affectedDiagnostics": [], "referencesUnchanged": true, "truncated": false})
	_operations.finish(response)
	assert(response.ok and _controller.identity == "land:1")
	assert(_bridge.calls == ["map.open", "map.catalog", "map.open", "map.render-atlas"])


func _check_failures() -> void:
	_bridge.fail_method = "map.open"
	assert(not (await _controller.load_map("land:1")).ok and _controller.identity == "land:0")
	assert(_errors == ["Controlled map rejection"])
	_bridge.unknown = true
	assert(not (await _controller.load_map("land:1")).ok and _operations.requires_reopen)
	var count := _bridge.calls.size()
	assert(not (await _controller.load_map("land:1")).ok and _bridge.calls.size() == count)
	_bridge.stop()
	_operations.reset_session()
	_bridge.fail_method = ""
	_bridge.unknown = false


func _check_teardown() -> void:
	call("_start_load")
	assert(_operations.busy)
	assert((await _controller.load_map("land:2")).get("busy", false))
	_controller.teardown()
	await _operations.completed
	await process_frame
	assert(_pending.get("connectionChanged", false) and _controller.identity.is_empty() and _controller.maps.is_empty())
	_controller.attach_session(_bridge)
	_bridge.empty = true
	await _controller.load_first()
	assert(_controller.identity.is_empty() and _land.get_node("%LandMapCanvas")._tiles.is_empty())


func _start_load() -> void:
	_pending = await _controller.load_map("land:1")


func _check_paged_catalog() -> void:
	var paged := PagedBridge.new()
	_controller.attach_session(paged)
	var response := await _controller.reload_catalog()
	assert(response.ok and paged.offsets == [0, 128, 256])
	assert(_controller.maps.size() == 257 and _controller.maps.back().identity == "land:256")
	paged.offsets.clear()
	paged.fail_second = true
	response = await _controller.reload_catalog()
	assert(not response.ok and paged.offsets == [0, 128] and _controller.maps.size() == 257)
	paged.fail_second = false
	paged.change_revision = true
	response = await _controller.reload_catalog()
	assert(not response.ok and _controller.maps.size() == 257)
	paged.stop()
	_controller.attach_session(_bridge)
