extends RefCounted

const Layout = preload("res://src/action_settings_repair_layout.gd")

var ui: Dictionary = {}
var _layout := Layout.new()
var _actions: Dictionary = {}
var _problem_color: Color


func build(window: Window, actions: Dictionary) -> Dictionary:
	ui = _layout.build(window)
	_actions = actions
	return ui


func apply_theme(window: Window, mode: String, density: String) -> void:
	_layout.apply_theme(window, mode, density)
	_problem_color = window.theme.get_color("problem", "Issues")



func render(view: Dictionary, state: Dictionary) -> void:
	if view.is_empty(): return
	_layout.summary_variant(false)
	ui.source.text = str(view.sourceLabel) + (" — Change random area" if state.phase != "unsupported" else "")
	ui.notice_title.text = str(view.noticeTitle)
	ui.notice_body.text = str(view.noticeBody)
	_render_input(view, state)
	_render_scope(view, state)
	_render_errors(view)
	_render_action_state(view, state)


func _render_input(view: Dictionary, state: Dictionary) -> void:
	var input: Dictionary = view.draft.input
	for key in ["mapKind", "shapeMode"]:
		var option: OptionButton = ui[key]
		option.select(-1)
		for index in option.item_count:
			if str(option.get_item_metadata(index)) == str(input[key]): option.select(index)
		if option.selected < 0: option.text = "Required" if str(input[key]).is_empty() else "Unsupported (" + str(input[key]) + ")"
	ui.map.text = str(view.mapLabel) + " ▾"
	ui.area.text = str(view.areaLabel) + " ▾"
	set_text(ui.chanceAdjustment, str(input.chanceAdjustment))
	for index in 4:
		var key := "bound%d" % index
		set_text(ui[key], str(input.bounds[index]))
		ui[key + "_label"].text = str(view.boundLabels[index])
		ui[key].get_parent().visible = index < int(view.boundCount)
	for edit: Array in state.pending_edits:
		if ui.get(str(edit[0])) is LineEdit: set_text(ui[edit[0]], str(edit[1]))
		elif ui.get(str(edit[0])) is OptionButton:
			var option: OptionButton = ui[str(edit[0])]
			for index in option.item_count:
				if str(option.get_item_metadata(index)) == str(edit[1]): option.select(index)
	ui.bounds.visible = int(view.boundCount) > 0
	ui.bounds_help.visible = int(view.boundCount) > 0
	ui.chance_help.text = str(view.chanceHelp)
	ui.shape_help.text = str(view.shapeHelp)
	ui.mode_warning.visible = bool(view.draft.modeChanged)


func _render_scope(view: Dictionary, state: Dictionary) -> void:
	var retained_stale_form: bool = state.phase == "stale-draft"
	ui.scope.visible = int(view.sharedCount) > 1 and bool(view.shareAllowed)
	var scope: String = view.draft.scope
	for edit: Array in state.pending_edits:
		if edit[0] == "scope": scope = str(edit[1])
	ui.only.set_pressed_no_signal(scope == "only-this-action")
	ui.shared.set_pressed_no_signal(scope == "shared-actions")
	ui.only.text = ("● " if ui.only.button_pressed else "○ ") + "Only this action"
	ui.shared.text = ("● " if ui.shared.button_pressed else "○ ") + "Update %d shared actions" % int(view.sharedCount)
	ui.shared.disabled = state.busy or retained_stale_form or not bool(view.shareAllowed)
	ui.outcome.text = str(view.outcomeHelp)
	ui.bounds_help.text = str(view.boundsHelp)
	ui.scope_help.text = str(view.scopeHelp)
	ui.affects_heading.text = "Currently shared by %d actions" % int(view.sharedCount) if int(view.sharedCount) > 1 else "Affects"
	ui.uses.text = "\n".join(view.sharedUses.map(func(usage): return str(usage.label)))
	ui.all_uses.visible = int(view.sharedCount) > 3
	ui.all_uses.text = "View all %d uses…" % int(view.sharedCount)


func _render_errors(view: Dictionary) -> void:
	var messages: Array[String] = []
	for field: Control in _layout.fields:
		field.remove_theme_color_override("font_color")
	for error: Dictionary in view.errors:
		var control: Variant = ui.get(str(error.field))
		if control is Control and not str(control.text).is_empty() and str(control.text) != "Required":
			messages.append(str(error.message))
			control.add_theme_color_override("font_color", _problem_color)
	ui.errors.text = "\n".join(messages)


func _render_action_state(view: Dictionary, state: Dictionary) -> void:
	var retained_stale_form: bool = state.phase == "stale-draft"
	ui.apply.text = "Applying…" if state.busy else str(view.applyLabel)
	ui.apply.disabled = state.busy or retained_stale_form or not bool(view.canApply) or not state.pending_edits.is_empty()
	ui.cancel.disabled = state.busy
	ui.only.disabled = state.busy or retained_stale_form
	ui.all_uses.disabled = state.busy or retained_stale_form
	for field: Control in _layout.fields:
		if field is LineEdit: field.editable = not state.busy
		else: field.disabled = state.busy
	for key in ["map", "area"]: ui[key].disabled = state.busy or retained_stale_form
	ui.status.text = "Applying repair · please wait" if state.busy else "Unapplied changes"
	if retained_stale_form: ui.status.text = "Draft kept · compare before applying"
	ui.body.visible = state.phase in ["editing", "stale-draft"]
	ui.recovery.visible = not ui.body.visible
	ui.copy.visible = ui.body.visible and (bool(view.get("allocationUnavailable", false)) or retained_stale_form)
	ui.copy.disabled = state.busy
	ui.compare.visible = retained_stale_form
	ui.compare.disabled = state.busy or not state.pending_edits.is_empty()
	ui.apply.visible = ui.body.visible
	ui.cancel.text = "Cancel" if ui.body.visible else "Back to Issues"
	if view.get("allocationUnavailable", false): ui.cancel.text = "Back to Issues"
	if ui.recovery.visible: recovery(state)
	focus_loop()


func set_text(control: LineEdit, value: String) -> void:
	if control.text != value: control.text = value


func recovery(state: Dictionary) -> void:
	var ui: Dictionary = ui
	for child in ui.recovery_buttons.get_children():
		ui.recovery_buttons.remove_child(child)
		child.queue_free()
	var title := "This action has changed"
	var body := "Your complete draft is kept. Compare the current action and settings before continuing."
	var actions: Array = [["Compare Current Settings", _actions.compare_current]]
	match state.phase:
		"comparison":
			title = "Review current settings and your draft"
			body = "Current → Your draft\n"
			for row: Array in state.comparison.changes:
				body += "%s:  %s  →  %s\n" % [row[0], "Not present" if str(row[1]).is_empty() else row[1], "Not entered" if str(row[2]).is_empty() else row[2]]
			if state.comparison.changes.is_empty(): body += "The visible field values are unchanged.\n"
			body += "\n" + str(state.comparison.contextMessage)
			actions = [["Compare Again", _actions.compare_current]]
			if state.comparison.canRebase:
				actions.append(["Back to Editing", _actions.back_to_editing])
				actions.append(["Review My Draft", _actions.review_draft])
		"unknown":
			title = "The repair outcome is not confirmed"
			body = "Do not apply the repair again yet. Check the current action, both settings records, and all affected actions. Checking never applies changes. Your draft is kept."
			actions = [["Check Repair Status", _actions.check_status]]
		"matches-repair":
			title = "The current settings match this repair"
			body = "The action, complete settings and affected actions match the submitted repair. Return to Issues without applying again. Save remains a separate action."
			actions = [["Return to Issues", _actions.finish_confirmed]]
		"not-applied":
			title = "The repair was not applied"
			body = "The same session confirms that the action and settings are unchanged. Review the draft at the current revision before a separate Apply. No retry has been sent."
			actions = [["Review & Retry", _actions.compare_current]]
		"source-gone":
			title = "This step no longer exists"
			body = "Your draft is still available to copy. Return to Issues; another step will not be substituted for this one."
			actions = []
		"unsupported":
			title = "Guided repair is unavailable for this action"
			body = "This action does not yet have a repair form. Its problem remains in Issues. Nothing has been changed."
			actions = []
	ui.recovery_title.text = title
	ui.recovery_body.text = body
	for edit: Array in state.pending_edits:
		ui.recovery_body.text += "\nKept draft — %s: %s" % [ui[str(edit[0]) + "_label"].text if ui.has(str(edit[0]) + "_label") else str(edit[0]), str(edit[1])]
	ui.status.text = "Outcome unconfirmed · draft kept" if state.submitted else "Draft kept · nothing applied"
	if state.phase in ["unknown", "matches-repair", "not-applied"]:
		ui.notice_title.text = title
		ui.notice_body.text = "Checking the outcome never applies or repeats a repair."
	if state.phase == "matches-repair": ui.status.text = "Repair confirmed · return without applying again"
	for action: Array in [["Copy Draft", _actions.copy_draft]] + actions:
		var button := Button.new()
		button.text = str(action[0])
		button.disabled = state.busy
		button.pressed.connect(action[1])
		ui.recovery_buttons.add_child(button)


func focus_loop() -> void:
	var controls: Array[Control] = []
	for control: Control in _layout.fields + [ui.only, ui.shared, ui.all_uses] + ui.recovery_buttons.get_children() + [ui.copy, ui.compare, ui.cancel, ui.apply]:
		if control.is_visible_in_tree() and (not control is BaseButton or not control.disabled): controls.append(control)
	for index in controls.size():
		controls[index].focus_next = controls[(index + 1) % controls.size()].get_path()
		controls[index].focus_previous = controls[(index - 1 + controls.size()) % controls.size()].get_path()
