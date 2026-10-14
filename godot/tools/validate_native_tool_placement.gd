extends SceneTree

const Placement = preload("res://src/native_tool_placement.gd")
var _checks := 0


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var window: Window = preload("res://src/editor_tool_window.tscn").instantiate()
	window.title = "Providence placement verification"
	root.add_child(window)
	window.show(); await _settle()
	print("DEFAULT_CLIENT_ORIGIN_FRAME position=%s frame=%s" % [window.position, window.get_position_with_decorations()])
	window.hide()
	window.reveal()
	window.reveal()
	await _settle()
	_expect(window.get_window_id() != root.get_window_id(), "Editor must have an independent native window")
	_expect(not window.borderless and not window.unresizable and not window.popup_window, "Editor must retain movable, resizable desktop chrome")
	_expect(window.position != Vector2i.ZERO, "First reveal must center editors without an explicit initial size")
	_expect(window.current_screen == root.current_screen, "First reveal must use the main window's display")
	_check_frame(window)
	for screen in DisplayServer.get_screen_count():
		var area := DisplayServer.screen_get_usable_rect(screen)
		window.position = area.position + (area.size - window.size) / 2
		await _settle()
		var moved := window.position
		window.reveal(); await _settle()
		_expect(window.position == moved, "Refocusing must preserve the user's position on display %d" % screen)
		_expect(window.current_screen == screen, "Editor must move independently to display %d" % screen)
		_check_frame(window)
		window.hide(); window.reveal(); await _settle()
		_expect(window.position == moved, "Reopening must preserve valid placement")
	window.position = Vector2i(-30000, -30000)
	window.reveal(); await _settle()
	_check_frame(window)
	window.position = DisplayServer.screen_get_usable_rect(window.current_screen).position
	window.reveal(); await _settle()
	_check_frame(window)
	# Keep the owned test window visible for independent Windows style/frame inspection.
	print("PROVIDENCE_NATIVE_PLACEMENT_READY")
	await create_timer(3).timeout
	window.free()
	var flow: Window = preload("res://src/discovery_flow_view.tscn").instantiate()
	if DisplayServer.get_screen_count() > 1:
		root.current_screen = 1; await _settle()
	root.add_child(flow)
	Placement.reveal(flow, Vector2i(1536, 836)); await _settle()
	_expect(flow.current_screen == root.current_screen, "New windows must follow a main window on another display")
	_check_frame(flow)
	flow.free()
	print("PROVIDENCE_NATIVE_PLACEMENT_OK checks=%d displays=%d" % [_checks, DisplayServer.get_screen_count()])
	quit()


func _settle() -> void:
	for frame in 8: await process_frame


func _check_frame(window: Window) -> void:
	var area := DisplayServer.screen_get_usable_rect(window.current_screen)
	var frame := Rect2i(window.get_position_with_decorations(), window.get_size_with_decorations())
	_expect(area.encloses(frame), "The complete desktop frame, including the draggable title bar, must fit inside its display: %s in %s" % [frame, area])


func _expect(value: bool, message: String) -> void:
	_checks += 1
	if not value: push_error(message); quit(1)
	assert(value, message)
