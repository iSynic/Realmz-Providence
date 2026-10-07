extends Window

signal applied(projection: Dictionary)
signal returned
signal edits_settled

const Presentation = preload("res://src/action_settings_repair_presentation.gd")
const Picker = preload("res://src/action_settings_repair_picker.gd")
var ui: Dictionary
var view: Dictionary = {}
var phase := "editing"
var _presentation := Presentation.new()
var _bridge
var _busy := false
var _submitted := false
var _needs_reconnect := false
var _intent: Dictionary = {}
var _session_token := ""
var _comparison: Dictionary = {}
var _pending_edits: Array = []
var _pending_navigation: Callable
var _discard := ConfirmationDialog.new()
var picker := Picker.new()
var operations: ProvidenceEditorOperation
var _checking_fields := false
var _generation := 0


func _ready() -> void:
	if operations == null:
		operations = preload("res://src/editor_operation.gd").new()
		add_child(operations)
	picker.operations = operations
	title = "Repair Action Settings"
	transient = true
	exclusive = true
	borderless = true
	unresizable = true
	min_size = Vector2i(1040, 700)
	size = Vector2i(1040, 700)
	ui = _presentation.build(self, {
		"compare_current": compare_current, "back_to_editing": back_to_editing,
		"review_draft": review_draft, "check_status": check_status,
		"finish_confirmed": finish_confirmed, "copy_draft": copy_draft,
	})
	apply_theme()
	for entry in [["Land", "land"], ["Dungeon", "dungeon"]]: _option(ui.mapKind, entry)
	for entry in [["Keep shape", "-1"], ["Set bounds", "0"], ["Move area", "1"], ["Adjust each edge", "2"]]: _option(ui.shapeMode, entry)
	for key in ["mapKind", "shapeMode"]:
		ui[key].item_selected.connect(func(index): change_field(key, str(ui[key].get_item_metadata(index))))
	for key in ["chanceAdjustment", "bound0", "bound1", "bound2", "bound3"]:
		ui[key].text_changed.connect(func(value): change_field(key, value))
	for key in ["map", "area"]: ui[key].pressed.connect(func(): open_picker(key))
	ui.all_uses.pressed.connect(open_picker.bind("uses"))
	ui.only.pressed.connect(change_field.bind("scope", "only-this-action"))
	ui.shared.pressed.connect(change_field.bind("scope", "shared-actions"))
	ui.cancel.pressed.connect(request_cancel)
	ui.copy.pressed.connect(copy_draft)
	ui.compare.pressed.connect(compare_current)
	ui.apply.pressed.connect(apply_repair)
	close_requested.connect(request_cancel)
	add_child(_discard)
	_discard.title = "Discard unapplied changes?"
	_discard.exclusive = true
	_discard.dialog_autowrap = true
	_discard.get_cancel_button().text = "Keep Editing"
	_discard.get_ok_button().text = "Discard Changes"
	_discard.confirmed.connect(_close)
	_discard.canceled.connect(func(): _discard.hide(); _pending_navigation = Callable(); ui.cancel.grab_focus())
	picker.hide()
	add_child(picker)
	picker.chosen.connect(change_field)
	picker.visibility_changed.connect(func():
		if not picker.visible and visible: ui.map.grab_focus())
	set_process(false)


func apply_theme(mode := "dark", density := "balanced") -> void:
	_presentation.apply_theme(self, mode, density)
	picker.theme = theme
	_discard.theme = theme
	if not view.is_empty(): _render()


func open_repair(bridge, revision: int, source: String, slot: int) -> Dictionary:
	if visible or _busy: return {"ok": false, "error": "Finish the current repair first."}
	_busy = true
	_bridge = bridge
	_generation += 1
	var response: Dictionary = await _read("action-settings.prepare-repair", {"expectedRevision": revision, "source": source, "slot": slot})
	_busy = false
	if not response.get("ok", false): return response
	view = response.result
	phase = str(view.phase)
	_busy = false
	_submitted = false
	_needs_reconnect = false
	_pending_edits = []
	_pending_navigation = Callable()
	_render()
	popup_centered(Vector2i(1040, 700))
	_presentation.focus_loop()
	_focus_first_error()
	return response


func change_field(field: String, value: String) -> void:
	if _busy or phase not in ["editing", "stale-draft"]: return
	_pending_edits = _pending_edits.filter(func(edit): return edit[0] != field)
	_pending_edits.append([field, value])
	_render()
	if _checking_fields:
		await edits_settled
	else:
		await _flush_edits()


func _flush_edits() -> void:
	_checking_fields = true
	var generation := _generation
	while not _pending_edits.is_empty() and visible and generation == _generation:
		while operations.busy and visible: await get_tree().process_frame
		if not visible: break
		var edit: Array = _pending_edits[0].duplicate()
		var retained_stale_form := phase == "stale-draft"
		var response: Dictionary = await _read("action-settings.change-repair", {"draft": view.draft, "field": edit[0], "value": edit[1]})
		if generation != _generation: break
		if not response.get("ok", false):
			_read_failed(response)
			break
		_pending_edits.erase(edit)
		view = response.result
		phase = str(view.phase)
		if retained_stale_form and phase == "stale": phase = "stale-draft"
		_render()
		if phase not in ["editing", "stale-draft"]: break
	_checking_fields = false
	edits_settled.emit()


func _read(method: String, params: Dictionary) -> Dictionary:
	return await operations.run_workflow(_bridge, "", func(op): return await op.request(method, params), null, true)


func open_picker(field: String) -> void:
	if not _busy and not _checking_fields and not _discard.visible and phase == "editing": picker.open_choices(_bridge, view.draft, field)


func apply_repair() -> void:
	if _busy or operations.busy or phase != "editing" or not view.get("canApply", false) or not _pending_edits.is_empty(): return
	_busy = true
	_render()
	var response: Dictionary = await operations.run_workflow(_bridge, "", _apply_checked, null, true)
	_busy = false
	_accept_apply(response)


func _apply_checked(op: ProvidenceEditorOperation) -> Dictionary:
	var checked: Dictionary = await op.request("action-settings.preview-repair", {"draft": view.draft})
	if not checked.get("ok", false):
		return checked
	view = checked.result
	phase = str(view.phase)
	_render()
	if phase != "editing" or not view.canApply:
		return {"ok": true, "previewOnly": true}
	_intent = view.intent.duplicate(true)
	_session_token = str(view.sessionToken)
	_submitted = true
	return await op.commit_repair({"expectedRevision": int(view.draft.revision), "draft": view.draft}, _intent)


func _accept_apply(response: Dictionary) -> void:
	if response.get("previewOnly", false):
		_render()
		_focus_first_error()
		return
	if response.get("ok", false):
		phase = "applied"
		hide()
		applied.emit(response.result)
	elif _uncertain_response(response):
		_needs_reconnect = true
		phase = "unknown"
		_render()
	else:
		_submitted = false
		_read_failed(response)


func check_status() -> void:
	if _busy: return
	var response := await _recovery_read("action-settings.reconcile-repair", {"intent": _intent, "sessionToken": _session_token})
	if not response.get("ok", false):
		_needs_reconnect = _uncertain_response(response)
		ui.recovery_body.text = "The repair still cannot be confirmed. No retry was sent.\n" + str(response.get("error", ""))
		return
	phase = str(response.result.outcome)
	if phase == "not-applied": _submitted = false
	_comparison = response.result
	_render()


func compare_current() -> void:
	if _busy or _checking_fields: return
	var response := await _recovery_read("action-settings.compare-repair", {"draft": view.draft})
	if not response.get("ok", false):
		ui.recovery_body.text = "Could not compare the current settings. Your draft is kept.\n" + str(response.get("error", ""))
		return
	_comparison = response.result
	phase = "comparison"
	_render()


func _recovery_read(method: String, params: Dictionary) -> Dictionary:
	_busy = true
	_render()
	var response: Dictionary = await operations.recover_repair(_bridge, method, params, _needs_reconnect and not _bridge.connection_alive())
	_busy = false
	_needs_reconnect = _uncertain_response(response)
	_render()
	return response


func finish_confirmed() -> void:
	if phase != "matches-repair": return
	phase = "applied"
	hide()
	applied.emit(_comparison.projection)
	var action := _pending_navigation
	_pending_navigation = Callable()
	if action.is_valid(): action.call()


func review_draft() -> void:
	if _busy or not _comparison.get("canRebase", false): return
	_busy = true
	_render()
	var response: Dictionary = await _read("action-settings.rebase-repair", {"draft": view.draft, "expectedRevision": int(_comparison.current.revision)})
	_busy = false
	if not response.get("ok", false):
		_render()
		ui.recovery_body.text = "The project changed again. Compare once more before continuing.\n" + str(response.get("error", ""))
		return
	view = response.result
	phase = str(view.phase)
	_submitted = false
	var pending := _pending_edits.duplicate(true)
	_pending_edits.clear()
	for edit: Array in pending:
		if edit[0] != "scope": await change_field(str(edit[0]), str(edit[1]))
	_render()
	_focus_first_error()


func back_to_editing() -> void:
	if phase != "comparison" or not _comparison.get("canRebase", false) or _submitted: return
	phase = "stale-draft"
	_render()
	ui.chanceAdjustment.grab_focus()


func _read_failed(response: Dictionary) -> void:
	_needs_reconnect = _uncertain_response(response)
	phase = "stale"
	_render()
	ui.recovery_body.text += "\n" + str(response.get("error", "The draft could not be checked."))


static func _uncertain_response(response: Dictionary) -> bool:
	return bool(response.get("outcomeUnknown", false)) or str(response.get("error", "")).begins_with("command could not be durably acknowledged")


func has_unapplied_changes() -> bool:
	return visible and (view.get("dirty", false) or _submitted or not _pending_edits.is_empty())


func request_cancel() -> void:
	request_navigation(Callable())


func request_navigation(action: Callable) -> void:
	if _busy or picker.visible: return
	_pending_navigation = action
	if phase == "matches-repair":
		finish_confirmed()
		return
	if has_unapplied_changes():
		_discard.dialog_text = "Your unapplied values will be discarded. Keep Editing returns to the complete draft."
		if _submitted: _discard.dialog_text = "The repair outcome is not confirmed. Leaving will not undo a repair that may already have applied. Copy the draft or check its status before leaving."
		_discard.popup_centered(Vector2i(600, 190))
		_discard.get_cancel_button().grab_focus()
	else: _close()


func _close() -> void:
	_generation += 1
	hide()
	returned.emit()
	var action := _pending_navigation
	_pending_navigation = Callable()
	if action.is_valid(): action.call()


func copy_draft() -> void:
	var lines: Array[String] = ["Action settings draft", str(view.sourceLabel)]
	for key in ["mapKind", "map", "area", "chanceAdjustment", "shapeMode", "bound0", "bound1", "bound2", "bound3"]:
		var control: Control = ui[key]
		lines.append("%s: %s" % [str(ui[key + "_label"].text), str(control.text)])
	for edit: Array in _pending_edits: lines.append("Pending %s: %s" % [edit[0], edit[1]])
	lines.append("Scope: " + str(view.draft.scope))
	DisplayServer.clipboard_set("\n".join(lines))
	ui.status.text = "Draft copied · " + str(ui.status.text).trim_prefix("Draft copied · ")


func _input(event: InputEvent) -> void:
	if visible and not picker.visible and not _discard.visible and event is InputEventKey and event.pressed and not event.echo and event.keycode == KEY_ESCAPE:
		get_viewport().set_input_as_handled()
		request_cancel()


func _option(control: OptionButton, entry: Array) -> void:
	control.add_item(str(entry[0]))
	control.set_item_metadata(control.item_count - 1, entry[1])


func _focus_first_error() -> void:
	for error: Dictionary in view.get("errors", []):
		var field: Variant = ui.get(str(error.field))
		if field is Control and field.is_visible_in_tree():
			field.grab_focus()
			return
	ui.cancel.grab_focus()


func _render() -> void:
	_presentation.render(view, {
		"phase": phase, "busy": _busy, "submitted": _submitted,
		"comparison": _comparison, "pending_edits": _pending_edits,
	})
