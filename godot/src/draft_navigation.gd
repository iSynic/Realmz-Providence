extends RefCounted

signal failed(message: String)
signal navigation_canceled

var _dialog: ConfirmationDialog
var _drafts
var _operations: ProvidenceEditorOperation
var _active_dialog: Callable
var _prepare_input: Callable
var _current_document: Callable
var _pending := Callable()


func initialize(dialog: ConfirmationDialog, drafts, operations: ProvidenceEditorOperation, active_dialog: Callable, prepare_input: Callable, current_document: Callable) -> void:
	_dialog = dialog
	dialog.dialog_hide_on_ok = false
	_drafts = drafts
	_operations = operations
	_active_dialog = active_dialog
	_prepare_input = prepare_input
	_current_document = current_document
	dialog.add_button("Discard & Continue", true, "discard")
	dialog.confirmed.connect(apply_and_continue)
	dialog.custom_action.connect(discard_and_continue)
	dialog.canceled.connect(cancel)


func request(action: Callable, destination: String = "continuing") -> void:
	if _operations.busy: return
	_prepare_input.call()
	var text_dialog: Window = _active_dialog.call()
	if text_dialog != null:
		text_dialog.request_navigation(action)
		return
	if not _drafts.has_draft():
		await action.call()
		return
	_pending = action
	_dialog.size = Vector2i(640, 180)
	_dialog.dialog_text = "%s has unapplied changes.\n\nApply or discard them before %s, or keep editing.\nApply updates the open project; use Save to save it to disk." % [_subject(), destination]
	_dialog.popup_centered(Vector2i(640, 180))
	_dialog.get_cancel_button().grab_focus()


func _subject() -> String:
	var editor: Control = _current_document.call()
	if editor.has_method("navigation_subject"): return editor.navigation_subject()
	if str(editor.get_meta("route_identity", "")) != "economy.items": return "This document"
	var item: Dictionary = editor.selected_definition()
	var subject := "Item %d" % int(item.get("classicId", 0))
	var item_name := str(item.get("name", "")).strip_edges()
	return subject if item_name.is_empty() else subject + " — " + item_name


func apply_and_continue() -> void:
	if _operations.busy: return
	var result: Dictionary = await _drafts.commit()
	if not result.get("ok", false):
		# Keep both the draft and the destination for an explicit correction or
		# discard. A rejected Apply must never silently navigate away.
		failed.emit(str(result.get("error", "Your edits could not be applied. They have been kept, and navigation was cancelled.")))
		return
	_dialog.hide()
	await _continue()


func discard_and_continue(action: StringName) -> void:
	if _operations.busy or action != &"discard": return
	_dialog.hide()
	_drafts.discard()
	if _drafts.has_draft():
		failed.emit("The original result must be checked before this document can be discarded.")
		return
	await _continue()


func cancel() -> void:
	var had_destination := _pending.is_valid()
	_pending = Callable()
	if had_destination: navigation_canceled.emit()


func _continue() -> void:
	# Clear before awaiting: the destination may itself present another draft.
	var action := _pending
	_pending = Callable()
	if action.is_valid(): await action.call()
