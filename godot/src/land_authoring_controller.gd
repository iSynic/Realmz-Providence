extends RefCounted

signal projection_applied(projection: Dictionary)
signal failed(message: String)
signal status_changed(message: String)
signal stamp_selected(resource: Dictionary, presentation: Dictionary)
signal stamp_state_changed(state: Dictionary)
signal tool_activated(tool: String)
signal mask_accepted(cells: Array)
signal mask_canceled
signal mask_started
signal mask_settled
signal mask_failed(response: Dictionary)

var options := {"shape": "freehand", "filled": true, "match": "connected-exact", "combine": "replace",
	"variation": "single", "chance": 100, "seed": 1234, "replace": false, "replaceTile": 1}
var selected: Array = []
var _view: ProvidenceLandEditor
var _map: ProvidenceMapDocumentController
var _operations: ProvidenceEditorOperation
var _workspace
var _overlay: Control
var _options: Window
var _review: Window
var _selection_actions: Window
var _selection_origin: Dictionary = {}
var _bridge: RefCounted
var _generation := 0
var _gesture_generation := 0
var _gesture_origin: Dictionary = {}
var _tool := "select"
var _queue: Dictionary = {}
var _reading := false
var _draft: Dictionary = {}
var _pending: Dictionary = {}
var _guard: Callable
var _accept: Callable
var _focus: WeakRef
var _submitting := false
var _stamp: Dictionary = {}
var _stamp_revision := 0
var _mask_state: Dictionary = {}
var _mask_queue: Array[Dictionary] = []
var _mask_generation := 0
var _accepting_mask := false
var _placing_stamp := false


func initialize(view: ProvidenceLandEditor, map: ProvidenceMapDocumentController, operations: ProvidenceEditorOperation, workspace, owner: Node, guard: Callable, accept: Callable) -> void:
	_view = view; _map = map; _operations = operations; _workspace = workspace; _guard = guard; _accept = accept
	_overlay = view.get_node("%LandAreaOverlay")
	_options = preload("res://src/land_paint_options.tscn").instantiate(); owner.add_child(_options)
	_review = preload("res://src/land_area_review.tscn").instantiate(); owner.add_child(_review)
	_selection_actions = preload("res://src/land_selection_actions.tscn").instantiate(); owner.add_child(_selection_actions)
	_selection_actions.options_accepted.connect(_accept_selection_options)
	_selection_actions.action_requested.connect(_selection_action)
	view.get_node("%SelectionActions").pressed.connect(open_selection_actions)
	workspace.paint.workspace.authoring_tool_requested.connect(set_tool)
	view.cell_selected.connect(_single_cell_selected)
	view.selection_restored.connect(restore_selection)
	view.visibility_changed.connect(_selection_context_changed)
	_overlay.gesture_started.connect(_begin_gesture)
	_overlay.gesture_changed.connect(_gesture_changed)
	_overlay.gesture_finished.connect(_gesture_finished)
	_overlay.gesture_canceled.connect(_cancel_from_overlay)
	_overlay.pointer_cell_changed.connect(_hover_stamp)
	_options.options_accepted.connect(_accept_options)
	_options.visibility_changed.connect(func(): if not _options.visible: _view.present_paint_tool(_tool))
	_review.close_requested.connect(discard_draft)
	_review.get_node("%CancelArea").pressed.connect(discard_draft)
	_review.get_node("%ApplyArea").pressed.connect(commit_selected)
	view.get_node("%FillSelection").pressed.connect(review_selection.bind("paint"))
	view.get_node("%ClearSelection").pressed.connect(review_selection.bind("erase"))
	view.get_node("%ReplaceSelection").pressed.connect(review_selection.bind("replace"))
	view.get_node("%ClearAreaSelection").pressed.connect(clear_selection)
	view.get_node("%ReconcileArea").pressed.connect(check_original)
	map.document_opened.connect(_document_opened)
	map.document_cleared.connect(_clear_document)
	attach_session(_bridge)


func attach_session(bridge: RefCounted) -> void:
	end_mask()
	_generation += 1; _bridge = bridge; _pending.clear(); _draft.clear(); _stamp.clear(); _reading = false; _submitting = false
	if _view == null: return
	_options.close(); _review.hide(); _clear_document()
	_view.get_node("%ReconcileArea").hide()


func _origin() -> Dictionary:
	return {"identity": _map.identity, "revision": _workspace.paint_context().revision, "generation": _generation}


func _matches(origin: Dictionary) -> bool:
	return _bridge != null and int(origin.generation) == _generation and origin.identity == _map.identity and not _map.is_dungeon


func _document_opened(_map_data: Dictionary, reset: bool) -> void:
	cancel_gesture()
	if reset: clear_selection(); discard_draft(); _options.close(); _selection_origin.clear(); _selection_actions.close()
	_activate_tool(_tool)


func _clear_document() -> void:
	_selection_origin.clear(); _selection_actions.close()
	cancel_gesture(); selected.clear(); _overlay.accept_selection([]); _overlay.set_active(false)
	_refresh_selection()


func set_tool(tool: String) -> void:
	if tool == "shapes":
		if has_unapplied_changes(): _guard.call(_show_options, "changing Land options")
		else: _show_options()
		return
	if has_unapplied_changes():
		_guard.call(_activate_tool.bind(tool), "changing Land tools"); return
	_activate_tool(tool)


func _activate_tool(tool: String) -> void:
	_tool = tool; cancel_gesture()
	var custom_brush: bool = tool == "paint" and (options.variation != "single" or int(options.chance) != 100 or options.replace)
	var shaped_selection: bool = tool == "wand" or tool == "select" and options.shape != "freehand"
	_overlay.set_active(_bridge != null and _workspace.paint_context().active and not _map.identity.is_empty() and not _map.is_dungeon and (tool in ["shapes", "fill", "erase"] or tool == "stamp" and not _stamp.is_empty() or shaped_selection or custom_brush))
	if tool == "paint" and not custom_brush: _overlay.selected = selected; _overlay.queue_redraw()
	if tool in ["fill", "erase"]: status_changed.emit("%s · preview before release · Esc cancels" % tool.capitalize())
	if tool == "stamp" and _stamp.is_empty(): _workspace.paint_resources.open("stamp")
	tool_activated.emit(tool)


func begin_mask(mask: Array, shape: Dictionary, continuous := false) -> void:
	end_mask()
	_mask_state = {"options": options.duplicate(true), "selected": selected.duplicate(true), "tool": _tool, "continuous": continuous}
	options.merge(shape, true); selected = _integer_cells(mask); _tool = "select"
	cancel_gesture(); _overlay.accept_selection(selected); _overlay.set_active(true)
	status_changed.emit("Draw Smart terrain mask · release or Enter to review · Esc returns without changes")


func end_mask() -> void:
	if _mask_state.is_empty(): return
	_mask_generation += 1; _mask_queue.clear()
	_overlay.set_locked(false)
	options = _mask_state.options; selected = _mask_state.selected; var tool: String = _mask_state.tool
	_mask_state.clear(); _overlay.accept_selection(selected); _activate_tool(tool); _refresh_selection()


func lock_mask(locked: bool) -> void:
	if not _mask_state.is_empty(): _overlay.set_locked(locked)


func has_mask_gesture() -> bool:
	return not _mask_state.is_empty() and (not _gesture_origin.is_empty() or _accepting_mask or not _mask_queue.is_empty())


func preview_mask(mask: Array, plan: Dictionary) -> void:
	_overlay.show_preview(mask, plan)


func _cancel_from_overlay() -> void:
	if _mask_state.get("continuous",false):
		cancel_gesture(); _overlay.accept_selection(selected); mask_canceled.emit()
	elif not _mask_state.is_empty(): end_mask(); mask_canceled.emit()
	else: cancel_gesture()


func select_stamp(resource: Dictionary, resource_revision: int, presentation: Dictionary = {}) -> void:
	_stamp = resource.duplicate(true); _stamp_revision = resource_revision
	_activate_tool("stamp"); _view.present_paint_tool("stamp")
	stamp_selected.emit(_stamp, presentation); _stamp_state()
	status_changed.emit("%s · move to preview · release to place · Esc cancels" % resource.name)


func _stamp_params(origin: Dictionary, cell: Dictionary) -> Dictionary:
	return {"identity": origin.identity, "expectedRevision": int(origin.revision), "resourceIdentity": _stamp.identity,
		"resourceRevision": _stamp_revision, "origin": {"x": int(cell.x), "y": int(cell.y)}}


func _show_options() -> void:
	_options.open(options, _view.get_node("PaintTools/Shapes"), _view.get_node("%MapTitle").text)


func open_selection_actions() -> void:
	if selected.is_empty() or _bridge == null or _map.identity.is_empty() or _map.is_dungeon: return
	if has_unapplied_changes(): _guard.call(open_selection_actions, "opening Selection Actions"); return
	_selection_origin = _origin()
	_selection_actions.open(options, _view.get_node("%SelectionActions"), _view.get_node("%MapTitle").text, selected, not _workspace.paint.workspace.current_brush().is_empty())


func _accept_selection_options(value: Dictionary) -> void:
	if _selection_origin.is_empty() or not _matches(_selection_origin): return
	options = value.duplicate(true)
	_activate_tool("select"); _view.present_paint_tool("select")
	status_changed.emit("%s selection · %s · Escape keeps the existing selection" % [str(options.shape).capitalize(), options.combine])


func _selection_action(action: String) -> void:
	if _selection_origin.is_empty() or not _matches(_selection_origin): return
	var focus: Control = _view.get_node("%SelectionActions")
	if action == "stamp": await _workspace.paint_resources.capture_selection(focus)
	else: await review_selection(action, focus)


func _accept_options(value: Dictionary) -> void:
	options = value.duplicate(true)
	_tool = "shapes"; cancel_gesture()
	_overlay.set_active(_bridge != null and _workspace.paint_context().active and not _map.identity.is_empty() and not _map.is_dungeon)
	_view.present_paint_tool("shapes")
	status_changed.emit("%s · %s · preview before release · Esc cancels" % [options.shape.capitalize(), options.variation])


func cancel_gesture() -> void:
	_gesture_generation += 1; _queue.clear(); _gesture_origin.clear(); _overlay.cancel_gesture()


func cancel_selection_preview() -> bool:
	if _tool not in ["select", "wand"] or not _mask_state.is_empty(): return true
	var origin := _origin()
	cancel_gesture()
	while (_reading or _operations.busy) and is_instance_valid(_view) and _view.is_inside_tree():
		await _view.get_tree().process_frame
	return _matches(origin)


func _begin_gesture(_cell: Vector2i) -> void:
	_gesture_generation += 1
	_gesture_origin = _origin()
	if not _mask_state.is_empty(): mask_started.emit()


func suspend() -> void:
	_selection_origin.clear(); _selection_actions.close()
	cancel_gesture(); _overlay.set_active(false); _options.close()


func _selection_context_changed() -> void:
	if not _view.is_visible_in_tree():
		_selection_origin.clear(); _selection_actions.close()


func clear_selection() -> void:
	selected.clear(); _overlay.accept_selection([]); _refresh_selection()


func restore_selection(cells: Array, tool: String) -> void:
	selected = _integer_cells(cells).filter(func(cell): return int(cell.x)>=0 and int(cell.x)<90 and int(cell.y)>=0 and int(cell.y)<90)
	if selected.size()>8100: selected.resize(8100)
	_overlay.accept_selection(selected); _refresh_selection(); _activate_tool(tool)
	_view.present_paint_tool(tool)


func _single_cell_selected(x: int, y: int, _tile: int, _action: Dictionary) -> void:
	if _mask_state.is_empty() and _tool == "select" and options.shape == "freehand":
		selected = [{"x": x, "y": y}]; _overlay.accept_selection(selected); _refresh_selection()


func _refresh_selection() -> void:
	_view.get_node("%Summary").text = "%d selected · Action Point records retained" % selected.size()
	for name in ["FillSelection", "ClearSelection", "ReplaceSelection", "ClearAreaSelection", "SelectionActions"]:
		_view.get_node("%" + name).disabled = selected.is_empty() or not _pending.is_empty()
	for name in ["FillSelection", "ReplaceSelection"]:
		_view.get_node("%" + name).disabled = selected.is_empty() or not _pending.is_empty() or _workspace.paint.workspace.current_brush().is_empty()


func _selection_request(start: Vector2i, end: Vector2i, positions: Array) -> Dictionary:
	var shape: String = options.match if _tool == "fill" or options.shape == "connected" else str(options.shape)
	if _tool == "wand": shape = "connected-exact"
	if _tool == "paint" or _tool == "erase": shape = "freehand"
	if _tool == "select" and shape == "freehand" and _mask_state.is_empty(): shape = "cell"
	var path: Array = []; for cell: Vector2i in positions: path.append({"x": cell.x, "y": cell.y})
	return {"shape": shape, "start": {"x": start.x, "y": start.y}, "end": {"x": end.x, "y": end.y},
		"filled": options.filled, "operation": options.combine if _tool in ["select", "wand"] else "replace",
		"current": _integer_cells(selected) if _tool in ["select", "wand"] else [], "path": path}


func _intent(cells: Array, operation: String) -> Dictionary:
	var brush: Dictionary = _workspace.paint.workspace.current_brush()
	return {"tilesetId": _view.atlas_projection.get("tilesetId", ""), "cells": _integer_cells(cells),
		"operation": "replace" if operation == "paint" and options.replace else operation,
		"selectedTile": int(brush.get("cells", [1])[0]), "replaceTile": int(options.replaceTile),
		"variation": options.variation, "variationTiles": brush.get("cells", []).map(func(tile): return int(tile)),
		"fillPercent": int(options.chance), "seed": int(options.seed)}


func _integer_cells(cells: Array) -> Array:
	return cells.map(func(cell): return {"x": int(cell.x), "y": int(cell.y)})


func _gesture_changed(start: Vector2i, end: Vector2i, positions: Array) -> void:
	if _bridge == null or not _pending.is_empty() or not _draft.is_empty(): return
	if _gesture_origin.is_empty(): return
	_queue = {"origin": _gesture_origin.duplicate(true), "selection": _selection_request(start, end, positions), "sequence": _gesture_generation}
	if not _reading: _drain()


func _hover_stamp(cell: Vector2i) -> void:
	if _tool != "stamp" or not _mask_state.is_empty() or _placing_stamp or _submitting or has_unapplied_changes(): return
	_gesture_generation += 1; _queue.clear()
	if cell.x<0: _overlay.cancel_gesture(); return
	_queue = {"origin":_origin(),"selection":{"end":{"x":cell.x,"y":cell.y}},"sequence":_gesture_generation}
	if not _reading: _drain()


func _drain() -> void:
	_reading = true
	var generation := _generation
	while generation == _generation and not _queue.is_empty():
		var request := _queue.duplicate(true); _queue.clear()
		if _operations.busy:
			await _view.get_tree().process_frame
			if int(request.sequence) == _gesture_generation and _queue.is_empty(): _queue = request
			continue
		var response := await _operations.run_workflow(_bridge, "Preview Land gesture", _preview_gesture.bind(request), null, true)
		if _matches(request.origin) and int(request.sequence) == _gesture_generation and _queue.is_empty():
			if response.get("ok", false):
				_overlay.show_preview(response.result.cells, response.result.get("paint", {}))
				if _tool == "stamp": status_changed.emit(preload("res://src/stamp_preview.gd").status(_stamp,response.result))
			elif _tool == "stamp" and not response.get("outcomeUnknown",false): _show_stamp_error(response,request.selection.end)
			else: _failure(response, request.origin)
	if generation == _generation: _reading = false


func _preview_gesture(operation: ProvidenceEditorOperation, request: Dictionary) -> Dictionary:
	if _tool == "stamp":
		var stamp := await operation.request("map-stamp.preview", _stamp_params(request.origin, request.selection.end))
		if not _matches(request.origin) or int(request.sequence) != _gesture_generation: return _stale()
		if stamp.get("ok", false): stamp.result.cells = stamp.result.paintedCells; stamp.result.paint = stamp.result.duplicate(true)
		return stamp
	var response := await operation.request("map.selection-preview", {"identity": request.origin.identity, "expectedRevision": request.origin.revision, "selection": request.selection})
	if not _matches(request.origin) or int(request.sequence) != _gesture_generation: return _stale()
	if not response.get("ok", false) or _tool in ["select", "wand"]: return response
	var cells: Array = _masked_cells(response.result.cells, request.selection.start)
	response.result.cells = cells
	if cells.is_empty(): return response
	var paint := await operation.request("map.preview-intent", {"identity": request.origin.identity, "expectedRevision": request.origin.revision, "intent": _intent(cells, "erase" if _tool == "erase" else "paint")})
	if not paint.get("ok", false): return paint
	response.result.paint = paint.result
	return response


func _masked_cells(cells: Array, start: Dictionary) -> Array:
	if _tool != "fill" or selected.is_empty(): return cells
	var allowed := {}; for cell: Dictionary in selected: allowed[Vector2i(int(cell.x), int(cell.y))] = true
	if not allowed.has(Vector2i(int(start.x), int(start.y))): return []
	return cells.filter(func(cell): return allowed.has(Vector2i(int(cell.x), int(cell.y))))


func _gesture_finished(start: Vector2i, end: Vector2i, positions: Array) -> void:
	if _placing_stamp: return
	_placing_stamp = _tool == "stamp"
	if _placing_stamp: _overlay.set_locked(true)
	await _accept_gesture(start,end,positions)
	if _placing_stamp: _overlay.set_locked(false)
	_placing_stamp = false


func _accept_gesture(start: Vector2i, end: Vector2i, positions: Array) -> void:
	if _gesture_origin.is_empty(): return
	var request := {"origin": _gesture_origin.duplicate(true), "selection": _selection_request(start, end, positions)}
	cancel_gesture()
	if _mask_state.get("continuous",false):
		request.maskGeneration = _mask_generation; _mask_queue.append(request)
		if _mask_queue.size()>=128: lock_mask(true)
		if not _accepting_mask: _accept_masks()
		return
	request.sequence = _gesture_generation
	while _reading or _operations.busy:
		await _view.get_tree().process_frame
		if not _matches(request.origin): return
	if not _matches(request.origin) or int(request.sequence) != _gesture_generation or not _pending.is_empty(): return
	var response := await _operations.run_workflow(_bridge, "Accept Land gesture", _preview_gesture.bind(request), null, true)
	if not _matches(request.origin) or int(request.sequence) != _gesture_generation: return
	if not response.get("ok", false):
		if _tool == "stamp" and not response.get("outcomeUnknown", false):
			_show_stamp_error(response, request.selection.end)
			status_changed.emit(str(response.get("error", "Stamp review failed.")))
		else: _failure(response, request.origin)
		return
	if _tool in ["select", "wand"]:
		if not _mask_state.is_empty():
			selected = _integer_cells(response.result.cells)
			_overlay.accept_selection(selected)
			var cells := selected.duplicate(true)
			if not _mask_state.continuous: end_mask()
			mask_accepted.emit(cells); return
		selected = _integer_cells(response.result.cells); _overlay.accept_selection(selected); _refresh_selection()
		_view.select_cell(start.x, start.y); return
	if response.result.cells.is_empty() and _tool != "stamp": return
	if _tool == "stamp":
		_overlay.show_preview(response.result.cells, response.result)
		status_changed.emit(preload("res://src/stamp_preview.gd").status(_stamp,response.result))
		if response.result.canApply:
			_draft = {"origin": request.origin, "params": _stamp_params(request.origin, request.selection.end), "previewMethod": "map-stamp.preview", "applyMethod": "map-stamp.apply"}
			await commit_selected()
		return
	var intent := _intent(response.result.cells, "erase" if _tool == "erase" else "paint")
	_draft = {"origin": request.origin, "params": {"identity": request.origin.identity, "expectedRevision": request.origin.revision, "intent": intent}}
	await commit_selected()


func _accept_masks() -> void:
	_accepting_mask = true
	var failed_read := false
	while not _mask_queue.is_empty():
		var request: Dictionary = _mask_queue.pop_front()
		while _reading or _operations.busy: await _view.get_tree().process_frame
		if not _mask_matches(request): continue
		request.selection.current = _integer_cells(selected)
		var params := {"identity":request.origin.identity,"expectedRevision":request.origin.revision,"selection":request.selection}
		var response := await _operations.run_workflow(_bridge,"Extend Smart terrain mask",func(op): return await op.request("map.selection-preview",params),null,true)
		if not _mask_matches(request): continue
		if not response.get("ok",false):
			failed_read = true; _mask_queue.clear(); mask_failed.emit(response); break
		selected = _integer_cells(response.result.cells); _overlay.accept_selection(selected)
		mask_accepted.emit(selected.duplicate(true))
	_accepting_mask = false
	if not _mask_state.is_empty() and not failed_read:
		lock_mask(false); mask_settled.emit()


func _mask_matches(request: Dictionary) -> bool:
	return not _mask_state.is_empty() and int(request.maskGeneration)==_mask_generation and _matches(request.origin)


func _show_stamp_error(response: Dictionary, destination: Dictionary) -> void:
	var plan := preload("res://src/stamp_preview.gd").invalid(_stamp,Vector2i(int(destination.x),int(destination.y)))
	_overlay.show_preview(plan.terrainCells,plan)
	status_changed.emit(str(response.get("error","Stamp unavailable."))+" · no cells changed")


func review_selection(operation: String, focus: Control = null) -> void:
	if selected.is_empty() or _bridge == null or not _pending.is_empty(): return
	if operation != "erase" and _workspace.paint.workspace.current_brush().is_empty():
		failed.emit("Choose an available atlas brush before filling or replacing terrain."); return
	_focus = weakref(focus if focus != null else _view.get_node("%" + {"paint": "FillSelection", "erase": "ClearSelection", "replace": "ReplaceSelection"}[operation]))
	var origin := _origin()
	var params := {"identity": origin.identity, "expectedRevision": origin.revision, "intent": _intent(selected, operation)}
	var response := await _operations.run_workflow(_bridge, "Review selected terrain", func(op): return await op.request("map.preview-intent", params), null, true)
	if not _matches(origin): return
	if not response.get("ok", false): _failure(response, origin); return
	_draft = {"origin": origin, "params": params}
	_review.title = "Review region action"; _review.get_node("%ReviewHeading").text = "REVIEW REGION " + operation.to_upper()
	_review.get_node("%ReviewDestination").text = "%s · %s selection" % [_view.get_node("%MapTitle").text, operation.capitalize()]
	_review.get_node("%ReviewCounts").text = _counts(response.result)
	_review.get_node("%ApplyArea").disabled = not response.result.canApply
	_review.get_node("%ReviewStatus").text = "One undo step · marker bands retained · selected artwork is replaced."
	_overlay.show_preview(selected, response.result)
	_review.popup_centered(); _review.get_node("%CancelArea").grab_focus()


func has_unapplied_changes() -> bool:
	return not _draft.is_empty() or not _pending.is_empty()


func discard_draft() -> void:
	if not _pending.is_empty() or _submitting: return
	_draft.clear(); _review.hide(); cancel_gesture(); _stamp_state()
	if _tool == "stamp": status_changed.emit("Placement discarded · move to preview another placement")
	if _focus != null and is_instance_valid(_focus.get_ref()): _focus.get_ref().grab_focus()


func commit_selected() -> Dictionary:
	if _draft.is_empty() or not _pending.is_empty() or _submitting: return {"ok": false, "error": "Check the original operation before applying."}
	var draft := _draft.duplicate(true)
	if not _matches(draft.origin): discard_draft(); return _stale()
	_submitting = true; _stamp_state()
	_review.get_node("%ApplyArea").disabled = true; _review.get_node("%CancelArea").disabled = true
	var response := await _operations.run_workflow(_bridge, "Apply Land terrain", _submit.bind(draft), null, true)
	_submitting = false
	_review.get_node("%ApplyArea").disabled = not _pending.is_empty(); _review.get_node("%CancelArea").disabled = not _pending.is_empty()
	if not _matches(draft.origin): return _stale()
	if not response.get("ok", false): _failure(response, draft.origin)
	_stamp_state()
	return response


func _submit(operation: ProvidenceEditorOperation, draft: Dictionary) -> Dictionary:
	var preview := await operation.request(draft.get("previewMethod", "map.preview-intent"), draft.params)
	if not _matches(draft.origin): return _stale()
	if not preview.get("ok", false): return preview
	if not preview.result.canApply: _draft.clear(); _review.hide(); cancel_gesture(); return preview
	var params: Dictionary = draft.params.duplicate(true)
	params.operationId = Crypto.new().generate_random_bytes(32).hex_encode()
	var method: String = draft.get("applyMethod", "map.apply-intent")
	var response := await operation.request(method, params)
	if not _matches(draft.origin): return _stale()
	if response.get("outcomeUnknown", false): _pending = {"origin": draft.origin, "params": params, "method": method}; return response
	if not response.get("ok", false): return response
	if not _accept.call(response): return response
	projection_applied.emit(response.result)
	var count: int = response.result.paintedCells.size()
	_view.retain_special_artwork(preview.result.get("specialPreviews", []))
	for cell: Dictionary in response.result.paintedCells: _view.update_cell(int(cell.x), int(cell.y), int(cell.tile))
	_view.apply_terrain_delta(response.result)
	var last: Dictionary = response.result.paintedCells.back()
	_view.select_cell(int(last.x), int(last.y))
	_draft.clear(); _review.hide(); cancel_gesture()
	status_changed.emit("%d terrain cells changed" % count)
	return response


func _failure(response: Dictionary, origin: Dictionary) -> void:
	if _mask_state.get("continuous",false): mask_failed.emit(response); return
	var message := str(response.get("error", "The terrain preview could not complete."))
	if _pending.get("confirmedCommitted", false): message = "Placement saved; refresh failed. Check again to refresh the map. " + message
	if response.get("outcomeUnknown", false):
		if _pending.is_empty(): _pending = {"origin": origin, "readOnly": true}
		_view.get_node("%ReconcileArea").show(); _overlay.set_active(false)
	_review.get_node("%ReviewStatus").text = message
	failed.emit(message); _refresh_selection()
	if _tool == "stamp": status_changed.emit(message + " · placement kept"); _stamp_state()


func check_original() -> void:
	if _pending.is_empty(): return
	var pending := _pending.duplicate(true)
	var lookup := {} if pending.get("readOnly", false) else {"domain": "project", "operationId": pending.params.operationId, "expectedIntent": {"method": pending.get("method", "map.apply-intent"), "params": pending.params}}
	var response := await _operations.recover_world(_bridge, lookup)
	if not _matches(pending.origin): return
	if not response.get("worldRecoveryConfirmed", false):
		response.outcomeUnknown = true
		response.error = str(response.get("error", "The original result remains unconfirmed. Your terrain draft is kept. Check it again to continue."))
		_failure(response, pending.origin); return
	var committed: bool = pending.get("confirmedCommitted", false) or not pending.get("readOnly", false) and response.result.outcome == "committed"
	# Keep the receipt until the saved destination is visible, including failed reads.
	_pending.confirmedCommitted = committed
	var refreshed := await _operations.run_workflow(_bridge, "Read current terrain", _reconcile.bind(committed), null, true)
	if not _matches(pending.origin): return
	if not refreshed.get("ok", false): _failure(refreshed, pending.origin); return
	_pending.clear()
	if committed: discard_draft()
	_view.get_node("%ReconcileArea").hide(); _refresh_selection(); _activate_tool(_tool); _stamp_state()
	if _tool == "stamp": status_changed.emit("Original placement confirmed · move to place again" if committed else "Original placement did not commit · retry or discard the retained placement")


func _reconcile(operation: ProvidenceEditorOperation, committed: bool) -> Dictionary:
	var response := await operation.request("session.describe", {})
	if not response.get("ok", false): return response
	projection_applied.emit({"revision": response.result.revision, "canUndo": response.result.canUndo, "canRedo": response.result.canRedo, "truncated": true})
	var refreshed := await _map.refresh_history(operation)
	if refreshed.get("ok", false) and not committed and not _draft.is_empty():
		_draft.origin.revision = int(response.result.revision); _draft.params.expectedRevision = int(response.result.revision)
	return refreshed


func _counts(plan: Dictionary) -> String:
	var bounds: Dictionary = plan.get("bounds", {})
	var area := "Cells (%d, %d) through (%d, %d)" % [int(bounds.get("left", 0)), int(bounds.get("top", 0)), int(bounds.get("right", 0)), int(bounds.get("bottom", 0))]
	var erase := "\nClear to Tile %d" % int(plan.eraseTile) if plan.get("eraseTile") != null else ""
	return "%s\n%d changed · %d unchanged%s" % [area, plan.paintedCells.size(), plan.unchangedCells, erase]


func _stale() -> Dictionary:
	return {"ok": false, "error": "The map or project changed. Make a new terrain selection."}


func dispose() -> void:
	_generation += 1; cancel_gesture(); _bridge = null; _workspace = null
	_guard = Callable(); _accept = Callable()
	for source in [_map.document_opened, _map.document_cleared]:
		for connection in source.get_connections():
			if connection.callable.get_object() == self: source.disconnect(connection.callable)
	for relay in [projection_applied, failed, status_changed, stamp_selected, stamp_state_changed, tool_activated]:
		for connection in relay.get_connections(): relay.disconnect(connection.callable)


func _stamp_state() -> void:
	if _tool == "stamp": stamp_state_changed.emit({"busy": _submitting, "unknown": not _pending.is_empty(), "retained": not _draft.is_empty()})
