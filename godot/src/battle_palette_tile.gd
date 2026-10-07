extends Button

const TooltipScene = preload("res://src/battle_palette_tooltip.tscn")


func _make_custom_tooltip(for_text: String) -> Object:
	var tooltip: PanelContainer = TooltipScene.instantiate()
	var panel := get_theme_stylebox("normal").duplicate() as StyleBoxFlat
	panel.bg_color.a = 1.0
	panel.content_margin_left = 10; panel.content_margin_right = 10
	panel.content_margin_top = 8; panel.content_margin_bottom = 8
	tooltip.add_theme_stylebox_override("panel", panel)
	var facts: Label = tooltip.get_node("Facts")
	facts.text = for_text
	facts.add_theme_color_override("font_color", get_theme_color("font_color"))
	facts.add_theme_font_override("font", get_theme_font("font"))
	facts.add_theme_font_size_override("font_size", get_theme_font_size("font_size"))
	return tooltip
