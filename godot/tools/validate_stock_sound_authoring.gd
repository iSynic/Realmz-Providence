extends SceneTree

const ACTION_ID := "realmz.action.9"
const AP_ID := "action-point:land:0:78"
const XAP_ID := "extra-action-point:436"
const SLOT := 6
const STOCK_SOUND_ID := 147
const STOCK_SOUND_IDENTITY := "classic-application:family-jewels:snd:147"

var _shell: Control
var _view: Control
var _workbench: ProvidenceActionStepWorkbench


func _initialize() -> void: call_deferred("_run")


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	assert(args.size() == 1)
	OS.set_environment("PROVIDENCE_PROJECT_PATH", "")
	_shell = load("res://src/editor_shell.tscn").instantiate()
	root.add_child(_shell)
	await process_frame
	await _shell._project_session.open_project(args[0])
	assert(_shell._bridge.is_project_backed())
	assert(_shell._bridge._application_library_root != "")
	for ordinary in [true, false]: await _check_route(ordinary)
	_shell._bridge.stop()
	_shell.queue_free()
	await process_frame
	print("STOCK_SOUND_AUTHORING_NATIVE_OK ap+xap picker=source-qualified apply-reopen=exact audition=application-payload open=stock-identity back=origin-step unrelated=preserved")
	quit()


func _check_route(ordinary: bool) -> void:
	var route := "scripts.action-points" if ordinary else "scripts.macros"
	await _shell._navigation.select_route(route)
	assert(await _open_record(ordinary))
	_view = _shell._documents.view(route)
	_workbench = _view.get_node("%SemanticActionSteps")
	await _choose_play_sound()
	var baseline := _other_steps()
	var target := await _choose_stock_sound()
	_check_stock_form(target)
	await _view.commit_selected()
	await _settle()
	assert(not _view.has_unapplied_changes())
	assert(await _open_record(ordinary))
	_workbench.focus_slot(SLOT)
	await _settle()
	_check_stock_form(target)
	assert(_other_steps() == baseline)
	await _check_audition_and_navigation(target, ordinary)


func _open_record(ordinary: bool) -> bool:
	if ordinary: return await _shell._scripts.open_action_point(AP_ID)
	return await _shell._scripts.open_extra_action_point(XAP_ID)


func _choose_play_sound() -> void:
	_workbench.focus_slot(SLOT)
	assert(preload("res://tools/divinity_picker_test_actions.gd").choose(_workbench, ACTION_ID))
	await _settle()
	assert(_workbench._field_controls.has("targetNativeId"))


func _choose_stock_sound() -> Dictionary:
	var control := _workbench._field_controls.targetNativeId.control as Button
	assert(control != null)
	control.pressed.emit()
	await _settle()
	_workbench._target_search.text = str(STOCK_SOUND_ID)
	_workbench._target_search.text_submitted.emit(str(STOCK_SOUND_ID))
	await _settle()
	for index in _workbench._target_results.item_count:
		var item := _workbench._target_results.get_item_metadata(index) as Dictionary
		if int(item.get("value", -1)) != STOCK_SOUND_ID: continue
		if str(item.get("status", "")) != "application-resource": continue
		assert(str(item.get("identity", "")) == STOCK_SOUND_IDENTITY)
		assert(str(item.get("detail", "")).contains("The Family Jewels"))
		_workbench._target_results.item_activated.emit(index)
		await _settle()
		return item
	assert(false, "The configured application library must expose stock sound 147")
	return {}


func _check_stock_form(target: Dictionary) -> void:
	var field := _workbench._field_controls.targetNativeId.field as Dictionary
	var preview := field.get("preview", {}) as Dictionary
	assert(int(field.get("value", -1)) == STOCK_SOUND_ID)
	assert(str(preview.get("identity", "")) == str(target.identity))
	assert(str(preview.get("status", "")) == "application-resource")
	assert(str(preview.get("detail", "")).contains("The Family Jewels"))
	var row := (_workbench._field_controls.targetNativeId.control as Control).get_parent()
	assert(_button(row, "▶ Play") != null)
	assert(_button(row, "■ Stop") != null)
	assert(_button(row, "Open in Stock Library") != null)
	assert(_button(row, "Open in Editor") == null)


func _check_audition_and_navigation(target: Dictionary, ordinary: bool) -> void:
	var row := (_workbench._field_controls.targetNativeId.control as Control).get_parent()
	_button(row, "▶ Play").pressed.emit()
	await _settle()
	var sound_view = _shell._media.sounds._view
	assert(sound_view._player.stream is AudioStreamWAV)
	assert(not sound_view._player.stream.data.is_empty())
	_button(row, "■ Stop").pressed.emit()
	await process_frame
	assert(not sound_view._player.playing)
	_button(row, "Open in Stock Library").pressed.emit()
	await _settle()
	var assets = _shell._assets.library_workbench
	assert(is_instance_valid(assets))
	assert(assets.current_scope() == "stock")
	assert(assets.selected_asset_identity() == str(target.identity))
	await _shell._navigation.navigate_back()
	await _settle()
	var route := "scripts.action-points" if ordinary else "scripts.macros"
	assert(_shell._documents.view(route).selected_identity() == (AP_ID if ordinary else XAP_ID))
	assert(_workbench._selected_slot == SLOT)
	_check_stock_form(target)


func _button(row: Node, label: String) -> Button:
	for child in row.get_children():
		if child is Button and child.text == label: return child
	return null


func _other_steps() -> Array:
	return _workbench.draft_steps().filter(func(step): return int(step.slot) != SLOT).duplicate(true)


func _settle() -> void:
	var deadline := Time.get_ticks_msec() + 60000
	var idle := 0
	while idle < 4:
		assert(Time.get_ticks_msec() < deadline)
		await process_frame
		var pending: bool = _shell._scripts._form_description_drain_running or not _shell._scripts._pending_form_descriptions.is_empty()
		idle = 0 if _shell._operations.busy or pending or _workbench._form_description.is_empty() else idle + 1
