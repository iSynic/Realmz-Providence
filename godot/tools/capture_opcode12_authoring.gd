extends SceneTree

const XAP_ID := "extra-action-point:436"
const SLOT := 0

var _shell: Control
var _workbench: ProvidenceActionStepWorkbench


func _initialize() -> void: call_deferred("_run")


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 1:
		_fail("A single isolated project path is required.")
		return
	var output_path := OS.get_environment("PROVIDENCE_CAPTURE_PATH")
	var surface := OS.get_environment("PROVIDENCE_CAPTURE_SURFACE")
	if output_path.is_empty() or surface not in ["opcode12-land", "opcode12-special", "opcode12-dungeon"]:
		_fail("An output path and Opcode 12 surface are required.")
		return
	root.content_scale_size = DisplayServer.window_get_size()
	_shell = load("res://src/editor_shell.tscn").instantiate() as Control
	root.add_child(_shell)
	await process_frame
	await _shell._project_session.open_project(args[0])
	await _shell._navigation.select_route("scripts.macros")
	if not await _shell._scripts.open_extra_action_point(XAP_ID):
		_fail("The capture Extra Action Point could not be opened.")
		return
	var view := _shell._documents.view("scripts.macros") as Control
	_workbench = view.get_node("%SemanticActionSteps") as ProvidenceActionStepWorkbench
	await _choose_action("realmz.action.12")
	match surface:
		"opcode12-land":
			await _prepare_land(0, 8, 9, 147)
		"opcode12-special":
			await _prepare_land(4, 8, 9, -186)
		"opcode12-dungeon":
			await _prepare_dungeon()
	await _settle()
	if surface != "opcode12-dungeon":
		await _open_palette()
	var image := root.get_viewport().get_texture().get_image()
	if image == null or image.save_png(output_path) != OK:
		_fail("The native Opcode 12 capture could not be saved.")
		return
	print("PROVIDENCE_OPCODE12_CAPTURE_OK %s %s" % [surface, output_path])
	_shell._bridge.stop()
	_shell.queue_free()
	await process_frame
	quit(0)


func _choose_action(action_identity: String) -> void:
	_workbench.focus_slot(SLOT)
	assert(preload("res://tools/divinity_picker_test_actions.gd").choose(_workbench, action_identity), "Missing action %s" % action_identity)
	await _settle()



func _prepare_land(level: int, x: int, y: int, value: int) -> void:
	await _select_choice("isDungeon", 0)
	_set_spin("level", level)
	_set_spin("xOrDungeonY", x)
	_set_spin("yOrDungeonX", y)
	_workbench._field_renderer.accept_target("tileValue", value)
	await _settle()
	await _select_choice("land.markerBand", 2 if value == 147 else 0)
	if _workbench._field_controls.has("land.note"):
		await _select_choice("land.note", 0)
		await _select_choice("land.path", 0)


func _prepare_dungeon() -> void:
	await _select_choice("isDungeon", 1)
	_set_spin("level", 0)
	_set_spin("xOrDungeonY", 7)
	_set_spin("yOrDungeonX", 12)
	_workbench._field_renderer.accept_target("tileValue", 4353)
	await _settle()
	assert(_selected_choice("dungeon.wall") == 1)
	assert(_selected_choice("dungeon.allowNorth") == 1)
	assert(_selected_choice("dungeon.horizontalDoor") == 0)


func _set_spin(key: String, value: int) -> void:
	var control := _workbench._field_controls[key].control as Control
	if control is SpinBox:
		(control as SpinBox).value = value
		return
	if control is OptionButton:
		var picker := control as OptionButton
		for index in picker.item_count:
			if int(picker.get_item_metadata(index)) == value:
				picker.select(index)
			picker.item_selected.emit(index)
			return
	if control is Button:
		_workbench._field_renderer.accept_target(key, value)
		return
	assert(false, "Field %s does not expose numeric or named choices." % key)


func _select_choice(key: String, value: int) -> void:
	var picker := _workbench._field_controls[key].control as OptionButton
	for index in picker.item_count:
		if int(picker.get_item_metadata(index)) != value:
			continue
		picker.select(index)
		picker.item_selected.emit(index)
		await _settle()
		return
	assert(false, "Missing choice %s=%d" % [key, value])


func _selected_choice(key: String) -> int:
	var picker := _workbench._field_controls[key].control as OptionButton
	return int(picker.get_item_metadata(picker.selected))


func _open_palette() -> void:
	var descriptor := _workbench._field_controls.tileValue as Dictionary
	var preview := descriptor.field.get("valuePickerPreview", {}) as Dictionary
	var expected := str(preview.get("label", ""))
	for child in (descriptor.control as Control).get_parent().get_children():
		if child is Button and (child as Button).text == expected:
			(child as Button).pressed.emit()
			await _settle()
			assert(_workbench._target_panel.visible)
			return
	assert(false, "The visual palette command was not rendered.")


func _settle() -> void:
	var deadline := Time.get_ticks_msec() + 60000
	var idle := 0
	while idle < 4:
		if Time.get_ticks_msec() >= deadline:
			_fail("Opcode 12 capture did not settle.")
			return
		await process_frame
		var pending: bool = _shell._scripts._form_description_drain_running or not _shell._scripts._pending_form_descriptions.is_empty()
		idle = 0 if _shell._operations.busy or pending or _workbench._form_description.is_empty() else idle + 1


func _fail(message: String) -> void:
	push_error(message)
	if _shell != null:
		_shell._bridge.stop()
		_shell.queue_free()
	quit(2)
