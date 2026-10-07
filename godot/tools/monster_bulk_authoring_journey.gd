extends SceneTree

var _bridge: ProvidenceNativeBridge
var _operations: ProvidenceEditorOperation
var _route
var _view
var _dialog
var _ids: Array = []
var _failed := false


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	root.size = Vector2i(1600, 900)
	root.content_scale_size = root.size
	root.gui_embed_subwindows = true
	var args := OS.get_cmdline_user_args()
	if args.size() != 1 or DirAccess.dir_exists_absolute(args[0]):
		_check(false, "Use a new disposable output root"); return
	_bridge = ProvidenceNativeBridge.new(args[0].path_join("settings.cfg"))
	_operations = ProvidenceEditorOperation.new()
	root.add_child(_operations)
	if not _ok(_bridge.create_project("monster-bulk-journey", args[0].path_join("project"))): return
	if not _ok(_bridge.request("monster.create", {"expectedRevision": 0, "setId": 0, "nativeId": 9})): return
	_route = load("res://src/monster_editor.tscn").instantiate()
	root.add_child(_route)
	_route.configure_operations(_operations, func(): return _bridge)
	_route.configure_authoring(func(response): return response.get("ok", false))
	_view = _route.get_node("Workbench")
	_dialog = _view.get_node("OperationReview")
	if not _ok(await _route.reload(_bridge)): return
	for label in ["Bulk Guardian", "Bulk Sentinel"]:
		await _create_entry(label)
		if _failed: return
	if not _ok(await _view.library.select_entry(_ids[0])): return
	if not _ok(await _view.library.select_entry(_ids[1], true)): return
	_check(_view.library.selected_identities().size() == 2 and _view.multiple.visible, "Real multiple selection was lost")
	await _membership_and_cancel()
	if _failed: return
	for mode in 3:
		await _copy_mode(mode)
		if _failed: return
	_bridge.stop()
	if not _ok(_bridge.start_project(args[0].path_join("project"), "", "", args[0].path_join("monster-library"))): return
	var library: Dictionary = _bridge.request("monster-library.list", {"ownership": "custom", "limit": 128})
	_check(library.result.total == 2, "Bulk operations changed or lost persisted Library entries")
	_check(_bridge.request("monster.open", {"setId": 0, "nativeId": 9}).ok, "Bulk Undo lost the occupied preferred record")
	_bridge.stop()
	_route.queue_free()
	await process_frame
	print("PROVIDENCE_MONSTER_BULK_AUTHORING_OK two-real-members occupied-preferred reviewed-destinations removal-reprepare cancel normal all-sets generated source-current-proposed atomic-undo reopen")
	quit(0)


func _create_entry(label: String) -> void:
	await _route._library_ops.open_review("NewLibrary")
	_dialog.get_node("%Target").text = "9"
	_dialog.get_node("%Label").text = label
	if not await _review(): return
	_dialog.get_node("%Commit").pressed.emit()
	await _idle()
	_check(not _dialog.visible and _view.draft_domain() == "library", "Library creation failed")
	_ids.append(str(_view.library.current_entry().entry.identity))


func _membership_and_cancel() -> void:
	var revision: int = _bridge.request("session.describe").result.revision
	await _route._library_ops.open_review("ReviewMembership")
	_check(_dialog.get_node("%Sections").current_tab == 2, "Review membership did not show exact allocations")
	var rows: Array = _dialog.get_meta("sections").excluded
	_check(rows.size() == 2 and rows.all(func(row): return int(row.preferredId) == 9 and int(row.targetId) != 9), "Occupied preferred IDs were silently reused")
	await _change_destination()
	if not await _review(): return
	_dialog.get_node("%Sections").current_tab = 2
	var last: TreeItem = _dialog.get_node("%Rows").get_root().get_first_child().get_next()
	last.select(0)
	_dialog.get_node("%Rows").item_selected.emit()
	_dialog.get_node("%AllocationEdit/Remove").pressed.emit()
	_check(_dialog.get_node("%Commit").disabled, "Membership removal retained an old accepted review")
	if not await _review(): return
	_check(_dialog.get_meta("sections").excluded.size() == 1, "Removed member returned during re-preparation")
	_dialog.cancel()
	_check(_bridge.request("session.describe").result.revision == revision and _view.library.selected_identities().size() == 2, "Cancel mutated the scenario or originating selection")


func _copy_mode(mode: int) -> void:
	await _route._library_ops.open_review("CopySelected")
	_check(_dialog.get_node("%Operation").item_count == 3, "Bulk modes are missing")
	_dialog.get_node("%Operation").select(mode)
	_dialog.get_node("%Operation").item_selected.emit(mode)
	if not await _review(): return
	_check(_dialog.get_meta("sections").comparison.size() > 128, "Full field comparison was truncated to one page")
	await _change_destination()
	if not await _review(): return
	var rows: Array = _dialog.get_meta("sections").excluded
	_check(rows.any(func(row): return int(row.targetId) == 23), "Explicit destination was replaced with automatic allocation")
	_dialog.get_node("%Commit").pressed.emit()
	await _idle()
	if not _check(not _dialog.visible and not _view.get_node("Failure").visible, "Bulk copy did not finish cleanly"): return
	for set_id in ([0] if mode == 0 else [0, 1, -1]):
		if not _ok(_bridge.request("monster.open", {"setId": set_id, "nativeId": 23})): return
	var revision: int = _bridge.request("session.describe").result.revision
	if not _ok(_bridge.request("history.undo", {"expectedRevision": revision})): return
	for row in rows:
		_check(not _bridge.request("monster.open", {"setId": 0, "nativeId": int(row.targetId)}).ok, "One Undo retained a copied member")
	if not _ok(await _route.reload(_bridge, _view.selection_snapshot())): return
	_check(_view.library.selected_identities().size() == 2, "Bulk operation lost retained membership")


func _change_destination() -> void:
	_dialog.get_node("%Sections").current_tab = 2
	var row: TreeItem = _dialog.get_node("%Rows").get_root().get_first_child()
	row.select(0)
	_dialog.get_node("%Rows").item_selected.emit()
	var input: LineEdit = _dialog.get_node("%AllocationEdit/Destination")
	input.text = "23"
	input.text_changed.emit("23")
	_check(_dialog.get_node("%Commit").disabled, "Typing a destination left stale acceptance enabled")
	_dialog.get_node("%AllocationEdit/Change").pressed.emit()


func _review() -> bool:
	_dialog.get_node("%Review").pressed.emit()
	await _idle()
	return _check(not _dialog.get_node("%Commit").disabled, str(_dialog.get_node("%Status").text))


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
