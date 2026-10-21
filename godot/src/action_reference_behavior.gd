class_name ProvidenceActionReferenceBehavior
extends RefCounted


static func add(group: VBoxContainer, control: Control, field: Dictionary, apply: Callable) -> CheckBox:
	var behavior: Dictionary = field.get("referenceBehavior", {}) if field.get("referenceBehavior") is Dictionary else {}
	if behavior.is_empty(): return null
	var checkbox := CheckBox.new()
	checkbox.text = str(behavior.label)
	checkbox.set_pressed_no_signal(bool(behavior.checked))
	checkbox.disabled = behavior.get("toggleValue") == null or not bool(field.get("editable", false))
	checkbox.tooltip_text = str(behavior.get("unavailableReason", "")) if behavior.get("unavailableReason") != null else "Keep the selected resource and change its behavior."
	checkbox.toggled.connect(func(_pressed):
		if checkbox.disabled or behavior.get("toggleValue") == null: return
		checkbox.disabled = true
		# A newer resource selection is awaiting its revision of the form.
		if value_of(control) != int(field.value): return
		var value := int(behavior.toggleValue)
		set_value(control, value)
		apply.call(value))
	group.add_child(checkbox)
	for key in ["note", "unavailableReason"]:
		if behavior.get(key) == null: continue
		var note := Label.new()
		note.text = str(behavior[key])
		note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		group.add_child(note)
	return checkbox


static func selection(field: Dictionary, selected: int, kind: String) -> Dictionary:
	var behavior: Dictionary = field.get("referenceBehavior", {}) if field.get("referenceBehavior") is Dictionary else {}
	var value := selected
	if not behavior.is_empty() and kind == str(behavior.targetKind):
		value *= int(behavior.selectionMultiplier)
		if value < int(field.minimum) or value > int(field.maximum):
			if value != int(field.value):
				return {"ok": false, "error": "This resource cannot keep the selected behavior within this setting's limits. " + str(behavior.get("unavailableReason", "Choose another resource."))}
	if value < -32768 or value > 32767:
		return {"ok": false, "error": "The selected resource is outside this action's supported range."}
	return {"ok": true, "value": value}


static func set_value(control: Control, value: int) -> void:
	control.set_meta("value", value)
	if control is SpinBox: control.set_value_no_signal(value)


static func value_of(control: Control) -> int:
	if control is OptionButton: return int(control.get_item_metadata(control.selected))
	if control is SpinBox: return int(control.value)
	return int(control.get_meta("value", 0))
