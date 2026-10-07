extends SceneTree

var _scopes_passed := false
var _captured_scopes := {}


func _initialize() -> void:
	call_deferred("_capture")


func _capture() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() < 2 or args.size() > 3 or (args.size() == 3 and args[2] not in ["measure-only", "scope-captures"]) or not FileAccess.file_exists(args[0].path_join("assets-corpus-disposable.marker")) or not DirAccess.dir_exists_absolute(args[1]):
		push_error("Expected marked disposable project and existing review output directory.")
		quit(2)
		return
	var shell = load("res://src/editor_shell.tscn").instantiate()
	root.add_child(shell)
	await process_frame
	await shell._project_session.open_project(args[0])
	if not shell._bridge.is_project_backed() or shell._bridge.current_project_path() != args[0]:
		push_error("Disposable review project did not open.")
		quit(1)
		return
	var workbench = load("res://src/unified_assets_editor.tscn").instantiate()
	workbench.name = "Assets Review"
	shell._document_tabs.add_child(workbench)
	shell.configure_assets_workbench(workbench)
	await workbench.reload(shell._bridge)
	await shell._navigation.activate_domain("assets", false)
	await shell._navigation.select_tab(shell._document_tabs.get_tab_count() - 1)
	await _audit_scopes(workbench, shell._bridge)
	if not _scopes_passed:
		shell._bridge.stop()
		quit(1)
		return
	if args.size() == 3 and args[2] == "scope-captures":
		shell._bridge.stop()
		quit(0)
		return
	workbench._supplied("bag-item", "Bag of Holding")
	var supplied = workbench.get_node("%Supplied")
	supplied.get_node("%VaultSearch").text = "-18"
	await supplied._load_page(0)
	for frame in 40:
		await process_frame
	if supplied.get_node("%ArtworkGallery").item_count == 0:
		push_error("Real Bag artwork is missing from the capture.")
		quit(1)
		return
	supplied._select_artwork(0)
	assert(workbench.get_node("%Bag").button_pressed)
	assert(supplied.get_node("%ArtworkGallery").is_selected(0))
	assert(not shell.get_node("%InspectorHost").visible)
	assert(not shell._domain_sidebar.visible)
	assert(shell._command_title.text.contains("MEDIA  /  ASSETS"))
	assert(shell._commit_edit_button.disabled)
	await shell._navigation.select_tab(4)
	assert(shell._domain_sidebar.visible)
	assert(shell.get_node("%InspectorHost").visible)
	assert(shell._command_title.text.contains("ITEMS"))
	await shell._navigation.select_tab(shell._document_tabs.get_tab_count() - 1)
	assert(not shell._domain_sidebar.visible)
	assert(not shell.get_node("%InspectorHost").visible)
	assert(shell._command_title.text.contains("MEDIA  /  ASSETS"))
	for viewport_size: Vector2i in [Vector2i(1600, 900), Vector2i(1920, 1080)]:
		root.size = viewport_size
		root.content_scale_size = viewport_size
		for frame in 6:
			await process_frame
		_measure(supplied, viewport_size)
		var browse: Control = supplied.get_node("BrowseInset/Browse")
		assert(absf(browse.global_position.x - 372) <= 2)
		assert(absf(browse.size.x - (viewport_size.x - 648)) <= 2)
		for expected: Array in [["SearchGroup/Fields/VaultSearch", 204, 30], ["FilterInset/Filters", 246, 34]]:
			var measured: Rect2 = browse.get_node(expected[0]).get_global_rect()
			assert(absf(measured.position.x - 372) <= 2 and absf(measured.size.x - browse.size.x) <= 2)
			assert(absf(measured.position.y - expected[1]) <= 2 and absf(measured.size.y - expected[2]) <= 2)
		var gallery: ItemList = supplied.get_node("%ArtworkGallery")
		var import_bounds: Rect2 = browse.get_node("Header/Heading/Import").get_global_rect()
		assert(absf(import_bounds.position.x - (viewport_size.x - 454)) <= 2)
		assert(absf(import_bounds.position.y - 67) <= 2 and import_bounds.size == Vector2(180, 34))
		var filter_x := 372.0
		for expected: Array in [["Kind", 79], ["All", 50], ["Previewable", 108], ["Missing", 79]]:
			var measured: Rect2 = browse.get_node("FilterInset/Filters/" + expected[0]).get_global_rect()
			assert(absf(measured.position.x - filter_x) <= 2)
			assert(measured.size == Vector2(expected[1], 30))
			filter_x += expected[1] + 6
		var first_card: Rect2 = gallery.call("card_bounds", 0)
		assert(absf(gallery.global_position.y + first_card.position.y - 320) <= 2)
		assert(absf(first_card.size.y - 146) <= 2)
		var second_row: Rect2 = gallery.call("card_bounds", 5)
		assert(absf(gallery.global_position.y + second_row.position.y - 476) <= 2)
		assert(absf(second_row.position.y - first_card.end.y - 10) <= 1)
		for index in gallery.item_count:
			var card: Rect2 = gallery.call("card_bounds", index)
			assert(absf(card.size.x - first_card.size.x) <= 1)
			var approved_width := (browse.size.x - 40.0) / 5.0
			assert(absf(card.size.x - approved_width) <= 2)
			assert(absf(gallery.global_position.x + card.position.x - (372 + (index % 5) * (approved_width + 10))) <= 2)
		var inspector: Control = supplied.get_node("InspectorInset/Selection")
		for expected: Array in [["SelectionBox", 89, 53], ["Matte", 154, 148], ["Zoom", 370, 30], ["CopyToScenario", 412, 34], ["UseInItem", 458, 34]]:
			var measured: Rect2 = inspector.get_node(expected[0]).get_global_rect()
			assert(absf(measured.position.x - (viewport_size.x - 248)) <= 2 and absf(measured.size.x - 236) <= 2)
			assert(absf(measured.position.y - expected[1]) <= 2 and absf(measured.size.y - expected[2]) <= 2)
		if args.size() == 3 and args[2] == "measure-only":
			continue
		await RenderingServer.frame_post_draw
		var capture := root.get_texture().get_image()
		if capture.get_size() != viewport_size or capture.save_png(args[1].path_join("bag-%dx%d.png" % [viewport_size.x, viewport_size.y])) != OK:
			push_error("Review capture failed or had an unexpected viewport size.")
			quit(1)
			return
		print("ASSETS_REVIEW viewport=%s workbench=%s minimum=%s" % [viewport_size, workbench.size, workbench.get_combined_minimum_size()])
	shell._bridge.stop()
	quit()


func _audit_scopes(workbench: Control, bridge) -> void:
	var before: Dictionary = bridge.request("session.describe")
	assert(before.get("ok", false))
	for scope: Array in [["Scenario", "project-asset.list"], ["Stock", "application-media.list"], ["Library", "personal-library.list"], ["Scenario", "project-asset.list"]]:
		workbench.get_node("%" + scope[0]).pressed.emit()
		var panel: Control = workbench.get_node("%Gallery")
		assert(panel.visible and not workbench.get_node("%Supplied").visible)
		assert(panel.get_node("%Preview").texture == null)
		assert(panel.get_node("%UseStock").disabled)
		var params := {"query": "", "offset": 0, "limit": 25}
		if scope[0] != "Library":
			params["kind"] = "icon"
		var expected: Dictionary = bridge.request(scope[1], params)
		assert(expected.get("ok", false))
		var rows: Array = expected.get("result", {}).get("items", [])
		assert(panel.get_node("%Gallery").item_count == rows.size())
		for index in rows.size():
			assert(panel._rows[index].identity == rows[index].identity)
		for frame in rows.size() + 2:
			await process_frame
		for viewport_size: Vector2i in [Vector2i(1600, 900), Vector2i(1920, 1080)]:
			root.size = viewport_size
			root.content_scale_size = viewport_size
			for frame in 6:
				await process_frame
			var search_bounds: Rect2 = panel.get_node("%Search").get_global_rect()
			print("ASSETS_SCOPE_GEOMETRY scope=%s viewport=%s search=%s minimum=%s" % [scope[0], viewport_size, search_bounds, panel.get_combined_minimum_size()])
			if rows.size() >= 10:
				print("ASSETS_SCOPE_CARDS ", panel.get_node("%Gallery").size, " ", panel.get_node("%Gallery").call("card_bounds", 0), " ", panel.get_node("%Gallery").call("card_bounds", 5))
				var second_row: Rect2 = panel.get_node("%Gallery").call("card_bounds", 5)
				assert(second_row.end.y <= panel.get_node("%Gallery").size.y)
			assert(absf(search_bounds.position.x - 372) <= 2 and absf(search_bounds.position.y - 204) <= 2)
			assert(absf(search_bounds.size.x - (viewport_size.x - 648)) <= 2 and search_bounds.size.y == 30)
			assert(panel.get_combined_minimum_size().x <= panel.size.x)
		if not rows.is_empty():
			var selected_index := 0
			if scope[0] == "Stock" and int(rows[0].get("classicResource", {}).get("resourceId", 0)) == 0:
				await panel._select(0)
				assert(panel.get_node("%UseStock").disabled)
				assert(not panel.get_node("%UseStock").tooltip_text.is_empty())
				selected_index = 1
			panel.get_node("%Gallery").select(selected_index)
			panel.get_node("%Gallery").item_selected.emit(selected_index)
			assert(panel._selected == selected_index)
			var args := OS.get_cmdline_user_args()
			if args.size() == 3 and args[2] == "scope-captures" and scope[0] != "Library" and not _captured_scopes.has(scope[0]):
				for viewport_size: Vector2i in [Vector2i(1600, 900), Vector2i(1920, 1080)]:
					root.size = viewport_size
					root.content_scale_size = viewport_size
					for frame in 8:
						await process_frame
					await RenderingServer.frame_post_draw
					var capture := root.get_texture().get_image()
					assert(capture.get_size() == viewport_size)
					assert(capture.save_png(args[1].path_join("%s-%dx%d.png" % [scope[0].to_lower(), viewport_size.x, viewport_size.y])) == OK)
				_captured_scopes[scope[0]] = true
			if scope[0] != "Library":
				assert(not panel.get_node("%UseStock").disabled)
				panel.get_node("%UseStock").pressed.emit()
				var picker = panel.get_node("%StockPicker")
				assert(panel.get_node("%StockPickerWindow").visible)
				assert(picker._artwork_identity == rows[selected_index].identity)
				assert(picker.get_node("%ProposedPicture").texture == panel.get_node("%Preview").texture)
				var items: Dictionary = bridge.request("item.list", {"scope": "scenario", "query": "", "offset": 0, "limit": 32})
				assert(items.get("ok", false) and not items.result.items.is_empty())
				assert(picker._rows.size() == items.result.items.size() and picker._rows.size() <= 32)
				for index in picker._rows.size():
					assert(picker._rows[index].identity == items.result.items[index].identity)
				picker.get_node("%DestinationItems").select(0)
				picker.get_node("%DestinationItems").item_selected.emit(0)
				assert(picker._selected.identity == items.result.items[0].identity)
				picker.get_node("%CancelArtwork").pressed.emit()
				assert(not panel.get_node("%StockPickerWindow").visible)
				await process_frame
				assert(panel.get_node("%UseStock").has_focus())
				print("ASSETS_PICKER_CANCEL_OK scope=%s items=%d" % [scope[0], picker._rows.size()])
		print("ASSETS_SCOPE_OK scope=%s rows=%d" % [scope[0], rows.size()])
	var after: Dictionary = bridge.request("session.describe")
	assert(after.get("ok", false))
	assert(before.result.revision == after.result.revision)
	_scopes_passed = true


func _measure(supplied: Control, viewport_size: Vector2i) -> void:
	var regions := {}
	for path: String in ["Browse/Header", "Browse/Scopes", "Browse/VaultSearch", "Browse/Filters", "Browse/VaultStatus", "Browse/Paging", "Selection/Caption", "Selection/SelectionBox", "Selection/Matte", "Selection/ArtworkDimensions", "Selection/PreviewLabel", "Selection/Zoom", "Selection/CopyToScenario", "Selection/UseInItem", "Selection/Ownership"]:
		var resolved_path := path.replace("Browse/Filters", "Browse/FilterInset/Filters")
		var node: Control = supplied.get_node("%VaultSearch") if path == "Browse/VaultSearch" else supplied.get_node(("InspectorInset/" if path.begins_with("Selection/") else "BrowseInset/") + resolved_path)
		var bounds := node.get_global_rect()
		regions[path] = [bounds.position.x, bounds.position.y, bounds.size.x, bounds.size.y]
	var gallery: ItemList = supplied.get_node("%ArtworkGallery")
	for index in [0, 4, 5, 9]:
		var bounds: Rect2 = gallery.call("card_bounds", index)
		bounds.position += gallery.global_position
		regions["card-%d" % index] = [bounds.position.x, bounds.position.y, bounds.size.x, bounds.size.y]
	print("ASSETS_GEOMETRY ", JSON.stringify({"viewport": [viewport_size.x, viewport_size.y], "regions": regions}))
