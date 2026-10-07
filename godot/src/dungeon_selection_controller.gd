extends RefCounted

var _view: ProvidenceDungeonEditor
var _context: Callable
var _preview: Callable
var _failed_preview: Callable
var _origin: Dictionary = {}
var _request: Dictionary = {}
var _sequence := 0
var _generation := 0
var _reading := false


func initialize(view: ProvidenceDungeonEditor, context: Callable, preview: Callable, failed_preview: Callable) -> void:
	_view = view
	_context = context
	_preview = preview
	_failed_preview = failed_preview
	view.selection_stroke_started.connect(begin)
	view.selection_stroke_changed.connect(progress)
	view.selection_stroke_requested.connect(finish)
	view.selection_stroke_cancelled.connect(cancel)


func begin() -> void:
	_generation += 1
	_origin = _context.call().duplicate(true)
	_request = _view.selection_request()
	_sequence = 0


func progress() -> void:
	if _origin.is_empty(): return
	var positions := _view.paint_positions()
	if positions.is_empty(): return
	_request.start = {"x": positions.front().x, "y": positions.front().y}
	_request.end = {"x": positions.back().x, "y": positions.back().y}
	_sequence += 1
	if not _reading: _pump(_generation)


func _pump(generation: int) -> void:
	_reading = true
	var delivered := -1
	while generation == _generation and delivered != _sequence:
		var sequence := _sequence
		var params := {"identity": _origin.identity, "expectedRevision": _origin.revision, "selection": _request.duplicate(true)}
		var response: Dictionary = await _preview.call("map.selection-preview", params, _origin)
		if generation != _generation or _context.call() != _origin: break
		delivered = sequence
		if sequence != _sequence: continue
		if response.get("ok", false): _view.show_selection_preview(response.result.cells)
		else:
			cancel()
			_view.cancel_paint_stroke()
			_failed_preview.call(response)
			break
	_reading = false


func finish(positions: Array) -> void:
	if _origin.is_empty() or positions.is_empty(): cancel(); return
	var origin := _origin.duplicate(true)
	var selection := _request.duplicate(true)
	selection.start = {"x": positions.front().x, "y": positions.front().y}
	selection.end = {"x": positions.back().x, "y": positions.back().y}
	_generation += 1
	_origin.clear()
	while _reading: await _view.get_tree().process_frame
	_view.guard_navigation(_accept_selection.bind(selection, origin))


func _accept_selection(selection: Dictionary, origin: Dictionary) -> void:
	var current: Dictionary = _context.call()
	if current.identity != origin.identity or current.generation != origin.generation: cancel(); return
	var params := {"identity": current.identity, "expectedRevision": current.revision, "selection": selection}
	var response: Dictionary = await _preview.call("map.selection-preview", params, current)
	if _context.call() != current: cancel(); return
	if response.get("ok", false): _view.accept_selection(response.result)
	else: cancel(); _failed_preview.call(response)


func cancel() -> void:
	_generation += 1
	_origin.clear()
	if is_instance_valid(_view) and _view.is_node_ready(): _view.show_selection_preview(_view.draft.cells)
