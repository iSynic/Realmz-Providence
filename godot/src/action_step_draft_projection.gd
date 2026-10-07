extends RefCounted


static func ordered(drafts: Dictionary) -> Array:
	var result: Array = []
	for slot in range(8):
		if not drafts.has(slot): continue
		var draft := (drafts[slot] as Dictionary).duplicate(true)
		var projection := draft.get("authoringProjection", {}) as Dictionary
		if projection.has("resolvedValues"):
			# Rust maps named choices to words; transient selections never enter a command.
			var values := (draft.settings.values as Dictionary).duplicate(true) if draft.has("settings") else {}
			for group in projection.get("controls", []):
				for key in group.memberFields:
					if key == "targetNativeId":
						draft.targetNativeId = int(projection.resolvedValues.get(key, draft.targetNativeId))
					elif draft.has("settings"):
						values[key] = projection.resolvedValues.get(key, values.get(key, 0))
			if draft.has("settings"): draft.settings.values = values
		for key in ["authoringInput", "authoringProjection", "descriptionPending", "descriptionRequest"]: draft.erase(key)
		if str(draft.get("actionIdentity", "realmz.action.0")) != "realmz.action.0": result.append(draft)
	return result


static func from_steps(steps: Array, forms: Dictionary) -> Dictionary:
	var result := {}
	var origins := {}
	for value in steps:
		var step := value as Dictionary
		var definition := step.get("definition", {}) as Dictionary
		var identity := str(definition.get("identity", "realmz.action.0"))
		if identity == "realmz.action.0": continue
		var raw_opcode := int(step.get("rawOpcode", 0))
		var draft := {"slot": int(step.get("slot", 0)), "actionIdentity": identity,
			"gosub": raw_opcode < 0 and int(step.get("opcode", 0)) not in [-14, -23],
			"targetNativeId": int(step.get("targetNativeId", 0))}
		var form_id := _text(definition.get("formId"))
		if not form_id.is_empty(): _attach_settings(draft, step, identity, form_id, forms, origins)
		result[int(draft.slot)] = draft
	return {"drafts": result, "settingsOrigins": origins}


static func _attach_settings(draft: Dictionary, step: Dictionary, identity: String, form_id: String, forms: Dictionary, origins: Dictionary) -> void:
	var primary := _dictionary(step.get("primarySettings"))
	var settings := {"values": _editable_values(form_id, _dictionary(primary.get("typedValues")), forms),
		"scope": {"mode": "preserve-references"}}
	var companion_id := _text((forms.get(form_id, {}) as Dictionary).get("companionFormId"))
	if not companion_id.is_empty():
		var secondary := _dictionary(step.get("secondarySettings"))
		settings["secondaryValues"] = _editable_values(companion_id, _dictionary(secondary.get("typedValues")), forms)
	draft["settings"] = settings
	var primary_usage := _dictionary(step.get("primaryUsage"))
	var secondary_usage := _dictionary(step.get("secondaryUsage"))
	origins[int(draft.slot)] = {"actionIdentity": identity, "targetNativeId": int(step.get("targetNativeId", -1)),
		"status": "conflict" if str(primary_usage.get("status", "")) == "conflict" or str(secondary_usage.get("status", "")) == "conflict" else str(primary_usage.get("status", ""))}


static func _editable_values(form_id: String, values: Dictionary, forms: Dictionary) -> Dictionary:
	var result := {}
	for value in (forms.get(form_id, {}) as Dictionary).get("fields", []) as Array:
		var field := value as Dictionary
		if not bool(field.get("preserved", false)):
			var key := str(field.get("name", ""))
			result[key] = int(values.get(key, 0))
	return result


static func new_settings(form_id: String, forms: Dictionary) -> Dictionary:
	var settings := {"values": _editable_values(form_id, {}, forms), "scope": {"mode": "preserve-references"}}
	var companion := _text((forms.get(form_id, {}) as Dictionary).get("companionFormId"))
	if not companion.is_empty(): settings["secondaryValues"] = _editable_values(companion, {}, forms)
	return settings


static func _text(value: Variant) -> String:
	return str(value) if value is String else ""


static func _dictionary(value: Variant) -> Dictionary:
	return value as Dictionary if value is Dictionary else {}
