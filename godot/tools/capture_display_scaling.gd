extends SceneTree

var _shell: Control
var _out := ""
var _logical := Vector2i(1600, 900)
var _receipts: Array[Dictionary] = []


func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	create_timer(90).timeout.connect(func(): push_error("UI scaling capture timed out"); quit(1))
	_out = OS.get_environment("PROVIDENCE_SCALE_REVIEW_ROOT")
	assert(not _out.is_empty() and not OS.get_environment("PROVIDENCE_DISPLAY_SETTINGS_PATH").is_empty())
	if OS.get_environment("PROVIDENCE_SCALE_REVIEW_WIDE") == "1": _logical = Vector2i(1920, 1080)
	var display := root.get_node("DisplaySettings")
	display.set_preference("100")
	root.size = _logical
	_shell = load("res://src/editor_shell.tscn").instantiate()
	_shell._bridge = ProvidenceNativeBridge.new(OS.get_environment("PROVIDENCE_SCALE_REVIEW_SETTINGS"))
	root.add_child(_shell)
	if not _shell.startup_presentable: await _shell.startup_completed
	await _shell._project_session.open_project(OS.get_environment("PROVIDENCE_SCALE_REVIEW_PROJECT"))
	await _settle()
	await _shell._navigation.select_route("scenario.startup")
	await _settle()
	var before: Dictionary = _shell._session_view.context().duplicate(true)
	assert(before.connected)
	var editor = _shell._documents.view("scenario.startup")
	var field: LineEdit = editor.text_field("ScenarioName")
	assert(not field.text.is_empty(), "The original scenario must populate the authoring form")
	await _capture("baseline-100")
	field.text += " · retained draft"
	field.text_changed.emit(field.text)
	field.grab_focus()
	field.caret_column = 8
	var draft := field.text
	await _shell._commands.dispatch(&"view.ui-scale.150")
	await _settle()
	assert(root.content_scale_factor > 1.0)
	# File-backed capture may extend past this low-DPI monitor. Record its actual
	# render dimensions; this demonstrates manual scaling, not a Zenbook DPI event.
	root.size = Vector2i(Vector2(_logical) * root.content_scale_factor)
	await _settle()
	assert(_shell.size.is_equal_approx(Vector2(_logical)))
	assert(field.text == draft and field.caret_column == 8 and field.has_focus())
	assert(editor.has_unapplied_changes())
	assert(_shell._session_view.context().revision == before.revision)
	assert(_shell._command_bar.get_global_rect().end.x <= _logical.x)
	await _capture("scaled-150-draft")
	await _show_scale_menu()
	await _capture("scale-menu-150")
	_shell._application_menu.get_node("View/UIScale").hide()
	_shell._application_menu.get_node("View").hide()
	editor.discard_draft()
	await _shell._navigation.open_first_map("land")
	await _settle()
	await _map_pointer()
	var reset := InputEventKey.new()
	reset.keycode = KEY_0
	reset.ctrl_pressed = true
	reset.alt_pressed = true
	reset.pressed = true
	Input.parse_input_event(reset)
	await _settle()
	assert(root.content_scale_factor == 1.0 and _shell._session_view.context().revision == before.revision)
	_shell._close_project()
	_shell.queue_free()
	await _settle()
	_finish()


func _finish() -> void:
	var receipt := {"logicalViewport": _logical, "captures": _receipts,
		"checks": "real imported startup; menu command; draft/caret/focus retained; map pointer; no revision change; Ctrl+Alt+0 keyboard reset executed",
		"display": {"dpi": DisplayServer.screen_get_dpi(), "scale": DisplayServer.screen_get_scale(), "usableRect": DisplayServer.screen_get_usable_rect()},
		"limitations": "Manual scaling on the current display; actual Zenbook and mixed-DPI display transitions remain untested."}
	FileAccess.open(_out.path_join("receipt-%dx%d.json" % [_logical.x, _logical.y]), FileAccess.WRITE).store_string(JSON.stringify(receipt, "  ") + "\n")
	print("PROVIDENCE_DISPLAY_SCALING_SHELL_OK logical=%s captures=%d draft=retained revision=unchanged pointer=scaled" % [_logical, _receipts.size()])
	quit()


func _show_scale_menu() -> void:
	_shell._commands.refresh()
	var view: PopupMenu = _shell._application_menu.get_node("View")
	view.popup(Rect2i(350, 52, 0, 0))
	for index in view.item_count:
		if view.get_item_text(index) == "UI Scale": view.set_focused_item(index)
	var event := InputEventKey.new()
	event.keycode = KEY_RIGHT
	event.pressed = true
	Input.parse_input_event(event)
	await create_timer(0.3).timeout
	await _settle()
	assert(_shell._application_menu.get_node("View/UIScale").visible, "View > UI Scale must open through keyboard navigation")


func _map_pointer() -> void:
	var canvas: ProvidenceMapCanvas = _shell._documents.view("maps.land").get_node("%LandMapCanvas")
	var cell := Vector2i(45, 45)
	canvas.reveal_cell(cell.x, cell.y)
	var local := canvas.cell_rect(cell).get_center()
	var viewport_point := canvas.get_global_transform_with_canvas() * local
	var screen_point := root.get_screen_transform() * viewport_point
	var canvas_to_screen := root.get_screen_transform() * canvas.get_global_transform_with_canvas()
	var recovered := canvas_to_screen.affine_inverse() * screen_point
	assert(recovered.distance_to(local) < 0.25, "Scaled coordinates must round trip within a quarter pixel")
	var selected: Array[Vector2i] = []
	canvas.record_selection_requested.connect(func(value, _point): selected.append(value))
	for pressed in [true, false]:
		var event := InputEventMouseButton.new()
		event.position = root.get_stretch_transform() * viewport_point
		event.button_index = MOUSE_BUTTON_LEFT
		event.pressed = pressed
		root.push_input(event)
		await process_frame
	assert(selected.has(cell), "A physical pointer location must select the intended scaled map cell")
	var before := canvas.zoom_percent()
	root.get_node("DisplaySettings").refresh_displays()
	assert(canvas.zoom_percent() == before, "UI scale does not change map zoom")


func _capture(state: String) -> void:
	if OS.get_environment("PROVIDENCE_SCALE_REVIEW_BEHAVIOR_ONLY") == "1": return
	await create_timer(0.4).timeout
	await _settle()
	await RenderingServer.frame_post_draw
	var name := "%s-%dx%d.png" % [state, _logical.x, _logical.y]
	var image := root.get_texture().get_image()
	assert(image.save_png(_out.path_join(name)) == OK)
	_receipts.append({"state": state, "path": name, "physicalSize": image.get_size(), "scale": root.content_scale_factor,
		"logicalSize": _shell.size, "revision": _shell._session_view.context().revision})


func _settle() -> void:
	for frame in 8: await process_frame
	while is_instance_valid(_shell) and _shell._operations.busy: await _shell._operations.completed
