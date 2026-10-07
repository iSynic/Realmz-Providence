extends RefCounted

const Equality = preload("res://src/document_value_equality.gd")


func review(operation: ProvidenceEditorOperation, document: Dictionary, revision: int, check_guard: Callable, present: Callable) -> Dictionary:
	var draft := document.duplicate(true)
	var reviewed := {}
	for attempt in range(17):
		var response := await _collect_impact(operation, draft, revision, check_guard)
		if not response.get("ok", false): return response
		var pending: Dictionary = _next_review(response.result.steps, reviewed)
		if pending.is_empty(): return {"ok": true, "draft": draft}
		var decision: String = await present.call(pending)
		var checked: Dictionary = check_guard.call()
		if not checked.get("ok", false): return checked
		if decision == "cancel": return {"ok": false, "cancelled": true, "draftKept": true, "error": "Shared settings review cancelled. Your draft is kept."}
		if decision not in ["shared", "independent"]: return _invalid("The settings review did not return a decision.")
		_set_scope(draft, int(pending.slot), decision, pending.affectedCallers)
		reviewed[int(pending.slot)] = pending.duplicate(true)
	return _invalid("The settings impact did not settle. Review the record again.")


func _collect_impact(operation: ProvidenceEditorOperation, draft: Dictionary, revision: int, check_guard: Callable) -> Dictionary:
	var combined := {}
	var offset := 0
	while true:
		var response := await operation.request("action-form.shared-impact", {"query": {
			"expectedRevision": revision, "source": draft.source, "steps": draft.steps, "offset": offset, "limit": 128}})
		if not response.get("ok", false): return response
		var checked: Dictionary = check_guard.call()
		if not checked.get("ok", false): return checked
		var page := response.get("result", {}) as Dictionary
		if int(page.get("revision", -1)) != revision or str(page.get("source", "")) != str(draft.source):
			return _invalid("The settings impact belongs to a different record revision.")
		var merged := _merge_page(combined, page, offset, 32 if str(draft.source).begins_with("complex-encounter:") or str(draft.source).begins_with("simple-encounter:") else 8)
		if not merged.ok: return merged
		if int(merged.nextOffset) < 0: break
		offset = int(merged.nextOffset)
	var steps: Array = combined.values()
	steps.sort_custom(func(a, b): return int(a.slot) < int(b.slot))
	if steps.size() != (draft.steps as Array).size(): return _invalid("The settings impact omitted a draft step.")
	for entry in draft.steps:
		if not combined.has(int(entry.slot)): return _invalid("The settings impact belongs to different steps.")
	for step in steps:
		var verified := _verify_actions(step)
		if not verified.ok: return verified
	return {"ok": true, "result": {"steps": steps}}


func _merge_page(combined: Dictionary, page: Dictionary, offset: int, capacity: int) -> Dictionary:
	var next_offset := -1
	var slots := {}
	for value in page.get("steps", []) as Array:
		var step := value as Dictionary
		var slot := int(step.get("slot", -1))
		if slot < 0 or slot >= capacity or slots.has(slot): return _invalid("The settings impact contains an invalid step.")
		slots[slot] = true
		if not combined.has(slot):
			combined[slot] = step.duplicate(true)
		else:
			if int(combined[slot].total) != int(step.total): return _invalid("The affected-action list changed while loading.")
			combined[slot].affectedCallers.append_array(step.affectedCallers)
			combined[slot].affectedActions.append_array(step.affectedActions)
		var next: Variant = step.get("nextOffset")
		if next != null:
			if int(next) <= offset: return _invalid("The affected-action list did not advance.")
			next_offset = int(next) if next_offset < 0 else mini(next_offset, int(next))
	return {"ok": true, "nextOffset": next_offset}


func _verify_actions(step: Dictionary) -> Dictionary:
	var callers := step.get("affectedCallers", []) as Array
	var actions := step.get("affectedActions", []) as Array
	if callers.size() != int(step.get("total", -1)) or actions.size() != callers.size():
		return _invalid("The affected-action list is incomplete.")
	if not callers.is_empty() and not _has_description(step.get("editedAction")):
		return _invalid("The edited action description is incomplete.")
	var seen := {}
	for index in range(callers.size()):
		var caller := callers[index] as Dictionary
		var action := actions[index] as Dictionary
		if not _has_description(action) or (action.get("changes", []) as Array).is_empty():
			return _invalid("An affected action is missing its setting changes.")
		var key := "%s/%d" % [str(caller.get("source", "")), int(caller.get("slot", -1))]
		if seen.has(key) or action.get("source") != caller.get("source") or action.get("slot") != caller.get("slot"):
			return _invalid("The affected-action descriptions do not match the confirmation.")
		seen[key] = true
	return {"ok": true}


func _has_description(value: Variant) -> bool:
	if not value is Dictionary: return false
	return not str(value.get("label", "")).is_empty() and not str(value.get("location", "")).is_empty()


func _next_review(steps: Array, reviewed: Dictionary) -> Dictionary:
	for value in steps:
		var step := value as Dictionary
		if int(step.total) == 0: continue
		if not reviewed.has(int(step.slot)) or not Equality.equal(step, reviewed[int(step.slot)]): return step
	return {}


func _set_scope(draft: Dictionary, slot: int, decision: String, callers: Array) -> void:
	for step in draft.steps:
		if int(step.slot) != slot: continue
		step.settings["scope"] = {"mode": "isolate"} if decision == "independent" else {
			"mode": "update-affected", "confirmedCallers": callers.duplicate(true)}


func _invalid(message: String) -> Dictionary:
	return {"ok": false, "draftKept": true, "error": message}
