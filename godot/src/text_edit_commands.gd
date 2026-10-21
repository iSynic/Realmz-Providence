extends RefCounted

static func availability(control: Control) -> Dictionary:
	if control is RichTextLabel: return {"edit.copy": not control.get_selected_text().is_empty()}
	if not control is TextEdit and not control is LineEdit: return {}
	var selected: bool = control.has_selection()
	return {"edit.copy":selected, "edit.cut":selected and control.editable,
		"edit.paste":control.editable, "edit.delete":control.editable and not control.text.is_empty()}


static func execute(command: StringName, control: Control) -> bool:
	if not availability(control).get(String(command), false): return false
	if control is RichTextLabel:
		DisplayServer.clipboard_set(control.get_selected_text())
		return true
	if command == &"edit.delete":
		_delete(control)
	else:
		var option: int
		if control is TextEdit:
			option = {&"edit.copy":TextEdit.MENU_COPY, &"edit.cut":TextEdit.MENU_CUT, &"edit.paste":TextEdit.MENU_PASTE}[command]
		else:
			option = {&"edit.copy":LineEdit.MENU_COPY, &"edit.cut":LineEdit.MENU_CUT, &"edit.paste":LineEdit.MENU_PASTE}[command]
		control.menu_option(option)
	return true


static func _delete(control: Control) -> void:
	if control is LineEdit:
		if control.has_selection():
			var start: int = control.get_selection_from_column()
			control.delete_text(start, control.get_selection_to_column())
			control.deselect()
			control.caret_column = start
		else:
			var start: int = control.caret_column
			control.delete_text(start, control.get_next_composite_character_column(start))
			control.caret_column = start
	elif control.has_selection(): control.delete_selection()
	else:
		var event := InputEventKey.new()
		event.keycode = KEY_DELETE
		event.pressed = true
		control.get_viewport().push_input(event)
		event = event.duplicate()
		event.pressed = false
		control.get_viewport().push_input(event)
