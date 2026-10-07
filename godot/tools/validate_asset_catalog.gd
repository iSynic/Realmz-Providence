extends SceneTree

class Bridge extends "res://src/native_bridge.gd":
	var calls: Array = []
	var fail_method := ""
	var fail_identity := ""
	var unknown := false
	var png := ""
	func is_project_backed() -> bool:
		return true
	func begin_repair_recovery(method: String, params: Dictionary, owner: int, _reconnect: bool) -> Dictionary:
		return super.begin_repair_recovery(method, params, owner, false)
	func _request(method: String, params: Dictionary) -> Dictionary:
		if method == "media.recovery.read": return _request(str(params.method), params.params)
		OS.delay_msec(20)
		calls.append({"method": method, "params": params.duplicate(true)})
		if method == fail_method and (fail_identity.is_empty() or params.get("identity", "") == fail_identity):
			return {"ok": false, "error": "Controlled catalog failure", "outcomeUnknown": unknown}
		match method:
			"project-asset.list", "application-media.list":
				assert(params.limit == 25 and params.kind == "all")
				var rows: Array = []
				for index in 25:
					rows.append({"identity": "icon:" + str(index), "label": "Asset " + str(index), "kind": "icon",
						"classicResource": {"resourceType": "cicn", "resourceId": 30126 + index}, "previewCommand": "icon.preview"})
				return {"ok": true, "result": {"revision": 7, "items": rows, "total": 25}}
			"icon.preview", "application-media.preview":
				return {"ok": true, "result": {"base64": png, "width": 8, "height": 8}}
			"project-asset.open":
				return {"ok": true, "result": {"asset": {"identity": params.identity}, "removable": true}}
		return {"ok": false, "error": "Unexpected catalog request"}

var _bridge := Bridge.new()
var _operations := ProvidenceEditorOperation.new()
var _panel: Control
var _pending: Dictionary = {}
var _frames := 0
var _completed_previews := 0


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	root.size = Vector2i(1600, 900)
	_panel = preload("res://src/unified_asset_gallery.tscn").instantiate()
	root.add_child(_panel)
	_panel.size = Vector2(1200, 760)
	root.add_child(_operations)
	_panel.configure_operations(_operations)
	process_frame.connect(func(): _frames += 1)
	_operations.completed.connect(_capture_completion)
	var bitmap := Image.create(8, 8, false, Image.FORMAT_RGBA8)
	bitmap.fill(Color.CORNFLOWER_BLUE)
	_bridge.png = Marshalls.raw_to_base64(bitmap.save_png_to_buffer())
	await _panel.show_scope(_bridge, "scenario")
	assert(_bridge.calls.size() == 26 and _completed_previews == 25)
	await _panel._select(3)
	await _check_completion()
	await _check_borrowed_history()
	await _check_changed_query()
	await _check_rejected_and_unknown()
	await _check_teardown()
	await _check_stock_cache()
	_bridge.stop()
	_panel.free()
	_operations.free()
	print("PROVIDENCE_ASSET_CATALOG_OK bounded-25 worker-previews completion single-flight borrowed-history selection query-guard rejection unknown teardown")
	quit()


func _capture_completion(_response: Dictionary) -> void:
	_completed_previews = 0
	var gallery: ItemList = _panel.get_node("%Gallery")
	for index in gallery.item_count:
		if gallery.get_item_icon(index).get_width() == 8: _completed_previews += 1


func _check_completion() -> void:
	var started := Time.get_ticks_msec()
	var before := _frames
	call("_start_reload")
	assert(_operations.busy and Time.get_ticks_msec() - started < 100)
	assert((await _panel.reload(_bridge)).get("busy", false))
	assert(_panel.get_node("%Gallery").item_count == 25)
	await _operations.completed
	await process_frame
	assert(_pending.ok and _completed_previews == 25 and _frames > before + 20)
	assert(_operations.last_metrics.maxFrameGapMs < 100)
	assert(not _bridge.calls.any(func(entry): return not entry.method in ["project-asset.list", "icon.preview", "project-asset.open"]))


func _check_borrowed_history() -> void:
	await _panel._select(3)
	var search: LineEdit = _panel.get_node("%Search")
	search.grab_focus()
	assert(_operations.begin(_bridge, "Undo"))
	var response: Dictionary = await _panel.refresh_after_history(_bridge, _operations)
	assert(response.ok and _operations.busy and _bridge.operation_busy())
	assert(_panel.get("_rows")[_panel.get("_selected")].identity == "icon:3")
	assert(root.gui_get_focus_owner() == search)
	assert(_bridge.calls.back().method == "project-asset.open")
	_operations.finish(response)


func _check_changed_query() -> void:
	var previous: Texture2D = _panel.get_node("%Preview").texture
	call("_start_reload")
	_panel.get_node("%Search").text = "Changed during read"
	await _operations.completed
	await process_frame
	assert(_pending.get("stale", false) and _panel.get_node("%Preview").texture == previous)
	assert(_panel.get("_rows")[_panel.get("_selected")].identity == "icon:3")
	_panel.get_node("%Search").text = ""
	assert((await _panel.reload(_bridge)).ok)


func _check_rejected_and_unknown() -> void:
	await _panel._select(3)
	_bridge.fail_method = "project-asset.list"
	assert(not (await _panel.reload(_bridge)).ok and not _operations.requires_reopen)
	assert(_panel.get_node("%Preview").texture != null and _panel.get_node("%UseStock").disabled)
	_bridge.fail_method = "icon.preview"
	_bridge.fail_identity = "icon:4"
	_bridge.unknown = true
	var count := _bridge.calls.size()
	assert(not (await _panel.reload(_bridge)).ok and _operations.requires_reopen)
	assert(_bridge.calls.size() == count + 6)
	_bridge.fail_method = ""
	_bridge.unknown = false
	assert((await _panel.reload(_bridge)).ok and _operations.requires_reopen)
	assert(not _operations.begin(_bridge, "Blocked mutation"))
	_bridge.stop()
	_operations.reset_session()
	_bridge.fail_method = ""
	_bridge.unknown = false


func _check_teardown() -> void:
	call("_start_reload")
	await _panel.reload(null)
	await _operations.completed
	await process_frame
	assert(_pending.get("connectionChanged", false))
	assert(_panel.get_node("%Gallery").item_count == 0 and _panel.get_node("%Preview").texture == null)
	assert(_panel.get_node("%Status").text == "No library is open.")


func _start_reload() -> void:
	_pending = await _panel.reload(_bridge)


func _check_stock_cache() -> void:
	var count := _bridge.calls.size()
	await _panel.show_scope(_bridge, "stock")
	assert(_bridge.calls.size() == count + 26 and _completed_previews == 25)
	count = _bridge.calls.size()
	assert((await _panel.reload(_bridge)).ok)
	assert(_bridge.calls.size() == count + 1 and _completed_previews == 25)
	await _panel.show_scope(_bridge, "scenario")
	count = _bridge.calls.size()
	await _panel.reload(_bridge)
	assert(_bridge.calls.size() == count + 26)
	_bridge.stop()
	_operations.reset_session()
	count = _bridge.calls.size()
	await _panel.show_scope(_bridge, "stock")
	assert(_bridge.calls.size() == count + 26 and _completed_previews == 25)
