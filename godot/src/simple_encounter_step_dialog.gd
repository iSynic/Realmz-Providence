class_name ProvidenceSimpleEncounterStepDialog
extends Window

signal done(result_index: int, steps: Array)
signal form_describe_requested(query: Dictionary, request_id: int, draft_slot: int)
signal target_search_requested(query: Dictionary)
signal peek_requested(kind: String, native_id: int, identity: String, context: Dictionary)
signal preview_requested(kind: String, native_id: int, identity: String, status: String)
signal help_requested(code: int, origin: Control)

var _result_index := 0
var _selected_step := 0
var _origin: Control
@onready var _workbench: ProvidenceActionStepWorkbench = %EncounterSemanticStep


func _ready() -> void:
	close_requested.connect(cancel)
	get_parent().visibility_changed.connect(func():
		if not get_parent().is_visible_in_tree(): cancel())
	%Done.pressed.connect(accept)
	%Cancel.pressed.connect(cancel)
	%CodeHelp.pressed.connect(func(): help_requested.emit(_selected_opcode(), %CodeHelp))
	_workbench.form_describe_requested.connect(func(query, request_id, slot): form_describe_requested.emit(query, request_id, slot))
	_workbench.target_search_requested.connect(func(query): target_search_requested.emit(query))
	_workbench.peek_requested.connect(func(kind, id, identity, context): peek_requested.emit(kind, id, identity, context))
	_workbench.preview_requested.connect(func(kind, id, identity, status): preview_requested.emit(kind, id, identity, status))
	_workbench.help_requested.connect(func(code, origin): help_requested.emit(code, origin))


func set_catalog(catalog: Dictionary) -> void:
	_workbench.set_catalog(catalog)


func open_step(identity: String, result_index: int, step_index: int, projections: Array, origin: Control) -> void:
	open_step_for_kind(identity, "simple-encounter", "Simple Encounter", result_index, step_index, projections, origin)


func open_step_for_kind(identity: String, script_kind: String, encounter_label: String, result_index: int, step_index: int, projections: Array, origin: Control) -> void:
	_result_index = result_index
	_selected_step = step_index
	_origin = origin
	title = "%s · Result %d · Step %d" % [encounter_label, result_index + 1, step_index + 1]
	%Identity.text = "RESULT %d  ·  STEP %d" % [result_index + 1, step_index + 1]
	var local: Array = []
	for value in projections:
		var projection := (value as Dictionary).duplicate(true)
		projection["slot"] = int(projection.get("slot", 0)) % 8
		local.append(projection)
	_workbench.set_document(identity, local, {
		"scriptKind": script_kind,
		"encounterIdentity": identity,
		"encounterResultIndex": result_index,
		"encounterStepIndex": step_index})
	_workbench.focus_slot(step_index)
	popup_centered_clamped(Vector2i(980, 720), 0.8)


func set_action_form_description(description: Dictionary, request_id: int) -> void:
	_workbench.set_form_description(description, request_id)


func set_action_target_page(page: Dictionary) -> void:
	_workbench.set_target_page(page)


func focus_source_target(step_index: int, field := "") -> bool:
	return await _workbench.focus_source_target(step_index, field)


func review_settings_change(impact: Dictionary) -> String:
	return await _workbench.review_settings_change(impact)


func accept() -> void:
	if not accept_local_draft(): return
	hide()
	_restore_origin()


func accept_local_draft() -> bool:
	var error := _workbench.draft_error()
	if not error.is_empty():
		%DialogStatus.text = str(error.get("error", "Complete the selected action."))
		return false
	_workbench.invalidate_action_picker()
	done.emit(_result_index, _workbench.draft_steps())
	return true


func has_unapplied_changes() -> bool:
	return visible and _workbench.has_unapplied_changes()


func accept_saved_document(draft: Dictionary) -> void:
	var local: Array = []
	for value: Dictionary in draft.get("steps", []):
		if int(value.get("slot", 0)) / 8 != _result_index: continue
		var step := value.duplicate(true)
		step["slot"] = int(step.get("slot", 0)) % 8
		local.append(step)
	_workbench.accept_saved_draft({"steps": local})


func read_navigation_state() -> Dictionary:
	return {"visible": visible, "result": _result_index, "step": _workbench.read_navigation_state()}


func restore_navigation_state(state: Dictionary) -> void:
	_workbench.restore_navigation_state(state.get("step", {}))


func cancel() -> void:
	_workbench.discard_draft()
	hide()
	_restore_origin()


func invalidate_document() -> void:
	_workbench.clear_document()
	hide()


func _selected_opcode() -> int:
	for value in _workbench.draft_steps():
		var step := value as Dictionary
		if int(step.get("slot", -1)) == _selected_step:
			return abs(int(str(step.get("actionIdentity", "realmz.action.0")).get_slice(".", 2)))
	return 0


func _restore_origin() -> void:
	if is_instance_valid(_origin):
		_origin.get_window().grab_focus()
		_origin.grab_focus()


func _unhandled_key_input(event: InputEvent) -> void:
	if visible and event is InputEventKey and event.pressed and event.keycode == KEY_ESCAPE:
		cancel()
		get_viewport().set_input_as_handled()
