@tool
extends "res://src/item_theme.gd"


func _rebuild() -> void:
	if not ITEM_COLORS.has(mode): return
	super._rebuild()
	var c: Array = ITEM_COLORS[mode].map(func(value): return Color(value))
	default_font_size = 13
	for kind in ["HelpRoot", "HelpInset", "HelpCard"]:
		set_type_variation(kind, "PanelContainer")
	set_stylebox("panel", "HelpRoot", make_panel_style(c[0], c[5], 1, 0, 0, 0))
	set_stylebox("panel", "HelpInset", make_panel_style(c[1], c[5], 1, 12, 10, 0))
	set_stylebox("panel", "HelpCard", make_panel_style(c[1], c[5], 1, 12, 12, 0))
	set_type_variation("HelpKicker", "Label")
	set_font_size("font_size", "HelpKicker", 11)
	set_color("font_color", "HelpKicker", c[6])
	set_type_variation("HelpSecondary", "Label")
	set_font_size("font_size", "HelpSecondary", 12)
	set_color("font_color", "HelpSecondary", c[4])
	set_type_variation("HelpChapter", "Button")
	for state in ["normal", "hover", "pressed", "hover_pressed", "disabled"]:
		set_stylebox(state, "HelpChapter", make_panel_style(c[7] if state in ["pressed", "hover_pressed"] else c[1], c[6] if state in ["pressed", "hover", "hover_pressed"] else Color.TRANSPARENT, 1, 8, 8, 0))
	set_color("default_color", "RichTextLabel", c[3])
	set_color("font_color", "Label", c[3])
	set_font("normal_font", "RichTextLabel", default_font)
	set_font("bold_font", "RichTextLabel", preload("res://theme/control_fonts.gd").get_font((default_font as SystemFont).font_names, 700))
	set_font_size("normal_font_size", "RichTextLabel", 13)
	set_font_size("bold_font_size", "RichTextLabel", 13)
	set_constant("line_separation", "RichTextLabel", 3)
