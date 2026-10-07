extends RefCounted

signal projection_applied(projection: Dictionary)
signal failed(message: String)
signal active_changed(active: bool)

var view: Control
var _map: ProvidenceMapDocumentController
var _land: ProvidenceLandEditor
var _authoring: RefCounted
var _operations: ProvidenceEditorOperation
var _bridge: RefCounted
var _context: Callable
var _accept: Callable
var _description: Callable
var _focus: Control
var _overlay: Control
var _generation := 0
var _origin: Dictionary = {}
var _pending: Dictionary = {}
var _strokes: Array = []
var _redo: Array = []
var _plan: Dictionary = {}
var _planned_intent: Dictionary = {}
var _stroke := preload("res://src/map_paint_stroke.gd").new()
var _sampled_tile := 0
var _reading := false
var _submitting := false
var _sequence := 0
var _visible_tiles: Dictionary = {}


func initialize(owner: Node, map: ProvidenceMapDocumentController, land: ProvidenceLandEditor, authoring: RefCounted, operations: ProvidenceEditorOperation, context: Callable, accept: Callable, description: Callable, focus: Control) -> void:
	_map=map; _land=land; _authoring=authoring; _operations=operations; _context=context; _accept=accept; _description=description; _focus=focus
	view=preload("res://src/magic_brush_window.tscn").instantiate(); owner.add_child(view)
	_overlay=land.get_node("%MagicOverlay")
	_overlay.gesture_started.connect(_begin); _overlay.gesture_changed.connect(_drag); _overlay.gesture_finished.connect(_finish)
	_overlay.gesture_canceled.connect(_cancel_stroke)
	view.apply_requested.connect(commit_selected); view.canceled.connect(discard_draft)
	view.changed.connect(_request_preview); view.comparison_changed.connect(_display)
	view.history_requested.connect(_history); view.recovery_requested.connect(check_original)
	map.document_opened.connect(_document_opened); map.document_cleared.connect(_clear)


func attach_session(bridge: RefCounted) -> void:
	_generation+=1; _bridge=bridge; _pending.clear(); _clear()


func _document_opened(_data: Dictionary, reset: bool) -> void:
	if reset: _generation+=1; _clear()
	elif is_open() and _pending.is_empty() and not _submitting:
		_plan.clear(); view.failure("The map changed. Cancel and reopen Magic to sample the current map."); _overlay.set_locked(true)


func _clear() -> void:
	_generation+=1; _sequence+=1; _origin.clear(); _strokes.clear(); _redo.clear(); _plan.clear(); _planned_intent.clear(); _stroke.clear(); _visible_tiles.clear()
	if is_instance_valid(_overlay): _overlay.set_active(false); _overlay.set_locked(false)
	if is_instance_valid(view): view.hide()
	active_changed.emit(false)


func is_open() -> bool:
	return not _origin.is_empty()


func _matches(origin: Dictionary) -> bool:
	return _bridge!=null and not origin.is_empty() and int(origin.generation)==_generation and origin.identity==_map.identity and not _map.is_dungeon


func open() -> Dictionary:
	if is_open(): return {"ok":true}
	var origin := {"identity":_map.identity,"generation":_generation,"expectedRevision":int(_context.call().revision)}
	var response := await _operations.run_workflow(_bridge,"Open Magic brush",func(op): return await op.request("magic-brush.open",{"identity":origin.identity,"expectedRevision":origin.expectedRevision}),null,true)
	if not _matches(origin): return {"ok":false}
	if not response.get("ok",false): failed.emit(str(response.get("error","Magic could not open."))); return response
	_origin=origin; _origin.merge(response.result,true)
	_strokes.clear(); _redo.clear(); _plan.clear(); _planned_intent.clear()
	_authoring.suspend(); _land.set_interaction_mode("select")
	view.show(); view.get_node("%ShowBefore").set_pressed_no_signal(false)
	view.sample("Press a map tile to sample it; drag to continue."); _controls(); view.present({},0)
	active_changed.emit(true); _overlay.set_active(true)
	return response


func draft() -> Dictionary:
	return {"tilesetId":_origin.get("tilesetId",""),"atlasBlob":_origin.get("atlasBlob"),"mappingRevision":int(_origin.get("mappingRevision",0)),"tolerance":view.tolerance(),"strokes":_strokes.duplicate(true)}


func _begin(cell: Vector2i) -> void:
	if not _matches(_origin) or _submitting or not _pending.is_empty(): return
	var tile: Variant = _land.terrain_tile_at(cell)
	if _visible_tiles.has(cell): tile=_visible_tiles[cell]
	if tile==null or int(tile)<0 or int(tile)>200:
		view.failure("Special artwork uses Stamps. Choose an ordinary atlas tile for Magic."); return
	_sampled_tile=int(tile); _stroke.orthogonal=not _linear_family(_sampled_tile).is_empty(); _stroke.begin(cell)
	view.get_node("%ShowBefore").set_pressed_no_signal(false)
	var family := _family(_sampled_tile)
	view.sample(_description.call(_sampled_tile)+"\n"+("Joining "+family if not family.is_empty() else "Exact tile · no shape adjustment"))
	view.get_node("%Apply").disabled=true
	if _stroke.orthogonal: _request_preview()


func _family(tile: int) -> String:
	var linear := _linear_family(tile)
	if not linear.is_empty(): return linear
	var family := "water" if tile in range(1,33) or tile in range(38,52) or tile==60 else "mountains" if tile in range(61,94) else "forest" if tile in range(121,130) else ""
	for row: Dictionary in _origin.get("presets",[]):
		if row.identity==family and row.get("available",false): return str(row.name)
	return ""


func _linear_family(tile: int) -> String:
	for row: Dictionary in _origin.get("linearFamilies", []):
		if row.tiles.any(func(candidate): return int(candidate)==tile): return str(row.name)
	return ""


func _preview_intent() -> Dictionary:
	var intent := draft()
	if _stroke.active and _stroke.orthogonal:
		intent.strokes.append({"sampledTile":_sampled_tile,"cells":_stroke.cells.map(func(cell): return {"x":cell.x,"y":cell.y})})
	return intent


func _drag(_start: Vector2i, end: Vector2i, _positions: Array) -> void:
	if not _stroke.active: return
	var previous_count := _stroke.cells.size()
	_stroke.append(end)
	var shown := _plan.duplicate(true)
	var cells: Array = _stroke.cells.map(func(cell): return {"x":cell.x,"y":cell.y,"tile":_sampled_tile})
	shown.terrainCells=shown.get("terrainCells",[])+cells
	for cell: Dictionary in cells: _visible_tiles[Vector2i(int(cell.x),int(cell.y))]=cell.tile
	_overlay.show_preview(cells,shown)
	if _stroke.orthogonal and _stroke.cells.size()!=previous_count: _request_preview()


func _finish(_start: Vector2i, end: Vector2i, _positions: Array) -> void:
	if not _stroke.active: return
	_stroke.append(end)
	var count := _stroke.cells.size()
	for stroke: Dictionary in _strokes: count+=stroke.cells.size()
	if _strokes.size()>=128 or count>32768:
		_cancel_stroke(); view.failure("Apply this draft before adding more strokes."); return
	_strokes.append({"sampledTile":_sampled_tile,"cells":_stroke.cells.map(func(cell): return {"x":cell.x,"y":cell.y})})
	_stroke.clear(); _redo.clear(); _request_preview()


func _cancel_stroke() -> void:
	var live_preview := _stroke.orthogonal
	_stroke.clear(); _display(); _controls()
	if live_preview: _request_preview()


func _history(redo: bool) -> void:
	if _submitting or not _pending.is_empty() or _stroke.active: return
	var source: Array=_redo if redo else _strokes
	var destination: Array=_strokes if redo else _redo
	if source.is_empty(): return
	destination.append(source.pop_back()); _request_preview()


func _request_preview() -> void:
	_sequence+=1; _planned_intent.clear(); view.get_node("%Apply").disabled=true; _controls()
	if not _reading: _read_previews()


func _read_previews() -> void:
	_reading=true
	while _matches(_origin) and _pending.is_empty():
		var sequence:=_sequence; var origin:=_origin.duplicate(true); var intent:=_preview_intent()
		while _operations.busy: await view.get_tree().process_frame
		if not _matches(origin): break
		var params:={"identity":origin.identity,"expectedRevision":int(origin.expectedRevision),"intent":intent}
		var response:=await _operations.run_workflow(_bridge,"Preview Magic strokes",func(op): return await op.request("magic-brush.preview",params),null,true)
		if not _matches(origin): break
		if sequence!=_sequence: continue
		if response.get("ok",false):
			_plan=response.result; _planned_intent=intent; view.present(_plan,_strokes.size()); _display()
			if _stroke.active and not _stroke.orthogonal: _drag(Vector2i.ZERO,_stroke.cells.back(),[])
		else: _failure(response,origin)
		break
	_reading=false; _controls()


func _display() -> void:
	if not is_open(): return
	_visible_tiles.clear()
	if not view.get_node("%ShowBefore").button_pressed:
		for cell: Dictionary in _plan.get("terrainCells",[]): _visible_tiles[Vector2i(int(cell.x),int(cell.y))]=cell.tile
	_overlay.show_preview([],{"originalMask":_plan.get("originalMask",[])} if view.get_node("%ShowBefore").button_pressed else _plan)


func _controls() -> void:
	view.controls(_submitting or not _pending.is_empty(),not _strokes.is_empty(),not _redo.is_empty(),not _pending.is_empty())
	view.get_node("%Apply").disabled=_submitting or _reading or _stroke.active or not _pending.is_empty() or _planned_intent!=draft() or not _plan.get("canApply",false)


func has_unapplied_changes() -> bool:
	return not _pending.is_empty() or is_open() and (not _strokes.is_empty() or _stroke.active or _submitting)


func discard_draft() -> void:
	if _submitting or not _pending.is_empty(): return
	_clear()
	if is_instance_valid(_focus) and _focus.is_inside_tree(): _focus.grab_focus()


func commit_selected() -> Dictionary:
	if _submitting or _reading or _stroke.active or not _pending.is_empty() or _planned_intent!=draft() or not _plan.get("canApply",false): return {"ok":false,"error":"Wait for a valid Magic preview before Apply."}
	var origin:=_origin.duplicate(true)
	var params:={"identity":origin.identity,"expectedRevision":int(origin.expectedRevision),"intent":draft(),"operationId":Crypto.new().generate_random_bytes(32).hex_encode()}
	_submitting=true; _overlay.set_locked(true); _controls()
	var response:=await _operations.run_workflow(_bridge,"Apply Magic strokes",func(op): return await op.request("magic-brush.apply",params),null,true)
	_submitting=false
	if not _matches(origin): return response
	if response.get("outcomeUnknown",false): _pending={"origin":origin,"params":params}
	if not response.get("ok",false): _failure(response,origin)
	elif _accept.call(response):
		projection_applied.emit(response.result)
		for cell: Dictionary in response.result.paintedCells: _land.update_cell(int(cell.x),int(cell.y),int(cell.tile))
		_land.apply_terrain_delta(response.result); discard_draft()
	_overlay.set_locked(not _pending.is_empty()); _controls()
	return response


func _failure(response: Dictionary, origin: Dictionary) -> void:
	if response.get("outcomeUnknown",false) and _pending.is_empty(): _pending={"origin":origin,"readOnly":true}
	_overlay.set_locked(not _pending.is_empty()); _controls()
	view.failure(str(response.get("error","Magic could not complete. The draft is kept.")))


func check_original() -> void:
	if _pending.is_empty() or _submitting: return
	var pending:=_pending.duplicate(true)
	var lookup:={} if pending.get("readOnly",false) else {"domain":"project","operationId":pending.params.operationId,"expectedIntent":{"method":"magic-brush.apply","params":pending.params}}
	_submitting=true; _controls()
	var response:=await _operations.recover_world(_bridge,lookup)
	_submitting=false
	if not _matches(pending.origin): return
	if not response.get("worldRecoveryConfirmed",false): _failure(response,pending.origin); return
	var committed:bool=not pending.get("readOnly",false) and response.result.outcome=="committed"
	response=await _operations.run_workflow(_bridge,"Read recovered Magic destination",_refresh,null,true)
	if not _matches(pending.origin): return
	if not response.get("ok",false): _failure(response,pending.origin); return
	_pending.clear(); _overlay.set_locked(false)
	if committed: discard_draft()
	else: _request_preview()


func _refresh(operation: ProvidenceEditorOperation) -> Dictionary:
	var response:=await operation.request("session.describe",{})
	if not response.get("ok",false): return response
	_origin.expectedRevision=int(response.result.revision); projection_applied.emit(response.result)
	return await _map.refresh_history(operation,response.result)


func dispose() -> void:
	attach_session(null)
	_map.document_opened.disconnect(_document_opened); _map.document_cleared.disconnect(_clear)
	_map=null; _authoring=null; _context=Callable(); _accept=Callable(); _description=Callable()
