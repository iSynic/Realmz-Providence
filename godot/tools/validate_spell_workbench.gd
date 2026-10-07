extends SceneTree

class FaultBridge extends "res://src/native_bridge.gd":
	var fail_method := ""
	var lose_method := ""
	var known_fail_method := ""
	var calls: Array[String] = []
	func _request(method: String, params: Dictionary) -> Dictionary:
		calls.append(method)
		if method == known_fail_method:
			known_fail_method = ""
			return {"ok": false, "error": "Controlled catalog read rejection; no mutation submitted."}
		if method == fail_method:
			fail_method = ""
			return {"ok": false, "outcomeUnknown": true, "error": "Controlled failed read; no mutation submitted."}
		var response: Dictionary = super._request(method, params)
		if method == lose_method:
			lose_method = ""
			return {"ok": false, "outcomeUnknown": true, "error": "Controlled lost reply after durable Spell Apply."}
		return response

var _bridge: FaultBridge
var _operations: ProvidenceEditorOperation
var _view: ProvidenceSpellEditor
var _controller := preload("res://src/spell_workbench_controller.gd").new()
var _revision := 0
var _failed := false
var _opened: Dictionary = {}


func _initialize() -> void: _run.call_deferred()


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if not _check(args.size() == 1 and DirAccess.dir_exists_absolute(args[0]), "Expected disposable fixture root"): return
	root.size = Vector2i(1600, 900); root.gui_embed_subwindows = true
	_bridge = FaultBridge.new(args[0].path_join("settings.cfg"))
	_operations = ProvidenceEditorOperation.new(); root.add_child(_operations)
	if not _ok(_bridge.create_project("spell-failure-boundaries", args[0].path_join("project"))): return
	_view = load("res://src/spell_editor.tscn").instantiate(); root.add_child(_view); _view.size = Vector2(1600, 900)
	_controller.initialize(_view, _operations, func(): return {"revision": _revision}, func(): return _bridge, func(response): return response.get("ok", false))
	_controller.projection_applied.connect(func(change): _revision = int(change.revision))
	_controller.attach_session(_bridge)
	await _controller._records.review_record("new")
	_controller._records._review.get_node("%UseDraft").pressed.emit()
	_name("Initial spell")
	if not _ok(await _view.commit_selected()): return
	await _idle()
	await _catalog_failure()
	await _read_failure_boundaries()
	if not _failed: await _lost_apply()
	if not _failed: await _picker_and_return()
	if not _failed: await _revision_conflict()
	if not _failed: await _queued_open()
	_controller.dispose(); _bridge.stop(); _view.queue_free(); _operations.queue_free(); await process_frame
	if not _failed: print("PROVIDENCE_SPELL_WORKBENCH_OK failed-read-reconnect post-apply-read-failure lost-ack-exact-receipt no-replay locked-browsing stale-picker exact-focus queued-open-origin")
	quit(1 if _failed else 0)


func _catalog_failure() -> void:
	_bridge.known_fail_method = "spell.catalog"
	var response := await _controller.reload()
	_check(not response.get("ok", false) and _view.selected_definition().is_empty(), "Initial catalog failure retains no stale record")
	_check(not _operations.requires_reopen and not _view._locked and _view.get_node("%DraftStatus").text.contains("Catalog unavailable"), "Known read rejection offers retry without a permanent loading lock")
	if not _ok(await _controller.reload()): return
	if not _ok(await _controller.open_spell("classic.spell.5101")): return
	await _idle()
	_bridge.known_fail_method = "spell.open-authoring"
	response = await _controller.reload()
	_check(not response.get("ok", false) and not _view._locked and _view.get_node("%SubmissionNotice").visible, "Initial record read rejection leaves a visible reason and unlocked retry path")
	if not _ok(await _controller.reload()): return
	if not _ok(await _controller.open_spell("classic.spell.5101")): return
	await _idle()


func _read_failure_boundaries() -> void:
	_name("Kept after read failure")
	_bridge.fail_method = "spell.draft.prepare"
	var before := _bridge.calls.count("spell.draft.apply")
	var result := await _view.commit_selected()
	_check(result.get("outcomeUnknown", false) and _controller._pending.is_empty(), "Failed preparation creates no mutation intent")
	_check(_view.get_node("%CheckOriginalResult").text == "Reconnect keeping draft", "Failed read offers explicit draft-preserving reconnect")
	await _controller.check_original_result()
	_check(not _operations.requires_reopen and _view.has_unapplied_changes() and _view.selected_definition().name == "Kept after read failure", "Read reconnect keeps the complete editable local draft")
	_check(before == _bridge.calls.count("spell.draft.apply"), "Read recovery never submits a mutation")
	_check(not _view.form.find_child("PlaylookEnd", true, false).disabled, "Recovery restores available preview controls without another selection")
	_bridge.fail_method = "spell.catalog"
	if not _ok(await _view.commit_selected()): return
	await _idle()
	_check(not _view.draft.dirty() and _controller._pending.is_empty() and _operations.requires_reopen, "Confirmed Apply remains acknowledged when its separate catalog refresh fails")
	_check(_view.get_node("%CheckOriginalResult").text == "Reconnect keeping draft", "Post-Apply read failure is classified as a read")
	before = _bridge.calls.count("spell.draft.apply")
	await _controller.check_original_result()
	_check(not _operations.requires_reopen and not _view.has_unapplied_changes() and before == _bridge.calls.count("spell.draft.apply"), "Post-Apply recovery unlocks without replay or false dirty state")


func _lost_apply() -> void:
	_name("Durable lost acknowledgement")
	_bridge.lose_method = "spell.draft.apply"
	var result := await _view.commit_selected()
	_check(result.get("outcomeUnknown", false) and not _controller._pending.is_empty(), "Lost submitted mutation retains its original intent")
	var query := _view.catalog_query()
	for path in ["%SpellClassFilter", "%SpellLevelFilter", "%PreviousSpellsPage", "%NextSpellsPage", "%PreviousSpell", "%NextSpell", "%NewCustomSpell", "%CopyToCustomSpell", "%ClearScenarioCustom"]:
		_check(_view.get_node(path).disabled, "All browsing and allocation controls lock during uncertain Apply")
	_view.get_node("%NextSpellsPage").pressed.emit(); _view.get_node("%PreviousSpell").pressed.emit()
	_check(query == _view.catalog_query(), "Locked callbacks preserve the originating state")
	var count := _bridge.calls.count("spell.draft.apply")
	_check(not (await _view.commit_selected()).get("ok", false) and _bridge.calls.count("spell.draft.apply") == count, "Repeated Apply cannot replay an uncertain mutation")
	await _controller.check_original_result()
	_check(_controller._pending.is_empty() and not _view.has_unapplied_changes() and not _operations.requires_reopen, "Exact committed receipt and fresh document clear recovery")
	_check(_view.selected_definition().name == "Durable lost acknowledgement" and _bridge.calls.count("spell.draft.apply") == count, "Recovery reads durable authoring truth without replay")


func _picker_and_return() -> void:
	await _idle()
	var target: LineEdit = _view.form.control_for("toHitBonus").get_line_edit()
	target.grab_focus(); target.caret_column = 1
	var state := _view.read_navigation_state()
	_controller._references.open_picker("lookEnd"); await _idle()
	var picker = _controller._references._picker
	var context: Dictionary = picker.context.duplicate(true)
	picker.cancel(); await process_frame
	_check(root.gui_get_focus_owner() == target, "Picker cancellation restores the exact originating control")
	_name("Changed picker origin")
	_controller._references.accept({"available": true, "value": 5}, context)
	_check(_view.selected_definition().lookEnd == 0, "An edited originating draft rejects stale picker acceptance")
	_view.discard_draft()
	_check(await _view.restore_navigation_state(state), "Linked return restores the spell")
	_check(root.gui_get_focus_owner() == target and target.caret_column == 1, "Return restores exact numeric field and caret")


func _revision_conflict() -> void:
	await _idle()
	_name("Local conflict draft")
	var document := _bridge.request("spell.open-authoring", {"identity": "classic.spell.5101"})
	var saved: Dictionary = document.result.definition.duplicate(true)
	saved.name = "Saved elsewhere"
	var params := {"expectedRevision": _revision, "draft": {"recordIndex": 0, "definition": saved, "allocation": null, "copySource": null}, "operationId": "c".repeat(64)}
	if not _ok(_bridge.request("spell.draft.apply", params)): return
	var count := _bridge.calls.count("spell.draft.apply")
	var result := await _view.commit_selected()
	_check(result.get("revisionConflict", false) and _view.selected_definition().name == "Local conflict draft" and _bridge.calls.count("spell.draft.apply") == count, "Conflict keeps the complete local draft without submitting a stale write")
	await _controller.review_saved_version()
	var review = _controller._saved_review
	_check(review.visible, "Saved-version comparison opens without replacing the draft")
	review.get_node("%KeepDraft").pressed.emit()
	_check(_view.selected_definition().name == "Local conflict draft", "Keep draft leaves it unchanged")
	await _controller.review_saved_version()
	review.get_node("%UseSaved").pressed.emit()
	_check(_view.selected_definition().name == "Saved elsewhere" and not _view.has_unapplied_changes() and _bridge.calls.count("spell.draft.apply") == count, "Explicit saved-version acceptance discards only local work and performs no mutation")


func _queued_open() -> void:
	_controller.load_catalog(_view.catalog_query())
	_check(_operations.busy, "Controlled catalog operation owns the transport")
	_open_queued.call_deferred()
	await process_frame
	_controller.attach_session(null)
	await _idle()
	_check(not _opened.get("ok", false) and _view.selected_definition().is_empty(), "Queued open cannot adopt a replacement session")


func _open_queued() -> void: _opened = await _controller.open_spell("classic.spell.1101")


func _name(value: String) -> void:
	var control: LineEdit = _view.form.control_for("name")
	control.text = value; control.text_changed.emit(value)


func _idle() -> void:
	for frame in 900:
		await process_frame
		if not _operations.busy and frame > 12: return
	_check(false, "Spell operation did not finish")


func _ok(result: Dictionary) -> bool: return _check(bool(result.get("ok", false)), str(result.get("error", "Command failed")))


func _check(value: bool, message: String) -> bool:
	if not value: _failed = true; push_error("PROVIDENCE_SPELL_WORKBENCH_FAILED: " + message)
	return value
