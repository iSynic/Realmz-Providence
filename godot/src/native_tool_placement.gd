extends RefCounted


static func reveal(window: Window, initial_size := Vector2i.ZERO) -> void:
	var first_open := not window.has_meta("placement_initialized")
	var screen := window.get_parent().get_window().current_screen if first_open else window.current_screen
	var area := DisplayServer.screen_get_usable_rect(screen)
	if first_open:
		window.set_meta("placement_min_size", window.min_size)
		if initial_size != Vector2i.ZERO: window.size = initial_size
		if area.size.x > 0 and area.size.y > 0:
			window.size = Vector2i(mini(window.size.x, area.size.x), mini(window.size.y, area.size.y))
			window.position = area.position + (area.size - window.size) / 2
	window.set_meta("placement_initialized", true)
	window.show(); window.grab_focus()
	_recover_frame(window)
	# Native decoration metrics become available after showing the window.
	var recovery := _recover_frame.bind(window)
	if not window.get_tree().process_frame.is_connected(recovery):
		window.get_tree().process_frame.connect(recovery, CONNECT_ONE_SHOT)


static func _recover_frame(window: Window) -> void:
	if not is_instance_valid(window) or not window.visible: return
	var area := DisplayServer.screen_get_usable_rect(window.current_screen)
	if area.size.x <= 0 or area.size.y <= 0: return
	var frame_position := window.get_position_with_decorations()
	var decoration_size := window.get_size_with_decorations() - window.size
	var available := area.size - decoration_size
	var minimum: Vector2i = window.get_meta("placement_min_size", window.min_size)
	window.min_size = Vector2i(mini(minimum.x, available.x), mini(minimum.y, available.y))
	window.size = Vector2i(mini(window.size.x, available.x), mini(window.size.y, available.y))
	var frame_size := window.get_size_with_decorations()
	var recovered := Vector2i(
		clampi(frame_position.x, area.position.x, area.end.x - frame_size.x),
		clampi(frame_position.y, area.position.y, area.end.y - frame_size.y))
	window.position += recovered - frame_position
