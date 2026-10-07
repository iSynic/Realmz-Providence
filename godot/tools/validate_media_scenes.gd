extends SceneTree

const ROUTES := ["scenario_picture", "scenario_sound", "scenario_icon", "special_land"]
const FIELDS := ["_search", "_gallery", "_list", "_count", "_name", "_name_field", "_resource_id",
	"_dimensions", "_format", "_duration", "_source", "_payload", "_scope", "_status", "_preview",
	"_empty_preview", "_waveform", "_empty_waveform", "_play", "_apply", "_remove", "_compile",
	"_landlook", "_base_tile", "_landlook_enabled", "_base_tile_enabled", "_uses", "_missing_notice"]


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var report := {}
	for viewport_size in [Vector2i(1600, 900), Vector2i(1920, 1080)]:
		root.size = viewport_size
		root.content_scale_size = viewport_size
		for route in ROUTES:
			var view := load("res://src/%s_editor.tscn" % route).instantiate() as Control
			root.add_child(view)
			view.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
			for frame in 5: await process_frame
			var fields := _fields(view)
			assert(fields.has("_search") and fields.has("_resource_id"))
			assert(fields.has("_gallery") or fields.has("_list"))
			report["%s/%dx%d" % [route, viewport_size.x, viewport_size.y]] = fields
			_check_actions(view, route)
			view.queue_free()
			await process_frame
	var arguments := OS.get_cmdline_user_args()
	if not arguments.is_empty():
		var output := FileAccess.open(arguments[0], FileAccess.WRITE)
		assert(output != null)
		output.store_string(JSON.stringify(report, "\t"))
		output.close()
	if arguments.size() > 1:
		var baseline: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(arguments[1]))
		assert(report == baseline, "Media scene geometry or fixed field presentation changed")
	print("PROVIDENCE_MEDIA_SCENES_OK routes=4 viewports=2")
	quit()


func _fields(view: Control) -> Dictionary:
	var result := {}
	var available := {}
	for property in view.get_property_list(): available[property.name] = true
	for field in FIELDS:
		if not available.has(field): continue
		var node: Variant = view.get(field)
		if not node is Control: continue
		var rectangle := (node as Control).get_global_rect()
		var row := {"type": node.get_class(), "rect": [rectangle.position.x, rectangle.position.y,
			rectangle.size.x, rectangle.size.y], "visible": node.visible}
		if node is Label or node is LineEdit or node is Button: row["text"] = node.text
		if node is Range: row["range"] = [node.min_value, node.max_value, node.value]
		result[field] = row
	return result


func _check_actions(view: Control, route: String) -> void:
	var ranges := {"scenario_picture": [30000, 30128], "scenario_sound": [200, 500],
		"scenario_icon": [1, 32767], "special_land": [-32768, -1]}
	var import_id := view.get("_import_id") as SpinBox
	assert(import_id.min_value == ranges[route][0] and import_id.max_value == ranges[route][1])
	assert(view.get("_import_name") is LineEdit)
	assert(view.get("_file_dialog").use_native_dialog)
	if route != "scenario_sound":
		assert(view.get("_import_dither").visible == (route == "scenario_picture"))
	var events: Array = []
	view.compile_requested.connect(func(): events.append("compile"))
	view.get("_compile").pressed.emit()
	assert(events == ["compile"], "Compile is disconnected or connected twice")
	if route == "special_land":
		var enabled := view.get("_landlook_enabled") as CheckBox
		enabled.button_pressed = false
		assert(not view.get("_landlook").editable)
		enabled.button_pressed = true
		assert(view.get("_landlook").editable)
	else:
		view.library_scope_requested.connect(func(scope): events.append(scope))
		for scope in ["ScenarioAssets", "CustomLibrary", "ReferenceAssets"]:
			view.find_child(scope, true, false).pressed.emit()
		assert(events == ["compile", "scenario", "personal", "stock"])
