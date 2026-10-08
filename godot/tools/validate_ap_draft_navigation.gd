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
var _source_directory := ""
const SOURCE = "action-point:land:3:13"
const DESTINATION = "action-point:land:3:14"

func _initialize() -> void: _run.call_deferred()

func _run() -> void:
	var args := OS.get_cmdline_user_args()
	assert(args.size() == 2, "Expected disposable root and Classic scenario folder")
	_path = args[0].path_join("project")
	_source_directory = args[1]
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
	await _check_preserved_dungeon_row()
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


func _check_preserved_dungeon_row() -> void:
	assert(await _shell._scripts.open_action_point("action-point:dungeon:1:28"))
	await _settle()
	assert(_view._identity.text.contains("Unplaced") and not _view._identity.text.contains("(0, 0)"))
	var original: Dictionary = _view.current_action_point().duplicate(true)
	var steps: ProvidenceActionStepWorkbench = _view._semantic_steps
	assert(steps.draft_steps().size() == 8)
	assert(steps._step_list._items[0].text.contains("Unrecognized imported instruction"))
	assert(_view.draft_error().is_empty(), str(_view.draft_error()))
	steps._select_slot(1)
	await _settle()
	assert(steps._description.text.contains("Missing Extra Code 22075"))
	var money := steps._field_controls.moneyType.control as OptionButton
	assert(money.get_item_text(money.selected) == "Default (0)")
	var gems := -1
	for index in money.item_count:
		if int(money.get_item_metadata(index)) == 2: gems = index
	assert(gems >= 0)
	money.select(gems)
	money.item_selected.emit(gems)
	await _settle()
	assert(_view.can_apply_draft(), str(_view.draft_error()))
	await _click(_view.get_node("%ApplyActionPoint"))
	var updated := _view.current_action_point()
	assert(int((steps._field_controls.moneyType.control as OptionButton).get_item_metadata((steps._field_controls.moneyType.control as OptionButton).selected)) == 2)
	assert(not _view.has_unapplied_changes())
	for key in ["classicDoorId", "coordinate", "postActionLevel", "postActionX", "postActionY", "chancePercent"]:
		assert(updated[key] == original[key], key)
	for index in range(8):
		if index != 1: assert(updated.actions[index] == original.actions[index], str(index))
	await _shell._execute_history("undo")
	await _settle()
	assert(_view.current_action_point() == original, "Undo: %s != %s" % [str(_view.current_action_point()), str(original)])
	await _shell._execute_history("redo")
	await _settle()
	assert(_view.current_action_point() == updated)
	await _check_dungeon_export(updated)
	assert(_shell._bridge.request("project.save").get("ok", false))
	var reopened: Dictionary = _shell._bridge.start_project(_path)
	assert(reopened.get("ok", false))
	await _shell._activate_session(reopened)
	await _shell._navigation.select_route("scripts.action-points")
	assert(await _shell._scripts.open_action_point("action-point:dungeon:1:28"))
	await _settle()
	assert(_view.current_action_point() == updated)


func _check_dungeon_export(updated: Dictionary) -> void:
	var output := _path.get_base_dir().path_join("export/Lord of the Abyss")
	assert(DirAccess.make_dir_recursive_absolute(output.get_base_dir()) == OK)
	var exported: Dictionary = _shell._bridge.request("project.compile-classic-slice", {"directory": output, "expectedRevision": _shell._session_view.revision})
	assert(exported.get("ok", false), str(exported))
	assert(FileAccess.get_file_as_bytes(output.path_join("Data DL")) == FileAccess.get_file_as_bytes(_source_directory.path_join("Data DL")))
	var before := FileAccess.get_file_as_bytes(_source_directory.path_join("Data DDD"))
	var after := FileAccess.get_file_as_bytes(output.path_join("Data DDD"))
	assert(before.size() == after.size())
	var target_offset := 4000 + 28 * 40 + 26
	for index in before.size():
		if index not in [target_offset, target_offset + 1]: assert(before[index] == after[index], str(index))
	before = FileAccess.get_file_as_bytes(_source_directory.path_join("Data EDCD"))
	after = FileAccess.get_file_as_bytes(output.path_join("Data EDCD"))
	var settings_offset := int(updated.actions[1].targetNativeId) * 10
	for index in before.size():
		if index < settings_offset or index >= settings_offset + 10: assert(before[index] == after[index], str(index))

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
