extends SceneTree


func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	var view: ProvidenceActionStepWorkbench = load("res://src/action_step_workbench.tscn").instantiate()
	root.add_child(view)
	await process_frame
	var action := {"identity": "realmz.action.1", "opcode": 1, "label": "Show Message", "selectable": true}
	view.set_catalog({"items": [action], "forms": []})
	view.set_document("action-point:land:0:1", [{"slot": 0, "definition": action, "rawOpcode": 1, "targetNativeId": 8}])
	await process_frame
	var failed_request := view._describe_generation
	assert(view.draft_error().error.contains("Wait for"))
	view.set_form_description({"error": "Action choices could not be loaded."}, failed_request)
	assert(view.draft_error().error.contains("could not be loaded"))
	assert(not view.draft_error().error.contains("Wait for"))
	view._request_description()
	var retry := view._describe_generation
	view.set_form_description({"error": "Stale failure"}, failed_request)
	assert(view.draft_error().error.contains("Wait for"))
	view.set_form_description({"action": action, "fields": [], "authoring": {}, "available": true}, retry)
	assert(view.draft_error().is_empty(), str(view.draft_error()))
	assert(not view.has_unapplied_changes())
	view.queue_free()
	await process_frame
	print("PROVIDENCE_ACTION_DESCRIPTION_LIFECYCLE_OK failure retry stale-response")
	quit()
