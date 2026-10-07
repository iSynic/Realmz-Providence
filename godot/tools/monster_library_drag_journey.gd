extends SceneTree

var _bridge: ProvidenceNativeBridge
var _operations: ProvidenceEditorOperation
var _route
var _view
var _review
var _ids: Array = []
var _failed := false


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	root.size = Vector2i(1920, 1080) if OS.get_environment("PROVIDENCE_DRAG_WIDTH") == "1920" else Vector2i(1600, 900)
	root.content_scale_size = root.size
	root.gui_embed_subwindows = true
	var args := OS.get_cmdline_user_args()
	if args.size() != 1 or DirAccess.dir_exists_absolute(args[0]):
		_check(false, "Use a new disposable output root"); return
	_bridge = ProvidenceNativeBridge.new(args[0].path_join("settings.cfg"))
	_operations = ProvidenceEditorOperation.new()
	root.add_child(_operations)
	if not _ok(_bridge.create_project("monster-drag-journey", args[0].path_join("project"))): return
	if not _ok(_bridge.request("monster.create", {"expectedRevision": 0, "setId": 0, "nativeId": 9})): return
	_route = load("res://src/monster_editor.tscn").instantiate()
	root.add_child(_route)
	_route.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_route.configure_operations(_operations, func(): return _bridge)
	_route.configure_authoring(func(response): return response.get("ok", false))
	_view = _route.get_node("Workbench")
	_review = _view.get_node("OperationReview")
	if not _ok(await _route.reload(_bridge)): return
	for label in ["Drag Guardian", "Drag Sentinel"]:
		await _create_entry(label)
		if _failed: return
	await _single_drag()
	if _failed: return
	await _built_in_drag()
	if _failed: return
	await _multiple_and_guards()
	if _failed: return
	_bridge.stop()
	_route.queue_free()
	await process_frame
	print("PROVIDENCE_MONSTER_LIBRARY_DRAG_OK gesture built-in custom unselected-row occupied-slot cancel atomic-undo-redo multi-member draft-cancel stale-project stale-library foreign standalone")
	quit(0)


func _create_entry(label: String) -> void:
	await _route._library_ops.open_review("NewLibrary")
	_review.get_node("%Target").text = "9"
	_review.get_node("%Label").text = label
	_review.get_node("%Review").pressed.emit()
	await _idle()
	if not _check(not _review.get_node("%Commit").disabled, "Library creation review failed"): return
	_review.get_node("%Commit").pressed.emit()
	await _idle()
	_ids.append(str(_view.library.current_entry().entry.identity))


func _single_drag() -> void:
	var revision: int = _bridge.request("session.describe").result.revision
	var occupied: Dictionary = _bridge.request("monster.open", {"setId": 0, "nativeId": 9}).result
	await _gesture(_row(_ids[0]), _view.scenario.get_node("InventoryScroll"))
	await _idle()
	if not _check(_review.visible and not _review.get_node("%Commit").disabled, "Dropping an unselected row did not prepare its copy review"): return
	await _capture("copy-review")
	var allocations: Array = _review.get_meta("sections").excluded
	if not _check(allocations.size() == 1 and allocations[0].identity == _ids[0] and int(allocations[0].targetId) != 9, "Drop changed source membership or replaced an occupied slot"): return
	_review.cancel()
	_check(_bridge.request("session.describe").result.revision == revision, "Cancelling a drop changed the scenario")
	# Dropping on an occupied row also allocates a new ID; it is not replacement.
	await _gesture(_row(_ids[0]), _view.scenario.get_node("InventoryScroll/Rows").get_child(0))
	await _idle()
	if not _check(_review.visible and not _review.get_node("%Commit").disabled, "Occupied-row drop did not prepare"): return
	var target := int(_review.get_meta("sections").excluded[0].targetId)
	_review.get_node("%Commit").pressed.emit()
	await _idle()
	var copied: Dictionary = _bridge.request("monster.open", {"setId": 0, "nativeId": target})
	if not _ok(copied): return
	_check(copied.result.monster.displayName == "Drag Guardian", "Drop copied the selected row instead of the dragged row")
	_check(_bridge.request("monster.open", {"setId": 0, "nativeId": 9}).result.monster == occupied.monster, "Drop modified an occupied record")
	if not _history("undo"): return
	_check(not _bridge.request("monster.open", {"setId": 0, "nativeId": target}).ok, "One Undo retained the drop")
	if not _history("redo"): return
	_check(_bridge.request("monster.open", {"setId": 0, "nativeId": target}).ok, "Redo lost the drop")
	if not _history("undo"): return
	if not _ok(await _route.reload(_bridge, _view.selection_snapshot())): return


func _multiple_and_guards() -> void:
	if not _ok(await _view.library.select_entry(_ids[0])): return
	if not _ok(await _view.library.select_entry(_ids[1], true)): return
	await _gesture(_row(_ids[0]), _view.scenario.get_node("InventoryScroll"))
	await _idle()
	if not _check(_review.visible and _review.get_meta("sections").excluded.size() == 2, "Multiselection drop lost members"): return
	_review.cancel()
	var drag = _view.library_drag
	var data: Dictionary = drag.transfer_data(_ids[0])
	var foreign := data.duplicate(true)
	foreign.owner = -1
	_check(not drag.can_drop(Vector2.ZERO, foreign) and not drag.can_drop(Vector2.ZERO, "text"), "Foreign drag was accepted")
	_view.library.revision += 1
	_check(not drag.can_drop(Vector2.ZERO, data), "Stale Library drag was accepted")
	_view.library.revision -= 1
	_view.browser.revision += 1
	_check(not drag.can_drop(Vector2.ZERO, data), "Stale scenario drag was accepted")
	_view.browser.revision -= 1
	if not _ok(await _route.reload(_bridge, _view.selection_snapshot())): return
	_check(not drag.can_drop(Vector2.ZERO, data), "A drag survived project reattachment with matching revisions")
	if not _ok(await _view.library.select_entry(_ids[0])): return
	_view.draft.edit_description("Unapplied Library draft")
	var dirty: Dictionary = _view.draft.submission().duplicate(true)
	var revision: int = _bridge.request("session.describe").result.revision
	data = drag.transfer_data(_ids[0])
	drag.drop(Vector2.ZERO, data)
	await process_frame
	if not _check(_view.get_node("DraftGuard").visible and not _review.visible, "Drop bypassed the draft guard"): return
	_view.get_node("DraftGuard").canceled.emit()
	_view.get_node("DraftGuard").hide()
	await _idle()
	_check(_view.draft.submission() == dirty and _bridge.request("session.describe").result.revision == revision, "Draft cancellation lost edits or changed the scenario")
	_view.discard_draft()
	await _route.reload(null)
	_check(drag.transfer_data(_ids[0]).is_empty() and not drag.can_drop(Vector2.ZERO, data), "Standalone Library allowed a scenario drop")


func _built_in_drag() -> void:
	var row: Button = _view.library.get_node("InventoryScroll/Rows").get_child(0)
	var identity := str(row.get_meta("identity"))
	var source: Dictionary = _bridge.request("monster-library.open", {"identity": identity}).result.entry
	await _gesture(row, _view.scenario.get_node("InventoryScroll"))
	await _idle()
	if not _check(_review.visible and not _review.get_node("%Commit").disabled, "Protected Built-in drop did not prepare"): return
	var target := int(_review.get_meta("sections").excluded[0].targetId)
	_review.get_node("%Commit").pressed.emit()
	await _idle()
	var copied: Dictionary = _bridge.request("monster.open", {"setId": 0, "nativeId": target})
	if not _ok(copied): return
	_check(copied.result.monster.displayName == source.label, "Built-in drop copied a different record")
	if not _history("undo"): return
	if not _ok(await _route.reload(_bridge, _view.selection_snapshot())): return


func _gesture(source: Button, target: Control) -> void:
	await _idle()
	await process_frame
	var start := source.get_global_rect().get_center()
	var finish := target.get_global_rect().get_center()
	await _motion(start, false)
	var press := InputEventMouseButton.new()
	press.position = start
	press.button_index = MOUSE_BUTTON_LEFT
	press.pressed = true
	Input.parse_input_event(press)
	await process_frame
	await _motion(start + Vector2(20, 0), true)
	if not _check(root.gui_is_dragging(), "Mouse movement did not start a real Library drag: %s %s %s" % [source.get_meta("identity"), source.get_global_rect(), _view.library_drag_context()]): return
	await _motion(finish, true)
	if _ids[0] not in _view.library.selected_identities(): await _capture("drag-preview")
	var release := InputEventMouseButton.new()
	release.position = finish
	release.button_index = MOUSE_BUTTON_LEFT
	Input.parse_input_event(release)
	await process_frame


func _motion(position: Vector2, held: bool) -> void:
	var event := InputEventMouseMotion.new()
	event.position = position
	event.relative = Vector2(20, 0)
	event.button_mask = MOUSE_BUTTON_MASK_LEFT if held else 0
	Input.parse_input_event(event)
	await process_frame


func _row(identity: String) -> Button:
	for row: Button in _view.library.get_node("InventoryScroll/Rows").get_children():
		if row.get_meta("identity") == identity: return row
	return null


func _capture(name: String) -> void:
	var directory := OS.get_environment("PROVIDENCE_DRAG_CAPTURE_ROOT")
	if directory.is_empty(): return
	await RenderingServer.frame_post_draw
	_check(root.get_texture().get_image().save_png(directory.path_join("%s-%d.png" % [name, root.size.x])) == OK, "Could not capture the drag workflow")


func _history(direction: String) -> bool:
	var revision := int(_bridge.request("session.describe").result.revision)
	return _ok(_bridge.request("history." + direction, {"expectedRevision": revision}))


func _idle() -> void:
	var stable := 0
	while stable < 3:
		await process_frame
		stable = stable + 1 if not _operations.busy and not _bridge.operation_busy() else 0


func _ok(response: Dictionary) -> bool:
	return _check(response.get("ok", false), str(response.get("error", "Command rejected")))


func _check(condition: bool, message: String) -> bool:
	if condition: return true
	_failed = true
	push_error(message)
	if _bridge != null: _bridge.stop()
	quit(1)
	return false
