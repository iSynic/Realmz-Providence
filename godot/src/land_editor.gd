class_name ProvidenceLandEditor
extends VBoxContainer

signal cell_selected(x: int, y: int, tile: int, action_point: Dictionary)
signal action_point_placement_requested(cell: Vector2i, action_point: Dictionary)
signal placement_canceled
signal action_point_activated(identity: String)
signal paint_stroke_started
signal paint_stroke_changed(count: int)
signal paint_stroke_requested(cells: Array)
signal paint_stroke_cancelled
signal atlas_changed(projection: Dictionary)
signal paint_tool_requested(tool: String)
signal cell_details_requested
signal terrain_sample_requested(cell: Vector2i)
signal selection_restored(cells: Array, tool: String)
signal script_authoring_requested
signal section_requested(section: String)

@onready var _title: Label = %MapTitle
@onready var _zoom_label: Label = %MapZoom
@onready var _canvas: ProvidenceMapCanvas = %LandMapCanvas

var atlas_projection: Dictionary = {}
var document_identity := ""
var _paint_tools: Dictionary = {}


func _ready() -> void:
	%ExportMapImage.pressed.connect(func(): %MapImageExport.open(_canvas, document_identity.replace(":", "-")))
	_canvas.action_point_placement_requested.connect(action_point_placement_requested.emit)
	_canvas.placement_canceled.connect(placement_canceled.emit)
	for section: String in ["LandLayout", "LandTiles", "RandomEncounters"]:
		get_node("MapSectionTabs/" + section + "Section").pressed.connect(func(): section_requested.emit(section))
	%MapViewFilters.changed.connect(_view_changed)
	%RandomRegionOverlay.display_changed.connect(_region_display_changed)
	%RandomRegionOverlay.regions_changed.connect(_region_entries_changed)
	_canvas.paint_stroke_started.connect(func(): paint_stroke_started.emit())
	_canvas.paint_stroke_changed.connect(func(count: int): paint_stroke_changed.emit(count))
	_canvas.paint_stroke_requested.connect(func(cells: Array): paint_stroke_requested.emit(cells))
	_canvas.paint_stroke_cancelled.connect(func(): paint_stroke_cancelled.emit())
	_canvas.tile_sample_requested.connect(func(cell: Vector2i): terrain_sample_requested.emit(cell))
	$PaintSelectionContext/CellDetails.pressed.connect(func(): cell_details_requested.emit())
	$PaintSelectionContext/CellScript.pressed.connect(script_authoring_requested.emit)
	var names := {"paint": "Brush", "select": "Select", "fill": "Fill", "sample": "Sample",
		"stamp": "Stamp", "erase": "Erase", "pan": "Pan", "shapes": "Shapes"}
	for mode in names:
		var button: Button = $PaintTools.get_node(names[mode])
		_paint_tools[mode] = button
		button.pressed.connect(func(): paint_tool_requested.emit(mode))


func set_script_destination(enabled: bool, existing: bool) -> void:
	$PaintSelectionContext/CellScript.disabled = not enabled
	$PaintSelectionContext/CellScript.text = "Open Action Point…" if existing else "Create Action Point here…"


func _unhandled_key_input(event: InputEvent) -> void:
	if not is_visible_in_tree() or not event is InputEventKey or not event.pressed or event.echo:
		return
	if event.ctrl_pressed or event.meta_pressed or event.alt_pressed:
		return
	var focus := get_viewport().gui_get_focus_owner()
	if focus is LineEdit or focus is TextEdit or focus is SpinBox:
		return
	var tools := {KEY_B: "paint", KEY_M: "select", KEY_I: "sample", KEY_H: "pan", KEY_G: "fill", KEY_E: "erase", KEY_S: "stamp"}
	if tools.has(event.keycode):
		var tool: String = tools[event.keycode]
		if not _paint_tools[tool].disabled: paint_tool_requested.emit(tool)
		get_viewport().set_input_as_handled()


func present_paint_tool(tool: String) -> void:
	for candidate in _paint_tools:
		_paint_tools[candidate].set_pressed_no_signal(candidate == tool)
	_canvas.set_interaction_mode(tool)


func set_paint_available(available: bool) -> void:
	for mode in ["paint", "sample", "fill", "erase", "shapes", "stamp"]:
		_paint_tools[mode].disabled = not available
		_paint_tools[mode].tooltip_text = "" if available else "Tile artwork is unavailable. Open Assets to inspect the source."


func set_authoring_context(has_map: bool, has_cell: bool) -> void:
	$EmptyLandHint.visible = not has_map
	for path in ["MapSectionTabs/RandomEncountersSection", "MapViewFilters/MapOverlayButton", "PaintTools/SmartTerrain", "PaintTools/Select", "PaintTools/Pan", "MapToolbar/ZoomOut", "MapToolbar/ZoomIn", "MapToolbar/ZoomFit", "MapToolbar/ExportMapImage"]:
		var button: BaseButton = get_node(path)
		button.disabled = not has_map
		button.tooltip_text = "" if has_map else "Create or open a Land map first."
	$PaintSelectionContext/CellDetails.disabled = not has_map or not has_cell
	$PaintSelectionContext/CellDetails.tooltip_text = "Select a cell to open Cell Details." if has_map else "Create or open a Land map first."


func paint_positions() -> Array:
	return _canvas.paint_positions()


func preview_terrain(plan: Dictionary) -> Dictionary:
	return _canvas.preview_terrain(plan)


func terrain_tile_at(cell: Vector2i) -> Variant:
	return _canvas.terrain_tile_at(cell)


func cell_artwork(cell: Vector2i) -> Dictionary:
	return _canvas.cell_artwork(cell)


func apply_terrain_delta(projection: Dictionary) -> void:
	_canvas.apply_terrain_delta(projection.get("terrainCells", []))


func apply_painted_terrain(painted: Array, planned: Array) -> void:
	var values := {}
	for cell: Dictionary in planned:
		values[Vector2i(int(cell.x), int(cell.y))] = cell.tile
	var terrain: Array = []
	for cell: Dictionary in painted:
		var coordinate := Vector2i(int(cell.x), int(cell.y))
		update_cell(coordinate.x, coordinate.y, int(cell.tile))
		terrain.append({"x": cell.x, "y": cell.y, "tile": values[coordinate]})
	_canvas.apply_terrain_delta(terrain)


func cancel_paint_stroke() -> void:
	_canvas.cancel_paint_stroke()


func set_paint_preview_tile(tile: int) -> void:
	_canvas.set_paint_preview_tile(tile)


func paint_touches_special_land(cells: Array) -> bool:
	return _canvas.paint_touches_special_land(cells)


func set_map_title(value: String) -> void:
	_title.text = value


func set_document(tiles: Array, action_points: Array, terrain_tiles: Array = []) -> void:
	_canvas.set_document(tiles, action_points)
	_canvas.terrain_tiles = terrain_tiles.duplicate()


func refresh_document(tiles: Array, action_points: Array, terrain_tiles: Array = []) -> void:
	_canvas.refresh_document(tiles, action_points)
	_canvas.terrain_tiles = terrain_tiles.duplicate()


func set_render_atlas(projection: Dictionary) -> bool:
	atlas_projection = projection.duplicate(true)
	var result := _canvas.set_render_atlas(projection)
	atlas_changed.emit(projection)
	return result


func clear_render_atlas() -> void:
	_canvas.clear_render_atlas()
	atlas_projection.clear()
	atlas_changed.emit({})


func render_overlay_count() -> int:
	return _canvas.render_overlay_count()


func render_atlas_identity() -> String:
	return _canvas.render_atlas_identity()


func requires_atlas_refresh(tiles: Array) -> bool:
	return _canvas.requires_atlas_refresh(tiles)


func canvas_height() -> int:
	return int(_canvas.size.y)


func select_cell(x: int, y: int, reveal := true) -> void:
	_canvas.select_cell(x, y, reveal)

func focus_source(_identity: String, _slot: int, field: String) -> bool:
	return preload("res://src/map_source_navigation.gd").focus(_canvas, field)


func update_cell(x: int, y: int, tile: int) -> void:
	_canvas.update_cell(x, y, tile)


func retain_special_artwork(previews: Array) -> void:
	_canvas.retain_special_artwork(previews)


func set_view_projection(result: Dictionary) -> void:
	var hints: Dictionary = result.get("viewOverlays",{})
	%MapViewOverlay.set_hints(hints)
	var map: Dictionary = result.get("map",{})
	var runtime: Dictionary = map.get("runtime") if map.get("runtime") is Dictionary else {}
	%MapViewFilters.set_context(str(map.get("identity","")),runtime.get("randomRectangles",[]),hints.get("playerMaps",[]))
	_region_entries_changed()


func _view_changed(flags: Dictionary, rectangles: Array, footprints: Array) -> void:
	_canvas.set_real_tiles_visible(bool(flags.realTiles))
	_canvas.set_action_points_visible(bool(flags.actionPoints))
	_canvas.texture_filter=TEXTURE_FILTER_LINEAR if flags.smooth else TEXTURE_FILTER_NEAREST
	%MapViewOverlay.configure(flags,footprints)
	var overlay: Control = %RandomRegionOverlay
	overlay.filter_active=true; overlay.visible_ids.clear()
	for row: Dictionary in rectangles: overlay.visible_ids[str(row.identity)]=true
	if overlay.display_enabled!=bool(flags.randomRectangles): overlay.set_display_enabled(bool(flags.randomRectangles))
	overlay.queue_redraw()


func _region_display_changed(enabled: bool) -> void:
	var state: RefCounted = %MapViewFilters.state
	if bool(state.flags.randomRectangles)!=enabled and not state.entries.randomRectangles.is_empty(): state.set_flag("randomRectangles",enabled)


func _region_entries_changed() -> void:
	var filters: Control = %MapViewFilters
	if filters.state.identity!=document_identity: return
	var overlay: Control = %RandomRegionOverlay
	if overlay.map_identity!=document_identity: return
	var rows: Array = overlay.regions.duplicate(true)
	var displayed: bool = overlay.display_enabled
	if not overlay.draft.is_empty() and not rows.any(func(row): return row.identity==overlay.draft.identity): rows.append(overlay.draft.duplicate(true))
	filters.set_context(document_identity,rows,filters.state.entries.playerMaps)
	if displayed and not filters.state.flags.randomRectangles: filters.state.set_flag("randomRectangles",true)


func read_navigation_state() -> Dictionary:
	var focus := get_viewport().gui_get_focus_owner()
	var tool := "select"
	for key in _paint_tools:
		if _paint_tools[key].button_pressed: tool = key
	return {"identity":document_identity,"canvas":_canvas.read_navigation_state(),"overlays":%MapViewFilters.state.read_navigation_state(),"cells":get_node("%LandAreaOverlay").selected.duplicate(true),
		"tool":tool,"focus":str(get_path_to(focus)) if is_instance_valid(focus) and is_ancestor_of(focus) else ""}


func restore_navigation_state(state: Dictionary) -> bool:
	if str(state.get("identity",""))!=document_identity: return false
	_canvas.restore_navigation_state(state.get("canvas",{}),true)
	%MapViewFilters.state.restore_navigation_state(state.get("overlays",{}))
	selection_restored.emit(state.get("cells",[]),str(state.get("tool","select")))
	await get_tree().process_frame
	var focus := get_node_or_null(str(state.get("focus",""))) as Control
	if is_instance_valid(focus) and focus.is_visible_in_tree(): focus.grab_focus()
	else: _canvas.grab_focus()
	return true


func set_interaction_mode(mode: String) -> void:
	_canvas.set_interaction_mode(mode)


func fit_canvas() -> void:
	_canvas.zoom_fit()


func toggle_action_points() -> bool:
	var enabled := not bool(%MapViewFilters.state.flags.actionPoints)
	%MapViewFilters.state.set_flag("actionPoints",enabled)
	return enabled


func _on_zoom_out_pressed() -> void:
	_canvas.zoom_out()


func _on_zoom_in_pressed() -> void:
	_canvas.zoom_in()


func _on_zoom_fit_pressed() -> void:
	_canvas.zoom_fit()


func _on_action_points_filter_toggled(visible: bool) -> void:
	_canvas.set_action_points_visible(visible)


func _on_canvas_cell_selected(x: int, y: int, tile: int, action_point: Dictionary) -> void:
	cell_selected.emit(x, y, tile, action_point)


func _on_canvas_action_point_activated(identity: String) -> void:
	action_point_activated.emit(identity)


func _on_canvas_zoom_changed(percent: int) -> void:
	_zoom_label.text = "%d%%" % percent


func set_special_paint_artwork(resource_id: int, texture: Texture2D) -> void:
	_canvas.set_special_paint_artwork(resource_id,texture)


func placement_focus_control() -> Control:
	return _canvas
