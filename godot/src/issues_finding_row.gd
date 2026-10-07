extends Button

signal open_requested

var _source: Label
var _problem: Label
var open_button: Button
var _severity := "error"


func _init(detailed: bool = false) -> void:
	custom_minimum_size.y = 106 if detailed else 59
	theme_type_variation = &"IssuesRow"
	toggle_mode = true
	gui_input.connect(func(event):
		if event is InputEventMouseButton and event.pressed and event.double_click and not open_button.disabled: open_requested.emit()
		elif event is InputEventKey and event.pressed and event.keycode==KEY_ENTER and not open_button.disabled: open_requested.emit())
	alignment = HORIZONTAL_ALIGNMENT_LEFT
	var inset := MarginContainer.new()
	inset.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for edge in ["left", "right"]:
		inset.add_theme_constant_override("margin_" + edge, 12 if detailed else 8)
	for edge in ["top", "bottom"]:
		inset.add_theme_constant_override("margin_" + edge, 12 if detailed else 5)
	inset.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(inset)
	var row: BoxContainer = VBoxContainer.new() if detailed else HBoxContainer.new()
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_theme_constant_override("separation", 8 if detailed else 12)
	inset.add_child(row)
	var labels := VBoxContainer.new()
	labels.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	labels.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	labels.mouse_filter = Control.MOUSE_FILTER_IGNORE
	labels.add_theme_constant_override("separation", 8 if detailed else 3)
	row.add_child(labels)
	_source = Label.new()
	_problem = Label.new()
	for label in [_source, _problem]:
		label.add_theme_font_size_override("font_size", 13 if detailed else 12)
		if detailed:
			label.custom_minimum_size.y = 17
		label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		label.mouse_filter = Control.MOUSE_FILTER_IGNORE
		labels.add_child(label)
	open_button = Button.new()
	open_button.name = "OpenSource"
	open_button.text = "Open Action" if detailed else "Open"
	if detailed:
		open_button.custom_minimum_size.x = 108
		open_button.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	open_button.custom_minimum_size.y = 32
	open_button.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	open_button.pressed.connect(func(): open_requested.emit())
	row.add_child(open_button)


func set_finding(source: String, finding: Dictionary, can_open: bool) -> void:
	_source.text = source
	_problem.text = str(finding.get("severity","error")).capitalize()+" · "+preload("res://src/issues_presentation.gd").message(finding)
	_severity = str(finding.get("severity", "error"))
	tooltip_text = source + "\n" + _problem.text
	open_button.disabled = not can_open
	open_button.hide()
	open_button.tooltip_text = "Open " + source if can_open else "No available editor destination"
	update_selection(false)


func update_selection(selected: bool) -> void:
	set_pressed_no_signal(selected)
	var token := "selected_problem" if selected else "problem"
	if _severity == "information":
		token = "secondary"
	elif _severity == "warning":
		token = "gold"
	_problem.add_theme_color_override("font_color", get_theme_color(token, "Issues"))
