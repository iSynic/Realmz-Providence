extends RefCounted

signal failed(response: Dictionary)

var _view: Window
var _land: Control
var _operations: ProvidenceEditorOperation
var _bridge: RefCounted
var _matches: Callable
var _suspend: Callable
var _resume: Callable
var _open_target: Callable
var _kept: Dictionary = {}
var _returning := false
var _generation := 0


func initialize(view: Window, land: Control, operations: ProvidenceEditorOperation, matches: Callable, suspend: Callable, resume: Callable, open_target: Callable) -> void:
	_view = view; _land = land; _operations = operations
	_matches = matches; _suspend = suspend; _resume = resume; _open_target = open_target
	view.get_node("%BehaviorSoundPicker").preview_requested.connect(_preview)
	view.get_node("%BehaviorSoundPicker").open_requested.connect(_edit)
	land.visibility_changed.connect(_visibility_changed)


func attach_session(bridge: RefCounted) -> void:
	_generation += 1; _bridge = bridge; _kept.clear(); _returning = false


func _current(origin: Dictionary) -> bool:
	return _bridge != null and _matches.is_valid() and _matches.call(origin)


func _preview(choice: Dictionary, generation: int) -> void:
	var picker: Window = _view.get_node("%BehaviorSoundPicker")
	var origin: Dictionary = picker.context.duplicate(true)
	if not _current(origin) or not choice.get("available",false) or choice.get("targetIdentity") == null: return
	while _operations.busy:
		await _view.get_tree().process_frame
		if not _current(origin) or generation != picker.generation or not picker.visible: return
	var method := "application-media.preview" if choice.ownership == "stock" else "sound.preview"
	var response := await _operations.run_workflow(_bridge,"Preview movement sound",func(operation): return await operation.request(method,{"identity":choice.targetIdentity}),null,true)
	if _current(origin):
		picker.receive_sound(response,generation,int(choice.value))
		if response.get("outcomeUnknown",false): failed.emit(response)


func _edit(choice: Dictionary, context: Dictionary) -> void:
	if not _current(context) or _operations.busy or choice.get("targetIdentity") == null: return
	var generation := _generation
	_kept = {"origin":context.duplicate(true),"draft":_view.draft(),"baseline":_view.baseline()}
	_suspend.call(); _view.suspend_reference()
	await _open_target.call("sound",absi(int(choice.value)),str(choice.targetIdentity),{"targetStatus":"application-resource" if choice.ownership == "stock" else "available"})
	if generation == _generation and _land.is_visible_in_tree(): _visibility_changed()


func _visibility_changed() -> void:
	if _land.is_visible_in_tree() and not _kept.is_empty() and not _returning: _restore.call_deferred()


func _restore() -> void:
	if _returning or _kept.is_empty(): return
	var generation := _generation
	_returning = true
	while generation == _generation and _operations.busy and _land.is_inside_tree(): await _land.get_tree().process_frame
	if generation != _generation: return
	if _land.is_visible_in_tree() and not _kept.is_empty():
		var kept := _kept.duplicate(true); _kept.clear()
		await _resume.call(kept)
	if generation == _generation: _returning = false


func dispose() -> void:
	attach_session(null)
	_land.visibility_changed.disconnect(_visibility_changed)
	_matches = Callable(); _suspend = Callable(); _resume = Callable(); _open_target = Callable()
