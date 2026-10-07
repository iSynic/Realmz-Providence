@tool
extends "res://theme/scenario_control_theme.gd"

const ITEM_COLORS := {
	"dark": ["12161b", "0a1219", "171b20", "edf4fb", "9eb1c2", "27313c", "9dcfff", "10283d", "ffd37a", "a7f3c3", "ffb29e", "cfb7ff"],
	"light": ["ffffff", "eef3f7", "e9eef3", "18232d", "42596e", "b6c3ce", "005fa8", "ddefff", "795100", "176236", "943a23", "67408d"],
	"high-contrast": ["000000", "080808", "131313", "ffffff", "ffffff", "ffffff", "7ad7ff", "003866", "ffe161", "71ff91", "ffb29e", "dabfff"],
}


func _rebuild() -> void:
	if not ITEM_COLORS.has(mode): return
	set_block_signals(true)
	super._rebuild()
	var c: Array = ITEM_COLORS[mode].map(func(hex: String): return Color(hex))
	var bold := SystemFont.new()
	bold.font_names = (default_font as SystemFont).font_names
	bold.font_weight = 700
	for variation in ["ItemHeading", "ItemTitle", "ItemName", "ItemFieldLabel", "ItemContext", "ItemId"]:
		set_type_variation(variation, "Label")
	for variation in ["ItemHeading", "ItemTitle", "ItemName", "ItemFieldLabel"]:
		set_font("font", variation, bold)
	set_font_size("font_size", "ItemTitle", 19)
	set_font_size("font_size", "ItemFieldLabel", 11)
	set_font_size("font_size", "ItemContext", 11)
	set_font_size("font_size", "ItemId", 12)
	set_color("font_color", "Label", c[3])
	set_color("font_color", "ItemHeading", c[6])
	set_color("font_color", "ItemFieldLabel", c[6])
	set_color("font_color", "ItemContext", c[4])
	set_color("font_color", "ItemId", c[8])
	for pair in [["Equipment", 9], ["Damage", 10], ["Special", 8], ["Restrictions", 11], ["Uses", 9]]:
		_section_theme(pair[0], c[pair[1]], c[0], c[5])
	for type in ["ItemPanel", "ItemInventory", "ItemHero", "ItemThumbnail"]:
		set_type_variation(type, "PanelContainer")
		set_stylebox("panel", type, make_panel_style(c[1] if type == "ItemThumbnail" else c[0], c[5], 1, 6 if density == "compact" else 10, 10))
	set_stylebox("panel", "ItemThumbnail", make_panel_style(c[1], c[5], 1, 4, 4))
	for type in ["LineEdit", "TextEdit"]:
		set_stylebox("normal", type, make_panel_style(c[1], c[5], 1, 5, 7))
		set_stylebox("read_only", type, make_panel_style(c[1], c[5], 1, 5, 7))
		set_color("font_uneditable_color" if type == "LineEdit" else "font_readonly_color", type, c[3])
	for state in ["normal", "disabled", "hover", "pressed", "hover_pressed"]:
		set_stylebox(state, "Button", make_panel_style(c[7] if state in ["pressed", "hover_pressed"] else c[2], c[6] if state in ["hover", "pressed", "hover_pressed"] else c[5], 1, 5, 8))
	set_type_variation("ItemCurrentRoute", "Button")
	set_stylebox("disabled", "ItemCurrentRoute", get_stylebox("pressed", "Button"))
	set_color("font_disabled_color", "ItemCurrentRoute", c[3])
	set_type_variation("ItemRow", "Button")
	set_stylebox("normal", "ItemRow", make_panel_style(c[1], c[5], 1, 4, 4))
	set_stylebox("pressed", "ItemRow", make_panel_style(c[7], c[6], 1, 4, 4))
	set_stylebox("hover_pressed", "ItemRow", get_stylebox("pressed", "ItemRow"))
	set_stylebox("hover", "ItemRow", make_panel_style(c[2], c[6], 1, 4, 4))
	set_block_signals(false)
	emit_changed()


func _section_theme(role: String, accent: Color, surface: Color, border: Color) -> void:
	set_type_variation("Item" + role + "Heading", "ItemHeading")
	set_color("font_color", "Item" + role + "Heading", accent)
	set_type_variation("Item" + role + "Panel", "PanelContainer")
	var fill := surface.lerp(accent, 0.025 if mode == "dark" else 0.045)
	if mode == "high-contrast": fill = surface
	set_stylebox("panel", "Item" + role + "Panel", make_panel_style(fill, border, 1, 6 if density == "compact" else 10, 10))
