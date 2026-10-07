extends SceneTree

const Controller = preload("res://src/scenario_media_controller.gd")
const Drafts = preload("res://src/editor_draft_apply.gd")

class Bridge extends "res://src/native_bridge.gd":
	var prefix := "picture"
	var revision := 5
	var label := "Original resource"
	var resource_id := 30000
	var fail_action := ""
	var unknown := false
	var calls: Array = []
	var preview := ""
	func _request(method: String, params: Dictionary) -> Dictionary:
		OS.delay_msec(20)
		calls.append({"method": method, "params": params.duplicate(true)})
		assert(method.begins_with(prefix + "."))
		var action := method.get_slice(".", 1)
		if action == fail_action: return {"ok": false, "outcomeUnknown": unknown, "error": "Controlled rejection"}
		match action:
			"list":
				var rows: Array = []
				for index in 50: rows.append(_row(index))
				return {"ok": true, "result": {"items": rows, "total": 50}}
			"open":
				var index := int(str(params.identity).get_slice(":", 1))
				var key := "tile" if prefix == "special-land" else prefix
				return {"ok": true, "result": {key: _row(index), "revision": revision}}
			"preview":
				if prefix == "sound":
					return {"ok": true, "result": {"pcm8Base64": "gICA", "sampleRate": 11025}}
				return {"ok": true, "result": {"base64": preview, "mimeType": "image/png"}}
			"update":
				assert(params.expectedRevision == revision and params.identity == prefix + ":0")
				label = params.label
				resource_id = params.resourceId
				revision += 1
				return {"ok": true, "result": {"identity": params.identity, "revision": revision}}
		return {"ok": false, "error": "Unexpected test request"}
	func _row(index: int) -> Dictionary:
		return {"identity": prefix + ":" + str(index), "label": label if index == 0 else "Resource " + str(index),
			"resourceId": resource_id + index, "hasPreview": true, "width": 8, "height": 8}
	func change_epoch() -> void:
		_connection_epoch += 1

var _bridge: Bridge
var _controller: RefCounted
var _view: Control
var _tabs: TabContainer
var _operations := ProvidenceEditorOperation.new()
var _drafts := Drafts.new()
var _pending: Dictionary = {}
var _frames := 0
var _statuses: Array[String] = []


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	root.add_child(_operations)
	process_frame.connect(func(): _frames += 1)
	for prefix in ["picture", "sound", "icon", "special-land"]:
		_setup(prefix)
		await _check_family(prefix)
		if prefix == "picture":
			await _check_borrowed_refresh()
			await _check_drafts()
			await _check_late_changes()
			await _check_affected_refresh()
			await _check_failure_boundaries()
		_controller.refresh_affected = func(_operation): return {"ok": true}
		_controller.dispose()
		assert(not _controller.refresh_affected.is_valid())
		_bridge.stop()
		_tabs.free()
	_operations.free()
	print("PROVIDENCE_MEDIA_WORKBENCH_OK four-families bounded-previews completion borrowed-history drafts late-typing unsupported-preview unknown epoch teardown")
	quit()


func _setup(prefix: String) -> void:
	_bridge = Bridge.new()
	_bridge.prefix = prefix
	_bridge.resource_id = 200 if prefix == "sound" else (-100 if prefix == "special-land" else 30000)
	var bitmap := Image.create(8, 8, false, Image.FORMAT_RGBA8)
	bitmap.fill(Color.CORNFLOWER_BLUE)
	_bridge.preview = Marshalls.raw_to_base64(bitmap.save_png_to_buffer())
	var scenes := {"picture": "scenario_picture_editor", "sound": "scenario_sound_editor", "icon": "scenario_icon_editor", "special-land": "special_land_editor"}
	_view = load("res://src/" + scenes[prefix] + ".tscn").instantiate()
	_tabs = TabContainer.new()
	_tabs.add_child(_view)
	root.add_child(_tabs)
	_drafts.initialize(_tabs, _accept, func(): return null)
	_controller = Controller.new()
	_controller.initialize(prefix, _view, _operations, func(): return {"revision": _bridge.revision}, _accept, _drafts.accept)
	_controller.status_changed.connect(func(message): _statuses.append(message))
	_controller.attach_session(_bridge)
	_operations.reset_session()


func _check_family(prefix: String) -> void:
	var before := _frames
	assert((await _controller.reload()).ok)
	assert(_statuses.back() == "Scenario resources loaded")
	var expected := 3 if prefix == "sound" else (26 if prefix == "picture" else 50)
	assert(_bridge.calls.size() == expected and _frames > before + 2, str({"calls": _bridge.calls, "frames": _frames - before, "selected": _view.selected_identity()}))
	assert(_bridge.calls[0].params == {"offset": 0, "limit": 128})
	assert(_view.selected_identity() == prefix + ":0" and not _operations.busy)
	if prefix != "sound":
		var gallery: ItemList = _view.get("_gallery")
		assert(gallery.item_count == 50)
		assert(gallery.get_item_icon(0).get_width() == 8)
	_name_field().text = "Updated resource"
	assert((await _drafts.commit()).ok and _bridge.label == "Updated resource")
	assert(not _view.has_unapplied_changes())
	_bridge.fail_action = "preview"
	assert((await _controller.open_media(prefix + ":0")).ok)
	assert(_view.selected_identity() == prefix + ":0")
	_bridge.fail_action = ""


func _check_borrowed_refresh() -> void:
	assert(_operations.begin(_bridge, "Undo"))
	var response: Dictionary = await _controller.refresh_workbench(_operations)
	assert(response.ok and _operations.busy and _bridge.operation_busy())
	_operations.finish(response)
	assert(not _operations.busy)


func _check_drafts() -> void:
	_name_field().text = "Keep this draft"
	var search: LineEdit = _view.find_child("PictureSearch", true, false)
	search.text = "No matching resource"
	search.text_changed.emit(search.text)
	assert(_view.selected_identity() == "picture:0" and _name_field().text == "Keep this draft")
	search.text = ""
	var count := _bridge.calls.size()
	assert((await _controller.reload()).get("draftKept", false))
	assert((await _controller.open_media("picture:1")).get("draftKept", false))
	assert((await _controller.remove_media("picture:0")).get("draftKept", false))
	assert((await _controller.import_media({})).get("draftKept", false))
	assert(_bridge.calls.size() == count and _view.selected_identity() == "picture:0")
	_bridge.fail_action = "update"
	assert(not (await _drafts.commit()).ok)
	assert(_name_field().text == "Keep this draft")
	_bridge.fail_action = ""
	_view.discard_draft()
	assert(_name_field().text == "Updated resource")


func _check_late_changes() -> void:
	call("_start_reload")
	assert(_operations.busy)
	assert((await _controller.open_media("picture:1")).get("busy", false))
	_name_field().text = "Typed during loading"
	await _operations.completed
	await process_frame
	assert(_pending.get("draftKept", false) and _name_field().text == "Typed during loading")
	_view.discard_draft()
	call("_start_reload")
	var search: LineEdit = _view.find_child("PictureSearch", true, false)
	search.text = "Changed query"
	await _operations.completed
	await process_frame
	assert(_pending.get("draftKept", false) and search.text == "Changed query")
	search.text = ""
	_name_field().text = "Submitted metadata"
	call("_start_apply")
	_name_field().text = "New typing after submission"
	await _operations.completed
	await process_frame
	assert(_pending.get("partlyApplied", false) and _bridge.label == "Submitted metadata")
	assert(_name_field().text == "New typing after submission")
	_view.discard_draft()
	assert(_name_field().text == "Submitted metadata")


func _check_affected_refresh() -> void:
	var revisions: Array = []
	_controller.refresh_affected = func(operation):
		assert(operation == _operations and operation.busy and _bridge.operation_busy())
		await process_frame
		revisions.append(_bridge.revision)
		return {"ok": true}
	_name_field().text = "Refresh visible origin"
	var revision := _bridge.revision
	assert((await _drafts.commit()).ok and revisions == [revision + 1])
	assert(not _operations.busy)
	_controller.refresh_affected = func(operation):
		assert(operation == _operations and operation.busy)
		return {"ok": false, "error": "Controlled origin refresh failure"}
	_name_field().text = "Applied before origin failure"
	var count := _bridge.calls.filter(func(call): return call.method == "picture.update").size()
	var response: Dictionary = await _controller.update_metadata(_view.draft_metadata())
	assert(response.ok and response.viewRefreshError == "Controlled origin refresh failure")
	assert(_bridge.calls.filter(func(call): return call.method == "picture.update").size() == count + 1)
	assert(not _operations.busy and not _view.has_unapplied_changes())
	_controller.refresh_affected = Callable()


func _check_failure_boundaries() -> void:
	_bridge.fail_action = "list"
	_name_field().text = "Saved without refresh"
	assert((await _drafts.commit()).ok and _bridge.label == "Saved without refresh")
	assert(not _view.has_unapplied_changes())
	_bridge.fail_action = "update"
	_bridge.unknown = true
	_name_field().text = "Unconfirmed metadata"
	assert(not (await _drafts.commit()).ok and _operations.requires_reopen)
	var count := _bridge.calls.size()
	assert(not (await _drafts.commit()).ok and _bridge.calls.size() == count)
	_bridge.stop()
	_operations.reset_session()
	_bridge.fail_action = ""
	_bridge.unknown = false
	_view.discard_draft()
	call("_start_reload")
	_bridge.change_epoch()
	await _operations.completed
	await process_frame
	assert(_pending.get("connectionChanged", false) and _operations.requires_reopen)
	assert(_name_field().text == "Saved without refresh")
	_bridge.stop()
	_operations.reset_session()
	call("_start_reload")
	_controller.teardown()
	await _operations.completed
	await process_frame
	assert(_pending.get("connectionChanged", false) and _view.selected_identity().is_empty())


func _name_field() -> LineEdit:
	return _view.get("_name_field") if _bridge.prefix == "sound" else _view.get("_name")


func _accept(response: Dictionary) -> bool:
	return response.get("ok", false)


func _start_reload() -> void:
	_pending = await _controller.refresh_workbench()


func _start_apply() -> void:
	_pending = await _drafts.commit()
