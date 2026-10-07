@tool
extends "res://src/item_theme.gd"

func _rebuild() -> void:
	if not ITEM_COLORS.has(mode): return
	super._rebuild()
	var colors: Array = ITEM_COLORS[mode].map(func(hex: String): return Color(hex))
	for pair in [["StoryTitle",6],["StoryMacroTitle",8],["StoryMacroHeading",8],["StoryStyleHeading",11],["StoryUsesHeading",9]]:
		set_type_variation(pair[0],"ItemTitle" if pair[0].ends_with("Title") else "ItemHeading")
		set_color("font_color",pair[0],colors[pair[1]])
