extends "res://tools/validate_shop_callers.gd"


func _run() -> void:
	create_timer(180).timeout.connect(func(): push_error("Shop filter check timed out"); quit(1))
	var args := OS.get_cmdline_user_args()
	assert(args.size() == 3)
	output = args[2]
	DirAccess.make_dir_recursive_absolute(args[1]); DirAccess.make_dir_recursive_absolute(output)
	root.gui_embed_subwindows = true
	shell = load("res://src/editor_shell.tscn").instantiate()
	shell._bridge = ProvidenceNativeBridge.new(args[1].path_join("settings.cfg"))
	root.add_child(shell); await process_frame
	await load_scenario(args[0], args[1].path_join("hax"))
	for viewport in [Vector2i(1920,1080), Vector2i(1600,900)]:
		root.size = viewport; root.content_scale_size = viewport
		await super.verify_callers(viewport)
		await verify_filters(viewport)
	await load_scenario(args[0].get_base_dir().path_join("Assault on Giant Mountain"), args[1].path_join("assault"))
	for viewport in [Vector2i(1920,1080), Vector2i(1600,900)]:
		root.size = viewport; root.content_scale_size = viewport
		await verify_missing_caller(viewport)
	FileAccess.open(output.path_join("receipt.json"), FileAccess.WRITE).store_string(JSON.stringify({"checks": checks}, "\t"))
	shell._bridge.stop(); shell.free(); await process_frame
	print("PROVIDENCE_SHOP_FILTERS_OK"); quit()


func load_scenario(source: String, project: String) -> void:
	assert(shell._bridge.create_project("shop-filters", project).ok)
	var imported: Dictionary = shell._bridge.request("project.import-classic-scenario", {
		"directory": source, "expectedRevision": 0, "applicationDataDirectory": OS.get_environment("PROVIDENCE_APPLICATION_RULES_ROOT")})
	assert(imported.ok, str(imported))
	await shell._activate_session(shell._bridge.request("session.describe", {})); await settle()


func verify_filters(viewport: Vector2i) -> void:
	var view = shell._workbenches.shop
	await shell._workbenches.shop_commands.open_native_id(20); await settle()
	var original: String = view.get_node("%Inflation").text
	view.get_node("%Inflation").text = "150"; view.get_node("%Inflation").text_changed.emit("150")
	var revision: int = shell._bridge.request("session.describe", {}).result.revision
	await click(view.get_node("%ProblemsOnly")); await settle()
	check(view._records.item_count == 0, "No-problem filter has an explicit empty result")
	check(view.has_unapplied_changes() and view.current_selection() == 20, "Filtering preserves the selected draft")
	await click(view.get_node("%ProblemsOnly")); await settle()
	check(view._index_for_native_id(20) >= 0, "Valid Shop above 19 stays visible")
	await click(view.get_node("%ShowUnverified")); await settle()
	var browser = view.get_node("%UnverifiedRecords")
	var records: ItemList = browser.get_node("Records")
	check(records.item_count == 16, "Hax unverified records are separate from actual Shops")
	await select_source(browser, 21)
	check(browser.get_node("Details").text.contains("1–999"), "Unverified selection shows its exclusion reason")
	check(view.get_node("%Inflation").text == "150", "Source browsing leaves the Shop draft untouched")
	await capture_filters(viewport, "sources")
	await click(browser.get_node("Actions/Callers")); await settle()
	var discovery = shell._commands._discovery._view
	check(discovery._record.get("linkOnly", false) and discovery._page.total == 0, "Uncalled source record has empty exact callers")
	check(discovery.get_node("%OpenRecord").disabled, "Unverified inventory cannot be opened for editing")
	discovery.close_view(); await settle()
	check(shell._bridge.request("session.describe", {}).result.revision == revision, "Filter and source reads create no history entry")
	await click(view.get_node("%ShowUnverified")); await settle()
	view.discard_draft()
	check(view.get_node("%Inflation").text == original, "Discard restores draft after browsing")
	await verify_problem_record(viewport)


func verify_problem_record(viewport: Vector2i) -> void:
	var view = shell._workbenches.shop
	await shell._workbenches.shop_commands.open_native_id(0); await settle()
	var record: Dictionary = view.current_record()
	record.itemIds[0] = 1500
	var changed: Dictionary = await shell._workbenches.shop_commands.commit(record, view._draft_serial)
	check(changed.ok, "Controlled invalid item fixture committed")
	await click(view.get_node("%ProblemsOnly")); await settle()
	check(view._records.item_count == 1 and view._index_for_native_id(0) == 0, "Problems only finds a low-numbered actual Shop")
	await capture_filters(viewport, "problems")
	await click(view.get_node("%ProblemsOnly")); await settle()
	var revision: int = shell._bridge.request("session.describe", {}).result.revision
	check(shell._bridge.request("history.undo", {"expectedRevision":revision}).ok, "Controlled fixture restored with document Undo")
	await shell._activate_session(shell._bridge.request("session.describe", {})); await settle()


func verify_missing_caller(viewport: Vector2i) -> void:
	await shell._navigation.select_route("economy.shops"); await settle()
	var view = shell._workbenches.shop
	if not view.get_node("%ShowUnverified").button_pressed: await click(view.get_node("%ShowUnverified")); await settle()
	var browser = view.get_node("%UnverifiedRecords")
	await select_source(browser, 26)
	check(browser._selected.callers == 1, "Assault source slot 26 retains its real caller")
	await click(browser.get_node("Actions/Callers")); await settle()
	var discovery = shell._commands._discovery
	FileAccess.open(output.path_join("missing-caller-state.json"), FileAccess.WRITE).store_string(JSON.stringify({
		"visible": discovery._view.visible, "record": discovery._view._record, "page": discovery._view._page,
		"selection": view.discovery_selection(), "status": discovery._view.get_node("%Status").text,
		"button":str(browser.get_node("Actions/Callers").get_global_rect()), "viewport":str(viewport)}, "\t"))
	check(discovery._view._page.items.size() == 1, "Missing Shop exact caller available")
	var link: Dictionary = discovery._view._page.items[0]
	check(link.source == "action-point:land:3:37", "Caller retains Land 3 AP 37 identity")
	await discovery.open_source(link); await settle()
	check(shell._documents.identity_for_tab(shell._document_tabs.current_tab) == "scripts.action-points", "Missing-target caller opens exact AP editor")
	await shell._navigation.navigate_back(); await settle()
	check(browser._selected_id == 26 and view.get_node("%ShowUnverified").button_pressed, "Back restores unverified slot and filters")
	await capture_filters(viewport, "missing-caller")
	await click(view.get_node("%ShowUnverified")); await settle()


func select_source(browser, native_id: int) -> void:
	var records: ItemList = browser.get_node("Records")
	for row in records.item_count:
		if int(records.get_item_metadata(row).nativeId) == native_id:
			records.select(row); records.item_selected.emit(row); await settle(); return
	assert(false, "Source row unavailable")


func capture_filters(viewport: Vector2i, label: String) -> void:
	await RenderingServer.frame_post_draw
	assert(root.get_texture().get_image().save_png(output.path_join("%s-%dx%d.png" % [label, viewport.x, viewport.y])) == OK)
