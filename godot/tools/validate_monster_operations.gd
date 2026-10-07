extends SceneTree

class Bridge extends "res://src/native_bridge.gd":
	var revision := 7
	var calls: Array = []
	var fail_method := ""
	var unknown := false
	func is_project_backed() -> bool: return true
	func _request(method: String, params: Dictionary) -> Dictionary:
		OS.delay_msec(25)
		calls.append({"method": method, "params": params.duplicate(true)})
		if method == fail_method: return {"ok": false, "outcomeUnknown": unknown, "error": "Controlled monster read failure"}
		if method == "monster.catalog":
			assert(params.limit == 128)
			return {"ok": true, "result": {"revision": revision, "catalog": {"offset": params.offset, "total": 300, "items": [
				{"nativeId": 1, "displayName": "Fixture monster", "availableSets": [0, 1], "iconId": 392}]}}}
		if method == "monster.open":
			return {"ok": true, "result": {"revision": revision, "setId": params.setId, "monster": {
				"nativeId": params.nativeId, "identity": "monster:%d:%d" % [params.setId, params.nativeId], "iconId": 392, "notOnMenu": false}}}
		if method == "monster-library.list":
			assert(params.limit <= 128)
			var items: Array = []
			for index in range(int(params.offset), mini(3, int(params.offset) + int(params.limit))):
				items.append({"identity": "library:stock:%d" % index, "label": "Library fixture", "ownership": "built-in", "preferredScenarioMonsterId": index + 1,
					"hitDice": 1, "armor": 1, "agility": 1, "iconId": 392})
			return {"ok": true, "result": {"revision": 2, "offset": params.offset, "total": 3, "items": items}}
		if method == "monster-library.describe": return {"ok": true, "result": {"revision": 2, "canUndo": false, "canRedo": false}}
		if method == "monster-library.open":
			return {"ok": true, "result": {"revision": 2, "projectRevision": revision, "protected": true, "entry": {
				"identity": params.identity, "ownership": "built-in", "label": "Library fixture", "template": {"iconId": 392}}}}
		if method == "monster-rewards.preview": return {"ok": true, "result": {}}
		if method == "monster-library.population-plan":
			var rows: Array = []
			for index in params.entryIds.size():
				rows.append({"identity": params.entryIds[index], "targetId": index + 1, "reason": "next-open-slot"})
			return {"ok": true, "result": {"format": "providence.monster-population-plan.v1", "projectRevision": params.expectedRevision,
				"libraryRevision": params.expectedLibraryRevision, "offset": params.offset, "total": rows.size(), "rows": rows}}
		if method == "monster-appearance.open":
			return {"ok": true, "result": {"format": "providence.monster-appearance.v1", "iconId": params.iconId, "state": "missing"}}
		return {"ok": false, "error": "Unexpected monster command"}

var _bridge := Bridge.new()
var _operations := ProvidenceEditorOperation.new()
var _route: Control
var _workbench: Control
var _pending: Dictionary = {}
var _frames := 0


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	root.add_child(_operations)
	_route = load("res://src/monster_editor.tscn").instantiate()
	root.add_child(_route)
	_route.configure_operations(_operations, func(): return _bridge)
	_workbench = _route.get_node("Workbench")
	# Background thumbnails have their own gate below; keep request counts here
	# specific to the selected document workflow rather than viewport timing.
	_route.hide()
	process_frame.connect(func(): _frames += 1)
	assert((await _route.reload(_bridge)).ok and _frames > 3)
	assert(_bridge.calls.size() == 6)
	await _check_selection()
	await _check_range()
	await _check_history_refresh()
	await _check_late_search()
	await _check_failures()
	_bridge.stop()
	_route.free()
	_operations.free()
	print("PROVIDENCE_MONSTER_OPERATIONS_OK worker-catalog detail-before-release borrowed-history search-page-selection known-rejection unknown-no-retry teardown")
	quit()


func _check_selection() -> void:
	_bridge.calls.clear()
	call("_open_scenario")
	assert(_operations.busy)
	assert((await _workbench.browser.open_record(2)).get("busy", false))
	await _operations.completed
	await process_frame
	assert(_pending.ok and _workbench.form.visible and _workbench.browser.native_id == 1)
	assert(_bridge.calls.map(func(entry): return entry.method) == ["monster.open", "monster-rewards.preview", "monster-appearance.open"])
	_bridge.calls.clear()
	assert((await _workbench.browser.switch_set(1)).ok)
	assert(_bridge.calls.map(func(entry): return entry.method) == ["monster.catalog", "monster.open", "monster.open", "monster-rewards.preview", "monster-appearance.open"])
	assert(_bridge.calls[2].params.setId == 0)
	assert((await _workbench.library.open_entry("library:stock:0")).ok and _workbench.form.visible)
	assert(not _workbench.preview.visible and _workbench.browser.native_id == 1)


func _check_history_refresh() -> void:
	assert((await _workbench.browser.search("Guard")).ok)
	assert((await _workbench.browser.load_page(128)).ok)
	assert((await _workbench.browser.open_record(1)).ok)
	assert((await _workbench.library.open_entry("library:stock:0")).ok)
	var changes := ProvidenceDocumentChanges.new()
	changes.register_document("combat.monsters", ["monster"])
	var controller := ProvidenceWorkbenchController.new("combat.monsters", _route, _route.refresh_workbench)
	_bridge.revision = 8
	assert(_operations.begin(_bridge, "Undo"))
	var refreshed := await controller.refresh(changes, _operations)
	assert(refreshed.ok and _operations.busy and not changes.needs_refresh("combat.monsters"))
	assert(_workbench.browser.revision == 8 and _workbench.browser.query == "Guard" and _workbench.browser.offset == 128)
	assert(_workbench.form.visible and _workbench.library.current_entry().projectRevision == 8)
	_operations.finish(refreshed)
	changes.invalidate({"changedEntities": ["monster:0:1"]}, "fixture")
	_bridge.fail_method = "monster.catalog"
	assert(not (await controller.refresh(changes)).ok and changes.needs_refresh("combat.monsters"))
	_bridge.fail_method = ""
	assert((await _route.reload(_bridge)).ok)


func _check_range() -> void:
	assert((await _workbench.library.select_entry("library:stock:0")).ok)
	_bridge.calls.clear()
	var response: Dictionary = await _workbench.library.select_entry("library:stock:2", false, true)
	assert(response.ok and _workbench.multiple.visible and not _workbench.plan_loading)
	assert(_workbench.library.selected_identities() == ["library:stock:0", "library:stock:1", "library:stock:2"])
	assert(_bridge.calls.map(func(entry): return entry.method) == ["monster-library.list", "monster-library.open", "monster-library.population-plan"])
	assert(_bridge.calls[0].params.limit == 3 and _bridge.calls[2].params.limit == 128)
	assert(_workbench.multiple.get_node("Header/CopySelected").disabled)
	assert(_operations.begin(_bridge, "Refresh selected Library entries"))
	response = await _route.refresh_workbench(_operations)
	assert(response.ok and _operations.busy and _workbench.multiple.visible)
	assert(_workbench.library.selected_identities() == ["library:stock:0", "library:stock:1", "library:stock:2"])
	_operations.finish(response)
	await _workbench.library.clear_multiple_selection()
	assert(not _workbench.multiple.visible and _workbench.form.visible)


func _check_late_search() -> void:
	call("_search_scenario")
	assert(_operations.busy)
	var search: LineEdit = _workbench.scenario.get_node("ScenarioSearch")
	search.text = "Later typing"
	search.text_changed.emit(search.text)
	await _operations.completed
	await process_frame
	assert(_pending.get("stale", false) and search.text == "Later typing" and _workbench.browser.catalog.is_empty())
	_workbench.scenario.get_node("SearchDelay").stop()
	assert((await _workbench.browser.search("Later typing")).ok)


func _check_failures() -> void:
	_bridge.fail_method = "monster.open"
	assert(not (await _workbench.browser.open_record(1)).ok and not _operations.requires_reopen)
	_bridge.fail_method = "monster-appearance.open"
	_bridge.unknown = true
	assert((await _workbench.browser.open_record(1)).get("outcomeUnknown", false) and _operations.requires_reopen)
	var count := _bridge.calls.size()
	assert(not (await _workbench.browser.open_record(1)).ok and _bridge.calls.size() == count)
	_bridge.stop()
	_operations.reset_session()
	_bridge.fail_method = ""
	_bridge.unknown = false
	call("_reload_route")
	_route.clear_selection()
	await _operations.completed
	await process_frame
	assert(_pending.get("connectionChanged", false) and _workbench.browser.catalog.is_empty() and not _workbench.form.visible)


func _open_scenario() -> void:
	_pending = await _workbench.browser.open_record(1)


func _search_scenario() -> void:
	_pending = await _workbench.browser.search("Initial query")


func _reload_route() -> void:
	_pending = await _route.reload(_bridge)
