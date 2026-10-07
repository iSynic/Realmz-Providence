extends "res://src/monster_reference_picker.gd"


func _preview(index: int) -> void:
	super._preview(index)
	if not selected.is_empty(): %UseSelection.disabled = true


func receive_resource(response: Dictionary, request_generation: int, value: int) -> void:
	if not visible or request_generation != generation or int(selected.get("value", -32769)) != value: return
	if context.field != "scrollingText": receive_picture(response, request_generation, value); return
	if not response.get("ok", false):
		%Availability.text = str(response.get("error", "Exact TEXT unavailable."))
		return
	%Details.text += "\n\n" + str(response.result.get("text", ""))
	%UseSelection.disabled = not selected.get("available", false)
	_accept_after_preview()


func _activate(index: int) -> void:
	if index < 0 or index >= _rows.size(): return
	if selected.get("identity") == _rows[index].get("identity") and not %UseSelection.disabled:
		_accept(); return
	_preview(index)
	if selected.get("available", false):
		_pending_accept = {"generation": generation, "identity": selected.identity}
		_accept_after_preview()


func _accept() -> void:
	if selected.is_empty() or %UseSelection.disabled: return
	var choice := selected.duplicate(true)
	var destination := context.duplicate(true)
	# Close before updating the draft, so invalidation cannot close twice and lose origin focus.
	cancel()
	accepted.emit(choice, destination)
