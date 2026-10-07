extends SceneTree

const Review = preload("res://src/script_settings_review.gd")

class ImpactOperation extends ProvidenceEditorOperation:
	var calls: Array = []
	var total := 2
	var failure := ""
	func request(method: String, params: Dictionary = {}) -> Dictionary:
		calls.append({"method": method, "params": params.duplicate(true)})
		assert(method == "action-form.shared-impact")
		var query: Dictionary = params.query
		assert(query.expectedRevision == 7)
		var count := 0 if query.steps[0].settings.scope.mode == "isolate" else total
		var callers := []
		var actions := []
		for index in range(int(query.offset), mini(count, int(query.offset) + 128)):
			var caller := {"source": "extra-action-point:%d" % index, "slot": 4}
			callers.append(caller)
			var action := caller.duplicate()
			action.merge({"location": "Extra Action Point %d · Step 5" % index, "label": "Battle",
				"changes": [{"label": "Message", "before": 0, "after": 240}]})
			actions.append(action)
		var step := {"slot": 1, "total": count, "affectedCallers": callers, "affectedActions": actions,
			"editedAction": {"location": "Land 0 · Action Point 27 · Step 2", "label": "Player Option",
				"changes": [{"label": "Left prompt", "before": 0, "after": 240}]},
			"nextOffset": int(query.offset) + 128 if int(query.offset) + 128 < count else null}
		var result := {"revision": 7, "source": query.source, "steps": [step]}
		match failure:
			"transport": return {"ok": false, "error": "Disconnected"}
			"revision": result.revision = 8
			"incomplete": step.total = count + 1
			"description": step.affectedActions = []
			"omitted": result.steps = []
			"duplicate": result.steps.append(step.duplicate(true))
			"wrong-step": step.slot = 2
			"unnamed": step.affectedActions[0].label = ""
			"missing-changes": step.affectedActions[0].changes = []
			"missing-edited": step.editedAction = null
		return {"ok": true, "result": result}

var _presented := []
var _decision := "shared"
var _valid := true
var _invalidate_on_present := false


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	await _check_decisions()
	await _check_failures()
	await _check_dialog()
	print("PROVIDENCE_SETTINGS_REVIEW_OK complete-paging shared independent cancel stale draft-guard descriptions dialog")
	quit()


func _document() -> Dictionary:
	return {"source": "action-point:land:0:27", "steps": [{"slot": 1,
		"settings": {"values": {"leftPrompt": 240}, "scope": {"mode": "preserve-references"}}}]}


func _present(impact: Dictionary) -> String:
	_presented.append(impact.duplicate(true))
	await process_frame
	if _invalidate_on_present: _valid = false
	return _decision


func _guard() -> Dictionary:
	return {"ok": true} if _valid else {"ok": false, "draftKept": true, "error": "Draft changed"}


func _check_decisions() -> void:
	for decision in ["shared", "independent", "cancel"]:
		_decision = decision
		_presented.clear()
		var operation := ImpactOperation.new()
		operation.total = 130
		var document := _document()
		var result: Dictionary = await Review.new().review(operation, document, 7, _guard, _present)
		assert(document == _document())
		assert(_presented.size() == 1 and _presented[0].affectedActions.size() == 130)
		assert(operation.calls[1].params.query.offset == 128)
		if decision == "cancel":
			assert(not result.ok and result.cancelled and result.draftKept and operation.calls.size() == 2)
		else:
			assert(result.ok)
			var scope: Dictionary = result.draft.steps[0].settings.scope
			assert(scope.mode == ("isolate" if decision == "independent" else "update-affected"))
			assert(operation.calls.size() == (3 if decision == "independent" else 4))
			if decision == "shared": assert(scope.confirmedCallers.size() == 130)
		operation.free()
	var unchanged := ImpactOperation.new()
	unchanged.total = 0
	_presented.clear()
	assert((await Review.new().review(unchanged, _document(), 7, _guard, _present)).ok)
	assert(_presented.is_empty() and unchanged.calls.size() == 1)
	unchanged.free()


func _check_failures() -> void:
	for failure in ["transport", "revision", "incomplete", "description", "omitted", "duplicate", "wrong-step", "unnamed", "missing-changes", "missing-edited"]:
		var operation := ImpactOperation.new()
		operation.failure = failure
		_presented.clear()
		assert(not (await Review.new().review(operation, _document(), 7, _guard, _present)).ok)
		assert(_presented.is_empty() and operation.calls.size() == 1)
		operation.free()
	var operation := ImpactOperation.new()
	_decision = "shared"
	_invalidate_on_present = true
	var result: Dictionary = await Review.new().review(operation, _document(), 7, _guard, _present)
	assert(not result.ok and result.draftKept and operation.calls.size() == 1)
	operation.free()
	_valid = true
	_invalidate_on_present = false


func _check_dialog() -> void:
	var operation := ImpactOperation.new()
	var response := await operation.request("action-form.shared-impact", {"query": {
		"expectedRevision": 7, "source": _document().source, "steps": _document().steps, "offset": 0}})
	var dialog := load("res://src/settings_impact_dialog.tscn").instantiate() as ProvidenceSettingsImpactDialog
	root.add_child(dialog)
	dialog.populate(response.result.steps[0])
	assert("2 other actions" in (dialog.get_node("%ImpactHeading") as Label).text)
	assert("Left prompt: 0 → 240" == (dialog.get_node("%ImpactChanges") as Label).text)
	assert(dialog.get_node("%ImpactActions").get_child_count() == 2)
	assert("Message: 0 → 240" in dialog.get_node("%ImpactActions").get_child(0).text)
	assert(dialog.get_ok_button().text == "Update listed actions")
	dialog.free()
	operation.free()
