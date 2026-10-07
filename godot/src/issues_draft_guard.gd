extends ConfirmationDialog

var _tabs: TabContainer
var _drafts: RefCounted
var _dialog_resolver: Callable
var _pending := Callable()
var _destination := ""
var _discard: Button
var _failed_apply := false
var _apply_error: Dictionary = {}
var _draft_focus: Control
var _last_editor_focus: WeakRef
var _applying := false


func initialize(tabs: TabContainer, drafts: RefCounted, dialog_resolver: Callable) -> void:
	_tabs = tabs
	_drafts = drafts
	_dialog_resolver = dialog_resolver
	dialog_autowrap = true
	dialog_hide_on_ok = false
	exclusive = true
	_discard = add_button("Discard and Open", true, "discard")
	confirmed.connect(_apply)
	custom_action.connect(_custom_action)
	canceled.connect(_cancel)


func _ready() -> void:
	# A Window owns a separate viewport; drafts belong to the document's host viewport.
	get_parent().get_viewport().gui_focus_changed.connect(_watch_numeric_input)


func request(action: Callable, destination: String) -> void:
	if _applying: return
	var text_dialog: Window = _dialog_resolver.call()
	if text_dialog != null:
		text_dialog.request_navigation(action)
		return
	prepare_pending_input()
	if not _drafts.has_draft():
		action.call()
		return
	_pending = action
	_destination = destination
	_failed_apply = false
	_apply_error = {}
	_draft_focus = _tabs.get_viewport().gui_get_focus_owner()
	if _last_editor_focus != null:
		var previous: Control = _last_editor_focus.get_ref()
		if is_instance_valid(previous) and _tabs.get_current_tab_control().is_ancestor_of(previous):
			_draft_focus = previous
	title = "Unapplied changes"
	dialog_text = "Apply your changes before opening %s, or discard them and open it.\nCancel keeps your changes here." % destination
	get_ok_button().show()
	get_ok_button().text = "Apply and Open"
	get_cancel_button().text = "Cancel"
	_discard.text = "Discard and Open " + destination
	popup_centered(Vector2i(720, 190))
	get_cancel_button().grab_focus()


func prepare_pending_input() -> void:
	var focused := _tabs.get_viewport().gui_get_focus_owner() as Control
	var editor: Control = _tabs.get_current_tab_control()
	if focused is LineEdit and focused.get_parent() is SpinBox and editor.is_ancestor_of(focused) and focused.get_parent().get_meta("issues_text_pending", false):
		(focused.get_parent() as SpinBox).apply()


func _watch_numeric_input(control: Control) -> void:
	var editor: Control = _tabs.get_current_tab_control()
	if is_instance_valid(control) and is_instance_valid(editor) and editor.is_ancestor_of(control):
		_last_editor_focus = weakref(control)
	if not control is LineEdit or not control.get_parent() is SpinBox:
		return
	var number := control.get_parent() as SpinBox
	if number.has_meta("issues_input_bound"):
		return
	number.set_meta("issues_input_bound", true)
	control.text_changed.connect(func(_text: String): number.set_meta("issues_text_pending", true))
	control.text_submitted.connect(func(_text: String): number.set_meta("issues_text_pending", false))
	number.value_changed.connect(func(_value: float): number.set_meta("issues_text_pending", false))


func _apply() -> void:
	if _applying: return
	_applying = true
	get_ok_button().disabled = true
	_discard.disabled = true
	get_cancel_button().disabled = true
	_apply_error = await _drafts.commit()
	get_ok_button().disabled = false
	_discard.disabled = false
	get_cancel_button().disabled = false
	if not bool(_apply_error.get("ok", false)):
		_applying = false
		_failed_apply = true
		title = "Could not apply changes"
		dialog_text = str(_apply_error.get("error", "The change could not be applied.")) + "\nKeep editing, or discard your remaining changes and open %s." % _destination
		get_ok_button().hide()
		get_cancel_button().text = "Keep Editing"
		get_cancel_button().grab_focus()
		return
	await _continue()
	_applying = false


func _custom_action(action: StringName) -> void:
	if _applying: return
	if action == &"discard":
		_drafts.discard()
		await _continue()


func _continue() -> void:
	hide()
	var action := _pending
	_pending = Callable()
	if action.is_valid():
		await action.call()


func _cancel() -> void:
	if _applying: return
	_pending = Callable()
	if _failed_apply:
		var fallback := _draft_focus
		if not is_instance_valid(fallback):
			var editor: Control = _tabs.get_current_tab_control()
			if editor.has_method("draft_focus_fallback"):
				fallback = editor.draft_focus_fallback()
		preload("res://src/editor_draft_apply.gd").focus_error(_apply_error, fallback)
