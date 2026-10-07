extends SceneTree
var _bridge := ProvidenceNativeBridge.new()
var _operations := ProvidenceEditorOperation.new()
var _controller := preload("res://src/global_macro_controller.gd").new()
var _view: ProvidenceGlobalMacroEditor
var _revision := 0
var _failed := false
func _initialize() -> void: call_deferred("_run")
func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size()!=1 or not args[0].get_base_dir().get_file().begins_with("providence-ui-"): quit(1); return
	root.size = Vector2i(1600,900)
	root.gui_embed_subwindows = true
	root.add_child(_operations)
	_view = preload("res://src/global_macro_editor.tscn").instantiate()
	root.add_child(_view)
	if not _accept(_bridge.create_project("global-hooks",args[0])): _finish(); return
	_accept(_bridge.request("extra-action-point.create",{"expectedRevision":_revision,"nativeId":1}))
	_accept(_bridge.request("extra-action-point.create",{"expectedRevision":_revision,"nativeId":119}))
	_controller.initialize(_view,_operations,func(): return {"revision":_revision},_accept)
	_controller.projection_applied.connect(func(projection): _revision=int(projection.revision))
	_controller.attach_session(_bridge)
	_check((await _controller.reload()).get("ok",false),"Could not load hooks")
	_check(not _view.can_apply_draft(),"Clean hooks enabled Apply")
	var before := _revision
	var original := _view.read_state()
	var choose := _view.find_child("StartGlobalMacroHook",true,false).find_child("Choose",true,false) as Button
	if not await _choose_start(choose): _finish();return
	_check(_view.has_unapplied_changes() and _revision==before and _view.read_state().start==1,"Picker mutated or chose wrong hook")
	_check(_view.can_apply_draft(),"Changed hooks did not enable Apply")
	_view.set_draft_target("death",119)
	await _settle()
	await _view.commit_selected()
	_check(_revision==before+1 and not _view.has_unapplied_changes(),"Five-hook Apply was not atomic")
	_accept(_bridge.request("history.undo",{"expectedRevision":_revision}))
	await _controller.reload()
	_check(_view.read_state()==original,"Undo did not restore all hooks")
	_accept(_bridge.request("history.redo",{"expectedRevision":_revision}))
	_accept(_bridge.request("project.save"))
	_accept(_bridge.start_project(args[0]))
	_controller.attach_session(_bridge)
	await _controller.reload()
	_check(_view.read_state().start==1 and _view.read_state().death==119,"Save/reopen lost hooks")
	choose.grab_focus()
	choose.pressed.emit()
	await _settle()
	var destination: Dictionary = _view.picker.context.duplicate(true)
	_view.picker.get_node("%Cancel").pressed.emit()
	await process_frame
	_check(not _view.has_unapplied_changes() and choose.has_focus(),"Cancel changed hooks or lost focus")
	_view.accept_choice({"identity":"extra-action-point:1","value":1,"available":true},destination)
	_check(not _view.has_unapplied_changes(),"Same target was not a no-op")
	_view.set_draft_target("start",119)
	_view.accept_choice({"identity":"extra-action-point:1","value":1,"available":true},destination)
	_check(_view.read_state().start==119,"Stale acceptance changed another draft")
	_view.discard_draft()
	_check(_view.read_state().start==1,"Discard lost saved assignment")
	_finish()
func _settle() -> void:
	await create_timer(0.4).timeout
	while _operations.busy: await process_frame
	await process_frame
func _accept(response: Dictionary) -> bool:
	if response.get("ok",false): _revision=int(response.get("result",{}).get("revision",_revision))
	else: _check(false,str(response))
	return bool(response.get("ok",false))
func _check(condition: bool,message: String) -> bool:
	if not condition: _failed=true;push_error(message)
	return condition
func _finish() -> void:
	if _view != null: _controller.dispose();_view.free()
	_bridge.stop()
	_operations.free()
	if not _failed: print("PROVIDENCE_GLOBAL_MACRO_NATIVE_OK contextual-picker eight-steps local-choice atomic-hooks undo-redo save-reopen cancel-focus same-target stale-rejected")
	quit(1 if _failed else 0)

func _choose_start(choose: Button) -> bool:
	choose.pressed.emit()
	await _settle()
	_check(_view.picker.visible and _view.picker.get_node("%Search").has_focus(),"Picker did not own search focus")
	_check(_view.picker.get_node("%Count").text.contains("of"),"Picker omitted the current page range")
	var choice_index := -1
	for index in _view.picker.get_node("%Choices").item_count:
		if _view.picker.get_node("%Choices").get_item_text(index).begins_with("1 ·"): choice_index=index
	if not _check(choice_index>=0,"XAP 1 missing from catalog"): return false
	_view.picker.get_node("%Choices").item_selected.emit(choice_index)
	await _settle()
	_check(not _view.picker.get_node("%UseSelection").disabled,"Eight-step preview did not enable acceptance")
	if _view.picker.get_node("%UseSelection").disabled: return false
	_view.picker.get_node("%UseSelection").pressed.emit()
	await _settle()
	return true
