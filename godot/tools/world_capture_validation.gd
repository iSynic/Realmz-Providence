extends RefCounted


static func verify(shell: Control, state: String, route: String) -> Dictionary:
	var actual: String = shell._documents.identity_for_tab(shell._document_tabs.current_tab)
	var view: Control = shell._document_tabs.get_current_tab_control()
	var gallery: Control = shell._maps.world_special._view
	if state == "resource-return":
		assert(view.get_meta("owns_asset_workspace",false), "Artwork return evidence must show the actual Assets destination.")
	elif state == "picker":
		assert(actual == "maps.land" and shell._maps.special_placement._picker.visible)
	elif route == "maps.special-land":
		assert(actual in ["maps.special-land","assets.special-land"] and gallery.is_visible_in_tree() and shell._navigation.special_land_world_context)
		assert(shell._maps.document.identity == "land:0", "World gallery lost its intended Land destination.")
	else: assert(actual == route, "Capture route mismatch: " + state + " -> " + actual)
	if actual in ["maps.land","maps.dungeon","maps.layout"] or gallery.is_visible_in_tree():
		assert(not shell._map_context_sidebar.get_node("MapToolset").is_visible_in_tree(), "World retained the obsolete shared tool scaffold.")
	if state == "cell":
		var cell: Vector2i = shell._maps.document.selected_cell
		var details: Window = shell._maps.cell_behavior.view
		assert(details.visible and int(details.context.x) == cell.x and int(details.context.y) == cell.y)
		assert(details.get_node("%CellArtwork").texture != null and details.get_node("%OpenCellActionPoint").is_visible_in_tree())
		assert(details.get_node("%SecretNormal").is_visible_in_tree() and details.get_node("%CreateCellActionPoint").is_visible_in_tree())
	_land_actions(shell, state)
	if state in ["dungeon","mixed","managed"]: _dungeon(shell)
	if state == "missing-art":
		assert(not shell._maps.paint.workspace.tiles_dock.is_available() and not shell._maps.paint.workspace.can_paint())
		assert(shell._workbenches.land.get_node("%LandMapCanvas")._atlas_texture == null and shell._workbenches.land.get_node("PaintTools/Brush").disabled)
	if state == "layout-empty":
		for name: String in ["NorthNeighbor","EastNeighbor","SouthNeighbor","WestNeighbor"]:
			var neighbor: Button = shell._workbenches.land_layout.get_node("%"+name)
			assert(neighbor.disabled and neighbor.get_meta("identity","").is_empty() and neighbor.icon == null)
	if state in ["mixed","managed"]:
		var dungeon: Control = shell._workbenches.dungeon
		var canvas: ProvidenceMapCanvas = dungeon.get_node("%DungeonMapCanvas")
		var selected: Vector2i = dungeon.selected_coordinate()
		assert(selected.x >= 0 and Rect2(Vector2.ZERO,canvas.size).encloses(canvas.cell_rect(selected)))
		if state == "mixed":
			assert(dungeon.draft.cells.size() > 1 and dungeon.draft.features.values().any(func(value): return value == null))
			assert(dungeon._dock.FIELDS.values().any(func(name): return dungeon._dock.get_node("%" + str(name)).text.contains("Mixed")))
		else: assert(int(canvas._tiles[selected.y*90+selected.x]) & 0x9060 != 0)
	if state == "layout":
		assert(not shell._map_context_sidebar.get_node("CurrentMapPanel").is_visible_in_tree() and not shell._map_context_sidebar.get_node("%LevelSetup").is_visible_in_tree())
		assert(shell._command_bar.command_title.text.to_lower().contains("layout"))
		assert(shell._workbenches.land_layout._cells.size() == 128 and shell._workbenches.land_layout._cells.any(func(value): return int(value) != 0))
		assert(shell._workbenches.land_layout.get_node("%NorthNeighbor").icon != null)
	if state == "special-unavailable":
		assert(gallery._rows.size() == 1 and not gallery._rows[0].available)
		assert(gallery.get_node("%SpecialPlace").disabled and not gallery.get_node("%SpecialDetails").text.is_empty())
	var result := {"actualRoute":actual,"tab":shell._document_tabs.current_tab,"map":shell._maps.document.identity,"worldContext":shell._navigation.special_land_world_context}
	if actual in ["maps.land","maps.dungeon"]:
		var canvas: ProvidenceMapCanvas = view.get_node("%LandMapCanvas" if actual == "maps.land" else "%DungeonMapCanvas")
		result.canvas = canvas.read_navigation_state(); result.canvasBounds = [canvas.size.x,canvas.size.y]
		result.logicalCellSize = canvas.cell_rect(Vector2i.ZERO).size.x
	return result


static func _land_actions(shell: Control, state: String) -> void:
	if state == "selection":
		assert(shell._maps.land_authoring._selection_actions.visible and shell._maps.land_authoring.selected.size() > 1)
	if state == "bounds-error":
		var review: Window = shell._maps.land_authoring._review
		assert(review.visible and review.get_node("%ReviewHeading").text == "INVALID STAMP BOUNDS" and review.get_node("%ApplyArea").disabled)
	if state == "empty":
		assert(shell._maps.document.identity.is_empty())
		var land: Control = shell._workbenches.land
		for path in ["MapSectionTabs/RandomEncountersSection", "MapViewFilters/MapOverlayButton", "PaintTools/SmartTerrain", "PaintSelectionContext/CellDetails"]: assert(land.get_node(path).disabled)
		assert(land.get_node("EmptyLandHint").is_visible_in_tree())
		assert(shell._maps.paint.workspace.tiles_dock.ui.customization.disabled and shell._maps.paint.workspace.tiles_dock.ui.special.disabled)
		assert(shell._maps.paint.workspace.tiles_dock.ui.tabs.Stamps.disabled and shell._maps.paint.workspace.tiles_dock.ui.tabs.Saved.disabled)


static func _dungeon(shell: Control) -> void:
	var view: Control = shell._workbenches.dungeon
	var canvas: ProvidenceMapCanvas = view.get_node("%DungeonMapCanvas")
	assert(int(view.atlas_projection.tileWidth) == 32 and int(view.atlas_projection.columns) == 20)
	assert(canvas._atlas_texture.get_size() == Vector2(64,64) and canvas._atlas_tile_size == Vector2i(16,16))
	for feature: String in ["Wall","HorizontalDoor","VerticalDoor","Stairs","Column","Archway"]:
		assert(view._dock.get_node("%"+feature+"Preview").texture != null)
	assert(not shell._inspector_panel.is_visible_in_tree(), "Dungeon must use its owning feature dock.")
