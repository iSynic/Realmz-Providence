extends RefCounted

const FormScene = preload("res://src/monster_record_form.tscn")
static var _field_labels: Dictionary = {}


static func owner(identity: String) -> String:
	var parts := identity.split(":")
	if parts[0] == "monster" and parts.size() == 3:
		return "Monster %s · %s" % [parts[2], {"0": "Normal", "1": "Monster", "-1": "Mega"}.get(parts[1], parts[1])]
	if parts[0] == "monster-description": return "Monster %s · Shared description" % parts[-1]
	if parts[0] == "action-point" and parts.size() == 4: return "%s %s · Action Point %s" % [parts[1].capitalize(), parts[2], parts[3]]
	if parts[0].begins_with("library"): return "Library entry"
	return "%s %s" % [parts[0].replace("-", " ").capitalize(), parts[-1]]


static func field(path: String, source := "") -> String:
	if path == "origin.kind": return "Ownership"
	var form_path := path.trim_prefix("template.")
	if _field_labels.is_empty(): _load_field_labels()
	var parts := path.trim_prefix("template.").split(".")
	if parts[0] == "attacks" and parts.size() == 3:
		return "Attack %d · %s" % [int(parts[1]) + 1, ["Low damage", "High damage", "Form", "Special"][int(parts[2])]]
	if _field_labels.has(form_path): return str(_field_labels[form_path]).capitalize()
	if parts[0] in ["spells", "items", "conditions", "money", "saves", "spellImmunities", "typeFlags"] and parts.size() == 2:
		var label: String = {"spells": "Spell", "items": "Item", "conditions": "Condition", "saves": "Save", "spellImmunities": "Spell immunity", "typeFlags": "Type flag"}.get(parts[0], _words(parts[0]))
		return "%s %d" % [label, int(parts[1]) + 1]
	if path.begins_with("grid["): return "Battle cell %s · Monster" % path.get_slice("[", 1).get_slice("]", 0)
	if path.begins_with("actions["):
		var slot := int(path.get_slice("[", 1).get_slice("]", 0))
		var destination := "Result %d · Step %d" % [slot / 8 + 1, slot % 8 + 1] if source.begins_with("simple-encounter:") or source.begins_with("complex-encounter:") else "Step %d" % (slot + 1)
		return "%s · %s" % [destination, _words(path.get_slice(".", path.get_slice_count(".") - 1))]
	return _words(path)


static func _load_field_labels() -> void:
	var scene := FormScene.get_state()
	for index in scene.get_node_count():
		var path := ""
		var label := ""
		for property in scene.get_node_property_count(index):
			var name := scene.get_node_property_name(index, property)
			if name == "field_path": path = str(scene.get_node_property_value(index, property))
			if name == "field_label": label = str(scene.get_node_property_value(index, property))
		if not path.is_empty() and not label.is_empty(): _field_labels[path] = label


static func _words(value: String) -> String:
	var result := ""
	for character in value:
		if character == character.to_upper() and character != character.to_lower(): result += " "
		result += character
	return result.replace(".", " · ").capitalize()
