extends SceneTree

const Controller = preload("res://src/script_record_controller.gd")

class Bridge extends "res://src/native_bridge.gd":
	var calls := []
	var submitted := {}
	var revision := 7
	func _request(method: String, params: Dictionary) -> Dictionary:
		calls.append(method)
		if method == "action-form.shared-impact":
			var query: Dictionary = params.query
			assert(query.expectedRevision == revision)
			var callers := [] if query.steps[0].settings.scope.mode == "isolate" else [{"source": "extra-action-point:3", "slot": 4}]
			var actions := [] if callers.is_empty() else [{"source": "extra-action-point:3", "slot": 4,
				"location": "Extra Action Point 3 · Step 5", "label": "Battle",
				"changes": [{"label": "Message", "before": 0, "after": 240}]}]
			return {"ok": true, "result": {"revision": revision, "source": query.source, "steps": [
				{"slot": 1, "total": callers.size(), "affectedCallers": callers, "affectedActions": actions,
				"editedAction": {"location": "Selected record · Step 2", "label": "Player Option", "changes": []}, "nextOffset": null}]}}
		if method.ends_with(".apply-draft"):
			assert(params.expectedRevision == revision)
			submitted = params.draft.duplicate(true)
			var scope: Dictionary = submitted.steps[0].settings.scope
			assert(scope.mode in ["isolate", "update-affected"])
			if scope.mode == "update-affected": assert(scope.confirmedCallers == [{"source": "extra-action-point:3", "slot": 4}])
			revision += 1
			return {"ok": true, "result": {"revision": revision, "changedEntities": [submitted.source]}}
		# A failed post-commit read must not turn transient confirmation into a draft.
		if method == "list": return {"ok": false, "error": "Controlled read failure"}
		return {"ok": false, "error": "Unexpected request"}

class View extends Control:
	var commit_handler: Callable
	var document := {}
	var saved := {}
	var decision := "shared"
	var late_typing := false
	var reviews := 0
	func set_document(value: Dictionary) -> void: document = value.duplicate(true)
	func set_summaries(_page: Dictionary, _revision: int, _preferred: String) -> void: pass
	func read_state() -> Dictionary: return {"identity": document.get("source", ""), "draft": document.duplicate(true), "mapIdentity": "land:0"}
	func accept_saved_draft(value: Dictionary) -> void: saved = value.duplicate(true)
	func review_settings_change(_impact: Dictionary) -> String:
		reviews += 1
		await get_tree().process_frame
		if late_typing: document["descriptor"] = "Later typing"
		return decision


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	for family in ["action-point", "extra-action-point"]:
		for decision in ["shared", "independent", "cancel", "late-typing"]:
			await _check_controller(family, decision)
		await _check_view_dialog(family)
	print("PROVIDENCE_SETTINGS_APPLY_OK ap xap reviewed-wire original-baseline cancel late-typing native-dialog")
	quit()


func _check_controller(family: String, decision: String) -> void:
	var operation := ProvidenceEditorOperation.new()
	var bridge := Bridge.new()
	var view := View.new()
	root.add_child(operation)
	root.add_child(view)
	var controller := Controller.new()
	controller.initialize(view, {"record": "actionPoint" if family == "action-point" else "extraActionPoint",
		"commitKey": "draft", "update": family + ".apply-draft", "list": "list", "limit": 128}, operation,
		func(): return {"revision": bridge.revision}, func(_response): pass, func(_response): pass)
	controller.attach_session(bridge)
	var draft := {"source": family + ":27", "steps": [{"slot": 1,
		"settings": {"values": {"promptA": 240}, "scope": {"mode": "preserve-references"}}}]}
	view.set_document(draft)
	view.decision = "shared" if decision == "late-typing" else decision
	view.late_typing = decision == "late-typing"
	var response: Dictionary = await controller.commit(draft)
	assert(view.reviews == 1 and not operation.busy)
	assert(draft.steps[0].settings.scope.mode == "preserve-references")
	if decision in ["cancel", "late-typing"]:
		assert(not response.ok and response.draftKept and bridge.submitted.is_empty())
		assert(bridge.calls == ["action-form.shared-impact"] and view.saved.is_empty())
		if decision == "late-typing": assert(view.document.descriptor == "Later typing")
	else:
		assert(response.ok and response.has("viewRefreshError") and bridge.revision == 8)
		assert(bridge.calls == ["action-form.shared-impact", "action-form.shared-impact", family + ".apply-draft", "list"])
		assert(view.saved == draft and view.document == draft)
		assert(bridge.submitted.steps[0].settings.scope.mode == ("isolate" if decision == "independent" else "update-affected"))
	controller.dispose()
	bridge.stop()
	operation.free()
	view.free()


func _check_view_dialog(family: String) -> void:
	var path := "res://src/%s_editor.tscn" % family.replace("-", "_")
	var view := load(path).instantiate() as Control
	root.add_child(view)
	var impact := {"total": 1, "editedAction": {"label": "Player Option", "location": "Step 2", "changes": []}, "affectedActions": []}
	_close_dialog.call_deferred(view)
	assert(await view.review_settings_change(impact) == "cancel")
	view.queue_free()
	await process_frame


func _close_dialog(view: Control) -> void:
	var dialog := view.find_child("SemanticSharedImpactDialog", true, false) as ConfirmationDialog
	assert(dialog != null and dialog.visible and dialog.exclusive)
	dialog.canceled.emit()
