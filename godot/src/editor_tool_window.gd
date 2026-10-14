extends Window

signal dock_requested
signal command_requested(command: StringName)
signal apply_requested


func _ready() -> void:
	close_requested.connect(dock_requested.emit)
	%Dock.pressed.connect(dock_requested.emit)
	%Apply.pressed.connect(apply_requested.emit)
	%Undo.pressed.connect(func(): command_requested.emit(&"edit.undo"))
	%Redo.pressed.connect(func(): command_requested.emit(&"edit.redo"))


func _unhandled_key_input(event: InputEvent) -> void:
	if not event is InputEventKey or not event.pressed or event.echo or not event.ctrl_pressed: return
	match event.keycode:
		KEY_ENTER: apply_requested.emit()
		KEY_Z: command_requested.emit(&"edit.redo" if event.shift_pressed else &"edit.undo")
		KEY_Y: command_requested.emit(&"edit.redo")
		KEY_S: command_requested.emit(&"file.save")
		_: return
	get_viewport().set_input_as_handled()


func set_status(message: String) -> void:
	%Status.text = message


func set_history(can_undo: bool, can_redo: bool, busy: bool) -> void:
	%Undo.disabled = busy or not can_undo; %Redo.disabled = busy or not can_redo
	%Apply.disabled = busy


func reveal() -> void:
	preload("res://src/native_tool_placement.gd").reveal(self)
