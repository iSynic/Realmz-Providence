class_name ProvidenceActionStepPresentation
extends RefCounted

static func action_label(definition: Dictionary, fallback := "Empty step") -> String:
	if definition.is_empty(): return fallback
	return "Code %d · %s" % [int(definition.get("opcode", 0)), str(definition.get("label", fallback))]


static func has_branch_destination(description: Dictionary) -> bool:
	for field: Dictionary in description.get("fields", []):
		if bool(field.get("editable", false)) and field.get("targetKind") in ["extra-action-point", "simple-encounter", "complex-encounter"]:
			return true
	return false


static func configure_gosub(control: CheckBox, applicable: bool, description: Dictionary) -> void:
	control.disabled = not applicable or not has_branch_destination(description)
	control.tooltip_text = "Return to this script after the branch." if not control.disabled else "The selected behavior has no branch destination. The stored return setting is preserved."


static func apply_semantic_style(panel: PanelContainer, gosub: CheckBox, heading: Label, definition: Dictionary, occupied: bool, applicable: bool) -> void:
	var color := ProvidenceActionStepList.semantic_color(definition)
	var border := color if occupied else Color("2b3c4d")
	panel.add_theme_stylebox_override("panel", ProvidenceActionStepList.make_style(Color("111820"), border, 2 if occupied else 1, 8, 8))
	gosub.visible = occupied and applicable
	heading.add_theme_color_override("font_color", border)


static func technical_text(draft: Dictionary, definition: Dictionary, description: Dictionary) -> String:
	var evidence := description.get("evidence", {}) as Dictionary
	return "\n".join(PackedStringArray([
		"Action identity  %s" % str(definition.get("identity", "—")),
		"Classic opcode  %s" % str(definition.get("opcode", "—")),
		"Storage  %s" % str(definition.get("storage", "empty")),
		"Imported target / row hint  %d" % int(draft.get("targetNativeId", 0)),
		"Evidence  %s · %s" % [str(evidence.get("kind", "pending")), str(evidence.get("status", ""))],
	]))


static func step_detail(draft: Dictionary, definition: Dictionary) -> String:
	var form_id := optional_text(definition.get("formId"))
	if not form_id.is_empty(): return str(definition.get("description", "Settings-backed action"))
	var kind := optional_text(definition.get("targetKind")).replace("-", " ")
	return "%s %d" % [kind.capitalize(), int(draft.get("targetNativeId", 0))] if not kind.is_empty() else str(definition.get("description", "No argument"))


static func outcome_summary(_draft: Dictionary, _definition: Dictionary, description: Dictionary) -> Dictionary:
	var summary := str(description.get("summary", ""))
	return {"preview": "PREVIEW · " + summary if not summary.is_empty() else "", "default": ""}


static func _selected_special_value(field: Dictionary) -> String:
	var selected := int(field.get("value", 0))
	for value in field.get("specialValues", []) as Array:
		var special := value as Dictionary
		if int(special.get("value", 0)) == selected: return str(special.get("meaning", ""))
	return ""


static func _choice_label(field: Dictionary) -> String:
	var selected := int(field.get("value", 0))
	for value in field.get("choices", []) as Array:
		var choice := value as Dictionary
		if int(choice.get("value", 0)) == selected: return str(choice.get("label", selected))
	return str(selected)


static func decorate_field(group: VBoxContainer, caption: Label, control: Control, field: Dictionary, _compact: bool) -> void:
	var details := PackedStringArray()
	var explanation := str(field.get("explanation", "")).strip_edges()
	if not explanation.is_empty(): details.append(explanation)
	var units := optional_text(field.get("units"))
	if not units.is_empty():
		var unit_label := Label.new()
		unit_label.text = units
		control.get_parent().add_child(unit_label)
	for special_value in field.get("specialValues", []) as Array:
		var special := special_value as Dictionary
		details.append("%d — %s" % [int(special.get("value", 0)), str(special.get("meaning", ""))])
	_set_tooltip(caption, control, "  ".join(details))
	_add_help(group, control, "  ".join(details))
	var preview := field.get("preview") as Dictionary if field.get("preview") is Dictionary else {}
	if not preview.is_empty():
		var preview_text := "%s  ·  %s" % [str(preview.get("label", "")), str(preview.get("detail", ""))]
		_add_note(group, preview_text, true)
	var selected_special := _selected_special_value(field)
	if not selected_special.is_empty(): _add_note(group, selected_special, true)
	_add_note(group, optional_text(field.get("availabilityReason")))


static func _add_help(group: VBoxContainer, control: Control, text: String) -> void:
	if text.is_empty(): return
	var help := Button.new()
	help.text = "Help"
	help.toggle_mode = true
	help.tooltip_text = "Expand field help (Enter or Space)."
	control.get_parent().add_child(help)
	var note := Label.new()
	note.text = text
	note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	note.add_theme_color_override("font_color", Color("8fa0ad"))
	group.add_child(note)
	note.hide()
	help.toggled.connect(func(expanded): note.visible = expanded)


static func _set_tooltip(caption: Label, control: Control, text: String) -> void:
	if text.is_empty(): return
	caption.tooltip_text = "%s\n%s" % [caption.tooltip_text, text] if not caption.tooltip_text.is_empty() else text
	control.tooltip_text = caption.tooltip_text


static func _add_note(group: VBoxContainer, text: String, trim := false) -> void:
	if text.is_empty(): return
	var note := Label.new()
	note.text = text
	note.add_theme_color_override("font_color", Color("8fa0ad"))
	note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	if trim:
		note.add_theme_color_override("font_color", Color("77d6a1"))
	group.add_child(note)


static func optional_text(value: Variant) -> String:
	return "" if value == null else str(value)


static func encounter_category_color(category: String) -> Color:
	match category.to_lower():
		"dialogue", "text": return Color("f2c94c")
		"branch", "logic": return Color("bd7cff")
		"combat": return Color("ef7d7d")
		"media": return Color("68c7e8")
		_: return Color("b9c7d4")
