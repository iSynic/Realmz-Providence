extends "res://src/spell_reference_picker.gd"

func show_item_preview(response: Dictionary) -> void:
	%Pictures.visible = response.get("texture") != null
	%Base.texture = response.get("texture")
	%Base.show(); %Facing.hide()
	for frame in 8: get_node("Margin/Layout/Panes/Preview/Pictures/SpellFrame" + str(frame)).hide()
	if response.get("ok", false):
		var definition: Dictionary = response.get("definition", {})
		%Details.text = "%s\n\n%s" % [str(definition.get("name", "")), str(definition.get("description", ""))]
	else: %Availability.text = str(response.get("error", "The item preview could not be loaded. Your slot is kept."))
