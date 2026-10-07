extends SceneTree

var shell: Control
var workbench: Control
var receipts: Array = []
var failed := false


func _initialize() -> void: call_deferred("_run")


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 2 or not FileAccess.file_exists(args[0].path_join("media-review-disposable.marker")):
		push_error("Marked disposable project and receipt path required"); quit(2); return
	root.gui_embed_subwindows = true; root.size = Vector2i(1600, 900)
	shell = load("res://src/editor_shell.tscn").instantiate(); root.add_child(shell)
	await process_frame; await shell._project_session.open_project(args[0])
	if not _check(shell._bridge.is_project_backed(), "open imported review project"): return
	await shell._assets.open_library("scenario"); workbench = shell._assets.library_workbench
	var panel: Control = workbench.get_node("%Gallery")
	var assets: Dictionary = shell._bridge.request("project-asset.list", {"limit":128})
	if not _check(assets.get("ok", false), "bounded catalog"): return
	var checked := {}
	var review_checked := false
	for asset: Dictionary in assets.result.items:
		var detail: Dictionary = shell._bridge.request("project-asset.open", {"identity":asset.identity,"limit":32})
		if not detail.get("ok", false): continue
		for source: Dictionary in detail.result.get("useTargets", []):
			var group := str(source.sourceKind) + (":" + str(source.source).get_slice(":", 0) if source.sourceKind == "record" else "")
			if source.sourceKind not in ["monster", "map", "player-map", "record", "spell", "battle"] or checked.has(group): continue
			await _follow(asset, source, panel)
			if failed: return
			checked[group] = true
			if not review_checked and source.sourceKind == "record":
				await _review_navigation(asset, source, panel)
				if failed: return
				review_checked = true
	if not _check(not checked.is_empty(), "import supplies actual linked owning records"): return
	shell._bridge.stop(); shell.queue_free(); await process_frame
	FileAccess.open(args[1], FileAccess.WRITE).store_string(JSON.stringify(receipts, "\t"))
	print("PROVIDENCE_MEDIA_NAVIGATION_NATIVE_OK exact-linked-records=" + str(checked.size()) + " back-selection-query-scroll-focus")
	quit()


func _review_navigation(asset: Dictionary, source: Dictionary, panel: Control) -> void:
	await panel.refresh_selection(str(asset.identity))
	var dialog: Window = workbench.get_node("%MediaDialog")
	await dialog.open_review("remove", shell._bridge, workbench._media_commands, panel.selection_context())
	var uses: Control = dialog.get_node("%AffectedUses")
	if not _check(uses.visible and not uses._rows.is_empty() and dialog.get_node("%Accept").disabled, "blocked removal exposes exact affected fields"): return
	var selected := -1
	for index in uses._rows.size():
		if uses._rows[index].source == source.source and uses._rows[index].field == source.field: selected = index
	if not _check(selected >= 0, "review contains original owning field"): return
	uses.get_node("Fields").select(selected)
	await uses._open_selected()
	for frame in 8: await process_frame
	while workbench._operations.busy: await process_frame
	if not _check(not dialog.visible and shell._document_tabs.get_current_tab_control() != workbench, "review opens exact owning field while retaining intent"): return
	await shell._navigation.navigate_back()
	if not _check(dialog.visible and dialog._base.identity == asset.identity and not dialog.get_node("%AffectedUses")._rows.is_empty(), "Back restores reviewed destination and refreshed uses: visible=%s base=%s rows=%d suspended=%s impact=%s" % [dialog.visible, dialog._base, dialog.get_node("%AffectedUses")._rows.size(), dialog._suspended_review, dialog.get_node("%Impact").text]): return
	dialog._cancel()


func _follow(asset: Dictionary, source: Dictionary, panel: Control) -> void:
	await workbench.show_scope("scenario")
	panel.get_node("%Search").text = str(int(asset.classicResource.resourceId))
	await panel.refresh_selection(str(asset.identity))
	panel.get_node("%Gallery").grab_focus()
	var before: Dictionary = workbench.read_navigation_state()
	await shell._open_artwork_source(source)
	if not _check(shell._document_tabs.get_current_tab_control() != workbench, "Used By opens " + str(source.source) + " · " + str(source.field)): return
	var current: Control = shell._document_tabs.get_current_tab_control()
	var focus := current.get_viewport().gui_get_focus_owner()
	if not _check(focus != null, "owning editor restores usable focus"): return
	if source.sourceKind == "player-map" and source.field == "scrollingText":
		if not _check(focus == current.get_node("%PlayerMapShow").get_line_edit(), "Player Map scrolling-text field receives exact focus"): return
	await shell._navigation.navigate_back()
	if not _check(shell._document_tabs.get_current_tab_control() == workbench, "Back returns to Assets"): return
	var after: Dictionary = workbench.read_navigation_state()
	if not _check(after.browser.query == before.browser.query and panel.selected_asset_identity() == asset.identity, "Back preserves search and exact selection: before=" + str(before) + " after=" + str(after) + " identity=" + panel.selected_asset_identity()): return
	_check(panel.get_viewport().gui_get_focus_owner() == panel.get_node("%Gallery"), "Back restores gallery focus")


func _check(condition: bool, label: String) -> bool:
	if condition: receipts.append({"check":label,"passed":true}); return true
	failed = true; push_error("MEDIA_NAVIGATION_FAILED " + label)
	if shell != null: shell._bridge.stop()
	quit(1); return false
