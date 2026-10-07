extends RefCounted

signal failed(message: String)
signal projection_applied(projection: Dictionary)

var palette := preload("res://src/special_land_palette_controller.gd").new()
var _picker: Window
var _owner: Node
var _workspace
var _operations: ProvidenceEditorOperation
var _bridge: RefCounted
var _navigation: Callable
var _generation := 0
var _origin: Dictionary = {}
var _accept: Callable
var _open: Callable
var _pending_read := false
var _focus: WeakRef
var _thumbnails: Dictionary = {}


func initialize(owner: Node, workspace, operations: ProvidenceEditorOperation, open_target: Callable) -> void:
	_owner = owner; _workspace = workspace; _operations = operations; _navigation = open_target
	_picker = preload("res://src/monster_reference_picker.tscn").instantiate(); owner.add_child(_picker)
	_picker.search_requested.connect(_search)
	_picker.preview_requested.connect(_preview)
	_picker.accepted.connect(_accepted)
	_picker.open_requested.connect(_open_reference)
	_picker.get_node("%RecoverReference").pressed.connect(check_connection)
	_picker.visibility_changed.connect(_picker_visibility)
	palette.initialize(workspace,operations,open_target)
	palette.failed.connect(failed.emit); palette.projection_applied.connect(projection_applied.emit)
	workspace.paint.workspace.tiles_dock.special_art_requested.connect(choose)
	workspace.document.document_opened.connect(_document_opened)
	workspace.document.document_cleared.connect(_clear)


func attach_session(bridge: RefCounted) -> void:
	_generation += 1; _bridge = bridge; _clear(); palette.attach_session(bridge)


func choose() -> void:
	await palette.open()


func choose_for_draft(current: int, destination: String, focus: Control, accept: Callable, open_reference := Callable()) -> void:
	if _bridge == null or _workspace.document.identity.is_empty() or _workspace.document.is_dungeon: return
	_origin = {"generation":_generation,"identity":_workspace.document.identity}; _accept = accept; _open = open_reference
	_focus = weakref(focus) if is_instance_valid(focus) else null
	var host: Node = focus.get_window() if is_instance_valid(focus) else _owner
	if _picker.get_parent() != host: _picker.reparent(host)
	_begin({"field":"specialLand","currentValue":current,"label":"Special Land artwork","destination":destination,
		"allowNone":false,"picturePreview":true},focus)


func _matches(origin: Dictionary) -> bool:
	return _bridge != null and not origin.is_empty() and origin == _origin and origin.generation == _generation and origin.identity == _workspace.document.identity and not _workspace.document.is_dungeon


func _params() -> Dictionary:
	return {"expectedRevision":int(_workspace.paint_context().revision)}


func _search(query: Dictionary, generation: int) -> void:
	if _pending_read: _show_recovery("Reconnect and refresh the artwork catalog before choosing a resource."); return
	var origin := _origin.duplicate(true)
	if _operations.busy: _picker.retry_search(query,generation); return
	var params := _params(); params.query = query
	params.query.limit = mini(64,int(params.query.limit))
	var response := await _operations.run_workflow(_bridge,"Browse Special Land artwork",_request.bind("monster-reference.list",params),null,true)
	if not _matches(origin): return
	_thumbnails.clear()
	for row: Dictionary in response.get("result",{}).get("specialThumbnails",[]): _thumbnails[int(row.value)] = row.response
	_picker.receive_page(response,generation)
	_picker.receive_thumbnails(_thumbnails,generation)
	if not response.get("ok",false): _failure(response)


func _preview(choice: Dictionary, generation: int) -> void:
	if _pending_read: _show_recovery("Reconnect and refresh before previewing artwork."); return
	if not choice.get("available",false): return
	var origin := _origin.duplicate(true)
	while _operations.busy and _matches(origin): await _picker.get_tree().process_frame
	if not _matches(origin) or not _picker.visible or generation != _picker.generation: return
	var cached: Dictionary = _thumbnails.get(int(choice.value),{})
	if not cached.is_empty() and cached.get("result",{}).get("revision",-1)==int(_workspace.paint_context().revision):
		_picker.receive_picture(cached,generation,int(choice.value)); return
	var params := _params(); params.resourceId = int(choice.value)
	var response := await _operations.run_workflow(_bridge,"Preview exact Special Land artwork",_request.bind("special-art.preview",params),null,true)
	if _matches(origin): _picker.receive_picture(response,generation,int(choice.value))
	if _matches(origin) and not response.get("ok",false): _failure(response)


func _request(operation: ProvidenceEditorOperation, method: String, params: Dictionary) -> Dictionary:
	return await operation.request(method,params)


func _accepted(choice: Dictionary, _context: Dictionary) -> void:
	if not _pending_read and _matches(_origin) and _accept.is_valid(): _accept.call(choice)


func select_placement(choice: Dictionary) -> void:
	var brush: Dictionary = _workspace.paint.workspace.tiles_dock.brush
	if brush.is_empty(): failed.emit("Resolve this map's artwork before placing Special Land tiles."); return
	var resource := {"identity":"special:%d" % int(choice.value),"name":choice.label,"collection":"","kind":"stamp","levelType":"land",
		"tilesetId":brush.tilesetId,"width":1,"height":1,"cells":[{"x":0,"y":0,"tile":int(choice.value)}],"favorite":false}
	_workspace.land_authoring.select_stamp(resource,0)


func _open_reference(choice: Dictionary, _context: Dictionary) -> void:
	if not _matches(_origin) or not _navigation.is_valid(): return
	var open_reference := _open
	_picker.cancel()
	if open_reference.is_valid(): open_reference.call(choice); return
	_navigation.call("map-tile",int(choice.value),str(choice.targetIdentity),
		{"targetStatus":"application-resource" if choice.ownership == "stock" else "compatibility-resource","levelType":"land"})


func _document_opened(_projection: Dictionary, reset: bool) -> void:
	if reset: _clear()


func _clear() -> void:
	_thumbnails.clear()
	_origin.clear(); _accept = Callable(); _open = Callable(); _pending_read = false; _focus = null
	if is_instance_valid(_picker): _picker.cancel(false)


func dispose() -> void:
	palette.dispose()
	_picker.visibility_changed.disconnect(_picker_visibility)
	_generation += 1; _clear(); _bridge = null; _navigation = Callable()
	for source in [_workspace.document.document_opened,_workspace.document.document_cleared,_workspace.paint.workspace.tiles_dock.special_art_requested]:
		for connection in source.get_connections():
			if connection.callable.get_object() == self: source.disconnect(connection.callable)
	if is_instance_valid(_picker): _picker.queue_free()
	for source in [failed,projection_applied]:
		for connection in source.get_connections(): source.disconnect(connection.callable)
	_workspace = null


func _failure(response: Dictionary) -> void:
	var message := str(response.get("error","The artwork catalog could not load."))
	if response.get("outcomeUnknown",false): _pending_read = true; _show_recovery(message)
	failed.emit(message)


func _show_recovery(message: String) -> void:
	_picker.get_node("%RecoverReference").show()
	_picker.get_node("%UseSelection").disabled = true
	_picker.get_node("%OpenReference").disabled = true
	_picker.get_node("%Availability").text = message


func check_connection() -> void:
	if not _pending_read or _operations.busy: return
	var origin := _origin.duplicate(true); var context: Dictionary = _picker.context.duplicate(true)
	var response := await _operations.recover_world(_bridge,{})
	if not _matches(origin): return
	if not response.get("worldRecoveryConfirmed",false): _failure(response); return
	projection_applied.emit({"revision":response.result.revision,"canUndo":response.result.canUndo,"canRedo":response.result.canRedo,"truncated":true})
	_pending_read = false
	if _picker.visible: _begin(context,_focus.get_ref() if _focus != null else null)


func _begin(context: Dictionary, focus: Control) -> void:
	# Reopening a visible picker closes its prior lifetime before starting this one.
	var origin := _origin.duplicate(true); var accept := _accept; var open_reference := _open
	_picker.cancel(false)
	_origin = origin; _accept = accept; _open = open_reference; _focus = weakref(focus) if is_instance_valid(focus) else null
	_picker.begin(context,focus)


func _picker_visibility() -> void:
	if not _picker.visible: _origin.clear(); _accept = Callable(); _open = Callable(); _focus = null; _thumbnails.clear()
