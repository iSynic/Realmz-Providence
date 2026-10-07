extends RefCounted

var _shell: Control
var _save: Callable
var _settle: Callable


func initialize(shell: Control, save: Callable, settle: Callable) -> void:
	_shell = shell
	_save = save
	_settle = settle


func land_states(size: Vector2i) -> void:
	await _settle.call()
	await _shell._navigation.open_map("land:0")
	var maps = _shell._maps
	var author = maps.land_authoring
	maps.paint_resources.open("favorite")
	await _save.call("favorites","maps.land",size)
	maps.paint_resources.discard_draft()
	maps.paint_resources._window.dismiss()
	author._options.open(author.options,_shell._workbenches.land.get_node("%FillSelection"),"Land 0")
	await _save.call("paint-options","maps.land",size)
	author._options.close()
	var cells := [{"x":30,"y":30},{"x":31,"y":30},{"x":30,"y":31},{"x":31,"y":31}]
	author.options.shape = "rectangle"
	author.restore_selection(cells,"select")
	_shell._workbenches.land.get_node("%SelectionActions").pressed.emit()
	await _save.call("selection","maps.land",size)
	author._selection_actions.close()
	await author.review_selection("paint")
	await _save.call("region","maps.land",size)
	author.discard_draft()
	_shell._workbenches.land.select_cell(9,17); await _settle.call()
	_shell._workbenches.land.get_node("PaintSelectionContext/CellDetails").pressed.emit()
	await _save.call("cell","maps.land",size)
	maps.cell_behavior.discard_draft()
	await _settle.call()
	maps.paint_resources.open("stamp")
	await _save.call("stamps","maps.land",size)
	maps.paint_resources.discard_draft()
	maps.paint_resources._window.dismiss()
	await _stamp_bounds_state(size)
	await maps.smart_terrain.open()
	maps.smart_terrain.view.accept_mask(cells)
	await maps.smart_terrain.review()
	await _save.call("smart","maps.land",size)
	maps.smart_terrain.discard_draft()
	await _region_states(size)
	await _settings_states(size)
	await _artwork_states(size)
	await _cell_states(size)


func _region_states(size: Vector2i) -> void:
	var regions = _shell._maps.regions
	await regions.open(19)
	regions.view.stage_bounds(Rect2i(12,18,12,8))
	await _save.call("random","maps.land",size)
	regions.discard_draft()
	regions.close()
	await _settle.call()


func _stamp_bounds_state(size: Vector2i) -> void:
	var maps = _shell._maps
	var author = maps.land_authoring
	var cells: Array = []
	for y in range(30,33):
		for x in range(30,34): cells.append({"x":x,"y":y})
	author.restore_selection(cells,"select")
	await maps.paint_resources.capture_selection(_shell._workbenches.land.get_node("%SelectionActions"))
	var window: Window = maps.paint_resources._window
	window.get_node("%ResourceName").text = "Bounds preview stamp"
	assert((await maps.paint_resources.commit_selected()).ok)
	await _settle.call()
	window._use(); await _settle.call()
	var revision: int = _shell._session_view.revision
	_shell._workbenches.land.get_node("%LandMapCanvas").reveal_cell(88,89)
	author._begin_gesture(Vector2i(88,89))
	await author._gesture_finished(Vector2i(88,89),Vector2i(88,89),[Vector2i(88,89)])
	assert(_shell._session_view.revision == revision and author._review.visible)
	await _save.call("bounds-error","maps.land",size)
	author.discard_draft(); await _settle.call()


func _settings_states(size: Vector2i) -> void:
	var maps = _shell._maps
	await maps.settings.open()
	await _save.call("settings","maps.land",size)
	maps.settings.view.set_loading(true)
	await _save.call("loading","maps.land",size)
	maps.settings.view.set_loading(false)
	maps.settings.view.show_failure({"ok":false,"error":"Controlled write failure: the level draft is kept."})
	await _save.call("failure","maps.land",size)
	maps.settings.view.close()
	await maps.settings.open()
	maps.settings.view.get_node("%SettingsName").text += " draft"
	maps.settings.view.get_node("%SettingsName").text_changed.emit(maps.settings.view.get_node("%SettingsName").text)
	maps.settings.view.hide()
	_shell._draft_navigation.request(func(): pass,"opening another level")
	await _save.call("dirty","maps.land",size)
	_shell._draft_navigation.cancel()
	_shell._unapplied_dialog.hide()
	maps.settings.discard_draft()
	await _settle.call()
	await maps.lifecycle.review_duplicate_map("land:0")
	await _save.call("duplicate","maps.land",size)
	maps.lifecycle.discard_draft()
	await _settle.call()
	_shell._workbenches.land.select_cell(9,17)
	await _settle.call()
	await maps.cell_behavior.open(_shell._workbenches.land.get_node("PaintSelectionContext/CellDetails"))
	maps.cell_behavior.view.show_failure("Controlled lost read reply: check the connection before applying.",true)
	await _save.call("unknown","maps.land",size)
	maps.cell_behavior.discard_draft()
	maps.paint.workspace.close_details()
	await _settle.call()


func _artwork_states(size: Vector2i) -> void:
	var maps = _shell._maps
	await maps.custom_landlooks.open()
	await _save.call("landlook","maps.land",size)
	var window: Window = maps.custom_landlooks.view
	window.get_node("%Operation").select(1)
	window.get_node("%Operation").item_selected.emit(1)
	window.get_node("%ImportMode").select(2)
	window.get_node("%ImportMode").item_selected.emit(2)
	await _save.call("landlook-import","maps.land",size)
	maps.custom_landlooks.discard_draft()
	await _settle.call()
	await maps.custom_landlooks.open()
	window.get_node("%SourceTemplate").select(window.get_node("%SourceTemplate").get_item_index(0))
	window.get_node("%SourceTemplate").item_selected.emit(window.get_node("%SourceTemplate").selected)
	window.get_node("%Custom6").pressed.emit()
	window.get_node("%ReplaceCustom").button_pressed=true
	await _settle.call()
	var prepared: Dictionary = await maps.custom_landlooks.review()
	assert(prepared.ok)
	if window.review_is_current(): assert((await maps.custom_landlooks.apply_review()).ok)
	maps.custom_landlooks.discard_draft()
	await _settle.call()
	await maps.tile_behavior.open(147)
	await _save.call("tile-behavior","maps.land",size)
	maps.tile_behavior.discard_draft()


func _cell_states(size: Vector2i) -> void:
	var maps = _shell._maps
	var land: Control = _shell._workbenches.land
	var tiles: Array = land.get_node("%LandMapCanvas")._tiles
	for index in tiles.size():
		if int(tiles[index])<0:
			land.select_cell(index%90,index/90)
			break
	await _settle.call()
	await maps.cell_behavior.open(land.get_node("PaintSelectionContext/CellDetails"))
	maps.cell_behavior.view.get_node("%PlacementDetailsToggle").button_pressed = true
	await _save.call("special-cell","maps.land",size)
	maps.cell_behavior.discard_draft()
	maps.paint.workspace.close_details()
	await _settle.call()


func dungeon_layout_states(size: Vector2i) -> void:
	await _settle.call()
	await _shell._navigation.open_map("dungeon:0")
	await _settle.call()
	var view: Control = _shell._workbenches.dungeon
	await _mixed_selection(view)
	await _save.call("mixed","maps.dungeon",size)
	var tiles: Array = view.get_node("%DungeonMapCanvas")._tiles
	for index in tiles.size():
		if int(tiles[index])&0x9060:
			await _shell._workbenches.dungeon_cells.open_cell(index%90,index/90)
			view.get_node("%DungeonMapCanvas").reveal_cell(index%90,index/90)
			break
	await _save.call("managed","maps.dungeon",size)
	await _settle.call()
	await _shell._navigation.select_route("maps.layout")
	await _settle.call()
	await _shell._workbenches.layout_commands.set_cell(3,4,"land:0")
	await _save.call("layout-impact","maps.layout",size)
	_shell._workbenches.land_layout.get_node("%LayoutPlacementReview").cancel()
	var layout: Control = _shell._workbenches.land_layout
	var baseline: Dictionary = _shell._bridge.request("land-layout.open").result
	var malformed: Dictionary = baseline.duplicate(true)
	if malformed.get("layout")==null: malformed.layout={"cells":[]}
	malformed.layout.cells=malformed.layout.cells.duplicate(true)
	if malformed.layout.cells.is_empty(): malformed.layout.cells.resize(128); malformed.layout.cells.fill(-1)
	malformed.layout.cells[19]=120
	layout.set_projection(malformed)
	layout._show_selected(1,3)
	await _save.call("layout-missing","maps.layout",size)
	layout.set_projection(baseline)


func _mixed_selection(view: Control) -> void:
	var canvas: ProvidenceMapCanvas = view.get_node("%DungeonMapCanvas")
	var tiles: Array = canvas._tiles
	for index in tiles.size():
		var start := Vector2i(index % 90, index / 90)
		for offset in [Vector2i.RIGHT, Vector2i.DOWN]:
			var finish: Vector2i = start + offset
			if finish.x >= 90 or finish.y >= 90: continue
			if (int(tiles[index]) & 0x6f9f) == (int(tiles[finish.y * 90 + finish.x]) & 0x6f9f): continue
			var response: Dictionary = _shell._bridge.request("map.selection-preview", {"identity":"dungeon:0", "expectedRevision":_shell._session_view.revision,
				"selection":{"shape":"rectangle", "start":{"x":start.x,"y":start.y}, "end":{"x":finish.x,"y":finish.y}, "filled":true,"operation":"replace","current":[]}})
			assert(response.ok)
			view.accept_selection(response.result); canvas.reveal_cell(start.x,start.y)
			assert(view.draft.features.values().any(func(value): return value == null))
			return
	assert(false, "The capture corpus has no genuinely mixed Dungeon selection.")


func special_states(size: Vector2i) -> void:
	await _settle.call()
	await _shell._navigation.open_map("land:0"); await _settle.call()
	await _settle.call()
	await _shell._navigation.select_route("maps.special-land")
	await _settle.call()
	var catalog: Control = _shell._maps.world_special._view
	var choice: Dictionary = {}
	for index in catalog._rows.size():
		if catalog._rows[index].available and catalog._rows[index].ownership == "stock":
			catalog.get_node("%SpecialGallery").select(index)
			catalog.get_node("%SpecialGallery").item_selected.emit(index)
			await _settle.call()
			choice=catalog.selected_choice()
			break
	if not choice.is_empty():
		catalog.get_node("%SpecialSearch").grab_focus()
		catalog.get_node("%SpecialOpen").pressed.emit(); await _settle.call()
		await _save.call("resource-return","maps.special-land",size)
		await _settle.call()
		await _shell._navigation.navigate_back()
		await _settle.call()
		assert(catalog.is_visible_in_tree() and catalog.selected_choice().value == choice.value)
		assert(catalog.get_node("%SpecialSearch").has_focus())
	catalog.get_node("%SpecialUnavailable").set_pressed_no_signal(true)
	catalog._selected={"value":-30000,"identity":"special-land:-30000"}
	catalog.get_node("%SpecialSearch").text="-30000"
	catalog.query_requested.emit(0)
	await _settle.call()
	if not catalog._rows.is_empty():
		catalog.get_node("%SpecialGallery").select(0)
		catalog.get_node("%SpecialGallery").item_selected.emit(0)
	await _save.call("special-unavailable","maps.special-land",size)
	catalog.get_node("%SpecialUnavailable").set_pressed_no_signal(false)
	catalog.get_node("%SpecialSearch").clear()
	await _settle.call()
	await _shell._navigation.open_map("land:0")
	var dock: Control = _shell._maps.paint.workspace.tiles_dock
	var atlas: Dictionary = _shell._workbenches.land.atlas_projection.duplicate(true)
	_shell._maps.document.apply_atlas({"available":false,"reason":"Controlled missing exact map artwork. Resolve the owning asset before painting."})
	await _save.call("missing-art","maps.land",size)
	_shell._maps.document.apply_atlas(atlas)
