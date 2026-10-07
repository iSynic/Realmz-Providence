extends SceneTree

const Dialog = preload("res://src/action_settings_repair_dialog.gd")
const Bridge = preload("res://src/native_bridge.gd")
const Fixture = preload("res://tools/action_settings_repair_fixture.gd")
var _failed := false
var _applied: Dictionary = {}


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 1 or not args[0].get_file().begins_with("providence-ui-repair-"):
		_check(false, "A disposable repair workflow root is required")
		quit(1)
		return
	root.size = Vector2i(1600, 900)
	root.gui_embed_subwindows = true
	var bridge := Bridge.new(args[0].path_join("settings.cfg"))
	print("REPAIR_NATIVE_ADAPTER ", bridge._adapter_path())
	var fixture := Fixture.new()
	if not fixture.create(bridge, args[0].path_join("project")):
		_check(false, fixture.error)
		bridge.stop()
		quit(1)
		return
	var dialog := Dialog.new()
	dialog.hide()
	root.add_child(dialog)
	dialog.applied.connect(func(projection): _applied = projection)
	var response := await dialog.open_repair(bridge, fixture.revision, "extra-action-point:158", 4)
	_check(response.get("ok", false), "Could not open the repair: " + str(response))
	if response.get("ok", false): await _exercise(dialog, fixture)
	dialog.free()
	bridge.stop()
	await process_frame
	if not _failed: print("PROVIDENCE_ACTION_SETTINGS_REPAIR_OK native=true required=true apply=once save=reopened undo=complete")
	quit(1 if _failed else 0)


func _exercise(dialog, fixture) -> void:
	await _frames(3)
	_check_geometry(dialog)
	await _edit_and_apply(dialog, fixture)


func _check_geometry(dialog) -> void:
	var metrics := {}
	for key in ["heading", "source", "notice", "body", "mapKind", "map", "area", "chanceAdjustment", "shapeMode", "bound0", "bound1", "bound2", "bound3", "summary_heading", "apply", "cancel"]:
		var rect: Rect2 = dialog.ui[key].get_global_rect()
		metrics[key] = [rect.position.x, rect.position.y, rect.size.x, rect.size.y]
	print("PROVIDENCE_REPAIR_GEOMETRY ", JSON.stringify(metrics))
	var approved := {"notice": [20,81,1000,61], "body": [20,156,1000,466], "mapKind": [20,209,132,34], "map": [164,209,394,34], "area": [570,209,150,34], "chanceAdjustment": [20,283,250,34], "shapeMode": [20,357,250,34], "bound0": [20,431,166,34], "bound1": [198,431,166,34], "bound2": [376,431,166,34], "bound3": [554,431,166,34], "cancel": [801,647,72,32], "apply": [883,647,137,32]}
	for key in approved:
		for index in 4: _check(absf(float(metrics[key][index]) - approved[key][index]) <= 2, "Approved Pencil geometry changed: " + key)
	_check(dialog.visible and dialog.size == Vector2i(1040, 700), "Approved repair window geometry changed: %s visible=%s" % [dialog.size, dialog.visible])


func _edit_and_apply(dialog, fixture) -> void:
	_check(not dialog.view.canApply and dialog.ui.apply.disabled, "Missing bounds were silently filled")
	_check(dialog.ui.bound0.has_focus(), "First missing field did not get initial focus")
	var initial: Dictionary = dialog.view.draft.duplicate(true)
	dialog.open_picker("area")
	await _frames(2)
	_check(dialog.picker.visible and dialog.picker._choose.disabled, "Target picker silently selected a replacement")
	dialog.picker.hide()
	_check(dialog.view.draft == initial, "Cancelling a target picker changed the draft")
	for entry in [["bound0", "9a"], ["bound1", "18"], ["bound2", "13"], ["bound3", "24"]]:
		dialog.ui[entry[0]].text = entry[1]
		dialog.ui[entry[0]].text_changed.emit(entry[1])
		while dialog._checking_fields: await process_frame
		if dialog.phase != "editing":
			_check(false, "Field change failed: " + dialog.ui.recovery_body.text)
			return
	_check(dialog.ui.bound0.text == "9a" and not dialog.view.canApply, "Invalid typed text was lost or accepted")
	_check(dialog.ui.errors.text.contains("Left edge"), "Invalid field lacks a named remedy")
	dialog.request_cancel()
	await _frames(2)
	_check(dialog._discard.visible and dialog._discard.get_cancel_button().has_focus(), "Discard guard did not protect the draft")
	dialog._discard.get_cancel_button().pressed.emit()
	await _frames(2)
	_check(not dialog._discard.visible, "Keep Editing did not dismiss the discard guard")
	_check(dialog.visible and dialog.ui.bound0.text == "9a", "Keep Editing lost the draft")
	await dialog.change_field("bound0", "9")
	_check(dialog.view.canApply, "Complete values did not enable Apply: " + str(dialog.view.errors))
	for mode in ["-1", "1", "2", "0"]:
		await dialog.change_field("shapeMode", mode)
		_check(dialog.view.draft.input.bounds == ["9", "18", "13", "24"], "A mode change replaced retained values")
	_check(dialog.ui.mode_warning.visible, "A mode change did not warn about reinterpreted values")
	for appearance in ["dark", "light", "high-contrast"]:
		for density in ["balanced", "compact"]:
			dialog.apply_theme(appearance, density)
			await _frames(2)
			_check(dialog.ui.body.size.y > 300 and dialog.ui.apply.position.y >= 0, "The form collapsed under a supported theme")
	var before: int = fixture.revision
	dialog.apply_repair()
	dialog.apply_repair()
	_check(dialog._busy and dialog.ui.apply.disabled and dialog.ui.cancel.disabled, "Apply did not lock duplicate mutation and cancellation")
	var blocked: Dictionary = fixture.bridge.request("session.describe")
	_check(blocked.get("busy", false), "A second request entered the adapter stream while Apply was pending")
	for frame in 600:
		if not dialog._busy: break
		await process_frame
	if dialog.phase != "applied":
		_check(false, "Apply failed: phase=%s %s" % [dialog.phase, dialog.ui.recovery_body.text])
		return
	_check(not dialog._busy and not dialog.visible and int(_applied.get("revision", -1)) == before + 1, "Apply did not return one completed repair: " + str(dialog.view))
	_verify_durable_repair(fixture, before)


func _verify_durable_repair(fixture, before: int) -> void:
	fixture.revision = before + 1
	var response: Dictionary = fixture.bridge.request("action-settings.prepare-repair", {"expectedRevision": fixture.revision, "source": "extra-action-point:158", "slot": 4})
	_check(response.get("ok", false) and response.result.draft.input.bounds == ["9", "18", "13", "24"], "Boundary settings did not exist after Apply: " + str(response))
	_check(fixture.mutate("history.undo", {}), fixture.error)
	response = fixture.bridge.request("action-settings.prepare-repair", {"expectedRevision": fixture.revision, "source": "extra-action-point:158", "slot": 4})
	_check(response.get("ok", false) and response.result.draft.input.bounds == ["", "", "", ""], "Undo left the new companion behind")
	_check(fixture.mutate("history.redo", {}), fixture.error)
	var path: String = fixture.bridge.current_project_path()
	response = fixture.bridge.request("project.save")
	_check(response.get("ok", false), "Explicit Save failed")
	response = fixture.bridge.start_project(path)
	_check(response.get("ok", false), "Saved project did not reopen")
	response = fixture.bridge.request("action-settings.prepare-repair", {"expectedRevision": fixture.revision, "source": "extra-action-point:158", "slot": 4})
	_check(response.get("ok", false) and response.result.draft.input.bounds == ["9", "18", "13", "24"], "Reopen lost the repaired companion")


func _frames(count: int) -> void:
	for index in count: await process_frame


func _check(condition: bool, message: String) -> void:
	if not condition:
		_failed = true
		push_error("PROVIDENCE_ACTION_SETTINGS_REPAIR_FAILED " + message)
