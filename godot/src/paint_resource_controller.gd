extends RefCounted

signal resource_selected(resource: Dictionary, resource_revision: int, presentation: Dictionary)
signal failed(message: String)

var _window: Window
var _dock: PanelContainer
var _view: ProvidenceLandEditor
var _dungeon: ProvidenceDungeonEditor
var _map: ProvidenceMapDocumentController
var _workspace
var _operations: ProvidenceEditorOperation
var _bridge: RefCounted
var _generation := 0
var _query_generation := 0
var _preview_sequence := 0
var _origin: Dictionary = {}
var _resource_revision := 0
var _pending: Dictionary = {}
var _submitting := false
var _open_target: Callable
var _kept_reference: Dictionary = {}
var _returning_reference := false


func initialize(owner: Node, workspace, dock: PanelContainer, view: ProvidenceLandEditor, dungeon: ProvidenceDungeonEditor, operations: ProvidenceEditorOperation, open_target: Callable) -> void:
	_workspace = workspace; _map = workspace.document; _dock = dock; _view = view; _operations = operations
	_dungeon = dungeon
	_open_target = open_target; view.visibility_changed.connect(_reference_visibility)
	_window = preload("res://src/paint_resource_window.tscn").instantiate(); owner.add_child(_window)
	_window.query_requested.connect(_query)
	_window.entry_requested.connect(_open_entry)
	_window.save_requested.connect(_save)
	_window.delete_requested.connect(_delete)
	_window.new_requested.connect(_new_palette)
	_window.capture_requested.connect(_capture)
	_window.use_requested.connect(_use)
	_window.feature_preview_requested.connect(_preview_features)
	_window.resource_preview_requested.connect(_preview_resource)
	_window.geometry_preview_requested.connect(_preview_geometry)
	_window.special_cell_requested.connect(func(current,destination,accept): _workspace.special_placement.choose_for_draft(current,destination,_window.get_node("%SpecialResourceCell"),accept,_open_special_reference))
	_window.get_node("%CheckResources").pressed.connect(check_original)
	_dock.resources_requested.connect(open)
	_dock.save_brush_requested.connect(func(): open("new"))
	_dock.favorite_tile_requested.connect(func(): open("favorite"))
	_dungeon.get_node("%StampTool").pressed.connect(open.bind("stamp"))
	_map.document_opened.connect(_document_changed)
	_map.document_cleared.connect(_clear)
	attach_session(_bridge)


func attach_session(bridge: RefCounted) -> void:
	_kept_reference.clear(); _returning_reference = false
	_generation += 1; _query_generation += 1; _bridge = bridge; _pending.clear(); _origin.clear(); _submitting = false
	if is_instance_valid(_window): _window.set_busy(false); _window.dismiss(); _window.get_node("%CheckResources").hide()


func _matches(origin: Dictionary) -> bool:
	return _bridge != null and not origin.is_empty() and int(origin.generation) == _generation and origin.identity == _map.identity and origin.tilesetId == _projection().get("tilesetId", "")


func _projection() -> Dictionary:
	return _dungeon.atlas_projection if _map.is_dungeon else _view.atlas_projection


func open(kind := "", focus: Control = null) -> void:
	if _bridge == null or _map.identity.is_empty(): return
	if _workspace.has_unapplied_changes(): _window.present_error("Apply or discard the map draft before managing paint resources."); return
	_origin = {"generation": _generation, "identity": _map.identity, "tilesetId": _projection().get("tilesetId", "")}
	var title: String = _dungeon.get_node("%DungeonMapTitle").text if _map.is_dungeon else _view.get_node("%MapTitle").text
	_window.open(title, null if _map.is_dungeon else _dock.ui.atlas, _projection(), focus if focus != null else _dungeon.get_node("%StampTool") if _map.is_dungeon else _dock.ui.save_brush, kind)
	if kind == "new": _new_palette()
	elif kind == "favorite": _new_palette(true)


func _document_changed(_projection: Dictionary, reset: bool) -> void:
	if reset: _clear()


func _clear() -> void:
	_query_generation += 1; _preview_sequence += 1; _origin.clear()
	if is_instance_valid(_window): _window.dismiss()


func _params() -> Dictionary:
	return {"expectedRevision": int(_workspace.paint_context().revision), "identity": _map.identity}


func _query(query: String, kind: String, offset: int) -> void:
	_query_generation += 1; var sequence := _query_generation; var origin := _origin.duplicate(true)
	while _operations.busy and _matches(origin): await _view.get_tree().process_frame
	if not _matches(origin) or sequence != _query_generation or not _window.visible: return
	var params := _params(); params.merge({"query": query, "kind": kind, "offset": offset, "limit": 64})
	params.scope = _window.collection_scope()
	var response := await _operations.run_workflow(_bridge, "Read local paint collection", _request.bind("paint-resources.list", params), null, true)
	if not _matches(origin) or sequence != _query_generation: return
	if not response.get("ok", false): _failure(response); return
	_resource_revision = int(response.result.resourceRevision); _window.present_list(response.result)


func _request(operation: ProvidenceEditorOperation, method: String, params: Dictionary) -> Dictionary:
	return await operation.request(method, params)


func _open_entry(identity: String) -> void:
	if not _pending.is_empty() or _window.has_unapplied_changes(): return
	var origin := _origin.duplicate(true); var params := _params(); params.resourceIdentity = identity
	var response := await _operations.run_workflow(_bridge, "Open paint resource", _request.bind("paint-resources.open", params), null, true)
	if not _matches(origin): return
	if not response.get("ok", false): _failure(response); return
	_resource_revision = int(response.result.resourceRevision)
	_window.present_resource(response.result.resource, false, response.result.get("ownership", "local") == "built-in", str(response.result.availabilityReason) if response.result.get("availabilityReason") != null else "", response.result.get("renderCells", []), response.result.get("specialPreviews", []))


func _new_palette(favorite := false) -> void:
	if _map.is_dungeon: _window.present_error("Select Dungeon cells, then capture their features as a stamp."); return
	var brush: Dictionary = _workspace.paint.workspace.current_brush()
	if brush.is_empty(): _window.present_error("Choose an available atlas brush first."); return
	var cells: Array = []
	for index in brush.cells.size(): cells.append({"x": index % int(brush.width), "y": index / int(brush.width), "tile": int(brush.cells[index])})
	_window.present_resource({"identity": "paint:" + Crypto.new().generate_random_bytes(16).hex_encode(), "name": _dock.ui.brush_name.text if favorite else "New palette",
		"collection": "", "kind": "palette", "levelType": "land", "tilesetId": brush.tilesetId,
		"width": int(brush.width), "height": int(brush.height), "cells": cells, "favorite": favorite}, true)


func _capture() -> void:
	var selected: Array = _dungeon.selected_cells() if _map.is_dungeon else _workspace.land_authoring.selected
	if selected.is_empty(): _window.present_error("Select map cells before capturing a stamp."); return
	var template := {"identity": "paint:" + Crypto.new().generate_random_bytes(16).hex_encode(), "name": "New stamp", "collection": "",
		"kind": "stamp", "levelType": "land", "tilesetId": "capture", "width": 1, "height": 1, "cells": [], "favorite": false}
	var params := _params(); params.merge({"identity": _map.identity, "cells": selected.map(func(cell): return {"x": int(cell.x), "y": int(cell.y)}), "resource": template})
	var origin := _origin.duplicate(true)
	var response := await _operations.run_workflow(_bridge, "Capture terrain stamp", _request.bind("paint-resources.capture", params), null, true)
	if not _matches(origin): return
	if not response.get("ok", false): _failure(response); return
	_resource_revision = int(response.result.resourceRevision)
	_window.present_resource(response.result.capture.resource, true, false, "", response.result.get("renderCells", []))
	if int(response.result.capture.omittedCells) > 0: _window.present_error("%d special-art cells omitted. Source AP markers are excluded." % int(response.result.capture.omittedCells))


func capture_selection(focus: Control) -> void:
	open("stamp", focus)
	var origin := _origin.duplicate(true)
	while _operations.busy and _matches(origin): await _view.get_tree().process_frame
	if _matches(origin) and _window.visible: await _capture()


func _integers(resource: Dictionary) -> Dictionary:
	var result := resource.duplicate(true)
	result.width = int(result.width); result.height = int(result.height)
	result.cells = result.cells.map(func(cell): return {"x": int(cell.x), "y": int(cell.y), "tile": int(cell.tile)})
	return result


func _save(resource: Dictionary, replace: bool) -> void:
	await _change({"operation": "replace" if replace else "create", "resource": _integers(resource)})


func _delete(identity: String) -> void:
	await _change({"operation": "delete", "identity": identity})


func _change(change: Dictionary) -> Dictionary:
	if _submitting or not _pending.is_empty(): return {"ok": false, "error": "Check the original collection operation first."}
	var origin := _origin.duplicate(true)
	var params := _params(); params.merge({"resourceRevision": _resource_revision, "change": change, "operationId": Crypto.new().generate_random_bytes(32).hex_encode()})
	_submitting = true; _window.set_busy(true)
	var response := await _operations.run_workflow(_bridge, "Save local paint resources", _request.bind("paint-resources.apply", params), null, true)
	_submitting = false
	if not _matches(origin): return {"ok": false, "error": "The resource destination changed."}
	if response.get("outcomeUnknown", false): _pending = {"origin": origin, "params": params}; _failure(response); return response
	_window.set_busy(false)
	if not response.get("ok", false): _failure(response); return response
	_resource_revision = int(response.result.resourceRevision)
	if change.has("resource"): _window.present_resource(change.resource)
	elif change.operation == "delete": _window.clear_resource("Resource deleted. Existing map cells are preserved.")
	if change.has("resource"): await _open_entry(str(change.resource.identity))
	_query("", "", 0)
	return response


func _use(resource: Dictionary) -> void:
	if not _matches(_origin) or resource.tilesetId != _projection().get("tilesetId", ""): return
	var presentation: Dictionary = _window.selection_presentation()
	if str(resource.identity).begins_with("preset:"):
		_window.close(); resource_selected.emit(_integers(resource), _resource_revision, presentation); return
	var response := await _change({"operation": "remember", "identity": resource.identity})
	if response.get("outcomeUnknown", false) or not _matches(_origin): return
	if not response.get("ok", false): return
	_window.close()
	resource_selected.emit(_integers(resource), _resource_revision, presentation)


func _failure(response: Dictionary) -> void:
	var message := str(response.get("error", "The collection operation could not complete. Your draft is kept."))
	if response.get("outcomeUnknown", false):
		if _pending.is_empty(): _pending = {"origin": _origin.duplicate(true), "readOnly": true}
		_window.set_busy(true); _window.get_node("%CheckResources").show()
	_window.present_error(message); failed.emit(message)


func check_original() -> void:
	if _pending.is_empty() or _submitting: return
	var pending := _pending.duplicate(true)
	var recovered := await _operations.recover_world(_bridge, {})
	if not _matches(pending.origin): return
	if not recovered.get("worldRecoveryConfirmed", false): _failure(recovered); return
	if pending.get("readOnly", false):
		_pending.clear(); _window.set_busy(false); _window.get_node("%CheckResources").hide(); _query("", "", 0); return
	var params: Dictionary = pending.params.duplicate(true); params.expectedRevision = int(recovered.result.revision)
	var response := await _operations.run_workflow(_bridge, "Check original collection result", _request.bind("paint-resources.operation-status", params), null, true)
	if not _matches(pending.origin): return
	if not response.get("ok", false): _failure(response); return
	if response.result.outcome == "unknown": _window.present_error("The original collection result is still unknown. Your draft is kept."); return
	_pending.clear(); _window.set_busy(false); _window.get_node("%CheckResources").hide()
	_resource_revision = int(response.result.resourceRevision)
	if response.result.outcome == "committed":
		if params.change.has("resource"): _window.present_resource(params.change.resource)
		elif params.change.operation == "delete": _window.clear_resource("The original deletion is confirmed.")
	else: _window.present_error("The original save was rejected. Your draft is kept; review it before applying again.")
	_query("", "", 0)


func has_unapplied_changes() -> bool:
	return not _pending.is_empty() or is_instance_valid(_window) and _window.has_unapplied_changes()


func discard_draft() -> void:
	if _pending.is_empty() and not _submitting and is_instance_valid(_window): _window.discard_draft()


func commit_selected() -> Dictionary:
	if not _pending.is_empty() or _submitting: return {"ok": false, "error": "Check the original collection operation first."}
	if not _window.has_unapplied_changes(): return {"ok": true}
	return await _change({"operation": "replace" if _window.is_existing() else "create", "resource": _integers(_window.draft())})


func dispose() -> void:
	_kept_reference.clear(); _open_target = Callable(); _view.visibility_changed.disconnect(_reference_visibility)
	_generation += 1; _query_generation += 1; _bridge = null; _workspace = null
	for source in [_map.document_opened, _map.document_cleared]:
		for connection in source.get_connections():
			if connection.callable.get_object() == self: source.disconnect(connection.callable)
	for relay in [resource_selected, failed]:
		for connection in relay.get_connections(): relay.disconnect(connection.callable)


func _preview_features(tile: int, changes: Array, generation: int) -> void:
	var origin := _origin.duplicate(true)
	var params := _params(); params.merge({"tile":tile,"changes":changes})
	var response := await _operations.run_workflow(_bridge, "Preview stamp cell features", _request.bind("paint-resources.preview-features", params), null, true)
	if not _matches(origin): return
	_window.present_feature_preview(response, generation)
	if not response.get("ok", false): _failure(response)


func _preview_resource(resource: Dictionary) -> void:
	_preview_sequence += 1; var sequence := _preview_sequence
	var origin := _origin.duplicate(true)
	var params := _params(); params.resource = _integers(resource)
	var response := await _operations.run_workflow(_bridge, "Preview saved stamp", _request.bind("paint-resources.preview", params), null, true)
	if not _matches(origin) or sequence != _preview_sequence: return
	var current: Dictionary = _window.draft()
	if current.is_empty() or _integers(current) != params.resource: return
	if response.get("ok", false): _window.present_resource_preview(str(resource.identity), response.result.renderCells, response.result.get("specialPreviews",[]))
	else: _failure(response)


func _preview_geometry(resource: Dictionary, edit: Dictionary, generation: int) -> void:
	var origin := _origin.duplicate(true)
	while _operations.busy and _matches(origin): await _view.get_tree().process_frame
	if not _matches(origin) or not _pending.is_empty(): return
	var params := _params(); params.merge({"resource": _integers(resource), "edit": edit})
	var response := await _operations.run_workflow(_bridge, "Review resource geometry", _request.bind("paint-resources.geometry", params), null, true)
	if not _matches(origin): return
	_window.present_geometry(response, generation)
	if not response.get("ok", false): _failure(response)


func _open_special_reference(choice: Dictionary) -> void:
	if not _matches(_origin) or _operations.busy or not _open_target.is_valid(): return
	_kept_reference = {"origin":_origin.duplicate(true),"window":_window.suspend_reference()}
	await _open_target.call("map-tile",int(choice.value),str(choice.targetIdentity),
		{"targetStatus":"application-resource" if choice.ownership=="stock" else "compatibility-resource","levelType":"land"})
	_reference_visibility()


func _reference_visibility() -> void:
	if _view.is_visible_in_tree() and not _kept_reference.is_empty() and not _returning_reference: _restore_reference.call_deferred()


func _restore_reference() -> void:
	_returning_reference = true; var generation := _generation
	while _operations.busy and generation==_generation: await _view.get_tree().process_frame
	if generation!=_generation: return
	if _view.is_visible_in_tree() and not _kept_reference.is_empty() and _matches(_kept_reference.origin):
		var kept := _kept_reference.duplicate(true); _kept_reference.clear(); _origin = kept.origin
		_window.restore_reference(kept.window,_projection()); await _preview_resource(_window.draft())
	_returning_reference = false
