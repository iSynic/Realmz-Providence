extends RefCounted

signal failed(message: String)
signal projection_applied(projection: Dictionary)

var _view: Control
var _workspace
var _operations: ProvidenceEditorOperation
var _bridge: RefCounted
var _navigate: Callable
var _generation := 0
var _query_sequence := 0
var _preview_sequence := 0
var _revision := -1
var _origin := ""
var _pending_read := false


func initialize(view: Control, workspace, operations: ProvidenceEditorOperation, navigate: Callable) -> void:
	_view = view
	_workspace = workspace
	_operations = operations
	_navigate = navigate
	view.query_requested.connect(_query)
	view.preview_requested.connect(_preview)
	view.placement_requested.connect(_place)
	view.reference_requested.connect(_open_reference)
	view.uses_requested.connect(_uses)
	view.use_open_requested.connect(_open_use)
	view.import_requested.connect(_import)
	view.recovery_requested.connect(check_connection)
	view.visibility_changed.connect(_visibility_changed)


func attach_session(bridge: RefCounted) -> void:
	_generation += 1
	_query_sequence += 1
	_preview_sequence += 1
	_bridge = bridge
	_revision = -1
	_origin = ""
	_pending_read = false
	if is_instance_valid(_view): _view.clear_preview()


func _visibility_changed() -> void:
	_query_sequence += 1
	_preview_sequence += 1
	# Tab presentation must finish before taking the shared operation lease.
	if _view.is_visible_in_tree(): call_deferred("_query",0)


func _current(generation: int) -> bool:
	return _bridge!=null and generation==_generation and _view.is_visible_in_tree()


func _query(offset: int) -> void:
	if _pending_read: return
	_view.set_loading()
	_query_sequence += 1
	var sequence := _query_sequence
	var generation := _generation
	while _operations.busy and _current(generation): await _view.get_tree().process_frame
	if not _current(generation) or sequence!=_query_sequence: return
	_origin = _workspace.document.identity
	_revision = int(_workspace.paint_context().revision)
	var map: Dictionary = {}
	for row: Dictionary in _workspace.document.maps:
		if row.identity==_origin: map=row
	_view.set_destination(_origin,str(map.get("name","")),_destination_available())
	var params := {"expectedRevision":_revision,"query":_view.query(offset)}
	var response := await _operations.run_workflow(_bridge,"Browse world artwork",_request.bind("monster-reference.list",params),null,true)
	if not _current(generation) or sequence!=_query_sequence: return
	if response.get("ok",false):
		_view.get_node("%SpecialRecover").hide()
		_view.present_page(response.result)
	else: _failure(response)


func _preview(choice: Dictionary) -> void:
	_preview_sequence += 1
	var sequence := _preview_sequence
	var generation := _generation
	while _operations.busy and _current(generation): await _view.get_tree().process_frame
	if not _current(generation) or sequence!=_preview_sequence or _pending_read: return
	var params := {"expectedRevision":_revision,"resourceId":int(choice.value)}
	var response := await _operations.run_workflow(_bridge,"Inspect world artwork",func(operation):
		var preview: Dictionary = await operation.request("special-art.preview",params)
		if not preview.get("ok",false): return preview
		var uses: Dictionary = await operation.request("special-art.uses",params)
		if not uses.get("ok",false): return uses
		preview.uses = uses.result
		return preview,null,true)
	if not _current(generation) or sequence!=_preview_sequence: return
	if not response.get("ok",false): _failure(response); return
	_view.present_preview(choice,response,response.get("uses",{}))


func _uses(offset: int) -> void:
	var choice: Dictionary = _view.selected_choice()
	var generation := _generation
	if choice.is_empty() or _pending_read or _operations.busy: return
	var response := await _operations.run_workflow(_bridge,"Read artwork placements",
		_request.bind("special-art.uses",{"expectedRevision":_revision,"resourceId":int(choice.value),"offset":offset}),null,true)
	if not _current(generation) or _view.selected_choice().get("identity")!=choice.identity: return
	if response.get("ok",false): _view.present_uses(response.result)
	else: _failure(response)


func _request(operation: ProvidenceEditorOperation, method: String, params: Dictionary) -> Dictionary:
	return await operation.request(method,params)


func _destination_available() -> bool:
	return not _origin.is_empty() and _origin==_workspace.document.identity and not _workspace.document.is_dungeon


func _place(choice: Dictionary) -> void:
	var generation := _generation
	var origin := _origin
	while _operations.busy and _current(generation): await _view.get_tree().process_frame
	if not _current(generation) or origin!=_origin: return
	if _pending_read or not _destination_available() or _revision!=int(_workspace.paint_context().revision): _query(0); return
	if choice==_view.selected_choice() and choice.get("available",false): await _workspace.use_special_land(choice,_origin)


func _open_reference(choice: Dictionary) -> void:
	var generation := _generation
	while _operations.busy and _current(generation): await _view.get_tree().process_frame
	if not _current(generation): return
	if not _pending_read and choice==_view.selected_choice() and _revision==int(_workspace.paint_context().revision):
		await _workspace.open_special_reference(choice)


func _open_use(use: Dictionary) -> void:
	var generation := _generation
	while _operations.busy and _current(generation): await _view.get_tree().process_frame
	if not _current(generation): return
	if not _pending_read and _revision==int(_workspace.paint_context().revision):
		await _workspace.reveal_coordinate(str(use.identity),int(use.first.x),int(use.first.y))


func _import() -> void:
	await _navigate.call("assets.special-land")


func _failure(response: Dictionary) -> void:
	_pending_read = bool(response.get("outcomeUnknown",false))
	var message := str(response.get("error","Artwork could not load."))
	_view.present_failure(message,_pending_read)
	failed.emit(message)


func check_connection() -> void:
	if not _pending_read or _operations.busy: return
	var generation := _generation
	var response := await _operations.recover_world(_bridge,{})
	if not _current(generation): return
	if not response.get("worldRecoveryConfirmed",false): _failure(response); return
	projection_applied.emit({"revision":response.result.revision,"canUndo":response.result.canUndo,"canRedo":response.result.canRedo,"truncated":true})
	_pending_read = false
	_query(0)


func dispose() -> void:
	attach_session(null)
	_view.visibility_changed.disconnect(_visibility_changed)
	for source in [_view.query_requested,_view.preview_requested,_view.placement_requested,_view.reference_requested,
			_view.uses_requested,_view.use_open_requested,_view.import_requested,_view.recovery_requested,failed,projection_applied]:
		for connection in source.get_connections(): source.disconnect(connection.callable)
	_workspace = null
	_navigate = Callable()
