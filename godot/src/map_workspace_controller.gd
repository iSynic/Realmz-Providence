extends RefCounted

signal projection_applied(projection: Dictionary)
signal status_changed(message: String)
signal failed(message: String)
signal selection_changed
signal catalog_changed(maps: Array)
signal title_changed(title: String)
signal inspector_visibility_requested(visible: bool)
signal assets_requested

var document := preload("res://src/map_document_controller.gd").new()
var references := preload("res://src/map_inspector_controller.gd").new()
var lifecycle := preload("res://src/map_lifecycle_controller.gd").new()
var paint := preload("res://src/map_paint_controller.gd").new()
var settings := preload("res://src/level_settings_controller.gd").new()
var regions := preload("res://src/random_region_controller.gd").new()
var land_authoring := preload("res://src/land_authoring_controller.gd").new()
var paint_resources := preload("res://src/paint_resource_controller.gd").new()
var dungeon_stamps := preload("res://src/dungeon_stamp_controller.gd").new()
var tile_catalog := preload("res://src/land_tile_catalog_controller.gd").new()
var tile_behavior := preload("res://src/tile_behavior_controller.gd").new()
var cell_behavior := preload("res://src/land_cell_behavior_controller.gd").new()
var custom_landlooks := preload("res://src/custom_landlook_controller.gd").new()
var smart_terrain := preload("res://src/smart_terrain_controller.gd").new()
var magic_brush := preload("res://src/magic_brush_controller.gd").new()
var terrain_mapping := preload("res://src/terrain_mapping_controller.gd").new()
var special_placement := preload("res://src/land_special_placement.gd").new()
var ap_placement := preload("res://src/map_ap_placement_controller.gd").new()
var world_special := preload("res://src/world_special_catalog_controller.gd").new()
var chrome := preload("res://src/map_workspace_chrome.gd").new()
var mode := "select"
var _registry
var _operations: ProvidenceEditorOperation
var _land: ProvidenceLandEditor
var _inspector: ProvidenceMapInspector
var _sidebar
var _inspector_host: Control
var _record_inspector: Control
var _dialog_owner: Node
var _navigation
var _scripts
var _messages
var _read_context: Callable
var _accept: Callable
var _accept_draft: Callable


func initialize(registry, operations: ProvidenceEditorOperation, inspector: ProvidenceMapInspector, sidebar, inspector_host: Control, record_inspector: Control, dialog_owner: Node) -> void:
	_registry = registry
	_operations = operations
	_land = registry.view("maps.land")
	_inspector = inspector
	_sidebar = sidebar
	_inspector_host = inspector_host
	_record_inspector = record_inspector
	_dialog_owner = dialog_owner
	document.initialize(_land, registry.view("maps.dungeon"), inspector, sidebar, operations)
	document.catalog_changed.connect(catalog_changed.emit)
	document.document_opened.connect(_document_opened)
	document.document_cleared.connect(_document_cleared)
	document.status_changed.connect(status_changed.emit)
	document.failed.connect(failed.emit)
	for route in ["maps.land", "maps.dungeon"]:
		registry.register_controller(route, preload("res://src/workbench_controller.gd").new(
			route, registry.view(route), document.refresh_history, Callable(), true))
	_sidebar.tool_selected.connect(set_tool_mode)
	_inspector.collapse_requested.connect(collapse_inspector)
	_inspector.commit_tile_requested.connect(paint.commit_cell)
	_inspector.open_action_point_requested.connect(open_action_point)
	_inspector.open_reference_requested.connect(open_reference)
	_inspector.mode_selected.connect(set_tool_mode)
	_inspector.tool_requested.connect(_open_cell_tool)
	_land.script_authoring_requested.connect(_open_cell_script)
	_land.section_requested.connect(_open_land_section)
	for sections in [_registry.view("maps.dungeon").get_node("%WorldSections"), _registry.view("maps.layout").get_node("%WorldSections"), _registry.view("maps.special-land").get_node("%WorldSpecialCatalog").get_node("%WorldSections")]:
		sections.section_requested.connect(_open_land_section)
	_registry.view("maps.dungeon").script_authoring_requested.connect(_open_cell_script)


func configure_commands(read_context: Callable, read_references: Callable, accept_response: Callable, accept_draft: Callable, navigation, scripts, messages) -> void:
	_read_context = read_context
	_accept = accept_response
	_accept_draft = accept_draft
	_navigation = navigation
	cell_behavior.initialize(_dialog_owner,document,_operations,read_context,accept_draft,_inspector.get_node("%CellBehavior"),_cell_presentation)
	cell_behavior.view.script_requested.connect(_open_details_script)
	cell_behavior.view.advanced_requested.connect(func(): cell_behavior.discard_draft(); paint.workspace.show_technical_details())
	cell_behavior.projection_applied.connect(projection_applied.emit)
	cell_behavior.failed.connect(failed.emit)
	selection_changed.connect(cell_behavior.selection_changed)
	_inspector.get_node("%CellBehavior").pressed.connect(func(): _navigation.request_authoring_navigation(cell_behavior.open,"opening cell behavior"))
	paint.workspace.authoring_cell_requested.connect(func(): _navigation.request_authoring_navigation(cell_behavior.open.bind(_land.get_node("PaintSelectionContext/CellDetails")), "opening Cell Details"))
	_scripts = scripts
	_messages = messages
	references.initialize(_inspector, document, _operations, read_context, read_references)
	references.projection_applied.connect(projection_applied.emit)
	references.status_changed.connect(status_changed.emit)
	references.failed.connect(failed.emit)
	lifecycle.initialize(document, _operations, read_context, navigation.show_created_map)
	lifecycle.initialize_review(_dialog_owner, _sidebar)
	lifecycle.projection_applied.connect(projection_applied.emit)
	lifecycle.status_changed.connect(status_changed.emit)
	lifecycle.failed.connect(failed.emit)
	settings.initialize(_dialog_owner, document, _operations, _accept_draft, _sidebar.get_node("%LevelSetup"), _sidebar.get_node("%ReconcileLevelSettings"))
	settings.projection_applied.connect(projection_applied.emit)
	settings.failed.connect(failed.emit)
	_sidebar.get_node("%LevelSetup").pressed.connect(open_level_settings)
	regions.initialize(_inspector_host, document, _operations, _land, _registry.view("maps.dungeon"), _accept_draft, _navigation.request_authoring_navigation, _sidebar.get_node("%RandomAreaTool"), _navigation.open_script_target)
	regions.projection_applied.connect(projection_applied.emit)
	regions.failed.connect(failed.emit)
	regions.active_changed.connect(_region_active_changed)
	_sidebar.get_node("%RandomAreaTool").pressed.connect(open_regions)
	_registry.view("maps.dungeon").random_rectangles_requested.connect(func(_identity): open_regions())
	document.region_requested.connect(func(slot): await regions.open(slot))


func attach_session(bridge: RefCounted) -> void:
	document.attach_session(bridge)
	references.attach_session(bridge)
	lifecycle.attach_session(bridge)
	settings.attach_session(bridge)
	regions.attach_session(bridge)
	paint.configure_commands(bridge, _operations, paint_context, _accept, _accept_draft)
	land_authoring.attach_session(bridge)
	paint_resources.attach_session(bridge)
	dungeon_stamps.attach_session(bridge)
	tile_catalog.attach_session(bridge)
	tile_behavior.attach_session(bridge)
	cell_behavior.attach_session(bridge)
	custom_landlooks.attach_session(bridge)
	smart_terrain.attach_session(bridge)
	magic_brush.attach_session(bridge)
	terrain_mapping.attach_session(bridge)
	special_placement.attach_session(bridge)
	world_special.attach_session(bridge)
	ap_placement.attach_session(bridge)


func initialize_paint() -> void:
	paint.connect_editor(_land, _inspector)
	paint.projection_applied.connect(projection_applied.emit)
	paint.status_changed.connect(status_changed.emit)
	paint.cell_committed.connect(_cell_committed)
	var workspace = paint.workspace
	workspace.assets_requested.connect(assets_requested.emit)
	workspace.tool_mode_requested.connect(set_tool_mode)
	workspace.status_changed.connect(status_changed.emit)
	workspace.availability_changed.connect(present_paint_workspace)
	workspace.initialize(_land, _inspector, _inspector_host, _dialog_owner)
	tile_catalog.initialize(document, _land, workspace.tiles_dock)
	tile_behavior.initialize(_dialog_owner, document, _land, workspace.tiles_dock, _operations, paint_context, _accept_draft, _navigation.request_authoring_navigation, _navigation.open_script_target)
	tile_behavior.projection_applied.connect(projection_applied.emit)
	tile_behavior.failed.connect(failed.emit)
	custom_landlooks.initialize(_dialog_owner, document, workspace.tiles_dock, _operations, paint_context, _accept_draft, _navigation.request_authoring_navigation, _open_current_tile_behavior)
	custom_landlooks.projection_applied.connect(projection_applied.emit)
	custom_landlooks.failed.connect(failed.emit)
	land_authoring.initialize(_land, document, _operations, self, _dialog_owner, _navigation.request_authoring_navigation, _accept_draft)
	land_authoring.projection_applied.connect(projection_applied.emit)
	land_authoring.status_changed.connect(status_changed.emit)
	land_authoring.failed.connect(failed.emit)
	smart_terrain.initialize(_dialog_owner, document, _land, land_authoring, _operations, paint_context, _accept_draft, _navigation.request_authoring_navigation)
	smart_terrain.projection_applied.connect(projection_applied.emit)
	smart_terrain.failed.connect(failed.emit)
	magic_brush.initialize(_dialog_owner,document,_land,land_authoring,_operations,paint_context,_accept_draft,workspace.tiles_dock.tile_description,_sidebar.get_node("%MagicTool"))
	magic_brush.projection_applied.connect(projection_applied.emit)
	magic_brush.failed.connect(failed.emit)
	terrain_mapping.initialize(_dialog_owner, document, _land, _sidebar, _operations, paint_context, _accept_draft, _navigation.request_authoring_navigation)
	terrain_mapping.projection_applied.connect(projection_applied.emit)
	terrain_mapping.failed.connect(failed.emit)
	paint_resources.initialize(_dialog_owner, self, workspace.tiles_dock, _land, _registry.view("maps.dungeon"), _operations, _navigation.open_script_target)
	special_placement.initialize(_dialog_owner,self,_operations,_navigation.open_script_target)
	special_placement.failed.connect(failed.emit)
	special_placement.projection_applied.connect(projection_applied.emit)
	world_special.initialize(_registry.view("maps.special-land").get_node("%WorldSpecialCatalog"),self,_operations,_navigation.select_route)
	world_special.failed.connect(failed.emit)
	world_special.projection_applied.connect(projection_applied.emit)
	paint_resources.failed.connect(failed.emit)
	paint_resources.resource_selected.connect(_use_paint_resource)
	dungeon_stamps.initialize(_dialog_owner, _registry.view("maps.dungeon"), document, _operations, _read_context, _accept_draft)
	dungeon_stamps.projection_applied.connect(projection_applied.emit)
	dungeon_stamps.failed.connect(failed.emit)
	chrome.initialize(_sidebar, _land, _registry.view("maps.dungeon"), _inspector_host, _inspector, document, paint, smart_terrain, magic_brush, regions, _navigation.request_authoring_navigation, open_level_settings, _open_land_section, _open_cell_tool); chrome.bind_stamps(land_authoring, dungeon_stamps)
	initialize_map_placement()
	present_paint_workspace()


func initialize_map_placement() -> void:
	ap_placement.initialize(_dialog_owner,self,_land,_registry.view("maps.dungeon"),_operations)
	ap_placement.projection_applied.connect(projection_applied.emit)
	ap_placement.failed.connect(failed.emit)
	chrome.mount_ap_placement()


func register_drafts(drafts) -> void:
	for route in ["maps.land", "maps.dungeon"]:
		drafts.register_editor(_registry.view(route), has_unapplied_changes, discard_draft, commit_selected)


func _open_current_tile_behavior() -> void:
	var brush: Dictionary = paint.workspace.tiles_dock.brush
	if not brush.is_empty(): await tile_behavior.open(int(brush.cells[0]))


func has_unapplied_changes() -> bool:
	if ap_placement.has_unapplied_changes(): return true
	if cell_behavior.has_unapplied_changes(): return true
	if lifecycle.has_unapplied_changes(): return true
	if smart_terrain.has_unapplied_changes(): return true
	if magic_brush.has_unapplied_changes(): return true
	if terrain_mapping.has_unapplied_changes(): return true
	if custom_landlooks.has_unapplied_changes(): return true
	if tile_behavior.has_unapplied_changes(): return true
	if dungeon_stamps.has_unapplied_changes(): return true
	if paint_resources.has_unapplied_changes(): return true
	if land_authoring.has_unapplied_changes(): return true
	if settings.has_unapplied_changes(): return true
	if regions.has_unapplied_changes(): return true
	if document.is_dungeon: return _registry.view("maps.dungeon").has_unapplied_changes()
	return document.selected_cell.x >= 0 and _inspector.tile_value() != document.original_tile


func discard_draft() -> void:
	ap_placement.discard_draft()
	cell_behavior.discard_draft()
	lifecycle.discard_draft()
	smart_terrain.discard_draft()
	magic_brush.discard_draft()
	terrain_mapping.discard_draft()
	custom_landlooks.discard_draft()
	tile_behavior.discard_draft()
	dungeon_stamps.discard_draft()
	paint_resources.discard_draft()
	land_authoring.discard_draft()
	settings.discard_draft()
	regions.discard_draft()
	if document.is_dungeon: _registry.view("maps.dungeon").discard_draft()
	else: _inspector.set_tile_value(document.original_tile)


func commit_selected() -> Dictionary:
	if ap_placement.has_unapplied_changes(): return await ap_placement.commit_selected()
	if cell_behavior.has_unapplied_changes(): return await cell_behavior.commit_selected()
	if lifecycle.has_unapplied_changes(): return await lifecycle.commit_selected()
	if smart_terrain.has_unapplied_changes(): return await smart_terrain.commit_selected()
	if magic_brush.has_unapplied_changes(): return await magic_brush.commit_selected()
	if terrain_mapping.has_unapplied_changes(): return await terrain_mapping.commit_selected()
	if custom_landlooks.has_unapplied_changes(): return await custom_landlooks.commit_selected()
	if tile_behavior.has_unapplied_changes(): return await tile_behavior.commit_selected()
	if dungeon_stamps.has_unapplied_changes(): return await dungeon_stamps.commit_selected()
	if paint_resources.has_unapplied_changes(): return await paint_resources.commit_selected()
	if land_authoring.has_unapplied_changes(): return await land_authoring.commit_selected()
	if settings.has_unapplied_changes(): return await settings.commit_selected()
	if regions.has_unapplied_changes(): return await regions.commit_selected()
	if document.is_dungeon: return await _registry.view("maps.dungeon").commit_selected()
	await paint.commit_cell()
	return {}


func open_level_settings() -> void:
	if settings.has_unapplied_changes(): await settings.open()
	else: await _navigation.request_authoring_navigation(settings.open, "opening level setup")


func _open_land_section(section: String) -> void:
	match section:
		"Canvas": await _navigation.select_route("maps.dungeon" if document.is_dungeon else "maps.land")
		"LandLayout": await _navigation.select_route("maps.layout")
		"LandTiles": await _navigation.open_special_land(true)
		"RandomEncounters": await _navigation.request_authoring_navigation(_show_region_canvas, "opening Random Areas")


func _show_region_canvas() -> void:
	if document.identity.is_empty(): return
	await _navigation.select_route("maps.dungeon" if document.is_dungeon else "maps.land")
	await open_regions()


func _open_cell_tool(tool: String) -> void:
	paint.workspace.close_details()
	match tool:
		"smart": await _navigation.request_authoring_navigation(smart_terrain.open, "opening Smart terrain")
		"stamp": await _navigation.request_authoring_navigation(paint_resources.open.bind("stamp"), "opening saved stamps")
		_: paint.workspace.set_tool("shapes")


func set_tool_mode(next: String) -> void:
	mode = next if next in ["select", "paint"] else "select"
	if mode == "paint" and document.is_dungeon: mode = "select"
	_sidebar.set_tool_mode(mode)
	_inspector.set_mode(mode)
	_land.set_interaction_mode(mode)
	paint.workspace.present_mode(mode)
	present_paint_workspace()


func open_regions() -> void:
	if regions.active: return
	await _navigation.request_authoring_navigation(regions.open, "opening encounter regions")


func _region_active_changed(active: bool) -> void:
	_registry.view("maps.dungeon").set_region_editor_active(active and document.is_dungeon)
	if active:
		set_tool_mode("select")
		land_authoring.suspend()
		_inspector.hide(); _record_inspector.hide()
		inspector_visibility_requested.emit(true)
	else: present_paint_workspace()
	if is_instance_valid(chrome.land_inspector): chrome.present(true, bool(_read_context.call().connected), paint.workspace.can_paint())


func present_paint_workspace() -> void:
	if _land == null or _inspector == null: return
	var active: bool = _registry.view("maps.land").visible and not document.is_dungeon and not regions.active
	var context: Dictionary = _read_context.call()
	paint.workspace.set_environment(active, bool(context.connected), document.is_dungeon)
	if is_instance_valid(chrome.land_inspector): chrome.present(_land.visible or _registry.view("maps.dungeon").visible, bool(context.connected), paint.workspace.can_paint())
	_land.set_authoring_context(not document.identity.is_empty() and bool(context.connected) and not document.is_dungeon, document.selected_cell.x >= 0)
	if is_instance_valid(paint.workspace.tiles_dock):
		paint.workspace.tiles_dock.set_map_context(not document.identity.is_empty() and bool(context.connected) and not document.is_dungeon)
	for sections in [_registry.view("maps.dungeon").get_node("%WorldSections"), _registry.view("maps.layout").get_node("%WorldSections"), _registry.view("maps.special-land").get_node("%WorldSpecialCatalog").get_node("%WorldSections")]:
		sections.set_context(not document.identity.is_empty() and bool(context.connected))
	if active:
		if _inspector.get_parent() == _inspector_host: _inspector.hide()
		_record_inspector.hide()


func paint_context() -> Dictionary:
	var context: Dictionary = _read_context.call()
	return {"identity": document.identity, "revision": context.revision,
		"connected": context.connected and not _operations.busy,
		"active": _land.visible and not regions.active, "dungeon": document.is_dungeon, "mode": mode,
		"cell": document.selected_cell, "originalTile": document.original_tile}


func select_cell(x: int, y: int, tile: int, action_point: Dictionary) -> void:
	_land.set_script_destination(true,not action_point.is_empty())
	document.select_cell(x, y, tile, action_point)
	_land.set_authoring_context(not document.identity.is_empty() and bool(_read_context.call().connected), x >= 0)
	references.select_cell()
	selection_changed.emit()


func select_dungeon_cell(x: int, y: int, tile: int, action_point: Dictionary) -> void:
	_registry.view("maps.dungeon").set_script_destination(true,not action_point.is_empty())
	document.select_cell(x, y, tile, action_point)
	selection_changed.emit()


func _cell_committed(tile: int) -> void:
	select_cell(document.selected_cell.x, document.selected_cell.y, tile, document.selected_action_point)


func _document_opened(_map: Dictionary, reset_selection: bool) -> void:
	title_changed.emit("  WORLD  /  %s" % ("DUNGEON EDITOR" if document.is_dungeon else "LAND EDITOR"))
	_navigation.sync_selection()
	if reset_selection:
		_land.set_script_destination(false,false); _registry.view("maps.dungeon").set_script_destination(false,false)
		set_tool_mode("select")
		references.show_overview()
	selection_changed.emit()


func _document_cleared() -> void:
	_land.set_script_destination(false,false); _registry.view("maps.dungeon").set_script_destination(false,false)
	references.show_overview()
	_registry.view("scripts.action-points").set_summaries({"items": [], "total": 0}, int(_read_context.call().revision))
	set_tool_mode("select")
	selection_changed.emit()


func collapse_inspector() -> void:
	if paint.workspace.close_details(): return
	chrome.collapse()


func focus_search() -> void:
	_sidebar.open_map_picker()


func open_action_point(identity: String) -> void:
	if identity.is_empty() or _operations.busy: return
	await _navigation.open_script_target("same-map-action-point",0,identity,{})


func _open_cell_script() -> void:
	if document.identity.is_empty() or document.selected_cell.x<0: return
	if not document.selected_action_point.is_empty(): await open_action_point(str(document.selected_action_point.identity)); return
	var cell := document.selected_cell
	await _navigation.open_script_target("new-action-point",0,"",{"mapIdentity":document.identity,"x":cell.x,"y":cell.y})


func _open_details_script() -> void:
	cell_behavior.discard_draft()
	await _open_cell_script()


func _cell_presentation() -> Dictionary:
	var result := _land.cell_artwork(document.selected_cell)
	result.caption = tile_catalog.label_for_tile(int(result.get("tile", 0)))
	result.actionPoint = document.selected_action_point.duplicate(true)
	for map: Dictionary in document.maps:
		if str(map.identity) == document.identity: result.mapName = str(map.name); break
	return result


func open_reference(reference: Dictionary) -> void:
	if _operations.busy: return
	var kind := str(reference.get("targetKind", ""))
	var target := str(reference.get("targetId", ""))
	var native_id := target.get_slice(":", target.get_slice_count(":") - 1).to_int()
	match kind:
		"message": _messages.open_native(native_id)
		"simple-encounter": await _scripts.open_simple_encounter_by_native_id(native_id)
		"extra-action-point":
			await _navigation.select_route("scripts.macros")
			await _scripts.open_extra_action_point_by_native_id(native_id)
		"action-point": await open_action_point(target)
		"map": await _navigation.open_map(target)
		_: status_changed.emit("%s does not have a migrated document route yet" % target)


func select_special_land(resource_id: int) -> void:
	if _operations.busy: return
	_navigation.special_land_world_context = true
	await _navigation.select_route("maps.land")
	special_placement.choose_for_draft(resource_id,"Place Special Land %d on %s" % [resource_id,document.identity],paint.workspace.tiles_dock.ui.special,special_placement.select_placement)


func reveal_coordinate(identity: String, x: int, y: int) -> void:
	if _operations.busy: return
	await document.load_map(identity)
	await _navigation.select_route("maps.land")
	_land.select_cell(x, y)


func use_special_land(choice: Dictionary, origin: String) -> void:
	if document.identity!=origin or document.is_dungeon or _operations.busy: return
	await _navigation.select_route("maps.land")
	if document.identity==origin: special_placement.select_placement(choice)


func open_special_reference(choice: Dictionary) -> void:
	await _navigation.open_script_target("map-tile",int(choice.value),str(choice.targetIdentity),
		{"targetStatus":"application-resource" if choice.ownership=="stock" else "compatibility-resource","levelType":"land"})


func teardown() -> void:
	ap_placement.attach_session(null)
	world_special.attach_session(null)
	special_placement.attach_session(null)
	cell_behavior.attach_session(null)
	smart_terrain.attach_session(null)
	terrain_mapping.attach_session(null)
	custom_landlooks.attach_session(null)
	tile_behavior.attach_session(null)
	tile_catalog.attach_session(null)
	dungeon_stamps.attach_session(null)
	paint_resources.attach_session(null)
	land_authoring.attach_session(null)
	document.teardown()
	references.teardown()
	lifecycle.teardown()
	settings.attach_session(null)
	regions.attach_session(null)


func dispose() -> void:
	ap_placement.dispose()
	chrome.dispose()
	world_special.dispose()
	special_placement.dispose()
	selection_changed.disconnect(cell_behavior.selection_changed); cell_behavior.dispose()
	smart_terrain.dispose()
	magic_brush.dispose()
	terrain_mapping.dispose()
	custom_landlooks.dispose()
	tile_behavior.dispose()
	tile_catalog.dispose()
	dungeon_stamps.dispose()
	paint_resources.dispose()
	land_authoring.dispose()
	regions.dispose()
	settings.dispose()
	references.dispose()
	lifecycle.dispose()
	paint.dispose()
	document.dispose()
	_read_context = Callable(); _accept = Callable(); _accept_draft = Callable()
	_navigation = null; _scripts = null; _messages = null
	_registry = null


func _use_paint_resource(resource: Dictionary, resource_revision: int, presentation: Dictionary = {}) -> void:
	if document.is_dungeon: dungeon_stamps.select_stamp(resource, resource_revision, presentation)
	elif resource.kind == "palette": paint.workspace.tiles_dock.use_saved_brush(resource)
	else: land_authoring.select_stamp(resource, resource_revision, presentation)
