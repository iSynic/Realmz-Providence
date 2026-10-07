extends "res://src/monster_reference_picker.gd"

func begin(destination: Dictionary, source_focus: Control = null) -> void:
	_limit = 40
	super.begin(destination, source_focus)
	%Ownership.hide()
	%OpenReference.hide()
	%None.text = "Unassigned"
	%UseSelection.text = "Use XAP"
	popup_centered(Vector2i(1040, 620))

func _preview(index: int) -> void:
	super._preview(index)
	if not selected.is_empty() and selected.get("available", false):
		%UseSelection.disabled = true
		%Details.text = "Loading all eight steps…"

func receive_page(response: Dictionary, request_generation: int) -> void:
	super.receive_page(response,request_generation)
	if response.get("ok",false) and visible and request_generation == generation:
		%Count.text = "%d–%d of %d matches · Current %d · Complete catalog" % [0 if _rows.is_empty() else _offset+1,_offset+_rows.size(),_total,context.currentValue]

func receive_script(response: Dictionary, request_generation: int, identity: String) -> void:
	if not visible or generation != request_generation or str(selected.get("identity", "")) != identity: return
	if not response.get("ok", false):
		%Details.text = str(response.get("error", "The script preview could not be read."))
		%UseSelection.disabled = true
		return
	var lines := PackedStringArray()
	var steps: Array = response.result.get("steps", [])
	for slot in 8:
		var matches: Array = steps.filter(func(step): return int(step.get("slot", -1)) == slot)
		var step: Dictionary = matches[0] if not matches.is_empty() else {}
		var definition: Dictionary = step.get("definition", {})
		lines.append("%d  %s · %s" % [slot + 1, str(definition.get("label", "Empty step")),preload("res://src/action_step_presentation.gd").step_detail(step,definition)])
	%Details.text = "\n".join(lines)
	%UseSelection.disabled = not selected.get("available", false)
	_accept_after_preview()

func _activate(index: int) -> void:
	if index < 0 or index >= _rows.size(): return
	if selected.get("identity") == _rows[index].get("identity") and not %UseSelection.disabled:
		_accept(); return
	_preview(index)
	if selected.get("available", false): _pending_accept = {"generation": generation, "identity": selected.identity}
