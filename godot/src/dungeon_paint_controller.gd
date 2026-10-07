extends RefCounted

var _view: ProvidenceDungeonEditor
var _context: Callable
var _preview: Callable
var _failed_preview: Callable
var _origin: Dictionary = {}
var _params: Dictionary = {}
var _latest: Dictionary = {}
var _sequence := 0
var _generation := 0
var _reading := false
var _finishing := false


func initialize(view: ProvidenceDungeonEditor, context: Callable, preview: Callable, failed_preview: Callable) -> void:
	_view = view
	_context = context
	_preview = preview
	_failed_preview = failed_preview
	view.paint_stroke_started.connect(begin)
	view.paint_stroke_changed.connect(progress)
	view.paint_stroke_requested.connect(finish)
	view.paint_stroke_cancelled.connect(cancel)


func begin() -> void:
	if _reading or _finishing or not _view.can_draw():
		_view.cancel_paint_stroke()
		return
	_generation += 1
	_origin = _context.call().duplicate(true)
	_params = {"identity": _origin.identity, "expectedRevision": _origin.revision,
		"edit": {"cells": [], "changes": _view.draw_changes()}}
	_latest.clear()
	_sequence = 0


func progress(_count: int) -> void:
	if _origin.is_empty() or _finishing: return
	_params.edit.cells = _coordinates(_view.paint_positions())
	_sequence += 1
	if not _reading: _pump(_generation)


func _pump(generation: int) -> void:
	_reading = true
	var delivered := -1
	while generation == _generation and delivered != _sequence:
		var sequence := _sequence
		var response: Dictionary = await _preview.call(_params.duplicate(true), _origin)
		if generation != _generation or not _matches(): break
		delivered = sequence
		if sequence != _sequence: continue
		_latest = response
		if response.get("ok", false):
			_view.show_paint_preview(response.result)
		elif response.get("outcomeUnknown", false):
			var kept := _params.duplicate(true)
			cancel()
			_view.cancel_paint_stroke()
			_view.stage_paint(kept, response.get("result", {}))
			_failed_preview.call(response)
			break
		else: break
	_reading = false


func finish(positions: Array) -> void:
	if _origin.is_empty() or _finishing: return
	_finishing = true
	while _reading: await _view.get_tree().process_frame
	if not _matches():
		cancel()
		return
	var submitted := _params.duplicate(true)
	submitted.edit.cells = _coordinates(positions)
	if submitted.edit.cells.is_empty(): cancel(); return
	# The release may add the final cell after the last coalesced preview.
	var response: Dictionary = _latest
	if response.get("ok", false) and submitted.edit.cells != _params.edit.cells:
		response = await _preview.call(submitted, _origin)
	if not _matches(): cancel(); return
	_origin.clear()
	_finishing = false
	if response.get("ok", false) and not response.result.get("canApply", false):
		_view.clear_paint_preview()
		_view.show_feature_status("These cells already match the draw preset. No history entry was added.")
		return
	_view.stage_paint(submitted, response.get("result", {}))
	if not response.get("ok", false): _failed_preview.call(response); return
	await _view.commit_selected()


func cancel() -> void:
	_generation += 1
	_origin.clear()
	_latest.clear()
	_finishing = false
	if is_instance_valid(_view): _view.clear_paint_preview()


func _matches() -> bool:
	return not _origin.is_empty() and _context.call() == _origin


func _coordinates(positions: Array) -> Array:
	var cells: Array = []
	for cell: Vector2i in positions: cells.append({"x": cell.x, "y": cell.y})
	return cells
