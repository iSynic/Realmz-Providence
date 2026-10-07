extends RefCounted

signal failed(response: Dictionary)
var _controller
var _operations: ProvidenceEditorOperation
var _picker: Window
var _land: Control
var _dungeon: Control
var _open_target: Callable
var _bridge: RefCounted
var _generation := 0
var _kept: Dictionary = {}
var _returning := false


func initialize(controller, operations: ProvidenceEditorOperation, land: Control, dungeon: Control, open_target: Callable) -> void:
	_controller = controller; _operations = operations; _land = land; _dungeon = dungeon; _open_target = open_target
	_picker = controller.view.get_node("%RegionReferencePicker")
	_picker.preview_requested.connect(_preview); _picker.open_requested.connect(_edit)
	land.visibility_changed.connect(_visibility_changed); dungeon.visibility_changed.connect(_visibility_changed)


func attach_session(bridge: RefCounted) -> void:
	_generation += 1; _bridge = bridge; _kept.clear(); _returning = false


func _preview(choice: Dictionary, generation: int) -> void:
	var origin: Dictionary = _picker.context.duplicate(true)
	if not _controller.reference_is_current(origin) or not choice.get("available",false) or choice.get("targetIdentity") == null: return
	var field := str(origin.field)
	if field != "soundId" and not field.begins_with("battle"): return
	while _operations.busy:
		await _picker.get_tree().process_frame
		if not _controller.reference_is_current(origin) or not _picker.visible or generation != _picker.generation: return
	var sound := field == "soundId"
	var method := ("application-media.preview" if choice.ownership=="stock" else "sound.preview") if sound else "battle.open"
	var params := {"identity":choice.targetIdentity} if sound else {"nativeId":str(choice.targetIdentity).get_slice(":",1).to_int()}
	var response := await _operations.run_workflow(_bridge,"Preview region reference",func(operation): return await operation.request(method,params),null,true)
	if not _controller.reference_is_current(origin): return
	if sound: _picker.receive_sound(response,generation,int(choice.value))
	elif _picker.visible and generation==_picker.generation and _picker.selected.get("identity")==choice.identity:
		if response.get("ok",false):
			var battle: Dictionary = response.result.battle
			var count: int = battle.grid.filter(func(value): return int(value)!=0).size()
			_picker.get_node("%Details").text = str(choice.detail) + "\n%d occupied grid cells · distance %d\nBefore message %d · After message %d · Macro %d\n%d findings" % [count,int(battle.distance),int(battle.messageBefore),int(battle.messageAfter),int(battle.battleMacro),response.result.diagnostics.size()]
		else: _picker.get_node("%Availability").text = str(response.get("error","Battle preview could not load."))
	if response.get("outcomeUnknown",false): failed.emit(response)


func _edit(choice: Dictionary, origin: Dictionary) -> void:
	if not _controller.reference_is_current(origin) or _operations.busy or choice.get("targetIdentity") == null: return
	var field := str(origin.field)
	var kind := "battle" if field.begins_with("battle") else "sound" if field=="soundId" else "message" if field=="textId" else "extra-action-point"
	var target := str(choice.targetIdentity); var native_id := target.get_slice(":",target.get_slice_count(":")-1).to_int()
	_kept = {"origin":origin.duplicate(true),"draft":_controller.view.kept_draft()}
	_controller.suspend_reference()
	await _open_target.call(kind,native_id,target,{"targetStatus":"application-resource" if choice.ownership=="stock" else "available"})
	_visibility_changed()


func _visibility_changed() -> void:
	if not _kept.is_empty() and not _returning and (_land.is_visible_in_tree() or _dungeon.is_visible_in_tree()): _restore.call_deferred()


func _restore() -> void:
	_returning = true; var generation := _generation
	while generation==_generation and _operations.busy: await _land.get_tree().process_frame
	if generation!=_generation: return
	if not _kept.is_empty() and (_land.is_visible_in_tree() or _dungeon.is_visible_in_tree()):
		var kept := _kept.duplicate(true)
		if await _controller.resume_reference(kept): _kept.clear()
	_returning = false


func dispose() -> void:
	attach_session(null)
	_land.visibility_changed.disconnect(_visibility_changed); _dungeon.visibility_changed.disconnect(_visibility_changed)
	_picker.preview_requested.disconnect(_preview); _picker.open_requested.disconnect(_edit)
	for connection in failed.get_connections(): failed.disconnect(connection.callable)
	_controller = null; _open_target = Callable()
