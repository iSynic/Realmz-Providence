extends PanelContainer

signal choose_requested
signal clear_requested
signal open_requested
signal selected

@export var hook := "start"
@export var condition := "New adventure starts"

func _ready() -> void:
	%HookName.text = hook.to_upper()
	%Condition.text = condition
	%Choose.pressed.connect(func(): selected.emit(); choose_requested.emit())
	%Clear.pressed.connect(func(): selected.emit(); clear_requested.emit())
	%Open.pressed.connect(func(): selected.emit(); open_requested.emit())
	gui_input.connect(func(event):
		if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT: selected.emit())

func present(target: Variant, description: String, available: bool, active: bool, locked: bool) -> void:
	%Assignment.text = "Unassigned" if target == null else "XAP %d · %s" % [target, description]
	%Assignment.tooltip_text = %Assignment.text
	%Choose.disabled = locked
	%Clear.disabled = locked or target == null
	%Open.disabled = locked or not available
	var style := get_theme_stylebox("panel").duplicate() as StyleBoxFlat
	if style != null:
		style.border_color = get_theme_color("font_color", "StoryMacroHeading") if active else get_theme_color("font_disabled_color", "Button")
		if active: style.bg_color = get_theme_stylebox("pressed", "Button").bg_color
		style.set_border_width_all(2 if active else 1)
		style.set_content_margin_all(10)
		add_theme_stylebox_override("panel", style)

func choice_focus() -> Control:
	return %Choose
