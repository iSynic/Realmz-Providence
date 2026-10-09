extends SceneTree

var _shell
var _capture_root := OS.get_environment("PROVIDENCE_BROWSING_CAPTURES")


func _initialize() -> void: _run.call_deferred()


func _run() -> void:
	OS.set_environment("PROVIDENCE_PROJECT_PATH", "")
	_shell = load("res://src/editor_shell.tscn").instantiate(); root.add_child(_shell)
	await process_frame
	var opened: Dictionary = _shell._bridge.start_project(OS.get_environment("PROVIDENCE_BROWSING_PROJECT"))
	assert(opened.ok); await _shell._activate_session(opened)
	var revision: int = _shell._session_view.revision
	for viewport_size in [Vector2i(1600, 900), Vector2i(1920, 1080)]:
		root.size = viewport_size
		await _scripts()
		await _battles()
		await _spells()
		await _economy()
		assert(_shell._session_view.revision == revision)
	_shell.free(); await process_frame
	print("PROVIDENCE_CATALOG_NAVIGATION_OK scripts battles palette spells items economy no-write")
	quit()


func _settle() -> void:
	for frame in 6000:
		await process_frame
		if not _shell._operations.busy and frame > 10: return
	assert(false, "Catalog navigation did not settle")


func _route(identity: String):
	await _shell._navigation.select_route(identity); await _settle()
	assert(_shell._documents.identity_for_tab(_shell._document_tabs.current_tab) == identity)
	return _shell._documents.view(identity)


func _scripts() -> void:
	for entry in [["scripts.action-points", "%ActionPointCollection", 60], ["scripts.macros", "%ExtraActionPointCollection", 150]]:
		var view = await _route(entry[0])
		var list: ItemList = view.get_node(entry[1])
		assert(list.item_count == entry[2])
		list.select(list.item_count - 1); list.item_selected.emit(list.item_count - 1)
		await _settle()
		assert(view.read_state().identity == str(view._summaries.back().identity))
		list.ensure_current_is_visible()
		await _capture(entry[0].replace(".", "-"))


func _battles() -> void:
	var view = await _route("combat.battles")
	var list: ItemList = view.get_node("%BattleRecordList")
	assert(list.item_count == 150 and view._palette_rows.size() == 60)
	list.select(149); list.item_selected.emit(149); await _settle()
	assert(view.current_selection() == 149)
	list.ensure_current_is_visible()
	var palette = view.get_node("%MonsterPalette")
	palette._choose(59); await _settle()
	assert(view.read_state().brush == 60 and palette.get_selected_items() == PackedInt32Array([59]))
	assert(not view.get_node("%PaletteNext").visible)
	await _capture("battles")


func _spells() -> void:
	var view = await _route("rules.spells")
	assert(view.catalog_query().class == 1)
	var list: ItemList = view.get_node("%SpellRecordList")
	assert(list.item_count > 64 and list.item_count == view._total)
	list.select(0); list.item_selected.emit(0); await _settle()
	assert(int(view.selected_definition().classicId) / 1000 == 1)
	await _capture("spells-sorcerer")
	var filter: OptionButton = view.get_node("%SpellClassFilter")
	filter.select(2); filter.item_selected.emit(2); await _settle()
	assert(view.catalog_query().class == 2 and list.item_count == view._total)
	assert(view._rows.all(func(row): return int(row.classicId) / 1000 == 2))
	if list.item_count > 0:
		list.select(list.item_count - 1); list.item_selected.emit(list.item_count - 1); await _settle()
		assert(int(view.selected_definition().classicId) / 1000 == 2)
	await _capture("spells-priest")
	var priest_identity := str(view._rows.back().identity)
	filter.select(1); filter.item_selected.emit(1); await _settle()
	var linked: Dictionary = await view.open_handler.call(priest_identity)
	assert(linked.ok and view.catalog_query().class == 2 and list.item_count == view._total)
	filter.select(0); filter.item_selected.emit(0); await _settle()
	assert(view.catalog_query().class == 0 and list.item_count > 128 and list.item_count == view._total)
	filter.select(1); filter.item_selected.emit(1); await _settle()


func _economy() -> void:
	for identity in ["economy.items", "economy.treasure", "economy.shops", "economy.items"]:
		var view = await _route(identity)
		var navigation = view.get_node("EconomyNavigation")
		if identity in ["economy.treasure", "economy.shops"]:
			assert(_shell._inspector_panel.get_node("%InspectorIdentity").text == str(view.current_record().identity))
		for name in navigation.ROUTES:
			assert(navigation.get_node(name).button_pressed == (navigation.ROUTES[name] == identity))
		if identity == "economy.items":
			var collection = view.get_node("%ItemCollection")
			assert(collection.item_count == view._total and collection.item_count >= 799)
			assert(collection.get_child_count() > 0 and collection.get_child_count() < 30)
			var tail: int = collection.item_count - 1
			collection.select(tail); collection.ensure_current_is_visible(); await _settle()
			assert(collection._active.has(tail))
			collection._active[tail].pressed.emit(); await _settle()
			assert(int(view.selected_definition().classicId) == int(view._items.back().classicId))
		await _capture(identity.replace(".", "-"))
	await _economy_cancel()


func _economy_cancel() -> void:
	var view = await _route("economy.treasure")
	view.get_node("%Gold").text = "42"
	view.get_node("%Gold").text_changed.emit("42")
	assert(view.has_unapplied_changes())
	var navigation = view.get_node("EconomyNavigation")
	navigation.get_node("ItemsTab").button_pressed = true
	navigation.get_node("ItemsTab").pressed.emit(); await _settle()
	var dialog: ConfirmationDialog = _shell.get_node("UnappliedChangesDialog")
	assert(dialog.visible)
	dialog.get_cancel_button().pressed.emit(); await _settle()
	assert(_shell._documents.identity_for_tab(_shell._document_tabs.current_tab) == "economy.treasure")
	assert(navigation.get_node("TreasureTab").button_pressed and not navigation.get_node("ItemsTab").button_pressed)
	assert(view.has_unapplied_changes()); view.discard_draft()


func _capture(name: String) -> void:
	if _capture_root.is_empty(): return
	DirAccess.make_dir_recursive_absolute(_capture_root)
	await process_frame; await RenderingServer.frame_post_draw
	var path := _capture_root.path_join("%s-%dx%d.png" % [name, root.size.x, root.size.y])
	assert(root.get_texture().get_image().save_png(path) == OK)
