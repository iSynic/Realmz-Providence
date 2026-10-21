extends SceneTree

const Dialog = preload("res://src/action_settings_repair_dialog.gd")
const Bridge = preload("res://src/native_bridge.gd")
const Fixture = preload("res://tools/action_settings_message_fixture.gd")
var _failed := false
var _applied: Dictionary = {}
var _navigated := ""


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 1 or not args[0].get_file().begins_with("providence-ui-repair-"):
		_check(false, "A disposable repair workflow root is required"); quit(1); return
	root.size = Vector2i(1600, 900)
	root.gui_embed_subwindows = true
	var bridge := Bridge.new(args[0].path_join("message-settings.cfg"))
	var fixture := Fixture.new()
	if not fixture.create_messages(bridge, args[0].path_join("message-project"), 2):
		_check(false, fixture.error); bridge.stop(); quit(1); return
	var dialog := Dialog.new()
	dialog.hide()
	root.add_child(dialog)
	dialog.applied.connect(func(projection): _applied = projection)
	dialog.message_editor_requested.connect(func(identity): dialog.request_navigation(func(): _navigated = identity))
	var opened := await dialog.open_repair(bridge, fixture.revision, "extra-action-point:158", 4)
	if _check(opened.get("ok", false), "Could not open Random Message repair: " + str(opened)):
		await _read_and_choose(dialog, fixture)
		await _ranges_and_navigation(dialog, fixture)
		await _shared_apply(dialog, fixture)
		await _missing_and_isolated(dialog, fixture)
	dialog.free()
	bridge.stop()
	await process_frame
	if not _failed: print("PROVIDENCE_ACTION_SETTINGS_MESSAGE_OK exact-picker signed zero off-page read-draft navigation-guard shared-confirmation apply-once history save-reopen")
	quit(1 if _failed else 0)


func _read_and_choose(dialog, fixture) -> void:
	await _frames(3)
	_check(dialog.view.family == "random-message" and dialog.ui.message_form.visible, "The message form was not selected")
	var original: Dictionary = dialog.view.draft.duplicate(true)
	dialog.ui.message_form.get_node("Results/Result0/Content/Read").pressed.emit()
	await _settle(dialog)
	var peek: Window = dialog.message_workflow.peek
	_check(peek.visible, "Read did not open an exact peek")
	_check(peek.position == (root.size - peek.size) / 2 - Vector2i(0, 15), "Read lost its approved placement")
	_check(peek.get_node("Panel/Inset/Body/Text").text == "Authored message 1\n  café, preserved spacing  ", "Read changed or truncated the message")
	_check(dialog.view.draft == original, "Read changed the repair draft")
	peek.get_node("Panel/Inset/Body/Footer/Back").pressed.emit()
	dialog.ui.message_form.get_node("Endpoints/First/Controls/Choose").pressed.emit()
	var picker: Window = dialog.message_workflow.picker
	await _wait_picker(picker)
	var body: Control = picker.get_node("Panel/Inset/Body")
	_check(picker.visible and body.get_node("Footer/Choose").disabled, "The picker selected a replacement without a choice")
	body.get_node("Results").select(2)
	body.get_node("Results").item_selected.emit(2)
	body.get_node("Wait/Continue").pressed.emit()
	body.get_node("Footer/Choose").pressed.emit()
	await _settle(dialog)
	_check(dialog.ui.firstMessage.text == "-3" and not picker.visible, "Choosing did not retain the explicit no-wait choice")
	_check(int(fixture.bridge.request("session.describe").result.revision) == fixture.revision, "Reading or choosing changed project state")


func _ranges_and_navigation(dialog, fixture) -> void:
	await dialog.change_field("firstMessage", "-1")
	await dialog.change_field("lastMessage", "1")
	var form: Control = dialog.ui.message_form
	_check(dialog.view.range.total == 3, "Signed range lost results")
	_check(form.get_node("Results/Result1/Content/Read").disabled, "No Message offered Read")
	form.get_node("Results/Result0/Content/Read").pressed.emit()
	await _settle(dialog)
	_check(dialog.message_workflow.peek.visible, "Read remained locked after typing settled")
	dialog.message_workflow.peek.hide()
	await dialog.change_field("firstMessage", "1.5")
	_check(dialog.ui.firstMessage.text == "1.5" and dialog.ui.apply.disabled, "Invalid input was lost or enabled Apply")
	await dialog.change_field("firstMessage", "2")
	await dialog.change_field("lastMessage", "10")
	_check(dialog.view.range.firstUnresolved.nativeId == 10 and dialog.ui.apply.disabled, "An off-page unresolved target was accepted")
	_check(form.get_node("OpenMessages").text.contains("10"), "The exact unresolved target was not named")
	form.get_node("OpenMessages").pressed.emit()
	await _frames(2)
	_check(dialog._discard.visible and _navigated.is_empty(), "Messages navigation bypassed the draft guard")
	dialog._discard.get_cancel_button().pressed.emit()
	await _frames(2)
	_check(dialog.visible and dialog.ui.lastMessage.text == "10", "Keep Editing lost the complete draft")
	form.get_node("OpenMessages").pressed.emit()
	dialog._discard.get_ok_button().pressed.emit()
	await _frames(2)
	_check(not dialog.visible and _navigated == "message:10", "Discard did not navigate to the exact owning target")
	var opened: Dictionary = await dialog.open_repair(fixture.bridge, fixture.revision, "extra-action-point:158", 4)
	_check(opened.get("ok", false), "The repair could not reopen after navigation")


func _shared_apply(dialog, fixture) -> void:
	await dialog.change_field("firstMessage", "2")
	await dialog.change_field("lastMessage", "4")
	_check(dialog.ui.shared.visible and not dialog.ui.shared.disabled, "Compatible shared settings cannot be confirmed")
	_check(dialog.ui.summary_heading.text == "Repair scope" and dialog.ui.only.global_position.y < dialog.ui.outcome.global_position.y, "Shared scope no longer precedes its consequence")
	dialog.ui.shared.pressed.emit()
	await _settle(dialog)
	_check(dialog.view.draft.scope == "confirmed-actions" and dialog.view.draft.confirmedCallers.size() == 1, "The shared scope lacks exact confirmation")
	for viewport in [Vector2i(1600, 900), Vector2i(1920, 1080)]:
		root.size = viewport
		for mode in ["light", "dark", "high-contrast"]:
			for density in ["balanced", "compact"]:
				dialog.apply_theme(mode, density)
				await _frames(2)
				_check(dialog.size == Vector2i(1040, 700) and dialog.ui.apply.position.y >= 0, "The repair collapsed under a supported appearance")
	var before: int = fixture.revision
	dialog.apply_repair()
	dialog.apply_repair()
	await _settle(dialog)
	if not _check(dialog.phase == "applied" and int(_applied.get("revision", -1)) == before + 1, "Apply did not produce one completed repair"): return
	fixture.revision = before + 1
	_verify_history(fixture)


func _verify_history(fixture) -> void:
	var prepared: Dictionary = fixture.bridge.request("action-settings.prepare-repair", {"expectedRevision": fixture.revision, "source": "extra-action-point:159", "slot": 4})
	_check(prepared.get("ok", false) and prepared.result.draft.input.firstMessage == "2", "The confirmed other action did not receive the update")
	var retained: Array = prepared.result.draft.input.retained
	_check(retained.size() == 3 and retained[0] == 0 and retained[1] == 250 and retained[2] == 0, "Inactive settings words changed: " + str(retained))
	_check(fixture.mutate("history.undo", {}), fixture.error)
	prepared = fixture.bridge.request("action-settings.prepare-repair", {"expectedRevision": fixture.revision, "source": "extra-action-point:159", "slot": 4})
	_check(prepared.result.draft.input.firstMessage == "1", "Undo did not restore the shared row")
	_check(fixture.mutate("history.redo", {}), fixture.error)
	var path: String = fixture.bridge.current_project_path()
	_check(fixture.bridge.request("project.save").get("ok", false), "Explicit Save failed")
	_check(fixture.bridge.start_project(path).get("ok", false), "Saved project could not reopen")
	prepared = fixture.bridge.request("action-settings.prepare-repair", {"expectedRevision": fixture.revision, "source": "extra-action-point:159", "slot": 4})
	_check(prepared.get("ok", false) and prepared.result.draft.input.lastMessage == "4", "Reopen lost the shared repair")


func _missing_and_isolated(dialog, fixture) -> void:
	var record: Dictionary = fixture.bridge.request("extra-action-point.open", {"identity": "extra-action-point:158"}).result.extraActionPoint
	record.actions[0].targetNativeId = 20
	_check(fixture.mutate("extra-action-point.update", {"extraActionPoint": record}), fixture.error)
	var opened: Dictionary = await dialog.open_repair(fixture.bridge, fixture.revision, "extra-action-point:158", 4)
	if not _check(opened.get("ok", false), "Missing settings could not be inspected"): return
	_check(dialog.ui.firstMessage.text.is_empty() and dialog.ui.lastMessage.text.is_empty() and dialog.ui.apply.disabled, "Missing settings invented a default range")
	await dialog.change_field("firstMessage", "2")
	await dialog.change_field("lastMessage", "4")
	dialog.apply_repair()
	await _settle(dialog)
	if not _check(dialog.phase == "applied", "Missing settings were not created"): return
	fixture.revision = int(_applied.revision)
	record = fixture.bridge.request("extra-action-point.open", {"identity": "extra-action-point:158"}).result.extraActionPoint
	record.actions[0].targetNativeId = 10
	_check(fixture.mutate("extra-action-point.update", {"extraActionPoint": record}), fixture.error)
	opened = await dialog.open_repair(fixture.bridge, fixture.revision, "extra-action-point:158", 4)
	if not _check(opened.get("ok", false), "Shared settings could not reopen for isolation"): return
	await dialog.change_field("firstMessage", "3")
	_check(dialog.view.isolated and dialog.view.draft.scope == "only-this-action", "A narrow repair did not prepare independent settings")
	dialog.apply_repair()
	await _settle(dialog)
	if not _check(dialog.phase == "applied", "Independent settings were not applied"): return
	fixture.revision = int(_applied.revision)
	var selected: Dictionary = fixture.bridge.request("action-settings.prepare-repair", {"expectedRevision": fixture.revision, "source": "extra-action-point:158", "slot": 4})
	var other: Dictionary = fixture.bridge.request("action-settings.prepare-repair", {"expectedRevision": fixture.revision, "source": "extra-action-point:159", "slot": 4})
	_check(selected.result.draft.originalAction.targetNativeId != 10 and selected.result.draft.input.firstMessage == "3", "The selected action did not receive its own settings")
	_check(other.result.draft.originalAction.targetNativeId == 10 and other.result.draft.input.firstMessage == "2", "Independent repair changed another caller")


func _settle(dialog) -> void:
	for frame in 1200:
		if not dialog._busy and not dialog._checking_fields and not dialog.operations.busy: return
		await process_frame
	_check(false, "Repair operation did not finish within its frame bound")


func _wait_picker(picker: Window) -> void:
	for frame in 1200:
		if picker.get_node("Panel/Inset/Body/Results").item_count > 0: return
		await process_frame
	_check(false, "The bounded message picker did not finish")


func _frames(count: int) -> void:
	for index in count: await process_frame


func _check(condition: bool, message: String) -> bool:
	if not condition:
		_failed = true
		push_error("PROVIDENCE_ACTION_SETTINGS_MESSAGE_FAILED " + message)
	return condition
