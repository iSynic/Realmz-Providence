extends RefCounted

var _view: ProvidenceRuleAuthoringEditor
var _operations: ProvidenceEditorOperation
var _read_bridge: Callable
var _generation: Callable
var _read_context: Callable
var _review

func initialize(view: ProvidenceRuleAuthoringEditor, operations: ProvidenceEditorOperation, bridge: Callable, generation: Callable, read_context: Callable) -> void:
	_view = view; _operations = operations; _read_bridge = bridge; _generation = generation; _read_context = read_context
	_review = preload("res://src/rule_operation_review.tscn").instantiate()
	view.add_child(_review)
	view.record_requested.connect(review_record)
	_review.accepted.connect(accept)
	_review.review_requested.connect(func(destination: int, context: Dictionary): review_record(str(context.action), destination))

func review_record(action: String, destination := -1) -> void:
	if _read_bridge.call() == null or _view.has_unapplied_changes(): return
	var context := {"action": action, "generation": _generation.call(), "state": _view.read_state()}
	var params := {"kind": _view.rule_kind, "expectedRevision": int(_read_context.call().revision)}
	if action != "new": params.expectedRevision = _view.draft.revision
	if destination >= 0: params.destinationClassicId = destination
	if action == "copy": params.copySource = _view.draft.document.get("copySource")
	if action == "clear": params.classicId = int(_view.selected_definition().classicId)
	var method := "rule.clear.review" if action == "clear" else "rule.allocation.review"
	var response: Dictionary = await _operations.run_workflow(_read_bridge.call(), "Review Rule " + action, func(operation): return await operation.request(method, params))
	if context.generation != _generation.call() or context.state != _view.read_state(): return
	if not response.get("ok", false):
		if _review.visible: _review.show_failure(str(response.get("error", "This destination is unavailable.")))
		else: _view.show_submission(response)
		return
	_review.begin(response.result, context, _view.get_viewport().gui_get_focus_owner())

func accept(review: Dictionary, context: Dictionary) -> void:
	if context.generation != _generation.call() or context.state != _view.read_state(): return
	if int(review.revision) != int(_read_context.call().revision):
		_view.show_submission({"ok": false, "error": "The allocation review is stale. Review this operation again; no draft was replaced."}); return
	if context.action == "clear": _view.stage_clear(review.draft)
	else: _view.begin_allocation(review.draft, int(review.revision), int(review.authorId))

func close() -> void:
	if is_instance_valid(_review): _review.cancel()

func dispose() -> void:
	close()
	_read_bridge = Callable(); _generation = Callable(); _read_context = Callable(); _view = null
