extends Button

var fallback_controls: Array[Control] = []
var _viewport_size := Vector2.ZERO


func _ready() -> void:
	pressed.connect(_toggle_menu)
	visibility_changed.connect(func():
		if not is_visible_in_tree(): close_menu(true))
	set_process_input(false)
	set_process(false)


func _toggle_menu() -> void:
	if $Menu.visible:
		close_menu(true)
		return
	$Menu.show()
	_viewport_size = get_viewport_rect().size
	_position_menu()
	_position_menu.call_deferred()
	grab_focus()
	set_process_input(true)
	set_process(true)


func _position_menu() -> void:
	if not $Menu.visible: return
	var bounds := get_viewport_rect().size
	var extent := $Menu.get_combined_minimum_size() as Vector2
	$Menu.size = extent
	$Menu.global_position = Vector2(clampf(global_position.x + size.x - extent.x, 0, maxf(0, bounds.x - extent.x)), clampf(global_position.y + size.y + 4, 0, maxf(0, bounds.y - extent.y)))


func close_menu(restore_focus: bool = false) -> void:
	if not is_node_ready() or not $Menu.visible:
		return
	$Menu.hide()
	set_process_input(false)
	set_process(false)
	if not restore_focus:
		return
	if is_visible_in_tree() and not disabled:
		grab_focus()
		return
	for control in fallback_controls:
		if is_instance_valid(control) and control.is_visible_in_tree() and control.focus_mode != Control.FOCUS_NONE:
			if control is LineEdit and not control.editable:
				continue
			control.grab_focus()
			return


func _process(_delta: float) -> void:
	if disabled:
		close_menu(true)
	elif get_viewport_rect().size != _viewport_size:
		close_menu(true)
	elif not get_viewport_rect().encloses($Menu.get_global_rect()):
		_position_menu()


func _input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed:
		if event.keycode == KEY_ESCAPE:
			close_menu(true)
			get_viewport().set_input_as_handled()
		elif event.keycode == KEY_TAB:
			close_menu()
	elif event is InputEventMouseButton and event.pressed:
		if not $Menu.get_global_rect().has_point(event.position) and not get_global_rect().has_point(event.position):
			close_menu()
