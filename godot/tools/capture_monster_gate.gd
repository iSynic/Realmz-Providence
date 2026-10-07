extends SceneTree

const SECTIONS := ["Overview", "Attacks", "Spells", "Items", "Saves", "Conditions"]
var _shell
var _route
var _view
var _directory := ""
var _route_name := ""
var _frames: Array = []
var _failed := false
var _amendment := false
var _metrics: Array = []


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 3 or args[2] not in ["monster", "library"]:
		_fail("Expected project directory, bounded output root, monster|library"); return
	_directory = args[1]
	_route_name = args[2]
	_amendment = OS.get_environment("PROVIDENCE_MONSTER_REVIEW_AMENDMENT") == "r2"
	DirAccess.make_dir_recursive_absolute(_directory)
	root.content_scale_size = DisplayServer.window_get_size()
	root.gui_embed_subwindows = true
	_shell = load("res://src/editor_shell.tscn").instantiate()
	root.add_child(_shell)
	await process_frame
	if _amendment and _route_name == "library": await _standalone()
	await _shell._project_session.open_project(args[0])
	if not _shell._session_view.connected: _fail("The review project did not open"); return
	await _shell._navigation.select_route("combat.monsters" if _route_name == "monster" else "combat.scrapbook")
	_route = _shell._document_tabs.get_current_tab_control()
	_view = _route.get_node("Workbench")
	if _route_name == "monster": await _monster_states()
	else: await _library_states()
	if _failed: return
	var manifest := {"route": _route.route_identity(), "viewport": [root.content_scale_size.x, root.content_scale_size.y],
		"theme": "dark", "density": "balanced", "projectPath": args[0], "frames": _frames,
		"metrics": _metrics,
		"adapter": _shell._bridge.request("build.identity").get("result", {}),
		"windowCapture": "Embedded Godot windows for a single bounded viewport capture; ownership remains native Window nodes."}
	var prefix := "extra" if OS.get_environment("PROVIDENCE_MONSTER_CAPTURE_CASE") == "missing-variant" else "capture"
	var file := FileAccess.open(_directory.path_join("%s-%s-%d.json" % [prefix, _route_name, root.content_scale_size.x]), FileAccess.WRITE)
	file.store_string(JSON.stringify(manifest, "\t"))
	_shell.queue_free()
	await process_frame
	print("PROVIDENCE_MONSTER_GATE_CAPTURE_OK route=%s viewport=%s frames=%d" % [_route_name, root.content_scale_size, _frames.size()])
	quit(0)


func _monster_states() -> void:
	var monster_id := OS.get_environment("PROVIDENCE_REVIEW_MONSTER_ID")
	if not _ok(await _view.browser.open_record(int(monster_id) if monster_id.is_valid_int() else 1)): return
	if OS.get_environment("PROVIDENCE_MONSTER_CAPTURE_CASE") == "missing-variant":
		_view.form.set_requested.emit(1)
		await _idle()
		await _capture("missing-variant")
		return
	for section in (["Overview", "Items"] if _amendment else SECTIONS):
		_view.form.show_section(section)
		await _capture(section.to_lower())
	_view.form.show_section("Overview")
	await _filtered(false, "guard")
	await _filtered(false, "no-monster-can-match-this-query")
	if not _ok(await _route.reload(_shell._bridge, {"active": "scenario", "nativeId": int(monster_id) if monster_id.is_valid_int() else 1, "setId": 0})): return
	for field in ["weapon", "iconId", "deathMacro"]:
		_route._references.open_picker(field)
		await _idle()
		if _amendment and field == "weapon":
			var choices: ItemList = _view.get_node("ReferencePicker/%Choices")
			for index in choices.item_count:
				if choices.get_item_text(index).begins_with("-1 ·"):
					choices.select(index)
					choices.item_selected.emit(index)
		await _capture({"weapon": "reference-picker", "iconId": "appearance-picker", "deathMacro": "macro-picker"}[field])
		_view.get_node("ReferencePicker").cancel()
	if not _amendment:
		await _review("Duplicate", "duplicate-review", int(_view.browser.catalog.total) + 10)
		await _review("ClearSelection", "clear-review")
		await _review("Switch", "switch-review", 2)
		await _review("Variants", "generation-review")
	else:
		await _review("ClearSelection", "clear-review")
		await _review("Variants", "generation-review")
	_field("armor").get_node("Value").text = "999"
	_field("armor").get_node("Value").text_changed.emit("999")
	await _route.commit_selected()
	if _amendment: await _capture("failed-write")
	_view.get_node("Failure").hide()
	await _capture("dirty-invalid")
	_view.discard_draft()
	if _amendment: await _extra_monster_states()


func _library_states() -> void:
	var rows := _view.library.get_node("InventoryScroll/Rows") as Node
	if rows.get_child_count() == 0: _fail("Protected Library rows are missing"); return
	if not _ok(await _view.library.open_entry(str(rows.get_child(0).get_meta("identity")))): return
	for section in (["Overview", "Items"] if _amendment else SECTIONS):
		_view.form.show_section(section)
		await _capture("protected-" + section.to_lower())
	_view.form.show_section("Overview")
	await _route._library_ops.open_review("Customize")
	await _prepare_review()
	await _capture("customize-review")
	_view.get_node("OperationReview").cancel()
	await _review("Transfer", "allocation-review")
	if _amendment:
		await _bulk_states()
	await _filtered(true, "frog")
	await _filtered(true, "no-library-entry-can-match-this-query")
	if not _ok(await _route.reload(_shell._bridge)): return
	_view.library.get_node("%LibrarySearch").text = ""
	if not _ok(await _view.library.load_page(0)): return
	var custom: Dictionary = _shell._bridge.request("monster-library.list", {"ownership": "custom", "limit": 1})
	if not _ok(custom) or custom.result.items.is_empty(): _fail("An adapter-backed custom entry is required"); return
	if not _ok(await _view.library.open_entry(str(custom.result.items[0].identity))): return
	for section in (["Overview", "Items"] if _amendment else SECTIONS):
		_view.form.show_section(section)
		await _capture("custom-" + section.to_lower())
	_view.form.show_section("Overview")
	await _route._library_ops.open_review("ClearSelection")
	await _prepare_review()
	await _capture("delete-review")
	_view.get_node("OperationReview").cancel()


func _filtered(library: bool, query: String) -> void:
	await _idle()
	var search: LineEdit = _view.library.get_node("%LibrarySearch") if library else _view.scenario.get_node("%ScenarioSearch")
	search.text = query
	var response: Dictionary
	if library: response = await _view.library.load_page(0)
	else:
		_view.scenario.get_node("%SearchDelay").stop()
		response = await _view.browser.search(query)
		_view.scenario.render_catalog()
	if not _ok(response): return
	if not library:
		var canonical: Dictionary = _shell._bridge.request("monster.catalog", {"setId": _view.browser.set_id, "query": query, "limit": 128})
		if not _ok(canonical): return
		if int(canonical.result.catalog.total) != int(_view.browser.catalog.total): _fail("Filtered count is stale"); return
	await _capture("no-results" if query.begins_with("no-") else "filtered")


func _review(action: String, state: String, target := -1) -> void:
	if action == "Transfer": await _route._library_ops.open_review(action)
	else: await _route._records.open_review(action)
	var review = _view.get_node("OperationReview")
	if target >= 0: review.get_node("%Target").text = str(target)
	await _prepare_review()
	await _capture(state)
	review.cancel()


func _prepare_review() -> void:
	var started := Time.get_ticks_usec()
	_view.get_node("OperationReview").get_node("%Review").pressed.emit()
	await _idle()
	_metrics.append({"operation": "complete-impact-review", "elapsedMs": (Time.get_ticks_usec() - started) / 1000.0,
		"rows": _view.get_node("OperationReview").get_meta("sections", {}).get("comparison", []).size()})


func _standalone() -> void:
	await _shell._navigation.select_route("combat.scrapbook")
	_route = _shell._document_tabs.get_current_tab_control()
	_view = _route.get_node("Workbench")
	var rows: Node = _view.library.get_node("InventoryScroll/Rows")
	if rows.get_child_count() == 0: _fail("Standalone stock did not load"); return
	if not _ok(await _view.library.open_entry(str(rows.get_child(0).get_meta("identity")))): return
	await _capture("no-scenario")


func _bulk_states() -> void:
	await _idle()
	var page: Dictionary = _shell._bridge.request("monster-library.list", {"ownership": "built-in", "limit": 2})
	if not _ok(page): return
	for index in page.result.items.size():
		if not _ok(await _view.library.select_entry(str(page.result.items[index].identity), index > 0)): return
	await _route._library_ops.open_review("ReviewMembership")
	await _capture("bulk-membership")
	var review = _view.get_node("OperationReview")
	var row: TreeItem = review.get_node("%Rows").get_root().get_first_child()
	row.select(0)
	review.get_node("%Rows").item_selected.emit()
	var destination: LineEdit = review.get_node("%AllocationEdit/Destination")
	destination.text = "32000"
	destination.text_changed.emit("32000")
	review.get_node("%AllocationEdit/Change").pressed.emit()
	await _prepare_review()
	await _capture("bulk-destination")
	review.get_node("%Sections").current_tab = 3
	await _capture("bulk-all-fields")
	review.cancel()
	await _route._library_ops.open_review("CopyStock")
	await _prepare_review()
	var sections: Dictionary = review.get_meta("sections", {})
	if sections.get("excluded", []).size() != 190: _fail("Complete stock membership was truncated"); return
	if sections.get("comparison", []).size() < 24000: _fail("Complete stock field comparison was truncated"); return
	review.get_node("%Sections").current_tab = 3
	await _capture("stock-population-review")
	review.cancel()


func _extra_monster_states() -> void:
	_view.form.show_section("Items")
	_field("items.0").field_edited.emit("items.0", 32767)
	_route._references.open_picker("items.0")
	await _idle()
	await _capture("unavailable-picker")
	var picker = _view.get_node("ReferencePicker")
	picker.get_node("%Search").text = "no-reference-can-match-this-query"
	picker.get_node("%Search").text_changed.emit("no-reference-can-match-this-query")
	await create_timer(0.3).timeout
	await _idle()
	await _capture("empty-picker")
	picker.cancel()
	_view.discard_draft()
	_view.form.show_section("Overview")
	_field("armor").get_node("Value").text = "13"
	_field("armor").get_node("Value").text_changed.emit("13")
	await _idle()
	var document: Dictionary = _shell._bridge.request("monster.open", {"setId": 0, "nativeId": _view.browser.native_id}).result
	var changed: Dictionary = _shell._bridge.request("monster.draft.apply", {"expectedRevision": int(document.revision),
		"draft": {"setId": 0, "nativeId": _view.browser.native_id, "fields": {"armor": 12}},
		"operationId": Crypto.new().generate_random_bytes(32).hex_encode()})
	if not _ok(changed): return
	await _route.commit_selected()
	await _capture("revision-conflict")
	_view.discard_draft()
	var restored: Dictionary = _shell._bridge.request("history.undo", {"expectedRevision": int(changed.result.change.revision)})
	if not _ok(restored): return


func _capture(state: String) -> void:
	for frame in 300:
		await process_frame
		if frame > 3 and not _view.get_node("Thumbnails").is_loading(): break
	await RenderingServer.frame_post_draw
	var path := _directory.path_join("%s-%s-%d.png" % [_route_name, state, root.content_scale_size.x])
	if root.get_texture().get_image().save_png(path) != OK: _fail("Capture failed: " + path); return
	_frames.append({"state": state, "path": path, "selection": _view.selection_snapshot(),
		"projectRevision": _view.browser.revision, "libraryRevision": _view.library.revision,
		"detailRect": _view.get_node("DetailScroll/Details").get_global_rect(),
		"genericInspectorVisible": _shell.get_node("%InspectorHost").visible})


func _idle() -> void:
	var stable := 0
	var previous := Time.get_ticks_usec()
	var gap := 0
	while stable < 3:
		await process_frame
		var now := Time.get_ticks_usec()
		gap = maxi(gap, now - previous)
		previous = now
		stable = stable + 1 if not _shell._operations.busy and not _shell._bridge.operation_busy() else 0
	_metrics.append({"operation": "frame-polled-workflow", "maxFrameGapMs": gap / 1000.0})


func _field(path: String):
	for node in _view.form.find_children("*", "", true, false):
		if node.has_method("bind_record") and node.field_path == path: return node
	return null


func _ok(response: Dictionary) -> bool:
	if response.get("ok", false): return true
	_fail(str(response.get("error", "Command rejected")))
	return false


func _fail(message: String) -> void:
	_failed = true
	push_error(message)
	if _shell != null: _shell.queue_free()
	quit(1)
