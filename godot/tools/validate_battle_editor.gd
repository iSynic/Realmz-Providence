extends SceneTree

var _editor: ProvidenceBattleEditor
var _failed := false


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	root.size = Vector2i(1600, 900)
	root.gui_embed_subwindows = true
	_editor = load("res://src/battle_editor.tscn").instantiate()
	_editor.theme = load("res://theme/providence_theme.tres")
	root.add_child(_editor)
	_editor.size = Vector2(1600, 900)
	await process_frame
	_populate()
	await _move_and_erase()
	if _failed: return
	await _overlap_and_keyboard()
	if _failed: return
	await _cancel_and_teardown()
	if _failed: return
	_preview_target()
	if _failed: return
	print("PROVIDENCE_BATTLE_EDITOR_OK cells=169 move-sign edge-anchor overlap-erase keyboard-delete gesture-cancel teardown preview=lockstep-ready")
	_editor.queue_free()
	quit(0)


func _populate(grid: Array = []) -> void:
	if grid.is_empty():
		grid.resize(169); grid.fill(0); grid[84] = -7
	_editor.bind_document({"revision": 4, "battle": {"identity": "battle:2", "nativeId": 2,
		"grid": grid, "distance": 3.0, "messageBefore": 0, "messageAfter": 0, "battleMacro": 0, "authored": true}})
	var rows := [{"nativeId": 7, "label": "Large Guard", "available": true, "reason": "",
		"monster": {"size": 3, "iconId": 0}}, {"nativeId": 8, "label": "Other Guard", "available": true,
		"reason": "", "monster": {"size": 3, "iconId": 0}}]
	_editor.set_palette({"page": {"items": rows, "offset": 0, "total": 2, "placeableTotal": 2}})
	_check(_editor.get_node("%Distance").text == "3" and not _editor.has_unapplied_changes(), "Reading an integral Distance dirtied or obscured the record")


func _move_and_erase() -> void:
	var canvas: ProvidenceBattleCanvas = _editor.get_node("%BattleCanvas")
	canvas.selected_slot = 84
	canvas.cell_selected.emit(84)
	_editor.get_node("%MoveOccupant").pressed.emit()
	await _click(0)
	if not _check(_editor.draft.record.grid[84] == 0 and _editor.draft.record.grid[14] == -7,
		"Moving the lower-right anchor at the edge lost placement sign or cell semantics"): return
	_editor.get_node("%MoveOccupant").pressed.emit()
	canvas.grab_focus()
	_key(KEY_ESCAPE)
	await process_frame
	if not _check(canvas.mode == "select" and _editor.draft.record.grid[14] == -7, "Escape failed to cancel Move before dragging"): return
	_editor.get_node("%EraseTool").pressed.emit()
	await _click(0)
	_check(_editor.draft.record.grid[14] == 0, "Erase targeted a covered cell instead of its visible anchor")


func _overlap_and_keyboard() -> void:
	var grid: Array = []; grid.resize(169); grid.fill(0); grid[84] = -7; grid[98] = 8
	_populate(grid)
	var canvas: ProvidenceBattleCanvas = _editor.get_node("%BattleCanvas")
	if not _check(canvas.visible_anchor(84) == 98, "Overlapping occupants did not follow visible draw order"): return
	_editor.get_node("%EraseTool").pressed.emit()
	await _click(84)
	if not _check(_editor.draft.record.grid[98] == 0 and _editor.draft.record.grid[84] == -7, "Erase removed the obscured occupant"): return
	canvas.selected_slot = 71
	canvas.grab_focus()
	_key(KEY_RIGHT)
	await process_frame
	if not _check(canvas.selected_slot == 84, "Arrow selection lost the column-major grid identity"): return
	_key(KEY_DELETE)
	await process_frame
	_check(_editor.draft.record.grid[84] == 0, "Keyboard Delete did not erase the selected visible occupant")


func _cancel_and_teardown() -> void:
	_populate()
	var palette: Control = _editor.get_node("%MonsterPalette")
	palette.select(0); palette.item_selected.emit(0)
	_mouse(35, true)
	await process_frame
	_key(KEY_ESCAPE)
	await process_frame
	if not _check(_editor.draft.record.grid[35] == 0 and _editor.draft.record.grid[84] == -7,
		"Cancelling a mouse gesture did not restore its complete starting draft"): return
	_editor.draft.edit("distance", "invalid")
	if not _check(_editor.get_node("%Apply").disabled and _editor.get_node("%Distance").text == "invalid", "Invalid text was normalized or became writable"): return
	_editor.get_node("%Discard").pressed.emit()
	_editor.picker.begin(_editor.reference_context("messageBefore"), _editor.get_node("%Distance"))
	_editor.teardown_session()
	if not _check(not _editor.picker.visible and _editor.current_applied_native_id() == -1, "Teardown retained a picker or previewable document"): return
	_populate()
	_editor.get_node("BattleUses").popup_centered(Vector2i(800, 520))
	_editor.teardown_session()
	_check(not _editor.picker.visible and not _editor.get_node("BattleUses").visible and _editor.current_applied_native_id() == -1,
		"Teardown retained a nested picker, uses window or previewable document")


func _preview_target() -> void:
	_populate()
	var selection := ProvidenceRebuiltPreviewSelection.new()
	var missing := selection.current_target("combat.battles", "", Vector2i(-1, -1), {}, {}, "", -1)
	var target := selection.current_target("combat.battles", "", Vector2i(-1, -1), {}, {}, "", _editor.current_applied_native_id())
	var preview: Node = load("res://src/rebuilt_preview_controller.tscn").instantiate()
	root.add_child(preview)
	var arguments: Dictionary = preview._target_arguments(target)
	_check(missing.is_empty() and target.get("kind") == "battle" and arguments.get("command") == "prepare-battle"
		and arguments.get("arguments") == PackedStringArray(["2"]), "Preview did not use the exact applied Battle identity")
	preview.queue_free()


func _click(slot: int) -> void:
	_mouse(slot, true); await process_frame; _mouse(slot, false); await process_frame


func _mouse(slot: int, pressed: bool) -> void:
	var canvas: ProvidenceBattleCanvas = _editor.get_node("%BattleCanvas")
	var event := InputEventMouseButton.new()
	event.button_index = MOUSE_BUTTON_LEFT; event.pressed = pressed
	event.position = canvas.global_position + canvas.rect_for_slot(slot).get_center()
	event.global_position = event.position
	root.push_input(event, true)


func _key(code: Key) -> void:
	var event := InputEventKey.new(); event.keycode = code; event.pressed = true
	root.push_input(event, true)


func _check(condition: bool, message: String) -> bool:
	if not condition and not _failed:
		_failed = true
		push_error("PROVIDENCE_BATTLE_EDITOR_FAILED: " + message)
		quit(1)
	return condition
