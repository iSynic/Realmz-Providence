class_name ProvidenceBattleEditor
extends HBoxContainer

signal document_applied(result: Dictionary)
signal commit_requested
signal recovery_requested
signal comparison_requested
signal record_requested(native_id: int)
signal inventory_requested
signal palette_requested
signal palette_art_requested
signal operation_requested(kind: String)
signal reference_requested(field: String)
signal reference_open_requested(field: String)
signal monster_open_requested(native_id: int, set_id: int)
signal used_by_requested
signal preview_requested
signal route_requested(route: String)

var draft := preload("res://src/battle_record_draft.gd").new()
var controller
var commit_handler: Callable
var picker:
	get:
		return get_node("ReferencePicker")
var _session_generation := 0
var _binding := false
var _locked := true
var _loading_label := ""
var _recovery := false
var _write_submitted := true
var _checking := false
var _summaries: Array = []
var _palette_rows: Array = []
var _monster_rows: Dictionary = {}
var _reference_rows: Dictionary = {}
var _brush := 0
var _set_id := 0
var _offset := 0
var _palette_offset := 0
var _total := 0
var _palette_total := 0
var _applied: Dictionary = {}
var _guard_action: Callable
var _impact_action: Callable
var _move_origin := -1


func _ready() -> void:
	resized.connect(_resize_palette)
	_resize_palette()
	draft.changed.connect(_render_draft)
	_bind_record_controls()
	_bind_palette_controls()
	_bind_grid_controls()
	for field in [%Before, %After, %Macro]:
		field.choose_requested.connect(reference_requested.emit)
		field.open_requested.connect(reference_open_requested.emit)
	%Distance.text_changed.connect(func(text: String):
		if not _binding and not _locked:
			draft.edit("distance", int(text) if text.is_valid_int() else text))
	%Impact.confirmed.connect(_accept_impact)
	%DraftGuard.add_button("Discard & Continue", false, "discard")
	%DraftGuard.custom_action.connect(_discard_guard)
	%DraftGuard.confirmed.connect(_apply_guard)
	%Failure.close_requested.connect(%Failure.hide)
	%CloseFailure.pressed.connect(%Failure.hide)
	%Recover.pressed.connect(recovery_requested.emit)
	%Compare.pressed.connect(comparison_requested.emit)
	_render_draft()


func _resize_palette() -> void:
	%PalettePanel.custom_minimum_size.x = 380 if get_viewport_rect().size.x >= 1800 else 300


func _accept_impact() -> void:
	%Impact.hide()
	if _impact_action.is_valid():
		_impact_action.call()


func _discard_guard(action: String) -> void:
	if action == "discard":
		discard_draft()
		_finish_guard()


func _bind_record_controls() -> void:
	%BattleSearch.text_changed.connect(func(_text): %SearchDelay.start())
	%SearchDelay.timeout.connect(func():
		_offset = 0
		inventory_requested.emit())
	%BattleRecordList.item_selected.connect(func(index): record_requested.emit(int(%BattleRecordList.get_item_metadata(index))))
	for pair in [[%NewBattle, "new"], [%CopyBattle, "copy"], [%ClearBattle, "clear"]]:
		pair[0].pressed.connect(func(): operation_requested.emit(pair[1]))
	%UsedBy.pressed.connect(used_by_requested.emit)
	%Preview.pressed.connect(func(): guard_navigation(preview_requested.emit))
	%Apply.pressed.connect(commit_requested.emit)
	%Discard.pressed.connect(discard_draft)
	%Recovery.pressed.connect(recovery_requested.emit)
	%BattleTab.pressed.connect(func(): %BattleTab.set_pressed_no_signal(true))
	%MonsterTab.pressed.connect(func(): route_requested.emit("combat.monsters"))
	%LibraryTab.pressed.connect(func(): route_requested.emit("combat.scrapbook"))


func _bind_palette_controls() -> void:
	for label in ["Normal", "Monster", "Mega"]: %MonsterSet.add_item(label)
	%MonsterSet.item_selected.connect(func(index):
		_set_id = [0, 1, -1][index]
		_monster_rows.clear()
		_palette_rows.clear()
		_palette_offset = 0
		%MonsterPalette.clear()
		_render_draft()
		palette_requested.emit())
	%PaletteSearch.text_changed.connect(func(_text): %PaletteDelay.start())
	%PaletteDelay.timeout.connect(func():
		_palette_offset = 0
		palette_requested.emit())
	%ShowUnavailable.toggled.connect(func(_value):
		_palette_offset = 0
		palette_requested.emit())
	%MonsterPalette.visible_items_changed.connect(func(): palette_art_requested.emit())
	%MonsterPalette.item_selected.connect(_choose_brush)
	%MonsterPalette.item_activated.connect(func(index):
		_choose_brush(index)
		monster_open_requested.emit(_brush, _set_id))
	%OpenPaletteMonster.pressed.connect(func(): monster_open_requested.emit(_brush, _set_id))
	%ForceFriends.toggled.connect(func(_value): _render_draft())


func _bind_grid_controls() -> void:
	for pair in [[%SelectTool, "select"], [%PaintTool, "paint"], [%EraseTool, "erase"]]:
		pair[0].pressed.connect(func(): _set_mode(pair[1]))
	%BattleCanvas.cell_selected.connect(func(_slot): _render_inspector())
	%BattleCanvas.cell_action.connect(_cell_action)
	%BattleCanvas.gesture_started.connect(draft.begin_gesture)
	%BattleCanvas.gesture_finished.connect(draft.finish_gesture)
	%BattleCanvas.gesture_cancelled.connect(func():
		draft.cancel_gesture()
		_set_mode("select"))
	%MoveOccupant.pressed.connect(func():
		_move_origin = %BattleCanvas.selected_slot
		%BattleCanvas.brush = _selected_value()
		_set_mode("move"))
	%ReplaceOccupant.pressed.connect(func(): _cell_action("replace", %BattleCanvas.selected_slot))
	%ClearCell.pressed.connect(func(): _cell_action("erase", %BattleCanvas.selected_slot))
	%SelectedFriends.toggled.connect(func(friends):
		if not _binding and not _locked:
			draft.edit_cell(%BattleCanvas.selected_slot, -absi(_selected_value()) if friends else absi(_selected_value())))
	%OpenSelectedMonster.pressed.connect(func(): monster_open_requested.emit(absi(_selected_value()), _set_id))


func bind_document(result: Dictionary) -> void:
	_applied = result.duplicate(true)
	draft.bind(result)
	_recovery = false
	_locked = false
	document_applied.emit(result.duplicate(true))
	_render_draft()


func allocate_document(result: Dictionary) -> void:
	_applied.clear()
	draft.allocate(result)
	_locked = false
	_render_draft()
	%Distance.grab_focus()


func set_inventory(result: Dictionary) -> void:
	_summaries = result.get("items", [])
	_offset = int(result.offset)
	_total = int(result.total)
	%BattleRecordList.clear()
	for row in _summaries:
		%BattleRecordList.add_item("%03d  Battle %d" % [int(row.nativeId), int(row.nativeId)])
		%BattleRecordList.set_item_metadata(%BattleRecordList.item_count - 1, int(row.nativeId))
		if int(row.nativeId) == current_selection():
			%BattleRecordList.select(%BattleRecordList.item_count - 1)
	%BattleRecordStatus.text = "%d records · %d matching" % [int(result.get("catalogTotal", _total)), _total]
	%Page.text = "%d entries · scroll to browse" % _total
	%Previous.hide(); %Next.hide()


func set_monsters(rows: Array, reset := false) -> void:
	if reset:
		_monster_rows.clear()
	for row in rows: _monster_rows[int(row.nativeId)] = row
	_render_draft()


func set_palette(result: Dictionary) -> void:
	var page: Dictionary = result.get("page", {})
	_palette_rows = page.get("items", [])
	_palette_offset = int(page.get("offset", 0))
	_palette_total = int(page.get("total", 0))
	set_monsters(_palette_rows)
	%MonsterPalette.render_page(_palette_rows, _brush, ["Normal", "Monster", "Mega"][[0, 1, -1].find(_set_id)])
	%PaletteStatus.text = "%d matching · %d placeable" % [_palette_total, int(page.get("placeableTotal", 0))]
	%PaletteEmpty.visible = _palette_total == 0
	%PaletteEmpty.text = "No matches. Clear the search or show unavailable entries." if int(page.get("placeableTotal", 0)) > 0 else "Create or transfer a scenario Monster in Monsters or Monster Library."
	%PalettePage.text = "%d entries · Scroll to browse" % _palette_total
	%PalettePrevious.hide()
	%PaletteNext.hide()
	_render_draft()


func receive_art(icon_id: int, projection: Dictionary) -> void:
	%BattleCanvas.receive_art(icon_id, projection)
	%MonsterPalette.receive_art(icon_id, projection.get("texture"), str(projection.get("reason", "")))
	_render_inspector()


func set_reference(field: String, row: Dictionary) -> void:
	_reference_rows[field] = row.duplicate(true)
	_render_draft()


func set_loading(loading: bool, message := "Loading Battle…") -> void:
	_locked = loading
	_loading_label = message if loading else ""
	_render_draft()


func show_palette_failure(response: Dictionary) -> void:
	_palette_rows.clear()
	%MonsterPalette.clear()
	%PaletteStatus.text = str(response.get("error", "The palette could not load."))
	_render_draft()
	if response.get("outcomeUnknown", false):
		show_submission_failure(response)


func set_recovery_checking(checking: bool) -> void:
	_checking = checking
	%Recovery.disabled = checking
	%Recover.disabled = checking
	_render_draft()


func show_submission_failure(response: Dictionary) -> void:
	_recovery = bool(response.get("outcomeUnknown", false))
	_write_submitted = bool(response.get("writeSubmitted", true))
	_locked = _recovery
	%FailureMessage.text = str(response.get("error", "Your draft is kept."))
	if _recovery:
		%FailureMessage.text += "\n\n" + ("Your original Apply may already be durable. " if _write_submitted else "") + "Editing and history stay locked. Closing this explanation leaves Check status in the Battle footer. Checking the original result never repeats Apply."
	%Recover.visible = _recovery
	%Compare.visible = not _recovery and not draft.record.is_empty()
	%Failure.popup_centered()
	_render_draft()


func show_review(title_text: String, explanation: String, accept: Callable) -> void:
	_impact_action = accept
	%Impact.title = title_text
	%Impact.dialog_text = explanation
	%Impact.ok_button_text = "Reload" if title_text == "Compare current Battle" else ("Clear draft" if title_text == "Clear Battle" else "Create draft")
	%Impact.popup_centered()


func finish_read_recovery() -> void:
	_recovery = false
	_locked = false
	%Failure.hide()
	_render_draft()


func guard_navigation(action: Callable) -> void:
	if _recovery:
		show_submission_failure({"outcomeUnknown": true, "error": "Check the original Apply result before navigating."})
		return
	if not has_unapplied_changes():
		action.call()
		return
	_guard_action = action
	%DraftGuard.dialog_text = "Battle %d has unapplied changes. Apply, discard them, or keep editing before continuing." % current_selection()
	%DraftGuard.popup_centered()


func _apply_guard() -> void:
	var response := await commit_selected()
	if response.get("ok", false):
		_finish_guard()


func _finish_guard() -> void:
	if has_unapplied_changes():
		return
	%DraftGuard.hide()
	var action := _guard_action
	_guard_action = Callable()
	if action.is_valid():
		action.call()


func _choose_brush(index: int) -> void:
	if index < 0 or index >= _palette_rows.size():
		return
	var row: Dictionary = _palette_rows[index]
	_brush = int(row.nativeId)
	if not row.available:
		_set_mode("select")
		%DraftStatus.text = str(row.reason)
		return
	_set_mode("paint")


func _set_mode(next: String) -> void:
	%BattleCanvas.mode = next
	%SelectTool.set_pressed_no_signal(next == "select")
	%PaintTool.set_pressed_no_signal(next == "paint")
	%EraseTool.set_pressed_no_signal(next == "erase")
	if next != "move":
		%BattleCanvas.brush = -_brush if %ForceFriends.button_pressed else _brush
	_render_draft()


func _cell_action(mode: String, slot: int) -> void:
	if _locked or _recovery or draft.record.is_empty() or slot < 0:
		return
	if mode == "erase":
		draft.edit_cell(slot, 0)
	elif mode == "move":
		if _move_origin < 0 or slot == _move_origin:
			return
		if int(draft.record.grid[slot]) != 0:
			%DraftStatus.text = "Move needs an empty anchor. Use Replace for an occupied anchor."
			return
		var value := int(draft.record.grid[_move_origin])
		draft.edit_cell(_move_origin, 0)
		draft.edit_cell(slot, value)
		%BattleCanvas.selected_slot = slot
		_move_origin = -1
		_set_mode("select")
	elif mode in ["paint", "replace"]:
		if not _brush_available():
			return
		var old := int(draft.record.grid[slot])
		var friends: bool = old < 0 if mode == "replace" else %ForceFriends.button_pressed
		draft.edit_cell(slot, -_brush if friends else _brush)
		%BattleCanvas.selected_slot = slot
	_render_inspector()


func _brush_available() -> bool:
	var selected: PackedInt32Array = %MonsterPalette.get_selected_items()
	if selected.is_empty() or selected[0] >= _palette_rows.size():
		return false
	var row: Dictionary = _palette_rows[selected[0]]
	return int(row.nativeId) == _brush and row.get("available", false)


func _render_draft() -> void:
	if not is_node_ready():
		return
	_binding = true
	var empty := draft.record.is_empty()
	var locked := _locked or _recovery or empty
	%BattleIdentity.text = "No Battle selected" if empty else "Battle %d · %s" % [current_selection(), ("Apply result unknown" if _write_submitted else "Connection lost") if _recovery else ("Unapplied draft" if draft.has_changes() else "Saved")]
	%Distance.editable = not locked
	var distance_text := "" if empty else str(draft.record.get("distance", ""))
	if not empty and draft.record.get("distance") is float and draft.record.distance == floor(draft.record.distance):
		distance_text = str(int(draft.record.distance))
	if %Distance.text != distance_text:
		%Distance.text = distance_text
	for pair in [[%Before, "messageBefore"], [%After, "messageAfter"], [%Macro, "battleMacro"]]:
		pair[0].set_value(0 if empty else int(draft.record.get(pair[1], 0)), _reference_rows.get(pair[1], {}))
		pair[0].set_locked(locked)
	%NewBattle.disabled = _locked or _recovery
	for control in [%CopyBattle, %ClearBattle, %UsedBy, %Preview]: control.disabled = locked or draft.creation
	%MonsterSet.disabled = _locked or _recovery
	%PaintTool.disabled = locked or not _brush_available()
	for control in [%SelectTool, %EraseTool, %ForceFriends]: control.disabled = locked
	%BattleCanvas.locked = locked or (%BattleCanvas.mode == "paint" and %PaintTool.disabled)
	%BattleCanvas.bind(draft.record.get("grid", []), _monster_rows)
	var count: int = draft.record.get("grid", []).filter(func(value): return int(value) != 0).size()
	%OccupantCount.text = "%d / 100 occupants" % count
	%Recovery.visible = _recovery
	%Discard.disabled = _locked or _recovery or not draft.has_changes()
	%Apply.disabled = locked or not draft.has_changes() or not draft.issue().is_empty()
	%DraftStatus.text = (("Apply result unknown" if _write_submitted else "Connection lost") + " · editing and history locked · awaiting status check") if _recovery else (draft.issue() if not draft.issue().is_empty() else ("Unapplied changes" if draft.has_changes() else "Saved"))
	if _checking:
		%DraftStatus.text = "Checking original result · editing and history locked · Apply will not be repeated"
	elif _locked and not _recovery and not _loading_label.is_empty():
		%DraftStatus.text = _loading_label
	_binding = false
	_render_inspector()


func _selected_value() -> int:
	var slot: int = %BattleCanvas.selected_slot
	return int(draft.record.get("grid", [])[slot]) if slot >= 0 and slot < draft.record.get("grid", []).size() else 0


func _render_inspector() -> void:
	var slot: int = %BattleCanvas.selected_slot
	var value := _selected_value()
	var row: Dictionary = _monster_rows.get(absi(value), {})
	var record: Dictionary = row.get("monster", {}) if row.get("monster") is Dictionary else {}
	%PlacementIdentity.text = "No occupant selected" if slot < 0 else "ANCHOR CELL (%d, %d)" % [slot / 13, slot % 13]
	%PlacementValue.text = "Empty cell" if value == 0 else "%s · %d" % [str(row.get("label", "Missing Monster")), absi(value)]
	%PlacementState.text = "" if value == 0 else ("Force Friend" if value < 0 else "Hostile") + " · " + ["Normal", "Monster", "Mega"][[0, 1, -1].find(_set_id)]
	if value != 0:
		var footprint: Vector2i = %BattleCanvas.footprint(value)
		%PlacementState.text += " · %d×%d" % [footprint.x, footprint.y]
	var projection: Dictionary = %BattleCanvas.art.get(int(record.get("iconId", 0)), {})
	%Facing.texture = projection.get("texture")
	%Reverse.texture = projection.get("facingTexture")
	%AppearanceReason.text = str(projection.get("reason", ""))
	%AppearanceReason.visible = value != 0 and not %AppearanceReason.text.is_empty()
	%MonsterFacts.text = str(row.get("reason", "")) if record.is_empty() else "Stamina %d   Armor %d\nSpell points %d   Resist %d\nMovement %d   Attacks %d" % [int(record.get("hitDice", 0)), int(record.get("armor", 0)), int(record.get("spellPoints", 0)), int(record.get("magicResistance", 0)), int(record.get("movementMax", 0)), int(record.get("attackCount", 0))]
	_binding = true
	%SelectedFriends.set_pressed_no_signal(value < 0)
	for control in [%SelectedFriends, %ClearCell, %MoveOccupant, %OpenSelectedMonster]: control.disabled = _locked or _recovery or value == 0
	%ReplaceOccupant.disabled = _locked or _recovery or value == 0 or not _brush_available()
	%OpenPaletteMonster.disabled = _locked or _recovery or not _brush_available()
	_binding = false


func route_identity() -> String: return "combat.battles"
func current_selection() -> int: return int(draft.record.get("nativeId", -1))
func current_applied_native_id() -> int: return int(_applied.get("battle", {}).get("nativeId", -1))
func current_battle() -> Dictionary: return _applied.get("battle", {}).duplicate(true)
func has_unapplied_changes() -> bool: return draft.has_changes() or _recovery
func authoring_generation() -> Vector2i: return Vector2i(_session_generation, draft.generation)
func command_state(_command_id: String) -> String: return "working"
func workbench_title() -> String: return "Combat / Battles"
func apply_label() -> String: return "Apply Battle"
func draft_error() -> Dictionary:
	var problem := "Check the original Apply result." if _recovery else draft.issue()
	return {} if problem.is_empty() else {"ok": false, "error": problem, "control": %Recovery if _recovery else %Distance}
func commit_selected() -> Dictionary: return await commit_handler.call() if commit_handler.is_valid() else {"ok": false, "error": "Open a project first."}
func discard_draft() -> void:
	if not _recovery:
		draft.discard()
		_render_draft()
func present_selection() -> void: document_applied.emit(_applied.duplicate(true))
func read_state() -> Dictionary:
	return {"search": %BattleSearch.text, "offset": _offset, "paletteSearch": %PaletteSearch.text, "paletteOffset": _palette_offset, "setId": _set_id, "brush": _brush, "showUnavailable": %ShowUnavailable.button_pressed, "slot": %BattleCanvas.selected_slot}


func clear_art() -> void:
	%BattleCanvas.art.clear()
	%MonsterPalette.clear_art()
	%BattleCanvas.queue_redraw()
	_render_inspector()


func visible_icon_ids() -> Array:
	var ids: Array = []
	var rows: Array = %MonsterPalette.visible_records()
	for value in draft.record.get("grid", []):
		var id := absi(int(value))
		if id != 0 and _monster_rows.has(id): rows.append(_monster_rows[id])
	for row in rows:
		if row.get("monster") is Dictionary:
			var id := int(row.monster.get("iconId", 0))
			if id != 0 and not id in ids:
				ids.append(id)
	return ids
func reference_context(field: String) -> Dictionary:
	if draft.record.is_empty() or _locked or _recovery:
		return {}
	var label := "Round Macro" if field == "battleMacro" else ("Before String" if field == "messageBefore" else "After String")
	return {"field": field, "currentValue": int(draft.record.get(field, 0)), "projectRevision": draft.revision,
		"origin": authoring_generation(), "nativeId": current_selection(), "label": label, "destination": "Battle %d · %s" % [current_selection(), label], "allowNone": true}
func reference_context_matches(context: Dictionary) -> bool:
	return not context.is_empty() and context.get("origin") == authoring_generation() and int(context.get("nativeId", -2)) == current_selection() and int(context.get("projectRevision", -2)) == draft.revision
func focus_source(identity: String, _slot: int, field: String) -> bool:
	if identity != str(draft.record.get("identity", "")):
		return false
	var control: Control = {"distance": %Distance, "messageBefore": %Before, "messageAfter": %After, "battleMacro": %Macro}.get(field)
	if control != null:
		if control is LineEdit:
			control.grab_focus()
		else:
			control.get_node("Choose").grab_focus()
		return true
	var index := field.trim_prefix("grid[").trim_suffix("].monster")
	if not index.is_valid_int() or int(index) < 0 or int(index) >= 169:
		return false
	%BattleCanvas.selected_slot = int(index)
	%BattleCanvas.grab_focus()
	_render_draft()
	return true
func teardown_session() -> void:
	_session_generation += 1
	_loading_label = ""
	_applied.clear()
	_monster_rows.clear()
	_reference_rows.clear()
	_palette_rows.clear()
	_summaries.clear()
	draft.bind({})
	%BattleRecordList.clear()
	%MonsterPalette.clear()
	picker.cancel(false)
	%Failure.hide()
	_locked = true
	$BattleUses.cancel(false)
	if controller != null:
		controller.teardown()
	_render_draft()
func clear_selection() -> void: teardown_session()
func read_navigation_state() -> Dictionary:
	var state := read_state()
	state.merge({"nativeId": current_selection(), "sessionGeneration": _session_generation,
		"recordScroll": %BattleRecordList.get_v_scroll_bar().value, "paletteScroll": %MonsterPalette.get_v_scroll_bar().value})
	var focus := get_viewport().gui_get_focus_owner()
	state["focus"] = str(get_path_to(focus)) if focus != null and is_ancestor_of(focus) else ""
	return state


func restore_navigation_state(state: Dictionary) -> bool:
	if state.get("sessionGeneration", -1) != _session_generation:
		return false
	restore_browser_state(state)
	var response: Dictionary = await controller.reload(null, int(state.get("nativeId", -1)))
	if not response.get("ok", false) or state.get("sessionGeneration", -1) != _session_generation:
		return false
	%BattleRecordList.get_v_scroll_bar().value = float(state.get("recordScroll", 0))
	%MonsterPalette.get_v_scroll_bar().value = float(state.get("paletteScroll", 0))
	var focus := get_node_or_null(str(state.get("focus", ""))) as Control
	if focus != null and focus.is_visible_in_tree():
		focus.grab_focus()
	return true


func restore_browser_state(state: Dictionary) -> void:
	_binding = true
	%BattleSearch.text = str(state.get("search", ""))
	%PaletteSearch.text = str(state.get("paletteSearch", ""))
	%SearchDelay.stop()
	%PaletteDelay.stop()
	_offset = int(state.get("offset", 0))
	_palette_offset = int(state.get("paletteOffset", 0))
	_set_id = int(state.get("setId", 0))
	_brush = int(state.get("brush", 0))
	%MonsterSet.select([0, 1, -1].find(_set_id))
	%ShowUnavailable.set_pressed_no_signal(bool(state.get("showUnavailable", false)))
	%BattleCanvas.selected_slot = int(state.get("slot", -1))
	_binding = false
func open_native_id(native_id: int) -> Dictionary: return await controller.open_record(native_id)
func open_native_id_for_test(native_id: int) -> Dictionary: return await open_native_id(native_id)
func refresh_workbench(operation: ProvidenceEditorOperation = null) -> Dictionary: return await controller.reload(operation)
func reload(_bridge, preferred_native_id := -1, operation: ProvidenceEditorOperation = null) -> Dictionary: return await controller.reload(operation, preferred_native_id)
