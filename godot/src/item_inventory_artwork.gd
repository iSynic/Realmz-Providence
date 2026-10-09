extends RefCounted

var _view: ProvidenceItemEditor
var _operations: ProvidenceEditorOperation
var _read_bridge: Callable
var _generation: Callable
var _request := 0
var _revision := -1
var _cache: Dictionary = {}


func initialize(view: ProvidenceItemEditor, operations: ProvidenceEditorOperation, read_bridge: Callable, generation: Callable) -> void:
	_view = view; _operations = operations; _read_bridge = read_bridge; _generation = generation
	view.catalog_presented.connect(present)
	view.catalog_loading.connect(invalidate)


func invalidate() -> void:
	_request += 1


func reset() -> void:
	invalidate()
	_cache.clear()
	_revision = -1


func dispose() -> void:
	reset()
	_view.catalog_presented.disconnect(present)
	_view.catalog_loading.disconnect(invalidate)
	_view = null
	_operations = null
	_read_bridge = Callable()
	_generation = Callable()


func present(rows: Array, revision: int) -> void:
	invalidate()
	if revision != _revision:
		_cache.clear()
		_revision = revision
	_load.call_deferred(rows.duplicate(true), _request, _generation.call())


func _load(rows: Array, request_id: int, generation: int) -> void:
	for index in rows.size():
		if not _current(request_id, generation): return
		var row: Dictionary = rows[index]
		var icon_id := int(row.get("iconId", 0))
		if icon_id == 0: continue
		if not _cache.has(icon_id):
			while _operations.busy:
				await _view.get_tree().process_frame
				if not _current(request_id, generation): return
			if _operations.requires_reopen: return
			var response := await _operations.run_workflow(_read_bridge.call(), "", _resolve.bind(icon_id))
			if not _current(request_id, generation): return
			if response.get("outcomeUnknown", false): return
			# Presentation cache is bounded and revision-local; it is never content authority.
			if _cache.size() >= 64: _cache.erase(_cache.keys()[0])
			_cache[icon_id] = response.get("preview", {})
		_view.set_catalog_artwork(int(row.get("catalogIndex", index)), str(row.identity), _cache[icon_id].get("texture"), str(_cache[icon_id].get("error", "")))


func _resolve(operation: ProvidenceEditorOperation, icon_id: int) -> Dictionary:
	var preview := await preload("res://src/item_artwork_lookup.gd").resolve(operation.request, icon_id)
	if preview.get("outcomeUnknown", false): return preview
	return {"ok": true, "preview": preview}


func _current(request_id: int, generation: int) -> bool:
	return is_instance_valid(_view) and _view.is_inside_tree() and request_id == _request and generation == _generation.call() and _read_bridge.call() != null
