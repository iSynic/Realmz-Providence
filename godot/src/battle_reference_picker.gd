extends "res://src/monster_reference_picker.gd"


func begin(destination: Dictionary, source_focus: Control = null) -> void:
	super.begin(destination, source_focus)
	%Ownership.hide()
	%OpenReference.text = "Open Macro" if context.field == "battleMacro" else "Open String"
	%UseSelection.text = "Use Macro" if context.field == "battleMacro" else "Use String"
	popup_centered(Vector2i(1040, 570))


func receive_page(response: Dictionary, request_generation: int) -> void:
	super.receive_page(response, request_generation)
	if not visible or request_generation != generation or not response.get("ok", false): return
	var rows: Array = response.get("result", {}).get("page", {}).get("items", [])
	for index in rows.size():
		if rows[index].value == context.currentValue:
			%Choices.select(index)
			%Choices.ensure_current_is_visible()
			_preview(index)
			return
