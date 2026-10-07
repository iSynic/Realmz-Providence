@tool
extends Theme

const PALETTES := {
	"dark": ["111820", "152230", "2b3c4d", "f2f7ff", "9fb2c4", "8e9aa8", "66b5ff", "ff7f8c", "214969"],
	"light": ["fffdf7", "e8e1d2", "8b8170", "1a211f", "5b625d", "666258", "005da8", "a11d2c", "ccdfef"],
	"high-contrast": ["000000", "101010", "ffffff", "ffffff", "ffffff", "bdbdbd", "00ffff", "ff00ff", "003d3d"],
}

@export_enum("dark", "light", "high-contrast") var mode := "dark":
	set(value):
		mode = value
		_rebuild()
@export_enum("balanced", "compact") var density := "balanced":
	set(value):
		density = value
		_rebuild()


func _init() -> void:
	_rebuild()


func _rebuild() -> void:
	if not PALETTES.has(mode):
		return
	var colors: Array = PALETTES[mode].map(func(hex: String): return Color(hex))
	var font := SystemFont.new()
	font.font_names = PackedStringArray(["JetBrains Mono", "Cascadia Mono", "Consolas"])
	default_font = font
	default_font_size = 13
	var padding := 5.5 if density == "compact" else 8.5
	var normal := make_panel_style(colors[1], colors[2], 1, padding)
	var hover := make_panel_style(colors[1], colors[6], 1, padding)
	var pressed := make_panel_style(colors[8], colors[6], 1, padding)
	var focus := make_panel_style(Color.TRANSPARENT, colors[6], 2, padding)
	for type in ["Button", "LineEdit", "TextEdit", "ItemList", "Label"]:
		set_color("font_color", type, colors[3])
		set_color("font_selected_color", type, colors[3])
		set_stylebox("focus", type, focus)
	for state in ["normal", "disabled"]:
		set_stylebox(state, "Button", normal)
	set_stylebox("hover", "Button", hover)
	set_stylebox("pressed", "Button", pressed)
	set_stylebox("hover_pressed", "Button", pressed)
	for state in ["font_hover_color", "font_pressed_color", "font_hover_pressed_color", "font_focus_color"]:
		set_color(state, "Button", colors[3])
	set_color("font_disabled_color", "Button", colors[5])
	for type in ["LineEdit", "TextEdit"]:
		set_stylebox("normal", type, normal)
		set_stylebox("read_only", type, normal)
		set_color("selection_color", type, colors[8])
	set_color("font_uneditable_color", "LineEdit", colors[3])
	set_color("font_readonly_color", "TextEdit", colors[3])
	set_color("background_color", "TextEdit", Color.TRANSPARENT)
	set_stylebox("panel", "PanelContainer", make_panel_style(colors[0], colors[2], 1, 16, 16, 0))
	set_stylebox("panel", "ItemList", make_panel_style(colors[0], colors[2], 1, 0, 0, 0))
	var row_padding := 2.0 if density == "compact" else 3.0
	set_stylebox("selected", "ItemList", make_panel_style(colors[8], colors[2], 1, row_padding, 8, 0))
	set_stylebox("selected_focus", "ItemList", make_panel_style(colors[8], colors[6], 2, row_padding, 8, 0))
	set_constant("v_separation", "ItemList", int(row_padding * 2))
	for type in ["VBoxContainer", "HBoxContainer"]:
		set_constant("separation", type, 6 if density == "compact" else 8)
	for variation in ["ScenarioSecondary", "ScenarioDiagnostic"]:
		set_type_variation(variation, "Label")
	set_color("font_color", "ScenarioSecondary", colors[4])
	set_color("font_color", "ScenarioDiagnostic", colors[7])


func make_panel_style(fill: Color, border: Color, width: int, vertical: float, horizontal := 8.0, radius := 4) -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = fill
	box.border_color = border
	box.set_border_width_all(width)
	box.set_corner_radius_all(radius)
	box.content_margin_left = horizontal
	box.content_margin_right = horizontal
	box.content_margin_top = vertical
	box.content_margin_bottom = vertical
	return box
