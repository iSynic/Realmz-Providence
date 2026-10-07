extends SceneTree

class Bridge extends "res://src/native_bridge.gd":
	var calls: Array = []
	var fail_method := ""
	var unknown := false
	var mismatch := false
	func _request(method: String, params: Dictionary) -> Dictionary:
		OS.delay_msec(25)
		calls.append({"method": method, "params": params.duplicate(true)})
		if method == fail_method: return {"ok": false, "outcomeUnknown": unknown, "error": "Controlled reference failure"}
		match method:
			"reference-string.list": return {"ok": true, "result": {"items": [group(-201), group(-202)], "total": 2}}
			"reference-string.open":
				var resource_id := -202 if str(params.identity).ends_with("-202") else -201
				return {"ok": true, "result": {"group": group(resource_id), "entries": entries()}}
			"text-resource.resolve-exact":
				return {"ok": true, "result": {"ownership": "scenario", "resource": {"resourceType": "TEXT", "identity": "text:fixture", "resourceId": int(params.resourceId) + (1 if mismatch else 0)}}}
		return {"ok": false, "error": "Unexpected method: " + method}
	func group(resource_id: int) -> Dictionary:
		return {"identity": "reference-string:TEXT:%d" % resource_id, "resourceType": "TEXT", "resourceId": float(resource_id), "ownership": "project-text", "label": "Fixture"}
	func entries() -> Array:
		var rows: Array = []
		for index in range(128): rows.append({"index": index, "text": "Scenario text %d" % index})
		return rows

var _view: ProvidenceReferenceStrings
var _preview := ProvidenceRebuiltPreviewSelection.new()
var _operations := ProvidenceEditorOperation.new()
var _commands := preload("res://src/reference_strings_controller.gd").new()
var _bridge := Bridge.new()
var _pending: Dictionary = {}
var _frames := 0


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	root.add_child(_operations)
	_view = preload("res://src/reference_strings.tscn").instantiate()
	root.add_child(_view)
	_view.size = Vector2(1100, 400)
	_commands.initialize(_view, _preview, _operations, func(): return _bridge)
	process_frame.connect(func(): _frames += 1)
	var before := _frames
	assert((await _commands.reload()).ok and _frames > before + 2)
	assert(_bridge.calls.map(func(entry): return entry.method) == ["reference-string.list", "reference-string.open", "text-resource.resolve-exact"])
	assert(_target().get("id") == -201)
	assert((await _commands.open_group("reference-string:TEXT:-202")).ok)
	assert(_target().get("id") == -202)
	await _check_navigation_state()
	await _check_refresh()
	await _check_failures()
	await _check_late_results()
	_commands.dispose()
	_bridge.stop()
	_view.free()
	_operations.free()
	print("PROVIDENCE_REFERENCE_STRINGS_CONTROLLER_OK worker-read borrowed-history exact-signed-preview preserved-selection rejection-stale unknown-no-retry session-guard")
	quit()


func _target() -> Dictionary:
	return _preview.current_target("text.text-resources", "", Vector2i(-1, -1), {}, {}, "")


func _check_navigation_state() -> void:
	var search: LineEdit = _view.find_child("ReferenceSearch", true, false)
	search.text = "-202"
	var state := _view.read_navigation_state()
	assert(state.identity == "reference-string:TEXT:-202")
	assert((await _commands.open_group("reference-string:TEXT:-201")).ok)
	_view.prime_navigation_state(state)
	assert((await _commands.open_group(str(state.identity))).ok)
	assert(_view.restore_navigation_state(state))
	assert(_view.read_state().identity == "reference-string:TEXT:-202")
	search.text = ""


func _check_refresh() -> void:
	var changes := ProvidenceDocumentChanges.new()
	changes.register_document(_view.route_identity())
	var controller := ProvidenceWorkbenchController.new(_view.route_identity(), _view, _commands.reload, _commands.teardown)
	await process_frame
	var entries: Tree = _view.find_child("EntryTable", true, false)
	var selected := entries.get_root().get_child(120)
	selected.select(1)
	entries.scroll_to_item(selected)
	await process_frame
	var scroll := entries.get_scroll()
	assert(scroll.y > 0)
	entries.grab_focus()
	assert(_operations.begin(_bridge, "Undo"))
	var response := await controller.refresh(changes, _operations)
	assert(response.ok and _operations.busy and _target().get("id") == -202)
	assert(entries.get_selected() == selected and entries.get_scroll() == scroll and entries.has_focus())
	_operations.finish(response)
	_view.hide()
	_view.show()
	var count := _bridge.calls.size()
	assert((await controller.activate(changes)).ok and _bridge.calls.size() == count)
	_bridge.fail_method = "reference-string.list"
	changes.invalidate({"truncated": true}, "fixture")
	assert(not (await controller.refresh(changes)).ok and changes.needs_refresh(_view.route_identity()))
	assert(_view.read_state().identity == "reference-string:TEXT:-202" and _target().get("id") == -202)
	_bridge.fail_method = ""


func _check_failures() -> void:
	_bridge.mismatch = true
	assert((await _commands.reload()).ok and _target().is_empty())
	_bridge.mismatch = false
	_bridge.fail_method = "text-resource.resolve-exact"
	assert((await _commands.reload()).ok and _target().is_empty() and not _operations.requires_reopen)
	_bridge.unknown = true
	assert((await _commands.reload()).get("outcomeUnknown", false) and _operations.requires_reopen)
	var count := _bridge.calls.size()
	assert(not (await _commands.reload()).ok and _bridge.calls.size() == count)
	_operations.reset_session()
	_bridge.stop()
	_bridge = Bridge.new()
	assert((await _commands.reload()).ok)


func _check_late_results() -> void:
	call("_start_refresh")
	assert(_operations.busy and (await _commands.open_group("reference-string:TEXT:-201")).get("busy", false))
	var search: LineEdit = _view.find_child("ReferenceSearch", true, false)
	search.text = "Later search"
	await _operations.completed
	await process_frame
	assert(_pending.get("stale", false) and search.text == "Later search")
	search.text = ""
	call("_start_refresh")
	_commands.teardown()
	await _operations.completed
	await process_frame
	assert(_pending.get("stale", false) and _view.read_state().identity.is_empty() and _target().is_empty())
	call("_start_preview")
	_preview.clear_scrolling_text()
	await _operations.completed
	await process_frame
	assert(_pending.get("stale", false) and _target().is_empty())


func _start_refresh() -> void:
	_pending = await _commands.reload()


func _start_preview() -> void:
	_pending = await _preview.select_scrolling_text(_bridge, _operations, -201)
