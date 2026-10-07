extends SceneTree

var _editor: Control
var _output_root := ""
var _manifest: Array = []


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 4:
		return _fail("Expected disposable project, application data, City of Bywater source, and output directory.")
	_output_root = args[3]
	if not DirAccess.dir_exists_absolute(_output_root): return _fail("The declared output directory does not exist.")
	root.content_scale_size = Vector2i(1600, 900)
	_editor = (load("res://src/editor_shell.tscn") as PackedScene).instantiate()
	root.add_child(_editor)
	await _frames(6)
	if not await _prepare_project(args[0], args[1], args[2]): return
	if not await _capture_treasure(): return
	if not await _capture_shop(): return
	if not await _capture_treasure_states(): return
	if not await _capture_shop_states(): return
	var file := FileAccess.open(_output_root.path_join("capture.json"), FileAccess.WRITE)
	file.store_string(JSON.stringify({"stage": "native-current-state", "renderer": "Godot 4.7.1", "captures": _manifest}, "\t"))
	file.close()
	print("PROVIDENCE_ECONOMY_CAPTURE_OK captures=%d icons=realmz-source-backed" % _manifest.size())
	quit(0)


func _prepare_project(project_path: String, application_path: String, source_path: String) -> bool:
	var created: Dictionary = _editor._bridge.create_project("economy-native-capture", project_path)
	if not created.get("ok", false): return _fail(str(created.get("error", "Project creation failed.")))
	await _editor._activate_session(created)
	await _wait_for_operations()
	for request in [
		["item-rules.import-standard", {"path": application_path.path_join("Data ID"), "textPath": application_path.path_join("Data ID.rsrc")}],
		["item-rules.import-scenario", {"path": source_path.path_join("Data NI")}],
		["project.import-classic-treasures", {"directory": source_path}],
		["project.import-classic-shops", {"directory": source_path}],
	]:
		var params := (request[1] as Dictionary).duplicate()
		params["expectedRevision"] = _editor._session_view.revision
		var response: Dictionary = _editor._bridge.request(str(request[0]), params)
		if not response.get("ok", false): return _fail(str(response.get("error", "Source import failed.")))
		_editor._session_view.apply(response.result)
	return true


func _capture_treasure() -> bool:
	_editor._navigation.select_tab(21)
	await _wait_for_operations()
	var controller = _editor._workbenches.treasure_commands
	var view: ProvidenceTreasureEditor = _editor._workbenches.treasure
	var loaded: Dictionary = await controller.reload()
	if not loaded.get("ok", false): return _fail(str(loaded.get("error", "Treasure records did not reload.")))
	var opened: Dictionary = await controller.open_native_id(10)
	if not opened.get("ok", false): return _fail(str(opened.get("error", "Treasure 10 did not open.")))
	if (view.find_child("NewTreasure", true, false) as Button).disabled: return _fail("New Treasure is disabled; next native ID is %d." % view._next_native_id)
	var gold := view.find_child("Gold", true, false) as LineEdit
	gold.text = "2001"
	gold.text_changed.emit("2001")
	await _select_item(view, "214")
	if not await _assert_artwork(view, ["GoldIcon", "GemsIcon", "JewelryIcon"], "Treasure"): return false
	var captured := await _capture_route("treasure", view)
	view.discard_draft()
	return captured


func _capture_shop() -> bool:
	_editor._navigation.select_tab(22)
	await _wait_for_operations()
	var controller = _editor._workbenches.shop_commands
	var view: ProvidenceShopEditor = _editor._workbenches.shop
	var loaded: Dictionary = await controller.reload()
	if not loaded.get("ok", false): return _fail(str(loaded.get("error", "Shop records did not reload.")))
	var opened: Dictionary = await controller.open_native_id(4)
	if not opened.get("ok", false): return _fail(str(opened.get("error", "Shop 4 did not open.")))
	if (view.find_child("NewShop", true, false) as Button).disabled: return _fail("New Shop is disabled; next native ID is %d." % view._next_native_id)
	var category := view.find_child("CategoryFilter", true, false) as OptionButton
	category.select(2)
	category.item_selected.emit(2)
	await _select_item(view, "214")
	view.call("_add_selected_stock")
	if not await _assert_artwork(view, [], "Shop"): return false
	var captured := await _capture_route("shop", view)
	view.discard_draft()
	return captured


func _capture_treasure_states() -> bool:
	_editor._navigation.select_tab(21)
	await _wait_for_operations()
	var controller = _editor._workbenches.treasure_commands
	var view: ProvidenceTreasureEditor = _editor._workbenches.treasure
	if not await _open_state_record(controller, 10, "Treasure"): return false
	var experience := view.find_child("Experience", true, false) as LineEdit
	experience.text = "50000"
	experience.text_changed.emit(experience.text)
	var search := view.find_child("ItemSearch", true, false) as LineEdit
	search.text = "no such Realmz item"
	view.call("_item_filter_edited")
	await _wait_for_operations()
	if not await _capture_state("treasure-no-match-invalid", "treasure", "No-match search and invalid signed 16-bit reward disable Apply"): return false
	if not await _open_state_record(controller, 10, "Treasure"): return false
	await _select_item(view, "214")
	var full_items: Array = []
	full_items.resize(20)
	full_items.fill(214)
	view._draft_record.itemIds = full_items
	view._form_dirty = true
	view.call("_render_draft", view._draft_record)
	view.call("_update_authoring_state")
	if not await _capture_state("treasure-full-disabled", "treasure", "All 20 slots occupied; Add is disabled while Replace and Clear remain contextual"): return false
	if not await _open_state_record(controller, 10, "Treasure"): return false
	await _select_item(view, "214")
	view.set_resolved_artwork(59, null)
	if not await _capture_state("treasure-missing-art", "treasure", "Missing exact Realmz artwork uses the explicit unavailable-art glyph"): return false
	if not await _open_state_record(controller, 10, "Treasure"): return false
	view.call("_show_clear_confirmation")
	await _frames(3)
	var captured := await _capture_state("treasure-clear-confirmation", "treasure", "Destructive clear keeps identity and references and requires confirmation")
	(view._clear_confirmation as ConfirmationDialog).hide()
	return captured


func _capture_shop_states() -> bool:
	_editor._navigation.select_tab(22)
	await _wait_for_operations()
	var controller = _editor._workbenches.shop_commands
	var view: ProvidenceShopEditor = _editor._workbenches.shop
	if not await _open_state_record(controller, 4, "Shop"): return false
	var stock := view.find_child("ShopStock", true, false) as ItemList
	if stock.item_count > 6: stock.select(6)
	view.call("_update_quantity_from_selection")
	var quantity := view.find_child("Quantity", true, false) as SpinBox
	quantity.value = 255
	quantity.value_changed.emit(255)
	if not await _capture_state("shop-boundary-terminators", "shop", "The imported record stops at each category terminator and exposes the 0–255 quantity boundary"): return false
	view.call("_show_clear_stock_confirmation")
	await _frames(3)
	var captured := await _capture_state("shop-clear-stock-confirmation", "shop", "Clearing all 1,000 stock and quantity slots requires confirmation and remains a local draft")
	(view._stock_confirmation as ConfirmationDialog).hide()
	if not captured: return false
	view.discard_draft()
	view.call("_show_clear_confirmation")
	await _frames(3)
	captured = await _capture_state("shop-clear-defaults-confirmation", "shop", "Clear To Defaults separately resets inflation and stock while retaining the Shop identity")
	(view._clear_confirmation as ConfirmationDialog).hide()
	if not captured: return false
	view.clear_selection()
	return await _capture_state("shop-no-selection", "shop", "No-selection state disables record editing while New Shop remains available")


func _open_state_record(controller: Variant, native_id: int, label: String) -> bool:
	var view: ProvidenceEconomyRecordEditor = controller._view
	if view.has_unapplied_changes(): view.discard_draft()
	var navigation_dialog := _editor.find_child("UnappliedChangesDialog", true, false) as ConfirmationDialog
	if navigation_dialog != null: navigation_dialog.hide()
	var opened: Dictionary = await controller.open_native_id(native_id)
	if not opened.get("ok", false): return _fail(str(opened.get("error", "%s %d did not open." % [label, native_id])))
	return true


func _select_item(view: Control, query: String) -> void:
	var search := view.find_child("ItemSearch", true, false) as LineEdit
	search.text = query
	view.call("_item_filter_edited")
	await _wait_for_operations()
	var pool := view.find_child("ItemPool", true, false) as ItemList
	if pool.item_count > 0 and not pool.is_item_disabled(0):
		pool.select(0)
		pool.item_selected.emit(0)
	await _wait_for_operations()


func _assert_artwork(view: Control, reward_nodes: Array, route: String) -> bool:
	for node_name in reward_nodes:
		if (view.find_child(node_name, true, false) as TextureRect).texture == null:
			return _fail("%s did not resolve %s." % [route, node_name])
	var pool := view.find_child("ItemPool", true, false) as ItemList
	if pool.item_count == 0 or pool.get_item_icon(0) == null: return _fail("%s item pool has no Realmz artwork." % route)
	return true


func _capture_route(route_name: String, view: Control) -> bool:
	for size in [Vector2i(1600, 900), Vector2i(1920, 1080)]:
		DisplayServer.window_set_size(size)
		root.content_scale_size = size
		await _frames(6)
		var path := _output_root.path_join("native-%s-%dx%d.png" % [route_name, size.x, size.y])
		var image := root.get_viewport().get_texture().get_image()
		if image == null or image.save_png(path) != OK: return _fail("Could not save %s." % path)
		_manifest.append({"route": route_name, "path": path.get_file(), "viewport": [size.x, size.y], "theme": "dark", "density": "balanced", "sourceRecord": 10 if route_name == "treasure" else 4})
	return true


func _capture_state(state_name: String, route_name: String, description: String) -> bool:
	var size := Vector2i(1600, 900)
	DisplayServer.window_set_size(size)
	root.content_scale_size = size
	await _frames(4)
	var path := _output_root.path_join("native-state-%s.png" % state_name)
	var image := root.get_viewport().get_texture().get_image()
	if image == null or image.save_png(path) != OK: return _fail("Could not save %s." % path)
	_manifest.append({"route": route_name, "path": path.get_file(), "viewport": [size.x, size.y], "theme": "dark", "density": "balanced", "state": state_name, "description": description})
	return true


func _wait_for_operations() -> void:
	var idle_frames := 0
	while idle_frames < 6:
		await process_frame
		idle_frames = 0 if _editor._operations.busy else idle_frames + 1


func _frames(count: int) -> void:
	for _index in range(count): await process_frame


func _fail(message: String) -> bool:
	push_error(message)
	quit(2)
	return false
