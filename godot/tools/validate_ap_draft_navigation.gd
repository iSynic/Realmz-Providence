extends SceneTree

const ImportSmoke = preload("res://tools/classic_scenario_import_smoke.gd")

class FaultBridge extends "res://src/native_bridge.gd":
	var reject_apply := false
	func _request(method: String, params: Dictionary) -> Dictionary:
		if reject_apply and method == "action-point.apply-draft":
			return {"ok": false, "error": "Controlled Apply rejection; draft retained."}
		return super._request(method, params)

var _shell: Control
var _view: ProvidenceActionPointEditor
var _path := ""
const SOURCE = "action-point:land:3:13"
const DESTINATION = "action-point:land:3:14"

func _initialize() -> void: _run.call_deferred()

func _run() -> void:
	var args := OS.get_cmdline_user_args()
	assert(args.size() == 2, "Expected disposable root and Classic scenario folder")
	_path = args[0].path_join("project")
	OS.set_environment("PROVIDENCE_PROJECT_PATH", "")
	root.gui_embed_subwindows = true
	_shell = load("res://src/editor_shell.tscn").instantiate()
	root.add_child(_shell)
	await process_frame
	_shell._bridge.stop()
	_shell._bridge = FaultBridge.new(args[0].path_join("settings.cfg"))
	var created: Dictionary = _shell._bridge.create_project("ap-draft-navigation", _path)
	assert(created.get("ok", false), str(created))
	await _shell._activate_session(created)
	assert(not (await ImportSmoke._inspect_source(_shell, args[1])).is_empty())
	assert(not (await ImportSmoke._import_and_describe(_shell)).is_empty())
	_view = _shell._documents.view("scripts.action-points")
	await _shell._navigation.select_route("scripts.action-points")
	for viewport in [Vector2i(1920, 1080), Vector2i(1600, 900)]:
		root.size = viewport
		root.content_scale_size = viewport
		assert(await _shell._scripts.open_action_point(SOURCE))
		await _settle()
		await _check_apply_history(viewport)
		await _check_selection_choices()
		await _check_failed_apply()
	await _check_reopen()
	_shell._close_project()
	_shell.queue_free()
	await process_frame
	print("PROVIDENCE_AP_DRAFT_NAVIGATION_OK actual-mouse-input viewports=1920+1600 local-apply-discard cancel apply-continue discard-continue failure-kept undo-redo save-reopen")
	quit()

func _check_apply_history(viewport: Vector2i) -> void:
	for node in [_view.get_node("%ApplyActionPoint"), _view.get_node("%DiscardActionPoint")]:
		assert(node.is_visible_in_tree() and not node.disabled)
		var rect: Rect2 = node.get_global_rect()
		assert(Rect2(Vector2.ZERO, Vector2(viewport)).encloses(rect), str(rect))
	var before := _message_value()
	var revision: int = _shell._session_view.revision
	await _edit_message(808)
	await _click(_view.get_node("%ApplyActionPoint"))
	assert(not _view.has_unapplied_changes() and _shell._session_view.revision == revision + 1)
	assert(_message_value() == 808)
	await _shell._execute_history("undo")
	await _settle()
	assert(_message_value() == before and not _view.has_unapplied_changes())
	await _shell._execute_history("redo")
	await _settle()
	assert(_message_value() == 808 and not _view.has_unapplied_changes())

func _check_selection_choices() -> void:
	await _edit_message(809)
	var revision: int = _shell._session_view.revision
	await _select_destination()
	assert(_shell._unapplied_dialog.visible and _view.selected_identity() == SOURCE)
	assert(_view.has_unapplied_changes() and _shell._session_view.revision == revision)
	await _click(_shell._unapplied_dialog.get_cancel_button())
	assert(_view.has_unapplied_changes() and _view.selected_identity() == SOURCE)
	await _select_destination()
	await _click(_shell._unapplied_dialog.get_ok_button())
	assert(_view.selected_identity() == DESTINATION and not _view.has_unapplied_changes())
	assert(_shell._session_view.revision == revision + 1)
	assert(await _shell._scripts.open_action_point(SOURCE))
	await _settle()
	assert(_message_value() == 809)
	await _edit_message(810)
	await _click(_view.get_node("%DiscardActionPoint"))
	assert(not _view.has_unapplied_changes() and _message_value() == 809)
	await _edit_message(811)
	revision = _shell._session_view.revision
	await _select_destination()
	await _click(_button(_shell._unapplied_dialog, "Discard & Continue"))
	assert(_view.selected_identity() == DESTINATION and _shell._session_view.revision == revision)
	assert(await _shell._scripts.open_action_point(SOURCE))
	await _settle()
	assert(_message_value() == 809)

func _check_failed_apply() -> void:
	await _edit_message(812)
	var revision: int = _shell._session_view.revision
	_shell._bridge.reject_apply = true
	await _select_destination()
	await _click(_shell._unapplied_dialog.get_ok_button())
	assert(_shell._unapplied_dialog.visible and _view.selected_identity() == SOURCE)
	assert(_view.has_unapplied_changes() and _shell._session_view.revision == revision)
	_shell._bridge.reject_apply = false
	await _click(_shell._unapplied_dialog.get_cancel_button())
	await _click(_view.get_node("%DiscardActionPoint"))
	assert(not _view.has_unapplied_changes() and _message_value() == 809)

func _check_reopen() -> void:
	assert(_shell._bridge.request("project.save").get("ok", false))
	var reopened: Dictionary = _shell._bridge.start_project(_path)
	assert(reopened.get("ok", false))
	await _shell._activate_session(reopened)
	await _shell._navigation.select_route("scripts.action-points")
	assert(await _shell._scripts.open_action_point(SOURCE))
	await _settle()
	assert(_message_value() == 809 and not _view.has_unapplied_changes())

func _edit_message(value: int) -> void:
	var workbench: ProvidenceActionStepWorkbench = _view.get_node("%SemanticActionSteps")
	assert(workbench.focus_slot(2))
	await _settle()
	assert(workbench._field_controls.has("targetNativeId"))
	await _click(workbench._field_controls.targetNativeId.control)
	workbench._target_search.text = str(value)
	workbench._target_search.text_submitted.emit(str(value))
	await _settle()
	var choice := -1
	for index in range(workbench._target_results.item_count):
		if int(workbench._target_results.get_item_metadata(index).value) == value: choice = index
	assert(choice >= 0, "Message picker did not return the requested message")
	workbench._target_results.item_activated.emit(choice)
	await _settle()
	assert(_view.has_unapplied_changes() and _view.can_apply_draft())

func _message_value() -> int:
	for action in _view.current_action_point().get("actions", []):
		if int(action.slot) == 2: return int(action.targetNativeId)
	assert(false, "Missing Show Message step")
	return -1

func _select_destination() -> void:
	var list: ItemList = _view.get_node("%ActionPointCollection")
	var index := -1
	for i in range(_view._summaries.size()):
		if str(_view._summaries[i].identity) == DESTINATION: index = i
	assert(index >= 0)
	var rect := list.get_item_rect(index)
	await _click_at(list.global_position + rect.get_center())

func _click(button: Button) -> void:
	assert(button != null and button.is_visible_in_tree() and not button.disabled)
	var position := button.get_global_rect().get_center()
	if button.get_window() != root: position += Vector2(button.get_window().position)
	await _click_at(position)

func _click_at(position: Vector2) -> void:
	for pressed in [true, false]:
		var event := InputEventMouseButton.new()
		event.button_index = MOUSE_BUTTON_LEFT
		event.position = position
		event.global_position = position
		event.pressed = pressed
		Input.parse_input_event(event)
		await process_frame
	await _settle()

func _settle() -> void:
	var idle := 0
	var deadline := Time.get_ticks_msec() + 15000
	while idle < 5:
		assert(Time.get_ticks_msec() < deadline, "Script workflow did not settle")
		await process_frame
		idle = 0 if _shell._operations.busy or _shell._scripts._form_description_drain_running else idle + 1

func _button(node: Node, text: String) -> Button:
	if node is Button and node.text == text: return node
	for child in node.get_children(true):
		var result := _button(child, text)
		if result != null: return result
	return null
