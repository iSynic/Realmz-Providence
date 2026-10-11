@tool
extends "res://src/item_theme.gd"


func _rebuild() -> void:
	super._rebuild()
	var heading := preload("res://theme/control_fonts.gd").get_font(PackedStringArray(["JetBrains Mono", "Consolas"]), 700)
	for type in ["MediaHeading", "MediaTitle", "MediaCollectionHeading"]:
		set_type_variation(type, "Label")
		set_font("font", type, heading)
		set_font_size("font_size", type, 18 if type == "MediaTitle" else 13)
		set_color("font_color", type, get_color("font_color", "ItemRestrictionsHeading" if type == "MediaCollectionHeading" else "ItemHeading"))
