extends RefCounted

var _view: ProvidenceSpellEditor
var _operations: ProvidenceEditorOperation
var _read_bridge: Callable
var _generation: Callable
var _read_context: Callable
var _review


func initialize(view: ProvidenceSpellEditor, operations: ProvidenceEditorOperation, read_bridge: Callable, generation: Callable, read_context: Callable) -> void:
	_view = view; _operations = operations; _read_bridge = read_bridge; _generation = generation; _read_context = read_context
	_review = preload("res://src/spell_operation_review.tscn").instantiate()
	view.add_child(_review)
	view.record_requested.connect(review_record)
	_review.accepted.connect(accept)
	_review.review_requested.connect(func(destination: int, context: Dictionary): review_record(str(context.kind), destination))


func review_record(kind: String, destination := -1) -> void:
	if _read_bridge.call() == null or _view.has_unapplied_changes(): return
	var context := {"kind": kind, "generation": _generation.call(), "state": _view.read_state()}
	var params := {"expectedRevision": int(_read_context.call().revision) if kind == "new" else _view.draft.revision}
	if destination >= 0: params.destinationRecordIndex = destination
	if kind == "copy": params.copySource = _view.draft.document.get("copySource")
	if kind == "clear": params.recordIndex = int(_view.draft.definition.recordIndex)
	var method := "spell.clear.review" if kind == "clear" else "spell.allocation.review"
	var response: Dictionary = await _operations.run_workflow(_read_bridge.call(), "Review Spell " + kind, func(operation): return await operation.request(method, params))
	if context.generation != _generation.call() or context.state != _view.read_state(): return
	if not response.get("ok", false):
		if _review.visible: _review.show_failure(str(response.get("error", "This destination is unavailable.")))
		else: _view.show_submission(response)
		return
	_review.begin(response.result, context, _view.get_viewport().gui_get_focus_owner())


func accept(review: Dictionary, context: Dictionary) -> void:
	if context.generation != _generation.call() or context.state != _view.read_state(): return
	if int(review.revision) != int(_read_context.call().revision):
		_view.show_submission({"ok": false, "error": "The allocation review is stale. Review this operation again; no draft was replaced."})
		return
	if context.kind == "clear":
		_view.draft.replace_definition(review.draft.definition)
		_view.form.set_definition(_view.draft.definition, true)
		_view.draft_edited.emit()
		_view.selection_changed.emit(_view.draft.definition.duplicate(true))
	else: _view.begin_allocation(review.allocation.draft, int(review.revision))


func close() -> void:
	if is_instance_valid(_review): _review.cancel()


func dispose() -> void:
	close()
	_read_bridge = Callable(); _generation = Callable(); _read_context = Callable()
	_view = null
