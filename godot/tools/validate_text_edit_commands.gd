extends SceneTree

const Commands = preload("res://src/text_edit_commands.gd")
var _failed := false

func _initialize() -> void: call_deferred("_run")

func _run() -> void:
	for control in [LineEdit.new(), TextEdit.new()]:
		root.add_child(control)
		control.text = "Café abc"
		control.grab_focus()
		if control is LineEdit: control.select(5,8)
		else: control.select(0,5,0,8)
		await process_frame
		_check(Commands.availability(control).get("edit.copy",false), "Selected native text cannot copy.")
		control.editable = false
		_check(not Commands.execute(&"edit.delete",control), "Read-only field accepted Delete.")
		_check(not Commands.availability(control).get("edit.cut",true), "Read-only field accepted Cut.")
		control.editable = true
		if control is LineEdit: control.select(5,8)
		else: control.select(0,5,0,8)
		_check(control.has_selection(), "Selection was not restored after leaving read-only mode.")
		var changed := [0]
		if control is LineEdit: control.text_changed.connect(func(_text): changed[0] += 1)
		else: control.text_changed.connect(func(): changed[0] += 1)
		_check(Commands.execute(&"edit.delete",control), "Editable field rejected Delete.")
		await process_frame
		_check(control.text == "Café ", control.get_class() + " Delete did not remove only selected text: " + control.text)
		_check(changed[0] > 0, "Delete did not notify the owning draft.")
		control.menu_option(LineEdit.MENU_UNDO if control is LineEdit else TextEdit.MENU_UNDO)
		await process_frame
		_check(control.text == "Café abc", "Delete did not join native text history.")
		control.deselect()
		if control is LineEdit: control.caret_column = 5
		else: control.set_caret_column(5)
		control.grab_focus()
		await process_frame
		Commands.execute(&"edit.delete", control)
		await process_frame
		_check(control.text == "Café bc", control.get_class() + " forward Delete failed: " + control.text)
		control.free()
	_check(Commands.availability(null).is_empty(), "Missing focus acquired text commands.")
	if not _failed: print("PROVIDENCE_TEXT_EDIT_COMMANDS_OK selected-delete readonly macroman focus")
	quit(1 if _failed else 0)

func _check(value: bool, message: String) -> void:
	if not value: _failed = true; push_error(message)
