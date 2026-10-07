extends "res://tools/validate_map_paint_workspace.gd"

class ResourceBridge extends PaintBridge:
	var resource_writes := 0
	var stamp_writes := 0
	var drop_resource := false
	var reject_resource := false
	var drop_rejected := false
	var drop_stamp := false
	func _request(method: String, params: Dictionary) -> Dictionary:
		if method == "map.render-atlas":
			var opened: Dictionary = super._request("map.open", {"identity":params.identity})
			if opened.get("ok", false) and opened.result.map.levelType == "dungeon":
				var image := Image.create(64, 64, false, Image.FORMAT_RGBA8); image.fill(Color(0.2, 0.3, 0.4))
				return {"ok":true,"result":{"available":true,"renderMode":"dungeon-top-down","tilesetId":opened.result.map.runtime.tilesetId,
					"tileWidth":16,"tileHeight":16,"columns":4,"rows":4,"base64":Marshalls.raw_to_base64(image.save_png_to_buffer())}}
		if method == "paint-resources.apply" and reject_resource:
			reject_resource = false; return {"ok":false,"error":"Controlled collection rejection"}
		if method == "paint-resources.apply" and drop_rejected:
			drop_rejected = false
			var other: Dictionary = params.duplicate(true)
			other.operationId = "b".repeat(64); other.change.resource.identity = "paint:competing"
			assert(super._request(method, other).ok)
			assert(not super._request(method, params).ok)
			return {"ok":false,"outcomeUnknown":true,"error":"Controlled rejected save reply loss"}
		var response: Dictionary = super._request(method, params)
		if response.get("ok", false) and method == "paint-resources.apply":
			resource_writes += 1
			if drop_resource: drop_resource = false; return {"ok":false,"outcomeUnknown":true,"error":"Controlled collection reply loss"}
		if response.get("ok", false) and method == "map-stamp.apply":
			stamp_writes += 1
			if drop_stamp: drop_stamp = false; return {"ok":false,"outcomeUnknown":true,"error":"Controlled stamp reply loss"}
		return response


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 1 or not args[0].get_file().begins_with("providence-ui-paint-"):
		push_error("A disposable paint-resource output root is required"); quit(1); return
	var prior := OS.get_environment("PROVIDENCE_PROJECT_PATH"); OS.set_environment("PROVIDENCE_PROJECT_PATH", "")
	root.size = Vector2i(1600, 900); root.gui_embed_subwindows = true
	var shell: Control = load("res://src/editor_shell.tscn").instantiate(); shell.set_script(CheckedShell); root.add_child(shell)
	await _frames(3); shell._bridge.stop(); shell._bridge = ResourceBridge.new(args[0].path_join("resource-settings.cfg"))
	var created: Dictionary = shell._bridge.create_project("paint-resources", args[0].path_join("resource-project"))
	if _check(created.get("ok", false), "Resource project creation failed"):
		await shell._activate_session(created)
		if await _setup(shell):
			await _tile_discovery(shell)
			await _collection(shell); await _geometry(shell); await _stamps(shell); await _failures(shell)
			await _dungeon_stamps(shell)
			await _persistence(shell, args[0].path_join("resource-project"))
	shell.free(); await _frames(2); OS.set_environment("PROVIDENCE_PROJECT_PATH", prior)
	if not _failed: print("PROVIDENCE_MAP_PAINT_RESOURCES_OK local-revisions named-palette nested-tile-cancel geometry dense-resize sparse-resize shrink-review hole-empty-distinction capture-marker-stripping sparse-destination preview-review cancel atomic-history failure-retained receipt-recovery no-replay stale dungeon-capture named-feature-edit dungeon-apply-history save-reopen teardown")
	quit(1 if _failed else 0)


func _tile_discovery(shell) -> void:
	await _settle(shell)
	var dock = shell._maps.paint.workspace.tiles_dock
	var revision: int = shell._session_view.revision
	var selected: Dictionary = dock.brush.duplicate(true)
	dock.ui.search.text = "shoreline"
	dock.ui.search.text_changed.emit(dock.ui.search.text)
	_check(dock.ui.results.item_count > 0 and dock.ui.results.get_item_text(0).contains("Shoreline"), "Landlook names did not become searchable")
	_check(dock.brush == selected and shell._session_view.revision == revision, "Tile browsing changed the current brush or project")
	dock.ui.search.text = "tile:151"
	dock.ui.search.text_changed.emit(dock.ui.search.text)
	_check(dock.ui.results.item_count == 1 and int(dock.ui.results.get_item_metadata(0)) == 151, "Exact tile alias lost its identity")
	dock.ui.search.text = ""
	for index in dock.ui.category.item_count:
		if dock.ui.category.get_item_metadata(index) == "tree-detail": dock.ui.category.select(index)
	dock.ui.category.item_selected.emit(dock.ui.category.selected)
	_check(dock.ui.results.item_count > 0 and dock.ui.count.text.ends_with("/ 200 tiles"), "Tile category filtering lost its count")
	for index in dock.ui.results.item_count:
		_check(dock._tile_names[int(dock.ui.results.get_item_metadata(index))].category == "tree-detail", "Tile category filter exposed another family")
	dock.ui.search.text = "no such shoreline tile"
	dock.ui.search.text_changed.emit(dock.ui.search.text)
	_check(dock.ui.results.item_count == 0 and dock.ui.empty.visible, "Empty tile search retained stale results")
	dock.select_tile(151)
	_check(dock.ui.category.selected == 0 and dock.ui.brush_name.text.contains("Tree detail"), "Exact tile reveal retained a category filter or wrong name")
	dock.select_tile(5)


func _collection(shell) -> void:
	var controller = shell._maps.paint_resources; var window = controller._window; var dock = shell._maps.paint.workspace.tiles_dock
	var revision: int = shell._session_view.revision
	dock.select_tile(5); dock.ui.favorite.pressed.emit(); await _settle(shell)
	_check(window.get_node("%FavoriteResource").button_pressed and int(window.draft().cells[0].tile) == 5, "Favorite tile did not stage the exact named tile")
	_check(window.visible and window.has_unapplied_changes(), "Save brush did not open a local draft")
	_check(window.size.x <= 1600 and window.size.y <= 900, "Collection window exceeds compact viewport")
	await _collection_layout(window)
	window.get_node("%ResourceName").text = "Village paths"
	window.get_node("%ResourceCollection").text = "Village"
	window.get_node("%FavoriteResource").button_pressed = true
	var saved: Dictionary = await controller.commit_selected(); await _settle(shell)
	_check(saved.get("ok", false) and not window.has_unapplied_changes(), "Named palette save failed")
	_check(shell._session_view.revision == revision, "Collection editing added scenario history")
	window.get_node("%ResourceCells").select(0); window._choose_tile(); await _frames(2)
	window._tile_atlas.select_tile(9); window._tile_dialog.hide()
	_check(int(window.draft().cells[0].tile) == 5, "Cancelling the nested tile picker changed the collection draft")
	window._choose_tile(); window._tile_atlas.select_tile(8); window._accept_tile(); window._tile_dialog.hide()
	_check(window.has_unapplied_changes(), "Explicit nested tile acceptance did not stage a draft")
	await controller.commit_selected(); await _settle(shell)
	window._use(); await _settle(shell)
	_check(not window.visible and int(dock.brush.cells[0]) == 8 and dock.ui.brush_name.text == "Village paths", "Use brush did not restore the named brush")
	controller.open(); await _settle(shell); await controller._query("No such resource", "", 0)
	_check(window.get_node("%Entries").item_count == 0 and window.draft().is_empty(), "Empty search retained stale resource details")
	window.close(); await _frames(2)
	_check(dock.ui.save_brush.has_focus(), "Collection cancellation did not restore focus")
	controller.open("stamp"); await _settle(shell)
	await controller._query("Tree", "stamp", 0)
	_check(window.get_node("%Entries").item_count == 2, "Built-in tree recipes did not appear in the correct atlas")
	await controller._open_entry("preset:castle-bed-156-157")
	_check(window.get_node("%UseResource").disabled and window.get_node("%DeleteResource").disabled, "Unavailable built-in recipe exposed acceptance or deletion")
	await controller._open_entry("preset:tree-pair-151-152")
	_check(not window.get_node("%UseResource").disabled and window.get_node("%ResourcePreview").texture != null, "Available built-in stamp lost its source preview")
	window.close()


func _stamps(shell) -> void:
	var controller = shell._maps.paint_resources; var window = controller._window; var author = shell._maps.land_authoring
	author.selected = [{"x":3,"y":3},{"x":4,"y":3},{"x":5,"y":3}]
	shell._maps.paint.workspace.set_tool("select"); controller.open(); await _settle(shell)
	await controller._capture()
	_check(window.draft().cells.size() == 2 and int(window.draft().cells[0].tile) == 112, "Capture copied markers or failed to omit special artwork")
	window.get_node("%ResourceName").text = "Village corner"
	window._draft.cells[0].tile = 5
	await controller.commit_selected(); await _settle(shell); window._use(); await _settle(shell)
	_check(author._tool == "stamp" and author._overlay.active, "Use stamp did not activate destination placement")
	var before := _tiles(shell); var revision: int = shell._session_view.revision
	author._hover_stamp(Vector2i(3,3)); await _settle(shell)
	_check(not author._review.visible and shell._session_view.revision == revision and _tiles(shell) == before, "Stamp hover wrote or opened a popup")
	author.cancel_gesture(); _check(_tiles(shell) == before, "Cancelling stamp preview mutated map cells")
	await _stamp_destination(author, Vector2i(3, 3))
	_check(shell._session_view.revision == revision + 1 and _tiles(shell)[273] == (0x6000 | 1005), "Stamp Apply lost destination AP ownership or atomicity")
	_check(_tiles(shell)[274] == before[274], "Sparse stamp changed a hole")
	await shell._undo(); _check(_tiles(shell) == before, "Stamp Undo lost original map words")
	await shell._redo(); _check(_tiles(shell)[273] == (0x6000 | 1005), "Stamp Redo did not restore its exact change")
	shell._bridge.drop_stamp = true
	var writes: int = shell._bridge.stamp_writes
	await _stamp_destination(author, Vector2i(6, 3)); _check(not author._pending.is_empty(), "Lost stamp reply discarded recovery context")
	await author.check_original()
	_check(author._pending.is_empty() and shell._bridge.stamp_writes == writes + 1, "Stamp recovery replayed its mutation")


func _geometry(shell) -> void:
	var controller = shell._maps.paint_resources; var window = controller._window
	controller.open(); await _settle(shell)
	await controller._query("Village paths", "palette", 0)
	var entries: ItemList = window.get_node("%Entries")
	await controller._open_entry(str(entries.get_item_metadata(0)))
	var original: Dictionary = window.draft(); var revision: int = shell._session_view.revision
	window.get_node("%ResourceWidth").value = 3; window.get_node("%ResourceHeight").value = 2
	window.get_node("%ResizeResource").pressed.emit(); await _settle(shell)
	var review: ConfirmationDialog = window.get_node("%ConfirmGeometry")
	_check(review.visible and review.dialog_text.contains("5 cells added"), "Palette resize did not show its exact dense fill review")
	_check(window.draft() == original and shell._session_view.revision == revision, "Geometry review wrote a draft or scenario before acceptance")
	review.canceled.emit(); review.hide(); _check(window.draft() == original, "Cancel geometry changed the resource")
	window.get_node("%ResourceWidth").value = 3; window.get_node("%ResourceHeight").value = 2
	window.get_node("%ResizeResource").pressed.emit(); await _settle(shell); review.confirmed.emit(); review.hide()
	_check(window.draft().cells.size() == 6, "Accepted palette resize did not fill every cell")
	await controller.commit_selected(); await _settle(shell)
	window.get_node("%ResourceWidth").value = 1; window.get_node("%ResourceHeight").value = 1
	window.get_node("%ResizeResource").pressed.emit(); await _settle(shell)
	_check(review.dialog_text.contains("5 removed") and review.dialog_text.contains("Removed:"), "Shrink review omitted its removed coordinates")
	review.confirmed.emit(); review.hide(); await controller.commit_selected(); await _settle(shell)
	window.close(); controller.open("stamp"); await _settle(shell)
	shell._maps.land_authoring.selected = [{"x":3,"y":3},{"x":5,"y":3}]
	await controller._capture(); var captured: Dictionary = window.draft()
	window.get_node("%ResourceWidth").value = 5; window.get_node("%ResourceHeight").value = 3
	window.get_node("%ResizeResource").pressed.emit(); await _settle(shell); review.confirmed.emit(); review.hide()
	_check(window.draft().cells == captured.cells and int(window.draft().width) == 5, "Stamp resize filled sparse holes")
	window.get_node("%ResourceCells").select(0); window._clear_cell()
	_check(int(window.draft().cells[0].tile) == 0, "Empty tile did not remain an explicit clear operation")
	window.get_node("%HoleResourceCell").pressed.emit(); await _settle(shell); review.confirmed.emit(); review.hide()
	_check(window.draft().cells.size() == 1, "Make hole retained a clearing cell")
	window.get_node("%ResourceCellX").value = 4; window.get_node("%ResourceCellY").value = 2
	window.get_node("%AddResourceCell").pressed.emit(); await _settle(shell); review.confirmed.emit(); review.hide()
	_check(window.draft().cells.size() == 2 and int(window.draft().cells[1].x) == 4, "Setting a sparse coordinate did not stage the exact cell")
	window.discard_draft(); window.close()
	_check(shell._session_view.revision == revision, "Collection geometry modified scenario history")


func _stamp_destination(author, cell: Vector2i) -> void:
	author._begin_gesture(cell)
	await author._gesture_finished(cell, cell, [cell])


func _failures(shell) -> void:
	var controller = shell._maps.paint_resources; var window = controller._window
	controller.open(); await _settle(shell); await controller._query("Village paths", "", 0)
	await controller._open_entry(str(window.get_node("%Entries").get_item_metadata(0)))
	window._duplicate(); window.get_node("%ResourceName").text = "Recovery copy"
	shell._bridge.reject_resource = true
	await controller.commit_selected(); _check(window.has_unapplied_changes(), "Rejected collection write lost draft")
	shell._bridge.drop_resource = true; var writes: int = shell._bridge.resource_writes
	await controller.commit_selected(); _check(not controller._pending.is_empty(), "Lost collection reply lost its original identity")
	await controller.check_original(); await _settle(shell)
	_check(controller._pending.is_empty() and not window.has_unapplied_changes() and shell._bridge.resource_writes == writes + 1, "Committed collection recovery replayed or retained a stale draft")
	window._duplicate(); window.get_node("%ResourceName").text = "Rejected copy"
	shell._bridge.drop_rejected = true
	await controller.commit_selected(); await controller.check_original(); await _settle(shell)
	_check(controller._pending.is_empty() and window.has_unapplied_changes(), "Rejected receipt recovery did not preserve an explicitly retryable draft")
	await controller.commit_selected(); await _settle(shell); window.close()
	await shell._maps.document.load_map("land:0"); await _frames(2)
	_check(not window.visible and controller._origin.is_empty(), "Navigation retained an actionable stale collection destination")
	await shell._maps.document.load_map("land:1")


func _persistence(shell, path: String) -> void:
	await shell._project_session.save()
	var reopened: Dictionary = shell._bridge.start_project(path)
	_check(reopened.get("ok", false), "Paint resource project did not reopen")
	await shell._activate_session(reopened); await shell._maps.document.load_map("land:1")
	shell._maps.paint_resources.open(); await _settle(shell)
	var window = shell._maps.paint_resources._window
	window.get_node("%ResourceScope").select(3)
	await shell._maps.paint_resources._query("", "", 0)
	_check(window.get_node("%Entries").item_count == 6, "Saved collection entries did not survive reopen")
	window.close()


func _settle(shell) -> void:
	var stable := 0
	for index in 600:
		await process_frame
		stable = stable + 1 if not shell._operations.busy and not shell._bridge.operation_busy() and not shell._maps.paint_resources._submitting and not shell._maps.land_authoring._reading and not shell._maps.dungeon_stamps._reading else 0
		if stable >= 4: return
	_check(false, "Paint collection operation did not settle")


func _collection_layout(window: Window) -> void:
	for viewport in [Vector2i(1600,900), Vector2i(1920,1080)]:
		root.size = viewport; window.popup_centered(); await _frames(3)
		var margin: Control = window.get_node("Margin")
		_check(margin.size.x <= window.size.x and margin.size.y <= window.size.y, "Collection content exceeded window bounds")
		for node_name in ["UseResource", "CancelResources", "ResourceKind", "ResourceScope"]:
			var rect: Rect2 = window.get_node("%" + node_name).get_global_rect()
			_check(rect.end.x <= window.size.x + 1 and rect.end.y <= window.size.y + 1, "Collection command clipped at " + str(viewport) + ": " + node_name)
	root.size = Vector2i(1600,900)


func _dungeon_stamps(shell) -> void:
	if not _mutate(shell, "map.create", {"levelType":"dungeon"}): return
	if not _mutate(shell, "dungeon-cell.apply-features", {"identity":"dungeon:0","edit":{"cells":[{"x":8,"y":8}],"changes":[{"primitive":"wall","enabled":true},{"primitive":"column","enabled":true}]}}): return
	if not _mutate(shell, "action-point.create", {"mapIdentity":"dungeon:0","x":8,"y":8}): return
	if not _mutate(shell, "action-point.create", {"mapIdentity":"dungeon:0","x":12,"y":12}): return
	await shell._reload_map_catalog(); await shell._maps.document.load_map("dungeon:0"); await shell._navigation.select_route("maps.dungeon")
	var view = shell._workbenches.dungeon
	var selected: Dictionary = shell._bridge.request("dungeon-cell.selection", {"identity":"dungeon:0","cells":[{"x":8,"y":8}]})
	view.set_selection_projection(selected.result)
	var controller = shell._maps.paint_resources; var window = controller._window
	controller.open("stamp"); await _settle(shell); await controller._capture()
	_check(window.draft().levelType == "dungeon" and int(window.draft().cells[0].tile) & 0x9060 == 0, "Dungeon capture copied managed ownership")
	window.get_node("%ResourceName").text = "Dungeon arch"
	window.get_node("%ResourceCells").select(0); window._choose_tile(); await _settle(shell)
	var tile: int = int(window.draft().cells[0].tile)
	window._feature_dialog._change("stairs", true); await _settle(shell); window._feature_dialog.close()
	_check(int(window.draft().cells[0].tile) == tile, "Cancelling feature selection changed the Dungeon stamp draft")
	window._choose_tile(); await _settle(shell); window._feature_dialog._change("stairs", true); await _settle(shell); window._feature_dialog._accept()
	_check(int(window.draft().cells[0].tile) != tile and int(window.draft().cells[0].tile) & 0x9060 == 0, "Explicit feature acceptance lost safe field ownership")
	await controller.commit_selected(); await _settle(shell); window._use(); await _settle(shell)
	await _dungeon_placement(shell)
	await _dungeon_linked_return(shell)


func _dungeon_linked_return(shell) -> void:
	var view: Control = shell._workbenches.dungeon; var canvas: Control = view.get_node("%DungeonMapCanvas")
	var cells := [{"x":12,"y":12},{"x":13,"y":12},{"x":13,"y":13}]
	var selected: Dictionary = shell._bridge.request("dungeon-cell.selection",{"identity":"dungeon:0","cells":cells})
	view.set_selection_projection(selected.result)
	canvas.restore_navigation_state({"zoom":2,"pan":[-30,40],"cell":[13,12],"showActionPoints":false})
	canvas.grab_focus(); var before: Dictionary = view.read_navigation_state()
	await shell._navigation.open_map("land:1"); await _settle(shell)
	await shell._navigation.navigate_back(); await _settle(shell)
	var restored: Dictionary = view.read_navigation_state()
	_check(shell._maps.document.identity=="dungeon:0" and restored.canvas==before.canvas and restored.cells==before.cells and restored.mode==before.mode,
		"Dungeon Back lost its map, multiselection, zoom, pan or tool")
	_check(canvas.has_focus() and shell._maps.document.selected_cell==Vector2i(13,12),"Dungeon return lost its exact selected cell or focus")


func _dungeon_placement(shell) -> void:
	var stamps = shell._maps.dungeon_stamps
	var opened: Dictionary = shell._bridge.request("map.open", {"identity":"dungeon:0"})
	var before: Array = opened.result.map.tiles
	var revision: int = shell._session_view.revision
	stamps._hover(Vector2i(12,12)); await _settle(shell)
	_check(not stamps._review.visible and shell._session_view.revision == revision, "Dungeon stamp hover wrote or opened a popup")
	stamps._cancel_preview()
	stamps._begin(Vector2i(12,12)); await stamps._finish(Vector2i(12,12), Vector2i(12,12), [Vector2i(12,12)])
	var after: Dictionary = shell._bridge.request("map.open", {"identity":"dungeon:0"})
	_check(int(after.result.map.tiles[1092]) & 0x9060 == int(before[1092]) & 0x9060, "Dungeon stamp lost destination AP or Note ownership")
	_check(shell._session_view.revision == revision + 1 and not stamps.has_unapplied_changes(), "Dungeon stamp did not finish one atomic draft")
	await shell._undo()
	var undone: Dictionary = shell._bridge.request("map.open", {"identity":"dungeon:0"})
	_check(undone.result.map.tiles == before, "Dungeon stamp Undo did not restore exact map words")
	await shell._redo()
	var writes: int = shell._bridge.stamp_writes; shell._bridge.drop_stamp = true
	stamps._begin(Vector2i(13,12)); await stamps._finish(Vector2i(13,12), Vector2i(13,12), [Vector2i(13,12)])
	await stamps.check_original()
	_check(stamps._pending.is_empty() and not stamps.has_unapplied_changes() and shell._bridge.stamp_writes == writes + 1, "Dungeon stamp receipt recovery replayed or lost the confirmed write")
	shell._workbenches.dungeon._set_mode("paint")
	_check(shell._workbenches.dungeon.can_draw() and not stamps._overlay.active, "Leaving Stamp intercepted the requested Dungeon Draw tool")
