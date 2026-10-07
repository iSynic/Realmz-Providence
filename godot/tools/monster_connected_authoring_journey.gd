extends SceneTree

var _shell
var _route
var _view
var _review
var _failed := false
var _source_id := -1
var _target_id := -1
var _battle_id := -1


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	root.size = Vector2i(1920, 1080) if OS.get_environment("PROVIDENCE_MONSTER_CONNECTED_CAPTURE_WIDTH") == "1920" else Vector2i(1600, 900)
	root.content_scale_size = root.size
	root.gui_embed_subwindows = true
	var args := OS.get_cmdline_user_args()
	if args.size() != 1 or not FileAccess.file_exists(args[0].path_join("project/assets-corpus-disposable.marker")):
		_check(false, "Expected a marked disposable Classic import root"); return
	OS.set_environment("PROVIDENCE_MONSTER_LIBRARY_ROOT", args[0].path_join("monster-library"))
	_shell = load("res://src/editor_shell.tscn").instantiate()
	root.add_child(_shell)
	await process_frame
	await _standalone_front_door()
	if _failed: return
	await _shell._project_session.open_project(args[0].path_join("project"))
	if not _check(_shell._session_view.connected, "The imported project did not open"): return
	await _shell._navigation.select_route("combat.monsters")
	_route = _shell._documents.view("combat.monsters")
	_view = _route.get_node("Workbench")
	_review = _view.get_node("OperationReview")
	var rows: Array = _bridge().request("monster.catalog", {"setId": 0, "limit": 128}).result.catalog.items
	rows = rows.filter(func(row): return int(row.nativeId) > 0 and int(row.hitDice) in range(1, 255) and row.availableSets.any(func(set_id): return int(set_id) == 0))
	if not _check(rows.size() >= 2, "Two active Normal records are required"): return
	_source_id = int(rows[0].nativeId)
	_target_id = int(rows[1].nativeId)
	if not _ok(await _view.browser.open_record(_source_id)): return
	await _nested_retarget()
	if _failed: return
	await _linked_item_return()
	if _failed: return
	_shell.queue_free()
	await process_frame
	print("PROVIDENCE_MONSTER_CONNECTED_AUTHORING_OK no-scenario-front-door nested-real-picker preview-only explicit-retarget signed-placement atomic-clear undo exact-item-edit return-focus")
	quit(0)


func _standalone_front_door() -> void:
	await _shell._navigation.select_route("combat.scrapbook")
	var route = _shell._documents.view("combat.scrapbook")
	var view = route.get_node("Workbench")
	_check(not _shell._session_view.connected and not view.has_scenario_destination(), "Opening Library silently created a scenario")
	_check(view.library.revision >= 0 and not view.scenario.get_node("%ScenarioSearch").editable, "The standalone front door lacks a Library or enables scenario controls")
	var rows: Node = view.library.get_node("InventoryScroll/Rows")
	if not _check(rows.get_child_count() > 0, "The front door did not load protected stock entries"): return
	if not _ok(await view.library.open_entry(str(rows.get_child(0).get_meta("identity")))): return
	_check(view.form.visible and not view.form.get_node("%Description").editable, "The front door did not open a protected reference")


func _nested_retarget() -> void:
	var battles: Dictionary = _bridge().request("battle.list", {"limit": 1})
	if not _ok(battles) or not _check(not battles.result.items.is_empty(), "An imported Battle is required"): return
	_battle_id = int(battles.result.items[0].nativeId)
	var document: Dictionary = _bridge().request("battle.open", {"nativeId": _battle_id}).result
	document.battle.grid[0] = -_source_id
	if not _apply("battle.update", {"battle": document.battle}): return
	if not _ok(await _route.reload(_bridge(), {"active": "scenario", "nativeId": _source_id, "setId": 0})): return
	await _route._records.open_review("ClearSelection")
	await _prepare_review()
	_review.get_node("%Sections").current_tab = 1
	var row: TreeItem = _review.get_node("%Rows").get_root().get_first_child()
	while row != null:
		var entry: Dictionary = row.get_metadata(0)
		if entry.source == "battle:%d" % _battle_id and entry.field == "grid[0].monster": break
		row = row.get_next()
	if not _check(row != null, "The real impact preview omitted its signed Battle use"): return
	row.select(0)
	_review.get_node("%Rows").item_selected.emit()
	_review.get_node("%RetargetUse").pressed.emit()
	await _idle()
	var picker = _review.get_node("ReplacementPicker")
	_check(picker.visible and picker.get_parent() == _review, "The replacement picker lost nested modal ownership")
	_check(_bridge().request("battle.open", {"nativeId": _battle_id}).result.battle.grid[0] == -_source_id, "Browsing changed the real Battle placement")
	var choices: ItemList = picker.get_node("%Choices")
	for index in choices.item_count:
		if choices.get_item_text(index).begins_with("%d ·" % _target_id): choices.select(index); choices.item_selected.emit(index)
	if not _check(not picker.get_node("%UseSelection").disabled, "The available replacement cannot be accepted"): return
	await _capture_nested_picker()
	picker.get_node("%UseSelection").pressed.emit()
	_check(_review.use_edits().size() == 1 and _review.get_node("%Commit").disabled, "Replacement did not invalidate the complete preview")
	await _prepare_review()
	_review.get_node("%Commit").pressed.emit()
	await _idle()
	_check(_bridge().request("battle.open", {"nativeId": _battle_id}).result.battle.grid[0] == -_target_id, "Atomic retarget changed the signed placement identity")
	if not _apply("history.undo", {}): return
	_check(_bridge().request("battle.open", {"nativeId": _battle_id}).result.battle.grid[0] == -_source_id, "One Undo did not restore the operation and its signed use together")
	if not _ok(await _route.reload(_bridge(), {"active": "scenario", "nativeId": _source_id, "setId": 0})): return


func _capture_nested_picker() -> void:
	var directory := OS.get_environment("PROVIDENCE_MONSTER_CONNECTED_CAPTURE_ROOT")
	if directory.is_empty(): return
	await process_frame
	await RenderingServer.frame_post_draw
	var path := directory.path_join("monster-nested-picker-%d.png" % root.size.x)
	if not _check(root.get_texture().get_image().save_png(path) == OK, "Could not capture nested picker"): return
	var frame := {"state": "nested-picker", "path": path, "selection": _view.selection_snapshot()}
	var file := FileAccess.open(directory.path_join("extra-connected-%d.json" % root.size.x), FileAccess.WRITE)
	file.store_string(JSON.stringify({"route": "combat.monsters", "viewport": [root.size.x, root.size.y], "frames": [frame],
		"adapter": _bridge().request("build.identity").get("result", {}), "theme": "dark", "density": "balanced",
		"composition": "Normal Editor shell; actual replacement picker owned by the operation-review Window."}, "\t"))


func _linked_item_return() -> void:
	var choice: Dictionary = _scenario_item_choice()
	if not _check(not choice.is_empty(), "A resolved scenario-owned Item is required"): return
	_view.accept_reference_choice("items.0", choice)
	if not _ok(await _route.commit_selected()): return
	await _idle()
	_view.form.show_section("Items")
	_view.form.get_node("%BodyScroll").scroll_vertical = 20
	await process_frame
	var before: Dictionary = _route.read_navigation_state()
	var routed: Array = []
	var reference_context: Dictionary = _view.reference_context("items.0")
	_route._references.configure_navigation(func(kind, native_id, identity, context):
		routed.append({"kind": kind, "nativeId": native_id, "identity": identity, "busy": _shell._operations.busy, "dirty": _shell._draft_apply.has_draft()})
		await _shell._navigation.open_script_target(kind, native_id, identity, context))
	await _route._references.open_existing("items.0")
	if not _check(_shell._documents.identity_for_tab(_shell._document_tabs.current_tab) == "economy.items", "Open Item did not navigate: %s · %s · routed=%s · match=%s · before=%s · after=%s" % [_shell._documents.identity_for_tab(_shell._document_tabs.current_tab), _shell._status.text, routed, _view.reference_context_matches(reference_context), reference_context, _view.reference_context("items.0")]): return
	var item = _shell._item_editor
	_check(item.selected_definition().id == choice.targetIdentity, "Linked navigation opened a different source identity")
	item.get_node("%ItemIdentifiedName").text = "Reviewed Monster Loot"
	await item.commit_selected()
	await _idle()
	_check(not item.has_unapplied_changes(), "The referenced Item did not commit through its real controller")
	await _shell._navigation.navigate_back()
	await _idle()
	var after: Dictionary = _route.read_navigation_state()
	_check(after.nativeId == before.nativeId and after.setId == before.setId and after.detailSection == "Items" and after.scenarioQuery == before.scenarioQuery and after.libraryPage == before.libraryPage, "Return lost the originating Monster selection, section or inventory state")
	_check(after.focusedReference == "items.0", "Return did not retain the exact reference focus")
	_check(_view.draft.document.slotPreview.items.any(func(slot): return int(slot.slot) == 0 and slot.label == "Reviewed Monster Loot"), "Return did not refresh the edited Item name")


func _scenario_item_choice() -> Dictionary:
	var offset := 0
	while true:
		var response: Dictionary = _bridge().request("monster-reference.list", {"expectedRevision": _view.browser.revision,
			"query": {"field": "items.0", "currentValue": 0, "ownership": "scenario", "showUnavailable": false, "limit": 128, "offset": offset}})
		if not _ok(response): return {}
		var page: Dictionary = response.result.page
		for choice: Dictionary in page.items:
			if choice.available and int(choice.value) >= 800 and choice.targetIdentity != null: return choice
		offset += page.items.size()
		if offset >= int(page.total) or page.items.is_empty(): return {}
	return {}


func _prepare_review() -> void:
	_review.get_node("%Review").pressed.emit()
	await _idle()
	_check(not _review.get_node("%Commit").disabled, str(_review.get_node("%Status").text))


func _apply(method: String, params: Dictionary) -> bool:
	params["expectedRevision"] = int(_bridge().request("session.describe").result.revision)
	var response: Dictionary = _bridge().request(method, params)
	if not _ok(response): return false
	_shell._session_view.apply(response.result.get("change", response.result), false)
	return true


func _idle() -> void:
	var stable := 0
	while stable < 3:
		await process_frame
		stable = stable + 1 if not _shell._operations.busy and not _bridge().operation_busy() else 0


func _bridge():
	return _shell._bridge


func _ok(response: Dictionary) -> bool:
	return _check(response.get("ok", false), str(response.get("error", "Command rejected")))


func _check(condition: bool, message: String) -> bool:
	if condition: return true
	_failed = true
	push_error(message)
	if _shell != null: _shell.queue_free()
	quit(1)
	return false
