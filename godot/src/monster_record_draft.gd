extends RefCounted

signal changed

var document: Dictionary = {}
var fields: Dictionary = {}
var description: Variant = null
var normal_not_on_menu: Variant = null
var _baseline_description := ""
var _baseline_normal: Variant = null
var generation := 0


func bind(result: Dictionary, normal_flag: Variant) -> void:
	clear()
	document = result.duplicate(true)
	var source: Variant = result.get("description")
	_baseline_description = str(source.get("text", "")) if source is Dictionary else ""
	_baseline_normal = normal_flag
	changed.emit()


func clear() -> void:
	generation += 1
	document.clear()
	fields.clear()
	description = null
	normal_not_on_menu = null
	_baseline_description = ""
	_baseline_normal = null


func has_changes() -> bool:
	return not fields.is_empty() or description != null or normal_not_on_menu != null


func edit_field(path: String, value: Variant) -> void:
	if document.is_empty(): return
	if values_match(value, baseline_value(path)): fields.erase(path)
	else: fields[path] = value
	changed.emit()


func edit_description(text: String) -> void:
	description = null if text == _baseline_description else text
	changed.emit()


func edit_bestiary(value: bool) -> void:
	if _baseline_normal == null: return
	normal_not_on_menu = null if value == bool(_baseline_normal) else value
	changed.emit()


func baseline_value(path: String) -> Variant:
	var value: Variant = document.get("monster", {})
	for part in path.split("."):
		if value is Dictionary: value = value.get(part)
		elif value is Array and part.is_valid_int() and int(part) < value.size(): value = value[int(part)]
		else: return null
	return value


func current_value(path: String) -> Variant:
	return fields.get(path, baseline_value(path))


func submission() -> Dictionary:
	var result := {"setId": int(document.get("setId", 0)),
		"nativeId": int(document.get("monster", {}).get("nativeId", -1)), "fields": fields.duplicate(true)}
	if description != null: result["description"] = description
	if normal_not_on_menu != null: result["normalNotOnMenu"] = normal_not_on_menu
	return result


func current_document() -> Dictionary:
	var result := document.duplicate(true)
	for path in fields:
		var parts: PackedStringArray = str(path).split(".")
		var owner: Variant = result.get("monster", {})
		for index in parts.size() - 1:
			owner = owner[int(parts[index])] if owner is Array else owner.get(parts[index], {})
		if owner is Array: owner[int(parts[-1])] = fields[path]
		else: owner[parts[-1]] = fields[path]
	if description != null: result["description"] = {"text": description}
	if normal_not_on_menu != null: result["normalNotOnMenu"] = normal_not_on_menu
	return result


func accept(submitted: Dictionary, saved: Dictionary) -> void:
	# An acknowledgement advances only the submitted values. Later typing survives.
	var retained: Dictionary = {}
	for path in fields:
		if not submitted.get("fields", {}).has(path) or not values_match(fields[path], submitted.fields[path]): retained[path] = fields[path]
	var later_description: Variant = description if description != submitted.get("description") else null
	var later_normal: Variant = normal_not_on_menu if normal_not_on_menu != submitted.get("normalNotOnMenu") else null
	bind(saved, saved.get("normalNotOnMenu"))
	for path in retained: edit_field(path, retained[path])
	if later_description != null: edit_description(str(later_description))
	if later_normal != null: edit_bestiary(bool(later_normal))
	changed.emit()


func retained_values() -> Dictionary:
	var values := fields.duplicate(true)
	if description != null: values["description"] = description
	if normal_not_on_menu != null: values["normalNotOnMenu"] = normal_not_on_menu
	return values


func comparison_value(source: Dictionary, path: String) -> Variant:
	if path == "description": return source.get("description", {}).get("text", "")
	if path == "normalNotOnMenu": return source.get("normalNotOnMenu")
	var value: Variant = source.get("monster", {})
	for part in path.split("."):
		if value is Dictionary: value = value.get(part)
		elif value is Array and part.is_valid_int() and int(part) < value.size(): value = value[int(part)]
		else: return null
	return value


func rebase(saved: Dictionary, keep: Array) -> void:
	var retained := retained_values()
	bind(saved, saved.get("normalNotOnMenu"))
	for path in keep:
		if retained.has(path): restore_retained(path, retained[path])


func restore_retained(path: String, value: Variant) -> void:
	if path == "description": edit_description(str(value))
	elif path == "normalNotOnMenu": edit_bestiary(bool(value))
	else: edit_field(path, value)


static func values_match(left: Variant, right: Variant) -> bool:
	var numeric := typeof(left) in [TYPE_INT, TYPE_FLOAT] and typeof(right) in [TYPE_INT, TYPE_FLOAT]
	return (numeric or typeof(left) == typeof(right)) and left == right
