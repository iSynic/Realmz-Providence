@tool
extends "res://src/item_theme.gd"


func _rebuild() -> void:
	super._rebuild()
	if not ITEM_COLORS.has(mode): return
	var c: Array = ITEM_COLORS[mode].map(func(hex: String): return Color(hex))
	for variation in ["ScenarioTitle", "ScenarioHeading", "ScenarioField"]:
		set_type_variation(variation, "ItemTitle" if variation == "ScenarioTitle" else "ItemHeading" if variation == "ScenarioHeading" else "ItemFieldLabel")
	set_color("font_color", "ScenarioTitle", c[8])
	set_color("font_color", "ScenarioHeading", c[8])
	set_type_variation("ScenarioPanel", "ItemPanel")
	set_type_variation("ScenarioPrimary", "Button")
	set_stylebox("normal", "ScenarioPrimary", make_panel_style(c[7], c[6], 1, 5, 12))
	set_stylebox("disabled", "ScenarioPrimary", make_panel_style(c[7], c[5], 1, 5, 12))
	set_type_variation("ScenarioBan", "CheckBox")
	for state in ["checked", "unchecked"]:
		var icon: Texture2D = load("res://theme/policy_%s.svg" % state)
		set_icon(state, "ScenarioBan", icon)
		set_icon(state + "_disabled", "ScenarioBan", icon)
	set_color("checkbox_checked_color", "ScenarioBan", c[6])
	set_color("checkbox_unchecked_color", "ScenarioBan", c[4])
	set_color("icon_disabled_color", "ScenarioBan", c[4])
