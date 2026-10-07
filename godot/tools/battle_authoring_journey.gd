extends SceneTree

var _bridge: ProvidenceNativeBridge
var _operations: ProvidenceEditorOperation
var _view: ProvidenceBattleEditor
var _controller := preload("res://src/battle_authoring_controller.gd").new()
var _revision := 0
var _failed := false


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	root.size = Vector2i(1600, 900)
	root.gui_embed_subwindows = true
	var args := OS.get_cmdline_user_args()
	if not _check(args.size() == 1, "Expected a disposable Battle journey root"): return
	var project := args[0].path_join("project")
	_bridge = ProvidenceNativeBridge.new(args[0].path_join("settings.cfg"))
	_operations = ProvidenceEditorOperation.new()
	root.add_child(_operations)
	if not _ok(_bridge.create_project("battle-authoring-journey", project)): return
	if not _seed_references(): return
	_view = load("res://src/battle_editor.tscn").instantiate()
	_view.theme = load("res://theme/providence_theme.tres")
	_view.size = Vector2(1600, 900)
	_controller.initialize(_view, _operations, func(): return {"revision": _revision}, func(): return _bridge, func(response): return response.get("ok", false))
	_controller.projection_applied.connect(func(change): _revision = int(change.revision))
	root.add_child(_view)
	if not _ok(await _controller.reload()): return
	await _create_and_edit()
	if _failed: return
	await _pick_references()
	if _failed: return
	await _apply_and_reopen(project)
	if _failed: return
	await _navigation_and_record_operations()
	if _failed: return
	await _read_failure_and_stale_write()
	if _failed: return
	_bridge.stop()
	_view.queue_free()
	await process_frame
	print("PROVIDENCE_BATTLE_AUTHORING_JOURNEY_OK real-adapter create-review draft-distance column-major signed-placement mouse-gesture-cancel picker-preview-cancel-accept no-results same-selection atomic-apply undo-redo durable-reopen copy-clear-discard exact-return unavailable-variant dirty-navigation-cancel read-loss-reconnect stale-write-draft-kept")
	quit(0)


func _seed_references() -> bool:
	# Setup uses existing commands; the Battle task itself uses native controls.
	for id in [1, 2]:
		if not _mutate("monster.create", {"setId": 0, "nativeId": id}): return false
		if not _mutate("monster.draft.apply", {"operationId": Crypto.new().generate_random_bytes(32).hex_encode(), "draft": {"setId": 0, "nativeId": id, "fields": {"hitDice": 2, "displayName": "Journey Guard %d" % id}}}): return false
	for id in [148, 149]:
		if not _mutate("message.create", {"nativeId": id, "text": "Battle journey String %d" % id}): return false
	return _mutate("extra-action-point.create", {"nativeId": 4})


func _mutate(method: String, params: Dictionary) -> bool:
	params["expectedRevision"] = _revision
	var response := _bridge.request(method, params)
	if not _ok(response): return false
	_revision = int(_bridge.request("session.describe").result.revision)
	return true


func _create_and_edit() -> void:
	_view.get_node("%NewBattle").pressed.emit()
	await _idle()
	var impact: ConfirmationDialog = _view.get_node("%Impact")
	if not _check(impact.visible and _view.current_selection() == -1, "Allocation mutated the form before explicit acceptance"): return
	impact.confirmed.emit()
	await _idle()
	if not _check(_view.current_selection() == 0 and _view.draft.creation, "New did not open the exact vacant local draft"): return
	if not _check(_bridge.request("battle.list").result.total == 0, "Creation review wrote before Apply"): return
	var distance: LineEdit = _view.get_node("%Distance")
	distance.text = "invalid"
	distance.text_changed.emit(distance.text)
	if not _check(_view.get_node("%Apply").disabled and not _view.draft_error().is_empty(), "Invalid Distance did not disable Apply"): return
	distance.text = "18"
	distance.text_changed.emit(distance.text)
	var palette: Control = _view.get_node("%MonsterPalette")
	if not _check(palette.item_count >= 2, "The real bounded monster palette did not load"): return
	palette.select(0)
	palette.item_selected.emit(0)
	_view.get_node("%ForceFriends").button_pressed = true
	await _click_cell(35)
	if not _check(_view.draft.record.grid[35] == -1, "Mouse placement lost the column-major slot or Force Friend sign"): return
	_view.get_node("%ForceFriends").button_pressed = false
	palette.select(1)
	palette.item_selected.emit(1)
	await _click_cell(119)
	if not _check(_view.draft.record.grid[119] == 2, "Asymmetric mouse placement transposed coordinates"): return
	var canvas: ProvidenceBattleCanvas = _view.get_node("%BattleCanvas")
	var before: Array = _view.draft.record.grid.duplicate()
	_mouse(canvas, 60, true)
	await process_frame
	var escape := InputEventKey.new()
	escape.keycode = KEY_ESCAPE
	escape.pressed = true
	root.push_input(escape)
	await process_frame
	_mouse(canvas, 60, false)
	await process_frame
	_check(_view.draft.record.grid == before, "Escape did not restore the whole in-progress placement gesture")


func _pick_references() -> void:
	for pair in [["Before", "148", 148], ["After", "149", 149], ["Macro", "-4", -4]]:
		var field: Control = _view.get_node("%" + pair[0])
		field.get_node("Choose").pressed.emit()
		await _idle()
		var picker = _view.picker
		if not _check(picker.visible and picker.get_node("%Search").has_focus(), "Picker did not open with search focused"): return
		picker.get_node("%Search").text = pair[1]
		picker.get_node("%Search").text_changed.emit(pair[1])
		await create_timer(0.25).timeout
		await _idle()
		var choices: ItemList = picker.get_node("%Choices")
		if not _check(choices.item_count > 0, "Signed or String search returned no matching identity"): return
		choices.select(0)
		choices.item_selected.emit(0)
		var original: Dictionary = _view.draft.record.duplicate(true)
		picker.cancel()
		await process_frame
		if not _check(_view.draft.record == original, "Picker preview or cancellation changed the draft"): return
		field.get_node("Choose").pressed.emit()
		await _idle()
		picker.get_node("%Search").text = pair[1]
		picker.get_node("%Search").text_changed.emit(pair[1])
		await create_timer(0.25).timeout
		await _idle()
		choices.select(0)
		choices.item_selected.emit(0)
		picker.get_node("%UseSelection").pressed.emit()
		if not _check(_view.draft.record[field.field_key] == pair[2], "Explicit picker acceptance lost its canonical identity"): return
	_view.get_node("%Before").get_node("Choose").pressed.emit()
	await _idle()
	_view.picker.get_node("%Search").text = "no-such-journey-reference"
	_view.picker.get_node("%Search").text_changed.emit("no-such-journey-reference")
	await create_timer(0.25).timeout
	await _idle()
	_check(_view.picker.get_node("%Choices").item_count == 0 and _view.picker.get_node("%UseSelection").disabled, "No-results retained an actionable stale preview")
	_view.picker.cancel()


func _apply_and_reopen(project: String) -> void:
	var before := _revision
	_view.get_node("%Apply").pressed.emit()
	await _idle()
	if not _check(_revision == before + 1 and not _view.has_unapplied_changes(), "Apply did not confirm exactly one canonical change"): return
	var opened := _bridge.request("battle.open", {"nativeId": 0})
	if not _ok(opened): return
	var record: Dictionary = opened.result.battle
	if not _check(record.grid[35] == -1 and record.grid[119] == 2 and record.distance == 18 and record.messageBefore == 148 and record.messageAfter == 149 and record.battleMacro == -4, "Atomic Apply lost authored fields"): return
	_view.get_node("%Macro").get_node("Choose").pressed.emit()
	await _idle()
	_view.picker.get_node("%UseSelection").pressed.emit()
	if not _check(not _view.has_unapplied_changes(), "Accepting the current signed Macro made a draft"): return
	if not _mutate("history.undo", {}): return
	if not _check(not _bridge.request("battle.open", {"nativeId": 0}).get("ok", false), "Undo retained the created Battle"): return
	if not _mutate("history.redo", {}): return
	_bridge.stop()
	if not _ok(_bridge.start_project(project)): return
	opened = _bridge.request("battle.open", {"nativeId": 0})
	if not _ok(opened): return
	_check(opened.result.battle == record, "Durable reopen changed the complete Battle")


func _navigation_and_record_operations() -> void:
	if not _ok(await _controller.reload()): return
	_view.get_node("%BattleCanvas").selected_slot = 35
	_view.get_node("%Distance").grab_focus()
	var location := _view.read_navigation_state()
	_view.get_node("%CopyBattle").pressed.emit()
	await _idle()
	_view.get_node("%Impact").confirmed.emit()
	await _idle()
	if not _check(_view.current_selection() == 1 and _view.draft.record.grid[35] == -1 and _view.draft.record.battleMacro == -4, "Copy lost the reviewed vacant identity or signed fields"): return
	_view.get_node("%Discard").pressed.emit()
	if not _check(await _view.restore_navigation_state(location), "Exact Battle return failed"): return
	if not _check(_view.current_selection() == 0 and _view.get_node("%BattleCanvas").selected_slot == 35 and _view.get_node("%Distance").has_focus(), "Return lost record, selected cell or focus"): return
	_view.get_node("%ClearBattle").pressed.emit()
	await _idle()
	_view.get_node("%Impact").confirmed.emit()
	if not _check(_view.draft.record.grid.all(func(value): return value == 0) and _bridge.request("battle.open", {"nativeId": 0}).result.battle.grid[35] == -1, "Clear wrote before Apply or retained occupants"): return
	_view.get_node("%Discard").pressed.emit()
	if not _check(_view.draft.record.grid[35] == -1, "Discard did not restore the complete cleared record"): return
	_view.get_node("%ShowUnavailable").button_pressed = true
	_view.get_node("%MonsterSet").select(2)
	_view.get_node("%MonsterSet").item_selected.emit(2)
	await _idle()
	var palette: Control = _view.get_node("%MonsterPalette")
	if not _check(palette.item_count > 0 and _view.get_node("%PaintTool").disabled, "Missing exact preview variant was substituted or became placeable"): return
	if not _check(await _view.restore_navigation_state(location), "Normal preview context could not be restored"): return
	_view.get_node("%Distance").text = "19"
	_view.get_node("%Distance").text_changed.emit("19")
	_view.get_node("%NewBattle").pressed.emit()
	await _idle()
	if not _check(_view.get_node("%DraftGuard").visible, "Dirty navigation did not offer an explicit choice"): return
	_view.get_node("%DraftGuard").get_cancel_button().pressed.emit()
	_view.get_node("%DraftGuard").hide()
	_check(_view.current_selection() == 0 and _view.draft.record.distance == 19, "Cancel changed the originating dirty Battle")


func _read_failure_and_stale_write() -> void:
	var revision_before := _revision
	# Kill only this fixture's adapter before its read-only prepare request.
	OS.kill(int(_bridge._process.pid))
	await process_frame
	_view.get_node("%Apply").pressed.emit()
	await _idle()
	if not _check(_view.get_node("%Recovery").visible and _operations.requires_reopen, "Read loss stranded the retained draft without a recovery entry"): return
	if not _check(_view.get_node("%FailureMessage").text.contains("not submitted"), "Read loss was mislabeled as an uncertain mutation"): return
	_view.get_node("%CloseFailure").pressed.emit()
	if not _check(_view.get_node("%Recovery").visible and _view.get_node("%Apply").disabled, "Closing failure removed recovery or unlocked editing"): return
	_view.get_node("%Recovery").pressed.emit()
	await _idle()
	if not _check(not _operations.requires_reopen and not _view.get_node("%Recovery").visible and _view.draft.record.distance == 19, "Explicit read recovery lost the draft or remained locked"): return
	if not _check(_bridge.request("session.describe").result.revision == revision_before, "Read recovery submitted or replayed a mutation"): return
	if not _mutate("message.update", {"identity": "message:148", "text": "Concurrent String edit"}): return
	var response := await _view.commit_selected()
	if not _check(not response.get("ok", false) and _view.draft.record.distance == 19, "Stale Apply lost the retained draft"): return
	if not _check(_bridge.request("battle.open", {"nativeId": 0}).result.battle.distance == 18, "Stale Apply changed the canonical Battle"): return
	_view.get_node("%Failure").hide()
	_view.get_node("%Discard").pressed.emit()
	if not _ok(await _controller.reload()): return
	_check(_view.draft.record.distance == 18 and not _view.has_unapplied_changes(), "Deliberate discard/reload failed after known rejection")


func _click_cell(slot: int) -> void:
	var canvas: ProvidenceBattleCanvas = _view.get_node("%BattleCanvas")
	_mouse(canvas, slot, true)
	await process_frame
	_mouse(canvas, slot, false)
	await process_frame


func _mouse(canvas: ProvidenceBattleCanvas, slot: int, pressed: bool) -> void:
	var event := InputEventMouseButton.new()
	event.button_index = MOUSE_BUTTON_LEFT
	event.pressed = pressed
	event.position = canvas.global_position + canvas.rect_for_slot(slot).get_center()
	event.global_position = event.position
	root.push_input(event, true)


func _idle() -> void:
	var stable := 0
	while stable < 3:
		await process_frame
		stable = stable + 1 if not _operations.busy and not _bridge.operation_busy() else 0


func _ok(response: Dictionary) -> bool:
	return _check(response.get("ok", false), str(response.get("error", "Battle command rejected")))


func _check(value: bool, message: String) -> bool:
	if not value:
		_failed = true
		push_error(message)
		if _bridge != null: _bridge.stop()
		quit(1)
	return value
