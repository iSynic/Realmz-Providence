extends SceneTree

const Dialog = preload("res://src/action_settings_repair_dialog.gd")
const Fixture = preload("res://tools/action_settings_repair_fixture.gd")

class FaultBridge extends "res://src/native_bridge.gd":
	var fault := ""
	var attempts := 0
	var reconciliation_reads := 0
	func _request(method: String, params: Dictionary) -> Dictionary:
		if method == "action-settings.reconcile-repair": reconciliation_reads += 1
		if method == "action-settings.change-repair" and fault == "read-failure":
			fault = ""
			return {"ok": false, "outcomeUnknown": true, "error": "Controlled draft read interruption"}
		if method != "action-settings.commit-repair": return super._request(method, params)
		attempts += 1
		OS.delay_msec(150)
		var mode := fault
		fault = ""
		if mode == "lost-before": return {"ok": false, "outcomeUnknown": true, "error": "Controlled lost reply before mutation"}
		var response: Dictionary = super._request(method, params)
		if response.get("ok", false) and mode == "lost-after": return {"ok": false, "outcomeUnknown": true, "error": "Controlled lost reply after mutation"}
		if response.get("ok", false) and mode == "checkpoint-reply": return {"ok": false, "error": "command could not be durably acknowledged because the portable checkpoint failed; reopen the project before retrying: controlled interruption"}
		return response

var _failed := false
var _base := ""


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 1 or not args[0].get_file().begins_with("providence-ui-repair-"):
		_check(false, "A disposable recovery output root is required")
		quit(1)
		return
	_base = args[0]
	root.gui_embed_subwindows = true
	root.size = Vector2i(1600, 900)
	for fault in ["lost-before", "lost-after", "checkpoint-reply", "restart-before"]:
		await _uncertain(fault)
	await _stale_and_local()
	await _private_and_paging()
	await _capacity()
	if not _failed: print("PROVIDENCE_ACTION_SETTINGS_RECOVERY_OK uncertainty=4 stale=explicit repair=local inputs=retained heartbeat=live")
	quit(1 if _failed else 0)


func _open(name: String, shared := 1) -> Dictionary:
	var bridge := FaultBridge.new(_base.path_join(name + "-settings.cfg"))
	var fixture := Fixture.new()
	if not fixture.create(bridge, _base.path_join(name), shared):
		_check(false, fixture.error)
		bridge.stop()
		return {}
	var dialog := Dialog.new()
	dialog.hide()
	root.add_child(dialog)
	var response := await dialog.open_repair(bridge, fixture.revision, "extra-action-point:158", 4)
	if not response.get("ok", false):
		_check(false, "Could not prepare: " + str(response))
		dialog.free()
		bridge.stop()
		return {}
	return {"dialog": dialog, "fixture": fixture, "bridge": bridge}


func _complete(dialog) -> void:
	for entry in [["bound0", "9"], ["bound1", "18"], ["bound2", "13"], ["bound3", "24"]]: await dialog.change_field(entry[0], entry[1])
	_check(dialog.view.canApply, "Completed draft cannot apply")


func _finish_operation(dialog) -> int:
	var frames := 0
	for index in 600:
		if not dialog._busy: break
		await process_frame
		frames += 1
	_check(not dialog._busy, "Controlled Apply did not finish")
	return frames


func _uncertain(fault: String) -> void:
	var case := await _open(fault)
	if case.is_empty(): return
	var dialog = case.dialog
	var bridge = case.bridge
	var revision: int = case.fixture.revision
	await _complete(dialog)
	var draft: Dictionary = dialog.view.draft.duplicate(true)
	bridge.fault = "lost-before" if fault == "restart-before" else fault
	dialog.apply_repair()
	dialog.request_cancel()
	_check(dialog._busy and dialog.visible and not dialog._discard.visible, "A pending repair was cancelled")
	var frames: int = await _finish_operation(dialog)
	_check(frames > 1, "The delayed native request froze UI frames")
	_check(dialog.phase == "unknown" and dialog.view.draft == draft, "Uncertain Apply lost its complete draft")
	dialog.copy_draft()
	_check(dialog.ui.status.text.contains("Outcome unconfirmed") and not dialog.ui.status.text.contains("no changes applied"), "Copy Draft falsely reported non-application for an uncertain repair")
	dialog.apply_repair()
	_check(bridge.attempts == 1, "Uncertain Apply automatically retried")
	var mismatched_intent: Dictionary = dialog._intent.duplicate(true)
	mismatched_intent.source = "extra-action-point:unrelated"
	_check(bridge.reconcile_repair({"intent": mismatched_intent}).get("outcomeUnknown", false) and bridge.reconciliation_reads == 0, "Unrelated intent entered the uncertain stream")
	var epoch: int = bridge.connection_epoch()
	if fault == "restart-before":
		var path: String = bridge.current_project_path()
		bridge.stop()
		_check(bridge.start_project(path).get("ok", false), "Could not restart the controlled project")
	await dialog.check_status()
	_check(bridge.attempts == 1, "Check Repair Status sent a mutation")
	var current: Dictionary = bridge.request("session.describe")
	if fault == "lost-before":
		_check(bridge.connection_epoch() == epoch, "Same-session reconciliation unnecessarily reopened the project")
		_check(dialog.phase == "not-applied" and int(current.result.revision) == revision, "Same-session non-application was not distinguished")
		dialog.copy_draft()
		_check(dialog.ui.status.text.contains("nothing applied"), "Copy Draft lost confirmed non-application")
		await dialog.compare_current()
		await dialog.review_draft()
		_check(dialog.phase == "editing" and dialog.view.canApply and bridge.attempts == 1, "Review & Retry implicitly applied or lost the draft")
		dialog.apply_repair()
		await _finish_operation(dialog)
		_check(dialog.phase == "applied" and bridge.attempts == 2, "Explicit reviewed retry failed")
	elif fault == "restart-before":
		_check(dialog.phase == "unknown" and int(current.result.revision) == revision, "A restart was incorrectly treated as proof of non-application")
		dialog.apply_repair()
		_check(bridge.attempts == 1, "Still-unknown recovery permitted a mutation")
	else:
		_check(dialog.phase == "matches-repair" and int(current.result.revision) == revision + 1, "Complete repaired context was not recognized")
		dialog.copy_draft()
		_check(dialog.ui.status.text.contains("Repair confirmed") and not dialog.ui.status.text.contains("no changes applied"), "Copy Draft contradicted the confirmed repair outcome")
		dialog.finish_confirmed()
		_check(not dialog.visible and bridge.attempts == 1, "Confirmed return applied again")
	dialog.free()
	bridge.stop()
	await process_frame


func _stale_and_local() -> void:
	var case := await _open("stale-local", 3)
	if case.is_empty(): return
	var dialog = case.dialog
	var fixture = case.fixture
	var bridge = case.bridge
	await _complete(dialog)
	_check(not dialog.view.shareAllowed and not dialog.ui.scope.visible,
		"Issues repair exposed an unsupported shared-write choice")
	await process_frame
	await process_frame
	_check(dialog.ui.outcome.text.contains("Other actions still need repair"),
		"Local repair did not explain the remaining shared callers")
	_check(fixture.mutate("extra-action-point.create", {"nativeId": 900}), fixture.error)
	dialog.apply_repair()
	await _finish_operation(dialog)
	_check(dialog.phase == "stale" and bridge.attempts == 0, "Stale draft entered commit without an explicit review")
	await dialog.compare_current()
	_check(dialog.phase == "comparison" and dialog._comparison.canRebase, "Current comparison was unavailable")
	var retained: Dictionary = dialog.view.draft.duplicate(true)
	dialog.back_to_editing()
	_check(dialog.phase == "stale-draft" and dialog.ui.body.visible and dialog.ui.apply.disabled and dialog.view.draft == retained, "Back to Editing silently rebased or lost the stale draft")
	await dialog.change_field("chanceAdjustment", "3.25")
	_check(dialog.phase == "stale-draft" and dialog.view.draft.input.chanceAdjustment == "3.25", "Retained stale form did not keep an edit")
	dialog.apply_repair()
	_check(bridge.attempts == 0 and dialog.ui.compare.visible, "Retained stale form applied without review")
	await dialog.compare_current()
	await dialog.review_draft()
	_check(dialog.phase == "editing" and dialog.view.draft.scope == "only-this-action" and dialog.view.draft.input.bounds == ["9", "18", "13", "24"], "Rebase lost values or changed the local repair policy")
	dialog.apply_repair()
	await _finish_operation(dialog)
	fixture.revision += 1
	for id in [158, 159, 160]:
		var response: Dictionary = bridge.request("action-settings.prepare-repair", {"expectedRevision": fixture.revision, "source": "extra-action-point:%d" % id, "slot": 4})
		var expected := ["9", "18", "13", "24"] if id == 158 else ["", "", "", ""]
		_check(response.get("ok", false) and response.result.draft.input.bounds == expected,
			"Local repair changed the wrong source %d" % id)
	_check((await dialog.open_repair(bridge, fixture.revision, "extra-action-point:158", 4)).get("ok", false), "Could not reopen shared action")
	bridge.fault = "read-failure"
	dialog.ui.bound0.text = "12x"
	dialog.ui.bound0.text_changed.emit("12x")
	while dialog._checking_fields: await process_frame
	_check(dialog.phase == "stale" and dialog.ui.bound0.text == "12x", "An interrupted read erased raw typed input")
	await dialog.compare_current()
	dialog.back_to_editing()
	await dialog.change_field("bound0", "12y")
	_check(dialog.ui.bound0.text == "12y" and dialog._pending_edits.is_empty(), "Editing the retained draft restored an older interrupted keystroke")
	await dialog.compare_current()
	await dialog.review_draft()
	_check(dialog.phase == "editing" and dialog.ui.bound0.text == "12y" and not dialog.view.canApply, "Read recovery lost the invalid value or made it applicable")
	var response: Dictionary = bridge.request("extra-action-point.open", {"identity": "extra-action-point:158"})
	var record: Dictionary = response.result.extraActionPoint
	record.actions = []
	_check(fixture.mutate("extra-action-point.update", {"extraActionPoint": record}), fixture.error)
	await dialog.change_field("bound0", "12")
	_check(dialog.phase == "source-gone" and dialog.ui.recovery_body.text.contains("not be substituted"), "A deleted step did not keep a source-gone recovery")
	dialog.free()
	bridge.stop()
	await process_frame


func _private_and_paging() -> void:
	var case := await _open("private-paging", 10)
	if case.is_empty(): return
	var dialog = case.dialog
	var bridge = case.bridge
	var fixture = case.fixture
	await _complete(dialog)
	dialog.open_picker("uses")
	await _picker_ready(dialog)
	_check(dialog.picker._items.size() == 8 and dialog.picker._total == 10 and not dialog.picker._next.disabled, "Uses paging lost the complete shared denominator")
	dialog.picker._next.pressed.emit()
	await _picker_ready(dialog)
	_check(dialog.picker._items.size() == 2 and dialog.picker._offset == 8, "The second page is incomplete")
	dialog.picker.hide()
	dialog.apply_repair()
	await _finish_operation(dialog)
	fixture.revision += 1
	var selected: Dictionary = bridge.request("action-settings.prepare-repair", {"expectedRevision": fixture.revision, "source": "extra-action-point:158", "slot": 4})
	var peer: Dictionary = bridge.request("action-settings.prepare-repair", {"expectedRevision": fixture.revision, "source": "extra-action-point:159", "slot": 4})
	_check(selected.result.draft.originalAction.targetNativeId != 10 and selected.result.draft.input.bounds == ["9", "18", "13", "24"], "Private repair did not allocate a separate complete pair")
	_check(peer.result.draft.originalAction.targetNativeId == 10 and peer.result.draft.input.bounds == ["", "", "", ""], "Private repair changed a shared peer")
	dialog.free()
	bridge.stop()
	await process_frame


func _picker_ready(dialog) -> void:
	var deadline := Time.get_ticks_msec() + 5000
	while (dialog.picker._requested or dialog.picker._loading) and Time.get_ticks_msec() < deadline: await process_frame
	_check(not dialog.picker._requested and not dialog.picker._loading, "Repair choices did not finish loading")


func _capacity() -> void:
	var bridge := FaultBridge.new(_base.path_join("capacity-settings.cfg"))
	var fixture := Fixture.new()
	if not fixture.create_exhausted(bridge, _base.path_join("capacity")):
		_check(false, "Could not create exhausted native fixture: " + fixture.error)
		bridge.stop()
		return
	var dialog := Dialog.new()
	dialog.hide()
	root.add_child(dialog)
	var response := await dialog.open_repair(bridge, fixture.revision, "extra-action-point:158", 4)
	_check(response.get("ok", false), "Could not open exhausted repair")
	if response.get("ok", false):
		await process_frame
		_check(dialog.view.allocationUnavailable and dialog.ui.copy.visible and dialog.ui.cancel.text == "Back to Issues",
			"Exhausted repair omitted the Copy Draft or guarded return path: unavailable=%s copy=%s cancel=%s notice=%s" %
			[dialog.view.allocationUnavailable, dialog.ui.copy.visible, dialog.ui.cancel.text,
			dialog.view.noticeBody])
		await dialog.change_field("chanceAdjustment", "3.50")
		_check(not dialog.view.canApply and dialog.ui.apply.disabled,
			"An edited exhausted repair remained applicable")
		var retained: Dictionary = dialog.view.draft.duplicate(true)
		dialog.copy_draft()
		dialog.apply_repair()
		_check(dialog.view.draft == retained and bridge.attempts == 0, "Exhaustion discarded values or attempted an overwrite")
		dialog.request_cancel()
		await process_frame
		_check(dialog._discard.visible, "Exhausted return bypassed dirty-draft protection")
		dialog._discard.get_cancel_button().pressed.emit()
		await process_frame
		_check(dialog.visible and dialog.view.draft == retained, "Keep Editing lost the exhausted draft")
	dialog.free()
	bridge.stop()
	await process_frame


func _check(condition: bool, message: String) -> void:
	if not condition:
		_failed = true
		push_error("PROVIDENCE_ACTION_SETTINGS_RECOVERY_FAILED " + message)
