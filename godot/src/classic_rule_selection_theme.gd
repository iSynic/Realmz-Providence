@tool
extends "res://src/player_scenario_theme.gd"


func _rebuild() -> void:
	super._rebuild()
	if not ITEM_COLORS.has(mode): return
	var c: Array = ITEM_COLORS[mode].map(func(hex: String): return Color(hex))
	set_type_variation("RuleSurface", "PanelContainer")
	set_stylebox("panel", "RuleSurface", make_panel_style(Color(PALETTES[mode][0]), c[5], 1, 0, 0, 0))
	set_type_variation("RulePreview", "PanelContainer")
	set_stylebox("panel", "RulePreview", make_panel_style(c[1], c[5], 1, 0, 0, 0))
	for variation in ["RuleText", "RuleContext", "RuleSaved", "RuleWarning", "RuleError"]:
		set_type_variation(variation, "Label")
		set_font_size("font_size", variation, 12)
	set_color("font_color", "RuleContext", c[4])
	set_color("font_color", "RuleSaved", c[6])
	set_color("font_color", "RuleWarning", c[8])
	set_color("font_color", "RuleError", c[10])
	set_font_size("font_size", "ScenarioHeading", 14)
