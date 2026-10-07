extends RefCounted

var _view
var _picker
var _operations: ProvidenceEditorOperation
var _read_bridge: Callable
var _open_target: Callable


func initialize(view, picker, operations: ProvidenceEditorOperation, read_bridge: Callable) -> void:
	_view = view
	_picker = picker
	_operations = operations
	_read_bridge = read_bridge
	view.reference_requested.connect(open_picker)
	view.reference_open_requested.connect(open_existing)
	picker.search_requested.connect(search)
	picker.preview_requested.connect(preview)
	picker.accepted.connect(accept)
	picker.open_requested.connect(open_target)


func configure_navigation(open_target_handler: Callable) -> void:
	_open_target = open_target_handler


func open_existing(field: String) -> void:
	var context: Dictionary = _view.reference_context(field)
	if context.is_empty() or not _open_target.is_valid(): return
	var query := {"field": field, "currentValue": int(context.currentValue), "search": str(int(context.currentValue)),
		"ownership": "all", "showUnavailable": true, "offset": 0, "seekCurrent": false, "limit": 128}
	var response: Dictionary = await _resolve_existing(query, context)
	if not _view.reference_context_matches(context): return
	if not response.get("ok", false): _view.show_submission_failure(response); return
	var matches: Array = response.result.page.items.filter(func(choice): return int(choice.value) == int(context.currentValue) and choice.available)
	if matches.size() != 1:
		_view.show_submission_failure({"ok": false, "error": "This exact reference is unavailable or ambiguous. Choose a resolved target to repair it."})
		return
	await open_target(matches[0], context)


func _resolve_existing(query: Dictionary, context: Dictionary) -> Dictionary:
	# A thumbnail lease may finish between the click and this foreground read.
	# Only wait for an unstarted read; never repeat a dispatched mutation.
	while is_instance_valid(_view) and _view.is_inside_tree() and _view.reference_context_matches(context):
		var response: Dictionary = await _operations.run_workflow(_read_bridge.call(), "Resolve Monster reference", _read_catalog.bind(query, context))
		if not response.get("busy", false): return response
		await _view.get_tree().process_frame
	return {"ok": false, "stale": true}


func open_picker(field: String) -> void:
	var context: Dictionary = _view.reference_context(field)
	if context.is_empty() or _read_bridge.call() == null: return
	_picker.begin(context, _view.get_viewport().gui_get_focus_owner())


func search(query: Dictionary, generation: int) -> void:
	var context: Dictionary = _picker.context.duplicate(true)
	var response: Dictionary = await _operations.run_workflow(_read_bridge.call(), "Browse Monster references",
		_read_catalog.bind(query, context))
	if response.get("busy", false):
		await _view.get_tree().process_frame
		if generation == _picker.generation and _picker.visible: _picker.retry_search(query, generation)
		return
	if _view.reference_context_matches(context): _picker.receive_page(response, generation)
	else: _picker.cancel()


func _read_catalog(operation: ProvidenceEditorOperation, query: Dictionary, context: Dictionary) -> Dictionary:
	return await operation.request("monster-reference.list", {"expectedRevision": context.projectRevision, "query": query})


func preview(choice: Dictionary, generation: int) -> void:
	if _picker.context.get("field") != "iconId" or int(choice.get("value", 0)) == 0: return
	var context: Dictionary = _picker.context.duplicate(true)
	var response: Dictionary = await _operations.run_workflow(_read_bridge.call(), "Preview Monster appearance",
		_read_appearance.bind(int(choice.value)))
	if _view.reference_context_matches(context): _picker.receive_appearance(response, generation, int(choice.value))


func _read_appearance(operation: ProvidenceEditorOperation, value: int) -> Dictionary:
	return await operation.request("monster-appearance.open", {"iconId": value})


func accept(choice: Dictionary, context: Dictionary) -> void:
	if not _view.reference_context_matches(context) or not choice.get("available", false): return
	_view.accept_reference_choice(str(context.field), choice)
	if context.field != "iconId": return
	if int(choice.value) == 0:
		_view.set_draft_appearance({"texture": null, "status": "No appearance selected."})
		return
	var response: Dictionary = await _operations.run_workflow(_read_bridge.call(), "Load selected Monster appearance", _read_appearance.bind(int(choice.value)))
	if _view.reference_context_matches(context) and response.get("ok", false):
		_view.set_draft_appearance(preload("res://src/monster_appearance_view.gd").from_projection(response.result, int(choice.value)))


func open_target(choice: Dictionary, context: Dictionary) -> void:
	if not _open_target.is_valid() or not _view.reference_context_matches(context) or choice.get("targetIdentity") == null: return
	while _operations.busy:
		await _view.get_tree().process_frame
		if not is_instance_valid(_view) or not _view.is_inside_tree() or not _view.reference_context_matches(context): return
	var field: String = context.field
	var kind := "monster-appearance" if field == "iconId" else ("extra-action-point" if field == "deathMacro" else ("spell" if field.begins_with("spells.") else "item"))
	_view.set_navigation_reference(field)
	_picker.cancel()
	await _open_target.call(kind, int(choice.value), str(choice.targetIdentity), {
		"targetStatus": "application-resource" if field == "iconId" and choice.ownership == "stock" else "resolved"})
