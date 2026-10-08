class_name ProvidenceActionFieldRenderer
extends RefCounted

const Presentation = preload("res://src/action_step_presentation.gd")

signal changed(key: String, value: int, binding: String)
signal search_requested(key: String, kind: String)
signal open_requested(kind: String, value: int, identity: String, context: Dictionary)
signal preview_requested(kind: String, value: int, identity: String, status: String)

var controls := {}
var _missing_settings := false


func render(form: GridContainer, description: Dictionary, missing_settings := false) -> void:
	controls.clear()
	_missing_settings = missing_settings
	var groups := (description.get("authoring", {}) as Dictionary).get("controls", []) as Array
	var members := {}
	for group in groups:
		for key in group.memberFields: members[key] = group
	var inserted := {}
	for field in description.get("fields", []):
		if bool(field.get("preserved", false)): continue
		if not bool(field.get("visible", true)): continue
		var key := str(field.key)
		if members.has(key):
			var mode := members[key] as Dictionary
			if not inserted.has(mode.key):
				_add_mode(form, mode)
				inserted[mode.key] = true
			if not mode.activeFields.has(key): continue
			_add_field(form, field, "authoring-selection")
		else:
			_add_field(form, field, str(field.row))
	_add_standalone_modes(form, groups)


func _add_standalone_modes(form: GridContainer, groups: Array) -> void:
	var standalone := groups.filter(func(mode): return (mode.get("memberFields", []) as Array).is_empty())
	if standalone.is_empty(): return
	var section := VBoxContainer.new()
	section.add_theme_constant_override("separation", 5)
	var title := Label.new()
	var dungeon := standalone.all(func(mode): return str(mode.get("key", "")).begins_with("dungeon."))
	title.text = "DUNGEON CELL FEATURES" if dungeon else "LAND CELL MARKERS"
	section.add_child(title)
	var grid_margin := MarginContainer.new()
	grid_margin.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	grid_margin.add_theme_constant_override("margin_right", 28)
	section.add_child(grid_margin)
	var grid := GridContainer.new()
	grid.columns = 2
	grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	grid.add_theme_constant_override("h_separation", 10)
	grid.add_theme_constant_override("v_separation", 3)
	grid_margin.add_child(grid)
	var notes := []
	for mode in standalone:
		var compact := (mode as Dictionary).duplicate(true)
		compact["compact"] = str(compact.get("key", "")) != "land.markerBand"
		var display := str(compact.get("display", ""))
		compact["display"] = ""
		_add_mode(grid, compact)
		if not display.is_empty() and display not in notes: notes.append(display)
	for display in notes:
		var note := Label.new()
		note.text = str(display)
		note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		section.add_child(note)
	form.add_child(section)


func _add_mode(form: GridContainer, mode: Dictionary) -> void:
	var field := {"key": mode.key, "label": mode.label, "value": mode.value,
		"choices": mode.choices, "editable": true, "row": "authoring-mode",
		"compact": bool(mode.get("compact", false))}
	_add_field(form, field, "authoring-mode")
	if not str(mode.display).is_empty():
		var note := Label.new()
		note.text = str(mode.display)
		note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		form.get_child(-1).add_child(note)


func _add_field(form: GridContainer, field: Dictionary, binding: String) -> void:
	var rendered := field.duplicate(true)
	var value_picker_kind := Presentation.optional_text(field.get("valuePickerKind"))
	if not value_picker_kind.is_empty(): rendered["compact"] = true
	var group := VBoxContainer.new()
	group.add_theme_constant_override("separation", 3)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 6)
	group.add_child(row)
	var caption := Label.new()
	caption.text = str(field.get("label", "Setting"))
	caption.custom_minimum_size.x = 125 if bool(rendered.get("compact", false)) else 225
	caption.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	row.add_child(caption)
	var control := _control(rendered)
	row.add_child(control)
	var key := str(field.key)
	controls[key] = {"control": control, "row": binding, "field": rendered}
	if control is OptionButton:
		control.item_selected.connect(func(_index): changed.emit(key, value_of(control), binding))
	elif control is SpinBox:
		control.value_changed.connect(func(_value): changed.emit(key, value_of(control), binding))
	var kind := Presentation.optional_text(field.get("targetKind"))
	var multiple := (field.get("uses", []) as Array).size() > 1
	if not kind.is_empty() and not multiple: _add_reference_commands(row, control, field, kind)
	if not value_picker_kind.is_empty():
		_add_value_picker_command(row, field, value_picker_kind)
		_add_value_picker_source_command(row, control, field, value_picker_kind)
	var decorated := field.duplicate(true)
	if multiple: decorated["preview"] = null
	Presentation.decorate_field(group, caption, control, decorated, true)
	if multiple: _add_uses(group, field)
	form.add_child(group)


func _add_uses(group: VBoxContainer, field: Dictionary) -> void:
	for usage in field.uses:
		var row := HBoxContainer.new()
		var label := Label.new()
		label.text = str(usage.label)
		label.custom_minimum_size.x = 225
		row.add_child(label)
		if usage.get("targetKind") != null:
			var effect := field.duplicate(true)
			effect.targetKind = usage.targetKind
			effect.preview = usage.preview
			effect.control = "target"
			var picker := _control(effect)
			row.add_child(picker)
			_add_reference_commands(row, picker, effect, str(usage.targetKind))
		else:
			var value := Label.new()
			value.text = "Not active" if usage.role == "inactive" else str(field.value)
			row.add_child(value)
		group.add_child(row)


func _control(field: Dictionary) -> Control:
	var choices := field.get("choices", []) as Array
	var value := int(field.get("value", 0))
	var control: Control
	if not choices.is_empty():
		control = _choice_control(choices, value)
	elif field.get("targetKind") != null and str(field.get("control", "target")) != "integer":
		var picker := Button.new()
		var preview := field.get("preview") as Dictionary if field.get("preview") is Dictionary else {}
		picker.text = str(preview.get("label", "Select content…"))
		if field.targetKind in ["message", "option-label"] and not preview.is_empty():
			picker.text = str(preview.get("detail", "")).replace("\n", " ")
			if picker.text.is_empty(): picker.text = "%s · Empty" % str(preview.get("label", "Content"))
		picker.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		picker.set_meta("value", value)
		picker.tooltip_text = str(preview.get("detail", "Choose referenced content by name."))
		picker.pressed.connect(func(): search_requested.emit(str(field.key), str(field.targetKind)))
		control = picker
	else:
		var input := SpinBox.new()
		input.min_value = min(int(field.get("minimum", -32768)), value)
		input.max_value = max(int(field.get("maximum", 32767)), value)
		input.value = value
		control = input
	control.custom_minimum_size = Vector2(105 if bool(field.get("compact", false)) else 190, 30)
	control.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	if control is BaseButton: control.disabled = not bool(field.get("editable", false))
	if control is SpinBox: control.editable = bool(field.get("editable", false))
	return control


func _choice_control(choices: Array, selected: int) -> OptionButton:
	var picker := OptionButton.new()
	var matched := false
	for choice in choices:
		picker.add_item(str(choice.label))
		picker.set_item_metadata(picker.item_count - 1, int(choice.value))
		if int(choice.value) == selected:
			picker.select(picker.item_count - 1)
			matched = true
	if not matched:
		picker.add_item(("Default (%d)" if _missing_settings else "Imported value (%d)") % selected)
		picker.set_item_metadata(picker.item_count - 1, selected)
		picker.select(picker.item_count - 1)
	return picker


func _add_reference_commands(row: HBoxContainer, control: Control, field: Dictionary, kind: String) -> void:
	var identity := preview_identity(field)
	var status := preview_status(field)
	if kind == "sound":
		for command in [{"label": "▶ Play", "kind": kind}, {"label": "■ Stop", "kind": "sound-stop"}]:
			var button := Button.new()
			button.text = command.label
			button.pressed.connect(func(): preview_requested.emit(command.kind, value_of(control), identity, status))
			row.add_child(button)
	var open := Button.new()
	open.text = "Open in Stock Library" if status == "application-resource" else "Edit labels" if kind == "option-label" else "Edit String" if kind == "message" else "Open in Editor"
	open.disabled = identity.is_empty()
	open.tooltip_text = "Open the exact referenced content." if not open.disabled else "Select available content to open it."
	var context := (field.get("targetContext", {}) as Dictionary).duplicate(true)
	context["targetStatus"] = status
	open.pressed.connect(func(): open_requested.emit(kind, value_of(control), identity, context))
	row.add_child(open)


func _add_value_picker_command(row: HBoxContainer, field: Dictionary, kind: String) -> void:
	var picker := Button.new()
	var preview := field.get("valuePickerPreview") as Dictionary if field.get("valuePickerPreview") is Dictionary else {}
	picker.text = str(preview.get("label", "Choose…"))
	picker.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	picker.custom_minimum_size.x = 180
	picker.disabled = not bool(field.get("editable", false))
	picker.tooltip_text = str(preview.get("detail", "Choose a known value; numeric entry remains available."))
	picker.pressed.connect(func(): search_requested.emit(str(field.key), kind))
	row.add_child(picker)


func _add_value_picker_source_command(row: HBoxContainer, control: Control, field: Dictionary, kind: String) -> void:
	if kind != "map-tile": return
	var preview := field.get("valuePickerPreview") as Dictionary if field.get("valuePickerPreview") is Dictionary else {}
	var identity := str(preview.get("identity", ""))
	var status := str(preview.get("status", ""))
	var open := Button.new()
	open.text = "Open in Stock Assets" if status == "application-resource" else "Open in Scenario Assets" if status == "compatibility-resource" else "Open destination map"
	open.disabled = identity.is_empty()
	open.tooltip_text = "Open the exact artwork source." if status in ["application-resource", "compatibility-resource"] else "Open the destination map that supplies this cell palette."
	var context := (field.get("targetContext", {}) as Dictionary).duplicate(true)
	context["targetStatus"] = status
	open.pressed.connect(func(): open_requested.emit(kind, value_of(control), identity, context))
	row.add_child(open)


func accept_target(key: String, value: int) -> void:
	if not controls.has(key): return
	var descriptor := controls[key] as Dictionary
	var control := descriptor.control as Control
	control.set_meta("value", value)
	if control is SpinBox: control.set_value_no_signal(value)
	changed.emit(key, value, str(descriptor.row))


static func preview_identity(field: Dictionary) -> String:
	var preview := field.get("preview") as Dictionary if field.get("preview") is Dictionary else {}
	return str(preview.get("identity", ""))


static func preview_status(field: Dictionary) -> String:
	var preview := field.get("preview") as Dictionary if field.get("preview") is Dictionary else {}
	return str(preview.get("status", ""))


static func value_of(control: Control) -> int:
	if control is OptionButton: return int(control.get_item_metadata(control.selected))
	if control is SpinBox: return int(control.value)
	return int(control.get_meta("value", 0))
