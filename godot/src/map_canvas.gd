class_name ProvidenceMapCanvas
extends Control

signal cell_selected(x: int, y: int, tile: int, action_point: Dictionary)
signal action_point_placement_requested(cell: Vector2i, action_point: Dictionary)
signal placement_canceled
signal action_point_activated(identity: String)
signal paint_stroke_started
signal paint_stroke_changed(count: int)
signal paint_stroke_requested(cells: Array)
signal paint_stroke_cancelled
signal zoom_changed(percent: int)
signal tile_sample_requested(cell: Vector2i)

const MAP_SIZE := 90
const MIN_ZOOM := 1.0
const MAX_ZOOM := 4.0
const ZOOM_STEP := 1.25
const ACTION_POINT_COLORS := {
	"battle": Color("f87171"),
	"encounter": Color("9dcfff"),
	"map": Color("38bdf8"),
	"quest": Color("c084fc"),
	"text": Color("eab308"),
	"trigger": Color("cbd5e1"),
}

var _tiles: Array = []
var _action_points: Array = []
var _selected := Vector2i(-1, -1)
var _atlas_texture: Texture2D
var _terrain_textures: Dictionary = {}
var _atlas_tile_size := Vector2i.ZERO
var _atlas_columns := 0
var _atlas_rows := 0
var _atlas_base_tile := 1
var _atlas_identity := ""
var _render_mode := "outdoor-landlook"
var _dungeon_sprite_layer_masks: Array = []
var _dungeon_behavior_overlay_masks: Array = []
var _overlay_textures: Dictionary = {}
var _special_paint_artwork: Dictionary = {}
var _zoom := MIN_ZOOM
var _pan_offset := Vector2.ZERO
var _panning := false
var _interaction_mode := "select"
var _show_action_points := true
var _show_real_tiles := true
var _paint_stroke := preload("res://src/map_paint_stroke.gd").new()
var _paint_preview_tile := 0
var _paint_preview_enabled := false
var terrain_tiles: Array = []
var terrain_preview: Dictionary = {}
var invalid_preview: Array[Vector2i] = []
var _export_cell_pixels := 0.0
var _export_overlays := true


func _ready() -> void:
	if _export_cell_pixels == 0: texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	focus_mode = FOCUS_ALL
	clip_contents = true
	if _export_cell_pixels == 0: get_window().focus_exited.connect(cancel_paint_stroke)


func image_export_size(current_zoom: bool) -> Vector2i:
	if _tiles.size() != MAP_SIZE * MAP_SIZE or _atlas_texture == null: return Vector2i.ZERO
	return Vector2i.ONE * roundi(MAP_SIZE * (_cell_size() if current_zoom else 32.0))


func create_image_export(cell_pixels: float, overlays: bool) -> ProvidenceMapCanvas:
	# Freeze presentation data without changing the live camera, filters or authored state.
	var copy := ProvidenceMapCanvas.new()
	copy._export_cell_pixels = cell_pixels
	copy._export_overlays = overlays
	copy.size = Vector2.ONE * cell_pixels * MAP_SIZE
	copy._tiles = _tiles.duplicate()
	copy._action_points = _action_points.duplicate(true)
	copy._atlas_texture = _atlas_texture
	copy._atlas_tile_size = _atlas_tile_size
	copy._atlas_columns = _atlas_columns
	copy._atlas_rows = _atlas_rows
	copy._atlas_base_tile = _atlas_base_tile
	copy._render_mode = _render_mode
	copy._dungeon_sprite_layer_masks = _dungeon_sprite_layer_masks.duplicate()
	copy._dungeon_behavior_overlay_masks = _dungeon_behavior_overlay_masks.duplicate()
	copy._overlay_textures = _overlay_textures.duplicate()
	copy._show_real_tiles = true
	copy._show_action_points = overlays and _show_action_points
	copy.texture_filter = texture_filter
	if overlays:
		for child in get_children():
			if child is Control and child.visible and child.has_method("create_image_export_overlay"):
				var layer: Control = child.create_image_export_overlay()
				layer.size = copy.size
				layer.theme = child.theme
				copy.add_child(layer)
	return copy


func set_document(tiles: Array, action_points: Array) -> void:
	cancel_paint_stroke()
	_tiles = tiles
	_action_points = action_points
	_selected = Vector2i(-1, -1)
	zoom_working()
	queue_redraw()


func refresh_document(tiles: Array, action_points: Array) -> void:
	cancel_paint_stroke()
	_tiles = tiles
	_action_points = action_points
	if _selected.x >= 0:
		select_cell(_selected.x, _selected.y, false, false)
	queue_redraw()


func paint_positions() -> Array:
	return _paint_stroke.cells.duplicate()


func terrain_tile_at(cell: Vector2i) -> Variant:
	if terrain_tiles.size() != MAP_SIZE * MAP_SIZE or cell.x < 0 or cell.y < 0 or cell.x >= MAP_SIZE or cell.y >= MAP_SIZE:
		return null
	return terrain_tiles[cell.y * MAP_SIZE + cell.x]


func preview_terrain(plan: Dictionary) -> Dictionary:
	_paint_preview_enabled = false
	terrain_preview.clear()
	invalid_preview.assign(plan.invalid)
	for cell: Dictionary in plan.cells:
		var coordinate := Vector2i(int(cell.x), int(cell.y))
		terrain_preview[coordinate] = int(cell.tile)
	queue_redraw()
	return {"painted": terrain_preview.size(), "protected": 0}


func apply_terrain_delta(cells: Array) -> void:
	if terrain_tiles.size() != MAP_SIZE * MAP_SIZE: return
	for cell: Dictionary in cells:
		terrain_tiles[int(cell.y) * MAP_SIZE + int(cell.x)] = cell.tile
	queue_redraw()


func set_render_atlas(projection: Dictionary) -> bool:
	clear_render_atlas()
	var artwork: Dictionary = preload("res://src/map_atlas_artwork.gd").decode(projection)
	if artwork.is_empty(): return false
	_atlas_texture = artwork.texture
	_atlas_tile_size = artwork.tileSize
	_atlas_columns = artwork.columns
	_atlas_rows = artwork.rows
	var projected_base_tile: Variant = projection.get("baseTile", 1)
	_atlas_base_tile = maxi(1, int(projected_base_tile if projected_base_tile != null else 1))
	_atlas_identity = str(projection.get("tilesetId", ""))
	_render_mode = str(projection.get("renderMode", "outdoor-landlook"))
	if _render_mode == "dungeon-top-down":
		var dungeon_render := projection.get("dungeonRender", {}) as Dictionary
		_dungeon_sprite_layer_masks = (dungeon_render.get("spriteLayerMasks", []) as Array).duplicate()
		_dungeon_behavior_overlay_masks = (dungeon_render.get("behaviorOverlayMasks", []) as Array).duplicate()
		if (
			str(dungeon_render.get("format", "")) != "realmz.dungeon-render.v1"
			or _dungeon_sprite_layer_masks.size() != MAP_SIZE * MAP_SIZE
			or _dungeon_behavior_overlay_masks.size() != MAP_SIZE * MAP_SIZE
		):
			clear_render_atlas()
			return false
	_overlay_textures = preload("res://src/map_atlas_artwork.gd").overlays(projection)
	queue_redraw()
	return true


func clear_render_atlas() -> void:
	_terrain_textures.clear()
	_atlas_texture = null
	_atlas_tile_size = Vector2i.ZERO
	_atlas_columns = 0
	_atlas_rows = 0
	_atlas_base_tile = 1
	_atlas_identity = ""
	_render_mode = "outdoor-landlook"
	_dungeon_sprite_layer_masks.clear()
	_dungeon_behavior_overlay_masks.clear()
	_overlay_textures.clear()
	queue_redraw()


func render_atlas_identity() -> String:
	return _atlas_identity


func terrain_texture(tile: int) -> Texture2D:
	if _atlas_texture == null or tile < 1 or tile > _atlas_columns * _atlas_rows: return null
	if not _terrain_textures.has(tile):
		var texture := AtlasTexture.new()
		texture.atlas = _atlas_texture
		texture.region = Rect2(Vector2i((tile - 1) % _atlas_columns, (tile - 1) / _atlas_columns) * _atlas_tile_size, _atlas_tile_size)
		_terrain_textures[tile] = texture
	return _terrain_textures[tile]


func cell_artwork(cell: Vector2i) -> Dictionary:
	if cell.x < 0 or cell.y < 0 or cell.x >= MAP_SIZE or cell.y >= MAP_SIZE: return {}
	var index := cell.y * MAP_SIZE + cell.x
	if index >= _tiles.size() or _render_mode == "dungeon-top-down": return {}
	var raw := int(_tiles[index]); var tile := preload("res://src/map_tile_identity.gd").normalize_atlas_tile(raw, _atlas_base_tile)
	return {"tile":tile,"base":terrain_texture(tile),"overlay":_overlay_textures.get(preload("res://src/map_tile_identity.gd").overlay_resource_id(raw)),"resourceId":preload("res://src/map_tile_identity.gd").overlay_resource_id(raw)}


func requires_atlas_refresh(tiles: Array) -> bool:
	if tiles.size() != _tiles.size(): return true
	for index in tiles.size():
		if tiles[index] == _tiles[index]: continue
		for raw in [int(tiles[index]), int(_tiles[index])]:
			if raw < 0 or (raw & ~0x6000) % 1000 > 200: return true
	return false


func render_mode() -> String:
	return _render_mode


func dungeon_cell_render_masks(cell_index: int) -> Dictionary:
	if (
		_render_mode != "dungeon-top-down"
		or cell_index < 0
		or cell_index >= _dungeon_sprite_layer_masks.size()
	):
		return {}
	return {
		"spriteLayers": int(_dungeon_sprite_layer_masks[cell_index]),
		"behaviorOverlays": int(_dungeon_behavior_overlay_masks[cell_index]),
	}


func render_overlay_count() -> int:
	return _overlay_textures.size()


func set_interaction_mode(mode: String) -> void:
	if mode != _interaction_mode:
		cancel_paint_stroke()
	_interaction_mode = mode if mode in ["select", "paint", "sample", "pan", "action-point"] else "select"
	mouse_default_cursor_shape = Control.CURSOR_CROSS if _interaction_mode in ["paint","action-point"] else Control.CURSOR_ARROW


func toggle_action_points() -> bool:
	_show_action_points = not _show_action_points
	queue_redraw()
	return _show_action_points


func set_action_points_visible(visible: bool) -> void:
	_show_action_points = visible
	queue_redraw()


func set_real_tiles_visible(value: bool) -> void:
	_show_real_tiles=value
	queue_redraw()


func action_point_marker_contract() -> Dictionary:
	return {
		"shape": "diamond-with-center-dot",
		"colors": ACTION_POINT_COLORS.duplicate(),
	}


func zoom_percent() -> int:
	return roundi(_zoom * 100.0)


func pan_offset() -> Vector2:
	return _pan_offset


func read_navigation_state() -> Dictionary:
	return {"zoom":_zoom,"pan":[_pan_offset.x,_pan_offset.y],"cell":[_selected.x,_selected.y],"showActionPoints":_show_action_points}


func restore_navigation_state(state: Dictionary, notify := false) -> void:
	cancel_paint_stroke()
	_zoom = clampf(float(state.get("zoom",1)),MIN_ZOOM,MAX_ZOOM)
	var pan: Array = state.get("pan",[0,0]); _pan_offset = Vector2(float(pan[0]),float(pan[1])) if pan.size()==2 else Vector2.ZERO
	_clamp_pan(_cell_size()); _show_action_points = bool(state.get("showActionPoints",true))
	var cell: Array = state.get("cell",[-1,-1])
	if cell.size()==2 and int(cell[0])>=0: select_cell(int(cell[0]),int(cell[1]),false,notify)
	else: clear_selection()
	zoom_changed.emit(zoom_percent()); queue_redraw()


func selected_cell() -> Dictionary:
	if _selected.x<0 or _tiles.size()!=MAP_SIZE*MAP_SIZE: return {}
	return {"x":_selected.x,"y":_selected.y,"tile":int(_tiles[_selected.y*MAP_SIZE+_selected.x]),"actionPoint":_action_point_at(_selected.x,_selected.y)}


func zoom_in() -> void:
	_set_zoom_at(_zoom * ZOOM_STEP, _selection_or_center())


func zoom_out() -> void:
	_set_zoom_at(_zoom / ZOOM_STEP, _selection_or_center())


func zoom_fit() -> void:
	_zoom = MIN_ZOOM
	_pan_offset = Vector2.ZERO
	zoom_changed.emit(zoom_percent())
	queue_redraw()


func zoom_working() -> void:
	if minf(size.x, size.y) < MAP_SIZE:
		zoom_fit()
		return
	# Fit is 100%; the initial editing view keeps individual cells readable.
	_zoom = clampf(16.0 / floorf(minf(size.x, size.y) / MAP_SIZE), MIN_ZOOM, MAX_ZOOM)
	reveal_cell(25, 25)
	zoom_changed.emit(zoom_percent())
	queue_redraw()


func reveal_cell(x: int, y: int) -> void:
	if x < 0 or y < 0 or x >= MAP_SIZE or y >= MAP_SIZE:
		return
	var cell_size := _cell_size()
	var desired_origin := size * 0.5 - (Vector2(x, y) + Vector2(0.5, 0.5)) * cell_size
	_pan_offset = desired_origin - _centered_origin(cell_size)
	_clamp_pan(cell_size)
	queue_redraw()


func update_cell(x: int, y: int, tile: int) -> void:
	var index := y * MAP_SIZE + x
	if index >= 0 and index < _tiles.size():
		_tiles[index] = tile
		var resource := preload("res://src/map_tile_identity.gd").overlay_resource_id(tile)
		if _special_paint_artwork.has(resource): _overlay_textures[resource] = _special_paint_artwork[resource]
		queue_redraw()


func retain_special_artwork(previews: Array) -> void:
	# Only confirmed placements promote preview pixels into the map's artwork cache.
	_overlay_textures.merge(preload("res://src/paint_resource_art.gd").special_textures(previews), true)
	queue_redraw()


func _gui_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and event.keycode == KEY_ESCAPE and _interaction_mode == "action-point":
		placement_canceled.emit(); accept_event(); return
	if _handle_paint_input(event):
		accept_event()
		return
	if event is InputEventMouseMotion and _panning:
		_pan_offset += (event as InputEventMouseMotion).relative
		_clamp_pan(_cell_size())
		queue_redraw()
		accept_event()
		return
	if not event is InputEventMouseButton:
		return
	var mouse := event as InputEventMouseButton
	if mouse.button_index == MOUSE_BUTTON_LEFT and not mouse.pressed and _interaction_mode == "pan":
		_panning = false
		accept_event()
		return
	if mouse.button_index == MOUSE_BUTTON_MIDDLE:
		_panning = mouse.pressed
		mouse_default_cursor_shape = Control.CURSOR_DRAG if _panning else Control.CURSOR_ARROW
		accept_event()
		return
	if _zoom_input(mouse): return
	if not mouse.pressed or mouse.button_index != MOUSE_BUTTON_LEFT:
		return
	if _interaction_mode == "pan":
		_panning = true
		accept_event()
		return
	var cell_size := _cell_size()
	if cell_size <= 0.0:
		return
	var origin := _origin(cell_size)
	var local_position: Vector2 = mouse.position - origin
	var x := int(floor(local_position.x / cell_size))
	var y := int(floor(local_position.y / cell_size))
	if x < 0 or y < 0 or x >= MAP_SIZE or y >= MAP_SIZE:
		return
	select_cell(x, y, false)
	if _interaction_mode == "action-point":
		action_point_placement_requested.emit(Vector2i(x,y), _action_point_at(x,y))
	elif _interaction_mode == "sample":
		tile_sample_requested.emit(Vector2i(x, y))
	elif _interaction_mode == "paint":
		if _tiles.size() == MAP_SIZE * MAP_SIZE:
			_paint_stroke.begin(Vector2i(x, y))
			paint_stroke_started.emit()
			paint_stroke_changed.emit(_paint_stroke.cells.size())
	elif mouse.double_click:
		var action_point := _action_point_at(x, y)
		if not action_point.is_empty():
			action_point_activated.emit(str(action_point.get("identity", "")))
	accept_event()


func _input(event: InputEvent) -> void:
	if event is InputEventMouseButton and not event.pressed and event.button_index in [MOUSE_BUTTON_LEFT, MOUSE_BUTTON_MIDDLE]:
		_panning = false
	if not _paint_stroke.active:
		return
	var local_event := event
	if event is InputEventMouse:
		local_event = make_input_local(event)
	if _handle_paint_input(local_event):
		get_viewport().set_input_as_handled()


func _notification(what: int) -> void:
	if what in [NOTIFICATION_WM_WINDOW_FOCUS_OUT, NOTIFICATION_EXIT_TREE, NOTIFICATION_RESIZED]:
		cancel_paint_stroke()
	elif what == NOTIFICATION_VISIBILITY_CHANGED and not is_visible_in_tree():
		cancel_paint_stroke()


func set_paint_preview_tile(tile: int) -> void:
	_paint_preview_tile = tile
	_paint_preview_enabled = true
	queue_redraw()


func paint_touches_special_land(cells: Array) -> bool:
	for cell: Vector2i in cells:
		var index := cell.y * MAP_SIZE + cell.x
		if index >= 0 and index < _tiles.size() and int(_tiles[index]) < 0:
			return true
	return false


func cancel_paint_stroke() -> void:
	_panning = false
	var was_active: bool = _paint_stroke.active
	_paint_stroke.clear()
	_paint_preview_enabled = false
	terrain_preview.clear()
	invalid_preview.clear()
	if was_active:
		queue_redraw()
		paint_stroke_cancelled.emit()


func _handle_paint_input(event: InputEvent) -> bool:
	if not _paint_stroke.active:
		return false
	if event is InputEventKey and event.pressed and event.keycode == KEY_ESCAPE:
		cancel_paint_stroke()
		return true
	if event is InputEventKey and event.pressed and (event.ctrl_pressed or event.meta_pressed or event.keycode == KEY_TAB):
		cancel_paint_stroke()
		return false
	if event is InputEventMouseMotion:
		if not event.button_mask & MOUSE_BUTTON_MASK_LEFT:
			cancel_paint_stroke()
		else:
			_extend_paint_stroke(event.position)
		return true
	if event is InputEventMouseButton:
		if event.button_index == MOUSE_BUTTON_LEFT and not event.pressed:
			_extend_paint_stroke(event.position)
			var cells: Array = _paint_stroke.cells.duplicate()
			_paint_stroke.clear()
			_paint_preview_enabled = false
			terrain_preview.clear()
			invalid_preview.clear()
			queue_redraw()
			paint_stroke_requested.emit(cells)
			return true
		if event.pressed and event.button_index != MOUSE_BUTTON_LEFT:
			cancel_paint_stroke()
	return false


func _extend_paint_stroke(position: Vector2) -> void:
	var cell_size := _cell_size()
	var cell := Vector2i(((position - _origin(cell_size)) / cell_size).floor())
	if not Rect2(Vector2.ZERO, size).has_point(position):
		cell = Vector2i(-1, -1)
	_paint_stroke.append(cell)
	if cell.x >= 0 and cell.y >= 0 and cell.x < MAP_SIZE and cell.y < MAP_SIZE:
		_selected = cell
	paint_stroke_changed.emit(_paint_stroke.cells.size())
	queue_redraw()


func select_cell(x: int, y: int, reveal: bool = true, notify: bool = true) -> void:
	if x < 0 or y < 0 or x >= MAP_SIZE or y >= MAP_SIZE or _tiles.size() != MAP_SIZE * MAP_SIZE:
		return
	_selected = Vector2i(x, y)
	if reveal:
		reveal_cell(x, y)
	var action_point := _action_point_at(x, y)
	if notify: cell_selected.emit(x, y, int(_tiles[y * MAP_SIZE + x]), action_point)
	queue_redraw()


func clear_selection() -> void:
	_selected = Vector2i(-1, -1)
	queue_redraw()


func activate_selected_action_point() -> void:
	if _selected.x < 0:
		return
	var action_point := _action_point_at(_selected.x, _selected.y)
	if not action_point.is_empty():
		action_point_activated.emit(str(action_point.get("identity", "")))


func _draw() -> void:
	if _tiles.size() != MAP_SIZE * MAP_SIZE:
		draw_string(get_theme_default_font(), Vector2(18, 28), "Map projection unavailable")
		return
	var cell_size := _cell_size()
	var origin := _origin(cell_size)
	var visible_cells := visible_cell_bounds()
	for y in range(visible_cells.position.y, visible_cells.end.y):
		for x in range(visible_cells.position.x, visible_cells.end.x):
			var cell_index := y * MAP_SIZE + x
			var tile := int(_tiles[cell_index])
			if terrain_preview.has(Vector2i(x, y)):
				tile = int(terrain_preview[Vector2i(x, y)])
			elif _paint_preview_enabled and _paint_stroke.contains(Vector2i(x, y)):
				tile = _paint_preview_tile
			var destination := Rect2(origin + Vector2(x, y) * cell_size, Vector2.ONE * cell_size)
			if not _show_real_tiles:
				draw_rect(destination,preload("res://src/land_tile_color.gd").color(tile))
			elif not _draw_atlas_tile(destination, tile, cell_index):
				draw_rect(destination, _tile_color(tile))
			if _render_mode == "dungeon-top-down" and _export_overlays:
				_draw_dungeon_behavior_overlay(destination, cell_index)
			elif _show_real_tiles and _render_mode != "dungeon-top-down":
				_draw_overlay(destination, tile)
			if terrain_preview.has(Vector2i(x, y)):
				draw_rect(destination, Color(0.2, 0.6, 1, 0.18))
	for cell in invalid_preview:
		draw_rect(Rect2(origin + Vector2(cell) * cell_size, Vector2.ONE * cell_size), Color(1, 0.15, 0.2, 0.4))
	if _show_action_points:
		for action_point_value in _action_points:
			var action_point := action_point_value as Dictionary
			var coordinate := action_point.get("coordinate", {}) as Dictionary
			var x := int(coordinate.get("x", -1))
			var y := int(coordinate.get("y", -1))
			if visible_cells.has_point(Vector2i(x, y)):
				var center := origin + (Vector2(x, y) + Vector2(0.5, 0.5)) * cell_size
				_draw_action_point_marker(
					center,
					cell_size,
					str(action_point.get("overlayKind", "trigger")),
					_selected == Vector2i(x, y),
					bool(action_point.get("hasUnknownAction", false))
				)
	if _selected.x >= 0:
		draw_rect(Rect2(origin + Vector2(_selected) * cell_size, Vector2.ONE * cell_size), Color("ffffff"), false, 2.0)
	if _export_cell_pixels == 0: draw_rect(Rect2(origin, Vector2.ONE * cell_size * MAP_SIZE), Color("63717e"), false, 1.0)


func _draw_action_point_marker(center: Vector2, cell_size: float, kind: String, is_selected: bool, has_unknown: bool) -> void:
	var radius := maxf(3.0, cell_size * 0.34)
	var points := PackedVector2Array([
		center + Vector2(0.0, -radius),
		center + Vector2(radius, 0.0),
		center + Vector2(0.0, radius),
		center + Vector2(-radius, 0.0),
	])
	var shadow := PackedVector2Array()
	for point in points:
		shadow.append(point + Vector2.ONE)
	draw_colored_polygon(shadow, Color(0.0, 0.0, 0.0, 0.45))
	var fill := ACTION_POINT_COLORS.get(kind, ACTION_POINT_COLORS["trigger"]) as Color
	fill.a = 1.0 if is_selected else (0.95 if has_unknown else 0.82)
	draw_colored_polygon(points, fill)
	var outline := Color("ffd47a") if is_selected else (Color("eff6ff") if has_unknown else Color(0.027, 0.039, 0.055, 0.9))
	var outline_width := maxf(2.0, cell_size * 0.13) if is_selected else maxf(1.0, cell_size * 0.08)
	var outline_points := points.duplicate()
	outline_points.append(points[0])
	draw_polyline(outline_points, outline, outline_width, true)
	if cell_size >= 12.0:
		draw_circle(center, maxf(1.5, cell_size * 0.08), Color(0.031, 0.047, 0.063, 0.78))


func _cell_size() -> float:
	if _export_cell_pixels > 0: return _export_cell_pixels
	return maxf(1.0, floor(minf(size.x, size.y) / MAP_SIZE) * _zoom)


func _origin(cell_size: float) -> Vector2:
	if _export_cell_pixels > 0: return Vector2.ZERO
	return _centered_origin(cell_size) + _pan_offset


func _centered_origin(cell_size: float) -> Vector2:
	var extent := Vector2.ONE * cell_size * MAP_SIZE
	return (size - extent) * 0.5


func _set_zoom_at(requested_zoom: float, pointer: Vector2) -> void:
	var next_zoom := clampf(requested_zoom, MIN_ZOOM, MAX_ZOOM)
	if is_equal_approx(next_zoom, _zoom):
		return
	var previous_cell_size := _cell_size()
	var previous_origin := _origin(previous_cell_size)
	var map_position := (pointer - previous_origin) / previous_cell_size
	_zoom = next_zoom
	var next_cell_size := _cell_size()
	var desired_origin := pointer - map_position * next_cell_size
	_pan_offset = desired_origin - _centered_origin(next_cell_size)
	_clamp_pan(next_cell_size)
	zoom_changed.emit(zoom_percent())
	queue_redraw()


func _selection_or_center() -> Vector2:
	if _selected.x < 0:
		return size * 0.5
	var cell_size := _cell_size()
	return _origin(cell_size) + (Vector2(_selected) + Vector2(0.5, 0.5)) * cell_size


func _clamp_pan(cell_size: float) -> void:
	var extent := Vector2.ONE * cell_size * MAP_SIZE
	var centered := _centered_origin(cell_size)
	if extent.x <= size.x:
		_pan_offset.x = 0.0
	else:
		_pan_offset.x = clampf(_pan_offset.x, size.x - extent.x - centered.x, -centered.x)
	if extent.y <= size.y:
		_pan_offset.y = 0.0
	else:
		_pan_offset.y = clampf(_pan_offset.y, size.y - extent.y - centered.y, -centered.y)


func _action_point_at(x: int, y: int) -> Dictionary:
	for candidate in _action_points:
		var row := candidate as Dictionary
		var coordinate := row.get("coordinate", {}) as Dictionary
		if int(coordinate.get("x", -1)) == x and int(coordinate.get("y", -1)) == y:
			return row
	return {}


func _tile_color(tile: int) -> Color:
	var palette := [Color("253846"), Color("395b55"), Color("6b7047"), Color("8a7250"), Color("75545b"), Color("536b82")]
	return palette[absi(tile) % palette.size()]


func _draw_atlas_tile(destination: Rect2, raw_tile: int, cell_index: int) -> bool:
	if _atlas_texture == null or _atlas_columns <= 0 or _atlas_rows <= 0:
		return false
	if _render_mode == "dungeon-top-down":
		return _draw_dungeon_atlas_tile(destination, cell_index)
	var tile := preload("res://src/map_tile_identity.gd").normalize_atlas_tile(raw_tile, _atlas_base_tile)
	var index := tile - 1
	if index < 0 or index >= _atlas_columns * _atlas_rows:
		return false
	_draw_atlas_index(destination, index)
	return true


func _draw_atlas_index(destination: Rect2, index: int) -> void:
	var source := Rect2(
		Vector2(index % _atlas_columns, index / _atlas_columns) * Vector2(_atlas_tile_size),
		Vector2(_atlas_tile_size)
	)
	draw_texture_rect_region(_atlas_texture, destination, source)


func _draw_dungeon_atlas_tile(destination: Rect2, cell_index: int) -> bool:
	if cell_index < 0 or cell_index >= _dungeon_sprite_layer_masks.size() or _atlas_columns * _atlas_rows < 16: return false
	preload("res://src/dungeon_cell_artwork.gd").draw_sprites(self, destination, _atlas_texture, _atlas_columns, _atlas_tile_size, int(_dungeon_sprite_layer_masks[cell_index]))
	return true


func _draw_dungeon_behavior_overlay(destination: Rect2, cell_index: int) -> void:
	if cell_index < 0 or cell_index >= _dungeon_behavior_overlay_masks.size(): return
	preload("res://src/dungeon_cell_artwork.gd").draw_behavior(self, destination, int(_dungeon_behavior_overlay_masks[cell_index]))


func cell_rect(cell: Vector2i) -> Rect2:
	var extent := _cell_size()
	return Rect2(_origin(extent) + Vector2(cell) * extent, Vector2.ONE * extent)


func visible_cell_bounds() -> Rect2i:
	var extent := _cell_size()
	var origin := _origin(extent)
	# Include one neighboring cell for marker outlines and partially visible artwork.
	var first := Vector2i((-origin / extent).floor()) - Vector2i.ONE
	var last := Vector2i(((size - origin) / extent).ceil()) + Vector2i.ONE
	first = first.clamp(Vector2i.ZERO, Vector2i.ONE * MAP_SIZE)
	last = last.clamp(first, Vector2i.ONE * MAP_SIZE)
	return Rect2i(first, last - first)


func _draw_overlay(destination: Rect2, raw_tile: int) -> bool:
	var resource_id := preload("res://src/map_tile_identity.gd").overlay_resource_id(raw_tile)
	var texture: Texture2D = _overlay_textures.get(resource_id,_special_paint_artwork.get(resource_id))
	if resource_id == 0 or texture == null: return false
	draw_texture_rect(texture, destination, false)
	return true


func set_special_paint_artwork(resource_id: int, texture: Texture2D) -> void:
	_special_paint_artwork.clear()
	if resource_id < 0 and texture != null: _special_paint_artwork[resource_id] = texture
	queue_redraw()


func _zoom_input(mouse: InputEventMouseButton) -> bool:
	if not mouse.pressed or mouse.button_index not in [MOUSE_BUTTON_WHEEL_UP,MOUSE_BUTTON_WHEEL_DOWN]: return false
	_set_zoom_at(_zoom * ZOOM_STEP if mouse.button_index == MOUSE_BUTTON_WHEEL_UP else _zoom / ZOOM_STEP,mouse.position)
	accept_event(); return true
