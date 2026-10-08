extends RefCounted


static func definition(draft: Dictionary, catalog: Dictionary) -> Dictionary:
	if draft.is_empty(): return catalog.get("realmz.action.0", {})
	var identity := str(draft.get("actionIdentity", "realmz.action.0"))
	if catalog.has(identity): return catalog[identity]
	return {"identity": identity, "opcode": int(identity.get_slice(".", 2)),
		"label": "Unrecognized imported instruction", "selectable": false,
		"description": "Preserved unchanged. Replace with a known action to edit this step."}


static func validation(drafts: Dictionary, form: Control) -> Dictionary:
	for slot in drafts:
		var draft := drafts[slot] as Dictionary
		var error := str(draft.get("descriptionError", ""))
		if bool(draft.get("descriptionPending", false)): error = "Wait for the updated action choices before applying."
		var errors := (draft.get("authoringProjection", {}) as Dictionary).get("errors", []) as Array
		if not errors.is_empty(): error = str(errors[0])
		if not error.is_empty():
			return preload("res://src/editor_draft_apply.gd").failure("Step %d: %s" % [int(slot) + 1, error], form)
	return {}


static func retainable(draft: Dictionary, baseline: Array) -> bool:
	for step: Dictionary in baseline:
		if int(step.slot) == int(draft.slot):
			return preload("res://src/document_value_equality.gd").equal(
				preload("res://src/action_step_draft_projection.gd").ordered({draft.slot: draft})[0], step)
	return false
