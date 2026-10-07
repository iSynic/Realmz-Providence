extends RefCounted

var _view: ProvidenceRuleAuthoringEditor
var _operations: ProvidenceEditorOperation
var _bridge: Callable
var _generation: Callable
var _request := 0
var _cache: Dictionary = {}

func initialize(view: ProvidenceRuleAuthoringEditor, operations: ProvidenceEditorOperation, bridge: Callable, generation: Callable) -> void:
	_view = view; _operations = operations; _bridge = bridge; _generation = generation
	view.catalog_applied.connect(load_rows)

func load_rows(rows: Array, revision: int) -> void:
	if _view.rule_kind != "race": return
	_request += 1
	var request_id := _request
	var generation: int = _generation.call()
	for row in rows:
		if row.ownership == "vacant": continue
		while _operations.busy:
			await _view.get_tree().process_frame
			if request_id != _request or generation != _generation.call(): return
		if _bridge.call() == null or request_id != _request or generation != _generation.call(): return
		var key := "%d:%d:%d" % [generation, revision, int(row.portrait)]
		if not _cache.has(key):
			var response: Dictionary = await _operations.run_workflow(_bridge.call(), "Read Rule catalog portrait", func(operation):
				return await operation.request("rule-reference.preview", {"expectedRevision": revision,
					"field": "defaultIconSet" if _view.rule_kind == "race" else "defaultIcon", "value": int(row.portrait)}))
			if request_id != _request or generation != _generation.call(): return
			var textures: Array = preload("res://src/spell_presentation.gd").decode(response).get("textures", [])
			_cache[key] = textures[0] if not textures.is_empty() else null
		_view.show_catalog_portrait(str(row.identity), _cache[key])

func close() -> void:
	_request += 1; _cache.clear()

func dispose() -> void:
	close(); _bridge = Callable(); _generation = Callable(); _view = null
