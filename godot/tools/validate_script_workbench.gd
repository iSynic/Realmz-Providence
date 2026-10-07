extends SceneTree

const Owner = preload("res://src/script_record_controller.gd")
const Drafts = preload("res://src/editor_draft_apply.gd")

class Bridge extends "res://src/native_bridge.gd":
	var record := "encounter"
	var revision := 0
	var document: Dictionary
	var fail_method := ""
	var unknown := false
	var calls: Array = []
	var listed_elsewhere := false
	var opened: Array = []
	func _request(method: String, params: Dictionary) -> Dictionary:
		OS.delay_msec(25)
		calls.append(method)
		if method == fail_method: return {"ok": false, "outcomeUnknown": unknown, "error": "Controlled rejection"}
		if method == "list":
			if listed_elsewhere: return {"ok": true, "result": {"items": [], "total": 200}}
			return {"ok": true, "result": {"items": [{"identity": document.get("identity", ""), "nativeId": 2, "recordIndex": 2, "label": "Test record", "problems": 0}], "total": 1}}
		if method == "open":
			opened.append(str(params.identity))
			var result := {record: document.duplicate(true), "revision": revision}
			if record == "encounter": result["steps"] = []
			return {"ok": true, "result": result}
		if method == "update":
			assert(params.expectedRevision == revision)
			var submitted := params.get(record, params.get("draft", {})) as Dictionary
			if submitted.has("header"):
				var header := submitted.header as Dictionary
				for key in header: document[key] = header[key]
			elif record == "encounter" and submitted.has("source"):
				for key in ["nativeId", "promptMessageNativeId", "canBackOut", "maxTimes", "casteSuccess", "texts", "choiceResults"]: document[key] = submitted.get(key)
				document["identity"] = str(submitted.source)
			else:
				document = submitted.duplicate(true)
			revision += 1
			return {"ok": true, "result": {"revision": revision, "changedEntities": [document.get("identity", "")]}}
		return {"ok": false, "error": "Unexpected request"}

var _bridge: Bridge
var _view: Control
var _controller: RefCounted
var _tabs: TabContainer
var _operations := ProvidenceEditorOperation.new()
var _drafts := Drafts.new()
var _pending: Dictionary = {}
var _frames := 0


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	root.add_child(_operations)
	process_frame.connect(func(): _frames += 1)
	_check_action_catalog_mismatch()
	for record in ["encounter", "extraActionPoint", "actionPoint"]:
		_setup(record)
		var before := _frames
		assert((await _controller.reload()).ok)
		assert(_bridge.calls == ["list", "open"] and _frames > before + 2)
		assert(not _view.has_unapplied_changes() and _view.selected_identity() == _bridge.document.identity)
		assert(_operations.begin(_bridge, "Undo"))
		var refreshed: Dictionary = await _controller.reload("", _operations)
		assert(refreshed.ok and _operations.busy, str(refreshed))
		_operations.finish(refreshed)
		await _check_drafts()
		await _check_off_page_apply()
		await _check_off_page_history()
		await _check_lifetimes()
		_controller.dispose()
		_bridge.stop()
		_tabs.free()
	_operations.free()
	print("PROVIDENCE_SCRIPT_WORKBENCH_OK three-families drafts late-typing single-flight borrowed-history rejection unknown teardown catalog-mismatch")
	quit()


func _check_action_catalog_mismatch() -> void:
	var workspace := preload("res://src/script_workspace_controller.gd").new()
	var reported := []
	workspace.failed.connect(func(message: String): reported.append(message))
	var failure: Dictionary = workspace._action_catalog_failure({"ok": false, "error": "unknown method action-definition.list"})
	assert(failure.adapterProtocolMismatch and "does not match this editor" in failure.error)
	assert(reported == [failure.error])


func _check_off_page_apply() -> void:
	_bridge.listed_elsewhere = true
	var prior := _bridge.opened.size()
	_set_draft(74)
	assert((await _drafts.commit()).ok)
	assert(_bridge.opened.size() == prior + 1)
	assert(_bridge.opened.back() == _bridge.document.identity, "Apply must reopen the authored record even outside the list page")
	assert(_view.read_state().identity == _bridge.document.identity)
	_bridge.listed_elsewhere = false


func _check_off_page_history() -> void:
	_bridge.listed_elsewhere = true
	var prior := _bridge.opened.size()
	var identity := str(_bridge.document.identity)
	assert((await _controller.reload(identity, null, "", true)).ok)
	assert(_bridge.opened.size() == prior + 1 and _bridge.opened.back() == identity)
	assert(_view.read_state().identity == identity, "History must reopen an off-page identity exactly")
	_bridge.fail_method = "open"
	var before: Dictionary = _view.read_state().duplicate(true)
	assert(not (await _controller.reload("missing-record", null, "", true)).ok)
	assert(_view.read_state() == before, "An unavailable history destination must not open a substitute")
	_bridge.fail_method = ""
	_bridge.listed_elsewhere = false


func _setup(record: String) -> void:
	_bridge = Bridge.new()
	_bridge.record = record
	_bridge.document = _fixture(record)
	var scene: String = {"encounter": "simple_encounter_editor", "extraActionPoint": "extra_action_point_editor", "actionPoint": "action_point_editor"}[record]
	_view = load("res://src/" + scene + ".tscn").instantiate()
	_tabs = TabContainer.new()
	_tabs.add_child(_view)
	root.add_child(_tabs)
	_drafts.initialize(_tabs, _accept, func(): return null)
	_controller = Owner.new()
	var methods := {"record": record, "list": "list", "open": "open", "update": "update", "limit": 128}
	if record == "encounter": methods["commitKey"] = "draft"
	_controller.initialize(_view, methods,
		_operations, func(): return {"revision": _bridge.revision}, _accept, _drafts.accept)
	_controller.attach_session(_bridge)
	if record == "actionPoint": _view.set_maps([{"identity": "land:0", "name": "Land"}])
	_operations.reset_session()


func _fixture(record: String) -> Dictionary:
	if record == "encounter":
		return {"identity": "simple-encounter:2", "nativeId": 2, "promptMessageNativeId": 0, "canBackOut": false,
			"maxTimes": 0, "casteSuccess": 0, "texts": ["Before", "", "", ""], "choiceResults": [0, 0, 0, 0], "actions": []}
	var document := {"identity": "extra-action-point:2", "nativeId": 2, "classicDoorId": 0,
		"chancePercent": 100, "postActionLevel": 0, "postActionX": 0, "postActionY": 0, "actions": []}
	if record == "actionPoint":
		document.merge({"identity": "action-point:land:0:2", "levelIndex": 0, "recordIndex": 2, "coordinate": null}, true)
	return document


func _set_draft(value: int) -> void:
	if _bridge.record == "encounter": _view.get_node("%Response1Text").text = str(value)
	else: _view.get("_chance").value = value


func _draft_value() -> String:
	return _view.get_node("%Response1Text").text if _bridge.record == "encounter" else str(int(_view.get("_chance").value))


func _check_drafts() -> void:
	_set_draft(75)
	assert(_view.has_unapplied_changes())
	assert((await _controller.reload()).get("draftKept", false))
	assert((await _drafts.commit()).ok and _bridge.revision == 1)
	assert(not _view.has_unapplied_changes())
	_bridge.fail_method = "update"
	_set_draft(65)
	assert(not (await _drafts.commit()).ok and _draft_value() == "65")
	_bridge.fail_method = ""
	call("_start_apply")
	assert(_operations.busy, str(_pending))
	_set_draft(55)
	await _operations.completed
	await process_frame
	assert(_pending.get("partlyApplied", false) and _draft_value() == "55")
	_view.discard_draft()
	assert(_draft_value() == "65")
	_bridge.fail_method = "list"
	_set_draft(45)
	assert((await _drafts.commit()).ok and not _view.has_unapplied_changes())
	_bridge.fail_method = ""


func _check_lifetimes() -> void:
	call("_start_reload")
	assert(_operations.busy)
	assert((await _controller.open_record(str(_bridge.document.get("identity", "")))).get("busy", false))
	_set_draft(35)
	await _operations.completed
	await process_frame
	assert(_pending.get("draftKept", false) and _draft_value() == "35")
	_bridge.fail_method = "update"
	_bridge.unknown = true
	assert(not (await _drafts.commit()).ok and _operations.requires_reopen)
	if _view.has_method("set_draft_controls_locked"):
		var names: Array = ["ApplyActionPoint", "DiscardActionPoint"] if _bridge.record == "actionPoint" else ["ApplyExtraActionPoint", "DiscardExtraActionPoint"]
		for name in names: assert(_view.get_node("%" + name).disabled, "An unknown outcome must lock draft controls")
	var count := _bridge.calls.size()
	assert(not (await _drafts.commit()).ok and _bridge.calls.size() == count)
	_bridge.stop()
	_operations.reset_session()
	_bridge.fail_method = ""
	_bridge.unknown = false
	_view.discard_draft()
	call("_start_reload")
	_controller.teardown()
	await _operations.completed
	await process_frame
	assert(_pending.get("connectionChanged", false) and _view.selected_identity().is_empty())


func _accept(response: Dictionary) -> bool:
	return response.get("ok", false)


func _start_reload() -> void:
	_pending = await _controller.reload()


func _start_apply() -> void:
	_pending = await _drafts.commit()
