extends SceneTree

var _failed := false
var _source: ProvidenceNativeBridge
var _operations: ProvidenceEditorOperation
var _route
var _view
var _review
var _frames: Array = []


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var width := int(OS.get_environment("PROVIDENCE_LIBRARY_CAPTURE_WIDTH"))
	root.size = Vector2i(1920, 1080) if width == 1920 else Vector2i(1600, 900)
	root.content_scale_size = root.size
	root.gui_embed_subwindows = true
	var args := OS.get_cmdline_user_args()
	if args.size() != 1: _check(false, "Expected a disposable output directory"); return
	DirAccess.make_dir_recursive_absolute(args[0])
	_source = preload("res://tools/monster_library_fault_bridge.gd").new(args[0].path_join("settings.cfg"))
	_operations = ProvidenceEditorOperation.new()
	root.add_child(_operations)
	_route = load("res://src/monster_library_editor.tscn").instantiate()
	root.add_child(_route)
	_route.configure_operations(_operations, func(): return _source)
	_route.configure_authoring(func(_response): return true)
	_view = _route.get_node("Workbench")
	_review = _view.get_node("OperationReview")
	if not _ok(await _route.reload(_source)): return
	var description: Dictionary = _bridge().request("monster-library.describe")
	if not _check(description.result.builtIns == 201 and description.result.visibleEntries == 190 and description.result.revision == 0, "The pinned stock Library was not provisioned intact"): return
	await _capture("standalone-loaded")
	await _loading_capture()
	_check(not description.result.canUndo and not _view.has_scenario_destination(), "Stock provisioning became an authored change or a fake scenario")
	_check(_view.browser.catalog.total == 0, "Independent Library opened demo scenario content")
	_check(not _view.scenario.get_node("%ScenarioSearch").editable and _view.scenario.get_node("Header/NewMonster").disabled, "No-scenario search or creation was enabled")
	await _customize_and_edit()
	if _failed: return
	await _history_and_restore()
	if _failed: return
	_route.clear_selection()
	if not _ok(await _route.reload(_source)): return
	_check(_bridge().request("monster-library.describe").result.customEntries == 0, "Restore did not persist across Library reopen")
	_write_captures()
	_route.queue_free()
	await process_frame
	print("PROVIDENCE_MONSTER_LIBRARY_INDEPENDENT_OK protected-source customize invalid-id edit scenario-unavailable lost-reply recovery-without-replay library-undo-redo restore reopen")
	quit(0)


func _customize_and_edit() -> void:
	var page: Dictionary = _bridge().request("monster-library.list", {"ownership": "built-in", "limit": 1})
	if not _ok(await _view.library.open_entry(page.result.items[0].identity)): return
	_check(_view.form.visible and not _view.form.get_node("%Description").editable, "Protected source became editable")
	_check(not _view.form.get_node("Content/MonsterRecordActions/Customize").disabled, "Customize requires an unnecessary scenario")
	await _route._library_ops.open_review("Customize")
	await _commit_review()
	_check(_view.draft_domain() == "library" and _view.form.get_node("%Description").editable, "Customize did not open its distinct editable override")
	_check(_view.form.get_node("%ReferenceContext").visible and _view.form.get_node("Content/MonsterRecordActions/Transfer").disabled, "Unavailable scenario context lacks a reason or allows a transfer")
	_check(_view.scenario.get_node("Header/NewMonster").disabled, "Selecting a Library entry enabled scenario creation")
	for action in ["CopyStock", "CopyVisible", "CopyCustom"]:
		_check(_view.library.get_node("Header/PopulateScenario/Menu/Actions/" + action).disabled, "Library selection enabled a transfer without a scenario")
	var revision: int = _bridge().request("monster-library.describe").result.revision
	_view.form.get_node("%PreferredScenarioId").text = "invalid"
	_view.form.get_node("%PreferredScenarioId").text_changed.emit("invalid")
	var invalid: Dictionary = await _route.commit_selected()
	_check(not invalid.get("ok", false) and invalid.get("issues", []).any(func(issue): return issue.field == "preferredScenarioMonsterId"), "Invalid preferred ID did not identify its owning control")
	_check(_bridge().request("monster-library.describe").result.revision == revision and _view.has_unapplied_changes(), "Invalid preferred ID changed Library truth or lost the draft")
	await _capture("known-rejection")
	_view.get_node("Failure").hide()
	_view.discard_draft()
	_field("armor").get_node("Value").text = "17"
	_field("armor").get_node("Value").text_changed.emit("17")
	await _recover_lost_reply()
	_check(not _view.library.get_node("History/UndoLibrary").disabled, "Independent Library Undo was not enabled")


func _recover_lost_reply() -> void:
	var bridge = _bridge()
	var revision: int = bridge.request("monster-library.describe").result.revision
	bridge.lose_next_monster_reply = true
	var uncertain: Dictionary = await _route.commit_selected()
	_check(uncertain.get("outcomeUnknown", false) and _view.has_unapplied_changes(), "Lost reply did not retain and lock the Library draft")
	_check(_view.form.get_node("%ApplyDraft").disabled and _view.form.get_node("%CheckResult").visible, "Uncertain Library result allowed another mutation or hid recovery")
	_check(_view.library.get_node("History/UndoLibrary").disabled and _view.library.get_node("History/RedoLibrary").disabled, "Uncertain Library result advertised a history mutation")
	_view.library.set_history_state({"canUndo": true, "canRedo": true})
	_check(_view.library.get_node("History/UndoLibrary").disabled and _view.library.get_node("History/RedoLibrary").disabled, "A history refresh bypassed the recovery lock")
	await _capture("uncertain-result")
	_view.get_node("Failure").hide()
	_check(_view.library.get_node("History/UndoLibrary").disabled and _view.library.get_node("History/RedoLibrary").disabled, "Dismissing the failure window unlocked Library history")
	await _capture("persistent-recovery")
	await _route._authoring.check_original_result()
	if not _check(not _view.has_unapplied_changes() and _view.draft.document.monster.armor == 17, "Independent Library recovery failed: " + _view.get_node("Failure/Body/Message").text): return
	_check(bridge.request("monster-library.describe").result.revision == revision + 1 and bridge.apply_requests == 1, "Recovery replayed the Library write or added history")
	var history: Dictionary = bridge.request("monster-library.describe").result
	_check(_view.library.get_node("History/UndoLibrary").disabled == (not history.canUndo) and _view.library.get_node("History/RedoLibrary").disabled == (not history.canRedo), "Recovery did not restore canonical history availability")
	await _capture("confirmed-result")


func _capture(state: String) -> void:
	var directory := OS.get_environment("PROVIDENCE_LIBRARY_CAPTURE_ROOT")
	if directory.is_empty(): return
	DirAccess.make_dir_recursive_absolute(directory)
	await process_frame
	await RenderingServer.frame_post_draw
	var path := directory.path_join("library-%s-%d.png" % [state, root.size.x])
	_check(root.get_texture().get_image().save_png(path) == OK, "Could not capture Library state")
	_frames.append({"state": state, "path": path, "selection": _view.selection_snapshot(),
		"libraryRevision": _view.library.revision, "viewport": [root.size.x, root.size.y]})


func _loading_capture() -> void:
	if OS.get_environment("PROVIDENCE_LIBRARY_CAPTURE_ROOT").is_empty(): return
	_bridge().hold_catalog_frames = 20
	_view.library.load_page(0)
	await _capture("loading")
	await _idle()


func _write_captures() -> void:
	var directory := OS.get_environment("PROVIDENCE_LIBRARY_CAPTURE_ROOT")
	if directory.is_empty(): return
	var file := FileAccess.open(directory.path_join("recovery-%d.json" % root.size.x), FileAccess.WRITE)
	file.store_string(JSON.stringify({"frames": _frames, "route": "combat.scrapbook", "viewport": [root.size.x, root.size.y],
		"adapter": _bridge().request("build.identity").get("result", {}), "theme": "dark", "density": "balanced",
		"faultBoundary": "The real adapter commits; the test bridge hides its reply. Recovery checks that original receipt without replay.",
		"composition": "Actual Library route without shell chrome; embedded native windows."}, "\t"))


func _history_and_restore() -> void:
	await _route._library_ops.open_review("UndoLibrary")
	_check(_view.draft.document.monster.armor != 17, "Library Undo did not restore the baseline")
	await _route._library_ops.open_review("RedoLibrary")
	_check(_view.draft.document.monster.armor == 17, "Library Redo did not restore the edit")
	await _route._library_ops.open_review("Restore")
	await _commit_review()
	_check(_bridge().request("monster-library.describe").result.customEntries == 0, "Restore retained its customization")
	_check(not _view.get_node("Failure").visible, "Restore treated removed selection as a failed mutation")


func _commit_review() -> void:
	_review.get_node("%Review").pressed.emit()
	await _idle()
	if not _check(not _review.get_node("%Commit").disabled, _review.get_node("%Status").text): return
	_review.get_node("%Commit").pressed.emit()
	await _idle()
	_check(not _review.visible and not _view.get_node("Failure").visible, "The reviewed Library operation failed")


func _idle() -> void:
	var stable := 0
	while stable < 3:
		await process_frame
		stable = stable + 1 if not _operations.busy and not _bridge().operation_busy() else 0


func _bridge():
	return _route._read_bridge.call()


func _field(path: String):
	for node in _view.form.find_children("*", "", true, false):
		if node.has_method("bind_record") and node.field_path == path: return node
	return null


func _ok(response: Dictionary) -> bool:
	return _check(response.get("ok", false), str(response.get("error", "Command rejected")))


func _check(value: bool, message: String) -> bool:
	if value: return true
	_failed = true
	push_error(message)
	if _route != null: _route.clear_selection()
	quit(1)
	return false
