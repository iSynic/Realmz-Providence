extends RefCounted

signal failed(message: String)
signal projection_applied(projection: Dictionary)

var view: Control
var _workspace
var _operations: ProvidenceEditorOperation
var _bridge: RefCounted
var _navigation: Callable
var _generation := 0
var _active := false
var _pending_read := false


func initialize(workspace, operations: ProvidenceEditorOperation, navigation: Callable) -> void:
	_workspace = workspace; _operations = operations; _navigation = navigation
	var dock = workspace.paint.workspace.tiles_dock
	view = dock.ui.special_palette
	view.search_requested.connect(_search); view.choice_requested.connect(_preview)
	view.recovery_requested.connect(check_connection); view.open_requested.connect(_open_reference)
	dock.terrain_palette_requested.connect(show_terrain)
	workspace.document.document_opened.connect(_document_opened)
	workspace.document.document_cleared.connect(_clear)


func attach_session(bridge: RefCounted) -> void:
	_generation += 1; _bridge = bridge; _clear()


func open() -> void:
	if _bridge == null or _workspace.document.identity.is_empty() or _workspace.document.is_dungeon: return
	await _workspace.chrome.request_tool("paint")
	if _workspace.has_unapplied_changes() or _workspace.document.is_dungeon: return
	_active = true
	_workspace.paint.workspace.set_special_brush({},null)
	_workspace.paint.workspace.tiles_dock.show_special_palette(true)
	_workspace.chrome.land_inspector.restore()
	view.refresh()


func show_terrain() -> void:
	_active = false; _generation += 1
	_workspace.paint.workspace.clear_special_brush()
	_workspace.paint.workspace.tiles_dock.show_special_palette(false)


func _origin() -> Dictionary:
	return {"generation":_generation,"identity":_workspace.document.identity,"revision":int(_workspace.paint_context().revision)}


func _matches(origin: Dictionary, request_generation: int) -> bool:
	return _bridge != null and _active and origin == _origin() and request_generation == view.generation


func _search(query: Dictionary, request_generation: int) -> void:
	_workspace.paint.workspace.set_special_brush({},null)
	var origin := _origin()
	while _operations.busy and _matches(origin,request_generation): await view.get_tree().process_frame
	if not _matches(origin,request_generation): return
	if _pending_read:
		view.receive({"ok":false,"error":"Check connection before refreshing artwork."},request_generation); return
	var response := await _operations.run_workflow(_bridge,"Browse Special artwork",func(op):
		return await op.request("monster-reference.list",{"expectedRevision":origin.revision,"query":query}),null,true)
	if not _matches(origin,request_generation): return
	view.receive(response,request_generation)
	if not response.get("ok",false): _failure(response)


func _preview(choice: Dictionary, request_generation: int) -> void:
	_workspace.paint.workspace.set_special_brush({},null)
	if not choice.get("available",false) or _pending_read: return
	var origin := _origin()
	while _operations.busy and _matches(origin,request_generation): await view.get_tree().process_frame
	if not _matches(origin,request_generation) or int(view.selected.get("value",0)) != int(choice.value): return
	var response := await _operations.run_workflow(_bridge,"Read exact Special artwork",func(op):
		return await op.request("special-art.preview",{"expectedRevision":origin.revision,"resourceId":int(choice.value)}),null,true)
	if not _matches(origin,request_generation) or int(view.selected.get("value",0)) != int(choice.value): return
	var decoded := preload("res://src/asset_preview_decoder.gd").decode(response,{})
	view.set_preview(decoded)
	if decoded.get("texture") != null: _workspace.paint.workspace.set_special_brush(choice,decoded.texture)
	else: _failure(response if not response.get("ok",false) else {"error":decoded.get("error","Exact artwork unavailable.")})


func _failure(response: Dictionary) -> void:
	_pending_read = _pending_read or bool(response.get("outcomeUnknown",false))
	view.failure(str(response.get("error","Artwork could not load.")))
	failed.emit(str(response.get("error","Artwork could not load.")))


func check_connection() -> void:
	if _operations.busy or _bridge == null: return
	if not _pending_read: view.refresh(); return
	var generation := _generation
	var response := await _operations.recover_world(_bridge,{})
	if generation != _generation: return
	if not response.get("worldRecoveryConfirmed",false): _failure(response); return
	projection_applied.emit({"revision":response.result.revision,"canUndo":response.result.canUndo,"canRedo":response.result.canRedo,"truncated":true})
	_pending_read = false; view.refresh()


func _open_reference(choice: Dictionary) -> void:
	if not _active or _pending_read: return
	_navigation.call("map-tile",int(choice.value),str(choice.targetIdentity),
		{"targetStatus":"application-resource" if choice.ownership == "stock" else "compatibility-resource","levelType":"land"})


func _document_opened(_projection: Dictionary, reset: bool) -> void:
	if reset: _clear()
	elif _active: view.refresh()


func _clear() -> void:
	_active = false; _pending_read = false; _generation += 1
	if is_instance_valid(view): view.clear(); show_terrain()


func dispose() -> void:
	attach_session(null)
	_workspace.document.document_opened.disconnect(_document_opened)
	_workspace.document.document_cleared.disconnect(_clear)
	_workspace.paint.workspace.tiles_dock.terrain_palette_requested.disconnect(show_terrain)
	view.search_requested.disconnect(_search); view.choice_requested.disconnect(_preview)
	view.recovery_requested.disconnect(check_connection); view.open_requested.disconnect(_open_reference)
	for source in [failed,projection_applied]:
		for connection in source.get_connections(): source.disconnect(connection.callable)
	_workspace = null; _navigation = Callable()
