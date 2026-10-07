extends RefCounted

const Labels = preload("res://src/monster_review_labels.gd")
var _view
var _review
var _picker
var _operations: ProvidenceEditorOperation
var _read_bridge: Callable
var _context: Dictionary = {}
var _entry: Dictionary = {}


func initialize(view, review, operations: ProvidenceEditorOperation, read_bridge: Callable) -> void:
	_view = view
	_review = review
	_picker = review.get_node("ReplacementPicker")
	_operations = operations
	_read_bridge = read_bridge
	review.retarget_requested.connect(begin)
	_picker.search_requested.connect(search)
	_picker.accepted.connect(accept)


func begin(entry: Dictionary) -> void:
	if not _review.visible or not entry.get("canRetarget", false) or _review.get_meta("owner", "") != "record": return
	_entry = entry.duplicate(true)
	_context = {"field": "replacementMonster", "label": "replacement Monster", "allowNone": false,
		"destination": "%s · %s" % [Labels.owner(entry.source), Labels.field(entry.field, entry.source)],
		"currentValue": entry.targetId, "origin": _view.authoring_generation(),
		"revision": _view.browser.revision, "inputRevision": _review.input_revision}
	_picker.begin(_context, _review.get_node("%RetargetUse"))


func search(query: Dictionary, generation: int) -> void:
	var context := _context.duplicate(true)
	var response: Dictionary = await _operations.run_workflow(_read_bridge.call(), "Choose replacement Monster", _read.bind(query, context))
	if not _matches(context): _picker.cancel(false); return
	if response.get("busy", false): _picker.retry_search(query, generation); return
	_picker.receive_page(response, generation)


func _read(operation: ProvidenceEditorOperation, query: Dictionary, context: Dictionary) -> Dictionary:
	return await operation.request("monster-reference.list", {"expectedRevision": context.revision, "query": query})


func accept(choice: Dictionary, context: Dictionary) -> void:
	if _matches(context): _review.accept_retarget(_entry, choice)


func _matches(context: Dictionary) -> bool:
	return _review.visible and context == _context and _view.authoring_generation() == context.origin and _view.browser.revision == context.revision and _review.input_revision == context.inputRevision
