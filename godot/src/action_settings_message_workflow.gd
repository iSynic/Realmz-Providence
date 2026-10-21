extends Node

signal view_received(response: Dictionary)
signal activity_changed(busy: bool)
signal editor_requested(identity: String)

const Picker = preload("res://src/action_settings_message_picker.tscn")
const Peek = preload("res://src/action_settings_message_peek.tscn")
var picker: Window
var peek: Window
var operations: ProvidenceEditorOperation
var _form: Control
var _shade: ColorRect
var _bridge
var _draft: Dictionary = {}
var _phase := ""
var _busy := false
var _generation := 0
var _last_field := "firstMessage"


func initialize(form: Control, shade: ColorRect, shared_operations: ProvidenceEditorOperation) -> void:
	_form = form
	_shade = shade
	operations = shared_operations
	picker = Picker.instantiate()
	picker.operations = operations
	add_child(picker)
	peek = Peek.instantiate()
	add_child(peek)
	_form.choose_requested.connect(open_choices)
	_form.read_requested.connect(read_message)
	_form.page_requested.connect(page)
	_form.editor_requested.connect(editor_requested.emit)
	picker.choice_requested.connect(_choose)
	peek.editor_requested.connect(editor_requested.emit)
	for window: Window in [picker, peek]: window.visibility_changed.connect(_modal_changed)


func apply_theme(next_theme: Theme, panel: StyleBox) -> void:
	for window: Window in [picker, peek]:
		window.theme = next_theme
		window.get_node("Panel").add_theme_stylebox_override("panel", panel.duplicate())


func set_context(bridge, view: Dictionary, phase: String, busy: bool) -> void:
	var draft: Dictionary = view.get("draft", {}) if view.get("family") == "random-message" else {}
	if draft != _draft: _generation += 1
	_bridge = bridge
	_draft = draft.duplicate(true)
	_phase = phase
	_busy = busy


func has_modal() -> bool:
	return picker.visible or peek.visible


func cancel() -> void:
	_generation += 1
	picker.hide()
	peek.hide()
	_draft.clear()


func _available() -> bool:
	return _form.is_visible_in_tree() and not _busy and not operations.busy and _phase == "editing" and not _draft.is_empty()


func open_choices(field: String) -> void:
	if not _available(): return
	_last_field = field
	picker.open_choices(_bridge, _draft, field)


func page(offset: int) -> void:
	if not _available(): return
	var generation := _generation
	activity_changed.emit(true)
	var response := await _read("action-settings.preview-repair", {"draft": _draft, "offset": offset})
	if generation == _generation: view_received.emit(response)
	activity_changed.emit(false)


func read_message(identity: String) -> void:
	if not _available(): return
	var generation := _generation
	activity_changed.emit(true)
	var response := await _read("action-settings.peek-repair-message", {"draft": _draft, "identity": identity})
	if generation == _generation:
		if response.get("ok", false): peek.show_message(response.result)
		else: view_received.emit(response)
	activity_changed.emit(false)


func _choose(field: String, identity: Variant, waits: bool) -> void:
	if _busy or operations.busy or _phase != "editing": return
	var generation := _generation
	picker.set_submitting(true)
	activity_changed.emit(true)
	var response := await _read("action-settings.choose-repair-message", {"draft": _draft, "field": field, "identity": identity, "waitsForClick": waits})
	picker.set_submitting(false)
	if generation == _generation:
		if response.get("ok", false):
			picker.hide()
			view_received.emit(response)
		else: picker.show_error(str(response.get("error", "The choice could not be checked.")))
	activity_changed.emit(false)


func _read(method: String, params: Dictionary) -> Dictionary:
	return await operations.run_workflow(_bridge, "", func(op): return await op.request(method, params), null, true)


func _modal_changed() -> void:
	_shade.visible = has_modal()
	if not has_modal() and _form.is_visible_in_tree(): _form.endpoint(_last_field).grab_focus()
