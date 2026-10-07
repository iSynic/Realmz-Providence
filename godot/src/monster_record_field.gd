extends Container

signal field_edited(path: String, value: Variant)
signal reference_requested(path: String)
signal reference_open_requested(path: String)

static var _controls: Theme = preload("res://theme/scenario_control_theme.gd").new()
const ReferenceLabels = preload("res://src/monster_reference_labels.gd")

@export var field_path := ""
@export var field_label := ""
var _editing := false
var _binding := false
var _raw_value: Variant = null


func _ready() -> void:
	($Label as Label).text = field_label
	if field_path == "canSummon":
		$Reference.icon = null
	if field_path.begins_with("saves.") or field_path.begins_with("conditions."):
		$Value.custom_minimum_size.y = 32
		if field_path.begins_with("saves."):
			$Value.custom_minimum_size.x = 56
			$Value.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	if $Value is LineEdit:
		($Value as LineEdit).add_theme_color_override("font_uneditable_color", _controls.get_color("font_uneditable_color", "LineEdit"))
	clear_value()
	if $Value is LineEdit:
		$Value.text_changed.connect(_text_changed)
	else:
		$Value.toggled.connect(func(pressed: bool):
			if _editing: field_edited.emit(field_path, 1 if pressed else 0))
	if has_node("Reference"):
		$Reference.pressed.connect(func(): reference_requested.emit(field_path))
	if has_node("OpenReference"):
		$OpenReference.pressed.connect(func(): reference_open_requested.emit(field_path))
	if has_node("Choice"):
		$Choice.item_selected.connect(func(index: int):
			if _editing and not _binding: field_edited.emit(field_path, $Choice.get_item_metadata(index)))


func bind_record(record: Dictionary) -> void:
	_binding = true
	if has_node("Reference"):
		$Reference.hide()
		$Reference.text = "No selected value"
		$Reference.tooltip_text = "Reference selection unavailable."
		$Value.show()
	var value: Variant = record
	for part in field_path.split("."):
		if value is Dictionary:
			value = value.get(part)
		elif value is Array and part.is_valid_int() and int(part) >= 0 and int(part) < value.size():
			value = value[int(part)]
		else:
			value = null
	if $Value is CheckBox:
		($Value as CheckBox).set_pressed_no_signal(value != null and bool(value))
	else:
		($Value as LineEdit).text = "" if value == null else (str(int(value)) if value is float and value == floor(value) else str(value))
	tooltip_text = "%s · read-only" % field_label if value != null else "%s · no selected source value" % field_label
	if value is int or value is float:
		var label := ReferenceLabels.display(field_path, int(value))
		if not label.is_empty():
			($Value as LineEdit).text = label
			tooltip_text = "%s · %s · read-only; reference picker not connected" % [field_label, label]
			if has_node("Reference"):
				$Value.hide()
				$Reference.show()
				$Reference.text = ReferenceLabels.compact(field_path, int(value))
				$Reference.tooltip_text = tooltip_text
				$Reference.accessibility_name = "%s: %s. Reference selection unavailable." % [field_label, label]
	_raw_value = value
	if has_node("Choice"):
		$Choice.clear()
		var options := ReferenceLabels.choices(field_path)
		for id in options:
			$Choice.add_item(options[id])
			$Choice.set_item_metadata($Choice.item_count - 1, id)
		if not options.is_empty() and value != null:
			if not options.has(int(value)):
				$Choice.add_item("%d · Preserved imported value" % int(value))
				$Choice.set_item_metadata($Choice.item_count - 1, int(value))
			for index in $Choice.item_count:
				if $Choice.get_item_metadata(index) == int(value): $Choice.select(index)
		$Choice.visible = _editing and not options.is_empty()
	_binding = false


func bind_slot_preview(rows: Variant) -> void:
	if not rows is Array or rows.size() > (10 if field_path.begins_with("spells.") else 6) or not has_node("Reference") or not $Reference.visible:
		return
	var slot := int(field_path.get_slice(".", 1))
	var raw_id := int(($Value as LineEdit).text.get_slice(" · ", 0))
	var matches: Array = rows.filter(func(row): return row is Dictionary and row.get("slot") == slot and row.get("rawId") == raw_id)
	if matches.size() != 1:
		return
	for row in matches:
		var state := str(row.get("resolution", "context-unavailable"))
		if state == "resolved" and (not row.get("target") is String or str(row.target).is_empty()):
			return
		var name := str(row.get("label", "")) if row.get("label") is String else ""
		var label := "%d · %s" % [raw_id, name] if state == "resolved" and not name.is_empty() else "%d · %s" % [raw_id, {"resolved": "Unnamed target", "ambiguous": "Ambiguous target", "missing": "Missing target", "unsupported-signed": "Unsupported signed ID"}.get(state, "Context unavailable")]
		$Reference.text = label
		$Reference.tooltip_text = "%s · %s · reference selection unavailable" % [field_label, label]
		$Reference.accessibility_name = $Reference.tooltip_text
		return


func clear_value() -> void:
	if has_node("Error"): $Error.hide()
	bind_record({})
	configure_editing(false)


func configure_editing(enabled: bool) -> void:
	_editing = enabled
	if $Value is LineEdit:
		$Value.editable = enabled
		if enabled and not _is_reference():
			_binding = true
			$Value.text = str(int(_raw_value)) if _raw_value is float else str(_raw_value)
			_binding = false
			$Value.show()
			if has_node("Reference"): $Reference.hide()
	else: $Value.disabled = not enabled
	if has_node("Reference"):
		$Reference.disabled = not enabled or reference_requested.get_connections().is_empty()
		if enabled and _is_reference():
			$Reference.show()
			$Value.hide()
	if has_node("Choice"):
		var choice_field := not ReferenceLabels.choices(field_path).is_empty()
		$Choice.visible = enabled and choice_field
		$Choice.disabled = not enabled
		if enabled and choice_field:
			$Value.hide()
			$Reference.hide()
	tooltip_text = field_label if enabled else "%s · Read-only" % field_label
	configure_reference_access(enabled)


func configure_reference_access(enabled: bool) -> void:
	if not has_node("OpenReference"): return
	if _is_reference(): $Reference.disabled = not enabled or not _editing
	$OpenReference.visible = _is_reference() and _raw_value != null
	$OpenReference.disabled = not enabled or int(_raw_value if _raw_value != null else 0) == 0 or reference_open_requested.get_connections().is_empty()
	if field_path == "requiredWeapon" or (field_path == "weapon" and int(_raw_value if _raw_value != null else 0) < 0): $OpenReference.disabled = true


func _text_changed(text: String) -> void:
	if not _editing or _binding: return
	field_edited.emit(field_path, text if field_path == "displayName" or not text.is_valid_int() else int(text))


func _is_reference() -> bool:
	return field_path in ["deathMacro", "weapon", "requiredWeapon"] or field_path.begins_with("spells.") or field_path.begins_with("items.")


func show_validation(message: String) -> void:
	if not has_node("Error"): return
	$Error.text = message
	$Error.visible = not message.is_empty()
	$Value.tooltip_text = message
