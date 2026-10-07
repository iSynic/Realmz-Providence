extends RefCounted


func run(shell: Control, check: Callable, settle: Callable, mutate: Callable) -> void:
	var land: Control = shell._workbenches.land
	land.select_cell(12, 11); await settle.call(shell)
	land.get_node("PaintSelectionContext/CellDetails").pressed.emit(); await settle.call(shell)
	await preload("res://tools/world_cell_authoring_checks.gd").new().run(shell, check, settle)
	check.call(shell._map_inspector.get_node("%SelectedCoordinate").text == "CELL 12, 11", "Cell Details lost its actual selected cell.")
	check.call(shell._map_inspector.find_child("GrowSelection", true, false) == null, "Cell Details retained obsolete disabled scaffolding.")
	shell._map_inspector.get_node("%CellSelectionOptions").pressed.emit(); await settle.call(shell)
	check.call(shell._maps.land_authoring._options.visible and not shell._maps.paint.workspace._details.visible, "Cell options did not reach their working owner.")
	shell._maps.land_authoring._options.close()
	await preload("res://tools/world_selection_action_checks.gd").new().run(shell, check, settle)
	land.select_cell(12,11); await settle.call(shell)
	land.get_node("MapSectionTabs/RandomEncountersSection").pressed.emit(); await settle.call(shell)
	check.call(shell._maps.regions.active, "Visible Random Areas section did not open its spatial editor.")
	shell._maps.regions.close(); await settle.call(shell)
	land.get_node("MapSectionTabs/LandLayoutSection").pressed.emit(); await settle.call(shell)
	check.call(shell._documents.identity_for_tab(shell._document_tabs.current_tab) == "maps.layout", "Visible Land Layout section did not navigate.")
	check.call(not shell._inspector_panel.is_visible_in_tree(), "World Layout retained a stale global Inspector.")
	check.call(not shell._map_context_sidebar.get_node("MapToolset").is_visible_in_tree() and not shell._map_context_sidebar.get_node("%LevelSetup").is_visible_in_tree(), "Layout exposed controls for a different map.")
	await shell._navigation.navigate_back(); await settle.call(shell)
	check.call(shell._maps.document.selected_cell == Vector2i(12, 11), "Back from Layout lost the originating cell.")
	land.get_node("MapSectionTabs/LandTilesSection").pressed.emit(); await settle.call(shell)
	var gallery: Control = shell._maps.world_special._view
	check.call(gallery.is_visible_in_tree() and shell._navigation.special_land_world_context, "Visible Special Tiles section opened Media instead of World.")
	check.call(not shell._map_context_sidebar.get_node("CurrentMapPanel").is_visible_in_tree(), "Special Tiles exposed the last map as its active document.")
	await _context_guards(shell, gallery, check, settle)
	await _stock_return(shell, gallery, check, settle)
	await _route_transitions(shell, check, settle, mutate)
	print("PROVIDENCE_WORLD_NAVIGATION_OK visible-sections cell-options shared-context-public-entrypoints cancel-keeps-draft stock-open-back exact-focus")


func _route_transitions(shell: Control, check: Callable, settle: Callable, mutate: Callable) -> void:
	while shell._operations.busy: await shell.get_tree().process_frame
	await shell._navigation.select_route("maps.land"); await settle.call(shell)
	while shell._operations.busy: await shell.get_tree().process_frame
	if not shell._maps.document.maps.any(func(map): return map.levelType == "dungeon"):
		check.call(mutate.call(shell, "map.create", {"levelType":"dungeon"}), "Transition fixture could not create a Dungeon.")
		await shell._reload_map_catalog(); await settle.call(shell)
	await shell._navigation.select_route("scripts.action-points"); await settle.call(shell)
	await shell._navigation.open_map("dungeon:0"); await settle.call(shell)
	check.call(not shell._inspector_panel.is_visible_in_tree() and shell._workbenches.dungeon.is_visible_in_tree(), "AP to Dungeon retained the global Inspector.")
	shell._workbenches.dungeon.get_node("%WorldSections/LandLayout").pressed.emit(); await settle.call(shell)
	check.call(not shell._inspector_panel.is_visible_in_tree(), "Dungeon to Layout retained the global Inspector.")
	shell._workbenches.land_layout.get_node("%WorldSections/LandTiles").pressed.emit(); await settle.call(shell)
	var gallery: Control = shell._maps.world_special._view
	check.call(gallery.is_visible_in_tree(), "Visible Layout section did not open Special Tiles.")
	gallery.get_node("%WorldSections/RandomEncounters").pressed.emit(); await settle.call(shell)
	check.call(shell._maps.regions.active and shell._workbenches.dungeon.is_visible_in_tree(), "Special Tiles Random Areas did not restore its owning Dungeon canvas.")
	shell._maps.regions.close(); await settle.call(shell)
	shell._workbenches.dungeon.get_node("%WorldSections/LandTiles").pressed.emit(); await settle.call(shell)
	gallery.get_node("%WorldSections/Canvas").pressed.emit(); await settle.call(shell)
	check.call(shell._documents.identity_for_tab(shell._document_tabs.current_tab) == "maps.dungeon", "Special Tiles Canvas did not restore the actual current map.")
	await shell._navigation.select_route("linter.issues"); await settle.call(shell)
	await shell._navigation.open_map("land:1"); await settle.call(shell)
	check.call(shell._maps.chrome.land_inspector.is_visible_in_tree() and (shell._maps.paint.workspace.tiles_dock.is_visible_in_tree() or shell._map_inspector.is_visible_in_tree()) and not shell._inspector_panel.is_visible_in_tree(), "Issues to World did not restore the owning palette.")
	print("PROVIDENCE_WORLD_TRANSITIONS_OK assets ap dungeon layout issues land owning-context")


func _context_guards(shell: Control, gallery: Control, check: Callable, settle: Callable) -> void:
	gallery.get_node("%SpecialImport").pressed.emit(); await settle.call(shell)
	var media: Control = shell._documents.view("assets.special-land")
	media._name.text += " draft"
	var kept: Dictionary = media.draft_metadata()
	await shell._navigation.open_special_land(true); await settle.call(shell)
	_assert_guard(shell, gallery, media, kept, check)
	shell._draft_navigation.cancel(); shell._unapplied_dialog.hide()
	shell._domain_navigation.configure_domain("maps")
	var route: Button
	for button: Button in shell._domain_navigation._route_buttons:
		if button.get_meta("route_id") == "maps.special-land": route = button
	assert(route != null)
	route.pressed.emit(); await settle.call(shell)
	_assert_guard(shell, gallery, media, kept, check)
	shell._draft_navigation.cancel(); shell._unapplied_dialog.hide()
	await shell._navigation.select_route("assets.special-land"); await settle.call(shell)
	check.call(not shell._unapplied_dialog.visible and media.draft_metadata() == kept, "Same-context selection altered a Media draft.")
	media.discard_draft()
	await shell._navigation.open_special_land(true); await settle.call(shell)
	check.call(gallery.is_visible_in_tree() and shell._command_bar.command_title.text.contains("WORLD"), "Accepted same-tab context change did not refresh presentation.")


func _assert_guard(shell: Control, gallery: Control, media: Control, kept: Dictionary, check: Callable) -> void:
	check.call(shell._unapplied_dialog.visible and not gallery.is_visible_in_tree() and not shell._navigation.special_land_world_context,
		"A public World/Media entrypoint bypassed the draft guard or changed context before acceptance.")
	check.call(media.has_unapplied_changes() and media.draft_metadata() == kept, "A rejected context switch changed the draft.")


func _stock_return(shell: Control, gallery: Control, check: Callable, settle: Callable) -> void:
	gallery.get_node("%SpecialSearch").text = "-90"
	gallery.get_node("%SpecialSearch").text_changed.emit("-90"); await settle.call(shell)
	check.call(gallery._rows.size() == 1 and gallery._rows[0].ownership == "stock", "Stock gallery query lost exact source ownership.")
	gallery.get_node("%SpecialGallery").select(0); gallery.get_node("%SpecialGallery").item_selected.emit(0); await settle.call(shell)
	gallery.get_node("%SpecialSearch").grab_focus()
	gallery.get_node("%SpecialOpen").pressed.emit(); await settle.call(shell)
	check.call(not gallery.is_visible_in_tree() and shell._navigation.can_go_back(), "Visible Stock Open artwork failed to leave World with a return location.")
	await shell._navigation.navigate_back(); await settle.call(shell)
	check.call(gallery.is_visible_in_tree() and gallery.get_node("%SpecialSearch").text == "-90" and int(gallery.selected_choice().get("value", 0)) == -90,
		"Stock artwork Back lost World context, query or signed selection.")
	check.call(gallery.get_node("%SpecialSearch").has_focus(), "Stock artwork Back did not restore focus.")
