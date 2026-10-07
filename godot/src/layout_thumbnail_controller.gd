extends RefCounted

var _view: ProvidenceLandLayoutEditor
var _operations: ProvidenceEditorOperation
var _bridge: RefCounted
var _sequence := 0
var _reading := false
var _paused := false


func initialize(view: ProvidenceLandLayoutEditor, operations: ProvidenceEditorOperation) -> void:
	_view = view; _operations = operations
	view.previews_requested.connect(request_visible)


func attach_session(bridge: RefCounted) -> void:
	_sequence += 1; _bridge = bridge; _paused = false


func request_visible() -> void:
	_sequence += 1
	# Visibility changes precede tab presentation; never acquire its worker inline.
	if not _paused and _bridge != null and _view.is_visible_in_tree(): _drain.call_deferred()


func _drain() -> void:
	if _reading or _paused or _bridge == null or not _view.is_visible_in_tree() or _operations.busy or _view.thumbnail_candidates().is_empty(): return
	_reading = true
	var response: Dictionary = await _operations.run_workflow(_bridge,"Read visible map thumbnails",read_visible,null,true)
	_reading = false
	if response.get("ok",false) and not _view.thumbnail_candidates().is_empty(): request_visible()


func read_visible(operation: ProvidenceEditorOperation) -> Dictionary:
	var sequence := _sequence; var revision: int = _view.catalog_revision
	for identity in _view.thumbnail_candidates():
		if _bridge == null or sequence != _sequence or not _view.is_visible_in_tree(): break
		var response := await operation.request("map.thumbnail",{"identity":identity,"expectedRevision":revision})
		if _bridge == null or sequence != _sequence: break
		if response.get("outcomeUnknown",false): return response
		if response.get("ok",false): _view.present_thumbnail(identity,response.result)
		else: _view.present_thumbnail(identity,{"revision":revision,"available":false,"reason":str(response.get("error","Map preview unavailable"))})
	return {"ok":true}


func pause() -> void:
	_paused = true; _sequence += 1
	while _reading: await _view.get_tree().process_frame


func resume() -> void:
	_paused = false


func dispose() -> void:
	attach_session(null)
	_view.previews_requested.disconnect(request_visible)
