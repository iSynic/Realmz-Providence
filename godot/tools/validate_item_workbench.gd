extends SceneTree

class FaultBridge extends "res://src/native_bridge.gd":
	var fail_method := ""
	var lose_method := ""
	var calls: Array[String] = []
	func _request(method: String, params: Dictionary) -> Dictionary:
		calls.append(method)
		if method == fail_method:
			fail_method = ""
			return {"ok": false, "outcomeUnknown": true, "error": "Controlled failed read; no mutation submitted."}
		var response: Dictionary = super._request(method, params)
		if method == lose_method:
			lose_method = ""
			return {"ok": false, "outcomeUnknown": true, "error": "Controlled lost reply after durable Item Apply."}
		return response

var _bridge: FaultBridge
var _operations: ProvidenceEditorOperation
var _view: ProvidenceItemEditor
var _controller := preload("res://src/item_workbench_controller.gd").new()
var _revision := 0
var _failed := false
var _opened: Dictionary = {}


func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if not _check(args.size() == 1 and DirAccess.dir_exists_absolute(args[0]), "Expected disposable fixture root"): return
	root.size = Vector2i(1600, 900); root.gui_embed_subwindows = true
	_bridge = FaultBridge.new(args[0].path_join("settings.cfg"))
	_operations = ProvidenceEditorOperation.new(); root.add_child(_operations)
	if not _ok(_bridge.create_project("item-failure-boundaries", args[0].path_join("project"))): return
	_view = load("res://src/item_editor.tscn").instantiate(); root.add_child(_view); _view.size = Vector2(1600, 900)
	_controller.initialize(_view, _operations, func(): return {"revision": _revision}, func(response): return response.get("ok", false))
	_controller.projection_applied.connect(func(change): _revision = int(change.revision))
	_controller.attach_session(_bridge)
	await _controller._records.review_record("new")
	_controller._records._review.get_node("%UseDraft").pressed.emit()
	_name("Initial item")
	if not _ok(await _view.commit_selected()): return
	await _idle()
	await _read_failure_boundaries()
	if not _failed: await _lost_apply()
	if not _failed: await _picker_and_return()
	if not _failed: await _queued_open()
	_controller.dispose(); _bridge.stop(); _view.queue_free(); _operations.queue_free(); await process_frame
	if not _failed: print("PROVIDENCE_ITEM_WORKBENCH_OK real-adapter prepare-read-reconnect confirmed-apply-post-read-failure lost-ack-exact-receipt no-replay locked-filters stale-picker full-form-focus queued-open-origin")
	quit(1 if _failed else 0)


func _read_failure_boundaries() -> void:
	_name("Kept after read failure")
	_bridge.fail_method = "item.draft.prepare"
	var before := _bridge.calls.count("item.draft.apply")
	var result := await _view.commit_selected()
	_check(result.get("outcomeUnknown", false) and _controller._pending.is_empty(), "Failed preparation creates no mutation intent")
	_check(_view.get_node("%CheckOriginalResult").text == "Reconnect keeping draft", "Failed read offers explicit draft-preserving reconnect")
	await _controller.check_original_result()
	_check(not _operations.requires_reopen and _view.has_unapplied_changes() and _view.selected_definition().name == "Kept after read failure", "Read reconnect keeps the complete editable local draft")
	_check(before == _bridge.calls.count("item.draft.apply"), "Read recovery never submits a mutation")
	_bridge.fail_method = "item.list"
	if not _ok(await _view.commit_selected()): return
	await _idle()
	_check(not _view.draft.dirty() and _controller._pending.is_empty() and _operations.requires_reopen, "Confirmed Apply remains acknowledged when its separate catalog refresh fails")
	_check(_view.get_node("%CheckOriginalResult").text == "Reconnect keeping draft", "Post-Apply read failure is classified as a read")
	before = _bridge.calls.count("item.draft.apply")
	await _controller.check_original_result()
	_check(not _operations.requires_reopen and not _view.has_unapplied_changes() and before == _bridge.calls.count("item.draft.apply"), "Post-Apply recovery unlocks without replay or false dirty state")


func _lost_apply() -> void:
	_name("Durable lost acknowledgement")
	_bridge.lose_method = "item.draft.apply"
	var result := await _view.commit_selected()
	_check(result.get("outcomeUnknown", false) and not _controller._pending.is_empty(), "Lost submitted mutation retains its original intent")
	var query := _view.catalog_query()
	for path in ["%AllSources", "%ScenarioSource", "%StockSource"]:
		var button: Button = _view.get_node(path)
		_check(button.disabled, "Source controls lock during uncertain Apply"); button.pressed.emit()
	for label in ["AllItems", "Weapons", "Armor", "Accessories", "Magic", "Supplies"]:
		var button := _view.find_child(label, true, false) as Button
		_check(button.disabled, "Category controls lock during uncertain Apply"); button.pressed.emit()
	_view.get_node("%Next").pressed.emit(); _view.get_node("%Previous").pressed.emit()
	_check(query == _view.catalog_query(), "Locked browsing callbacks cannot change the originating state")
	var count := _bridge.calls.count("item.draft.apply")
	_check(not (await _view.commit_selected()).get("ok", false) and _bridge.calls.count("item.draft.apply") == count, "Repeated Apply cannot replay an uncertain mutation")
	await _controller.check_original_result()
	_check(_controller._pending.is_empty() and not _view.has_unapplied_changes() and not _operations.requires_reopen, "Exact committed receipt and fresh document clear recovery")
	_check(_view.selected_definition().name == "Durable lost acknowledgement" and _bridge.calls.count("item.draft.apply") == count, "Recovery reads durable authoring truth without replay")


func _picker_and_return() -> void:
	_controller._references.open_picker("itemType")
	await _idle()
	var picker = _controller._references._picker
	var context: Dictionary = picker.context.duplicate(true)
	_name("Changed picker origin")
	_controller._references.accept({"available": true, "value": -23}, context)
	_check(_view.selected_definition().itemType == 0, "An edited originating draft rejects stale picker acceptance")
	picker.cancel(); _view.discard_draft()
	_view.form.show_section("Special")
	var advanced := _view.form.find_child("SpecialAdvanced", true, false) as Control
	advanced.show()
	var controls: Array = _view.form.find_children("*", "SpinBox", true, false)
	var target: LineEdit
	for control in controls:
		if control.get_meta("field_name", "") == "special.3" and advanced.is_ancestor_of(control): target = control.get_line_edit()
	if not _check(target != null, "Advanced duplicate control exists"): return
	target.grab_focus(); target.caret_column = 1
	var state := _view.read_navigation_state()
	_view.form.show_section("Identity"); advanced.hide()
	if not _check(await _view.restore_navigation_state(state), "Linked return restores the item"): return
	_check(root.gui_get_focus_owner() == target and target.caret_column == 1 and advanced.visible, "Return restores the exact Advanced duplicate control, caret and visibility")


func _queued_open() -> void:
	_controller.load_catalog(_view.catalog_query())
	_check(_operations.busy, "Controlled catalog operation owns the transport")
	_open_queued.call_deferred()
	await process_frame
	_controller.attach_session(null)
	await _idle()
	_check(not _opened.get("ok", false) and _view.selected_definition().is_empty(), "Queued open cannot adopt a replacement session")


func _open_queued() -> void:
	_opened = await _controller.open_item("classic.item.51")


func _name(value: String) -> void:
	var control: LineEdit = _view.form.control_for("name")
	control.text = value; control.text_changed.emit(value)


func _idle() -> void:
	for frame in 240:
		await process_frame
		if not _operations.busy and frame > 5: return
	_check(false, "Item operation did not finish")


func _ok(result: Dictionary) -> bool:
	return _check(bool(result.get("ok", false)), str(result.get("error", "Command failed")))


func _check(value: bool, message: String) -> bool:
	if not value: _failed = true; push_error("PROVIDENCE_ITEM_WORKBENCH_FAILED: " + message)
	return value
