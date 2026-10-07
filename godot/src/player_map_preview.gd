extends Control

signal marker_placed(cell: Vector2i)
signal painting_stopped

var projection: Dictionary = {}
var zoom := 1.0
var placing := false
var _atlas: Dictionary = {}
var _picture: Texture2D
var _markers: Array = []
var _overlays: Dictionary = {}
var _dragging := false


func clear() -> void:
	projection.clear(); _atlas.clear(); _markers.clear(); _overlays.clear(); _picture = null
	queue_redraw()


func receive(response: Dictionary) -> String:
	clear()
	if not response.get("ok", false): return str(response.get("error", "Preview unavailable."))
	projection = response.result.duplicate(true)
	if projection.mode == "picture":
		_picture = preload("res://src/item_artwork_lookup.gd").decode_texture({"ok": true, "result": projection.resource})
		if _picture == null: clear(); return "The exact picture payload cannot be decoded."
	elif projection.mode.ends_with("crop"):
		_atlas = preload("res://src/map_atlas_artwork.gd").decode(projection.atlas)
		_overlays = preload("res://src/map_atlas_artwork.gd").overlays(projection.atlas)
		if _atlas.is_empty(): clear(); return "The exact map atlas cannot be decoded."
		for row: Dictionary in projection.markers:
			var texture: Texture2D = preload("res://src/item_artwork_lookup.gd").decode_texture({"ok": row.resource != null, "result": row.resource if row.resource != null else {}})
			_markers.append({"slot": row.get("slot", -1), "marker": row.marker, "texture": texture, "reason": row.reason})
	queue_redraw()
	var missing := _markers.filter(func(row): return row.texture == null).size()
	return "%d marker resource(s) unavailable; their exact IDs are retained." % missing if missing > 0 else ""


func set_zoom(value: float) -> void:
	zoom = clampf(value, 0.5, 3.0)
	custom_minimum_size = Vector2.ONE * 320 * zoom
	queue_redraw()


func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, Vector2.ONE * 320 * zoom), Color("080d12"))
	if projection.is_empty(): return
	if _picture != null:
		var rect: Dictionary = projection.rectangle
		var target := Rect2(0, 0, 320, 320)
		if int(rect.bottom) != 0 or int(rect.right) != 0:
			target = Rect2(float(rect.left), float(rect.top), float(rect.right) - float(rect.left), float(rect.bottom) - float(rect.top))
		if target.size.x > 0 and target.size.y > 0: draw_texture_rect(_picture, Rect2(target.position * zoom, target.size * zoom), false)
	elif not _atlas.is_empty():
		_draw_terrain()
		_draw_markers()


func _draw_terrain() -> void:
	var columns := int(projection.columns)
	var extent := float(projection.cellSize) * zoom
	for index in projection.cells.size():
		var value := int(projection.cells[index])
		var target := Rect2(Vector2(index % columns, index / columns) * extent, Vector2.ONE * extent)
		if projection.mode == "dungeon-crop":
			_draw_index(target, 15)
			# Castle's edit-on map view shows all twelve packed sprite layers, without party state.
			for layer in 12:
				if value & (1 << layer): _draw_index(target, layer)
		else:
			var tile := _land_tile(value)
			_draw_index(target, tile - 1)
			if value < 0:
				var resource_id := value
				for _attempt in 3:
					if resource_id < -999: resource_id += 1000
				if _overlays.has(resource_id): draw_texture_rect(_overlays[resource_id], target, false)


func _land_tile(value: int) -> int:
	if value < 0: return clampi(int(projection.baseTile), 1, 200)
	if value > 999:
		value &= ~0x6000
		for _attempt in 3:
			if value > 999: value -= 1000
	return clampi(int(projection.baseTile), 1, 200) if value > 200 else maxi(1, value)


func _draw_index(target: Rect2, index: int) -> void:
	var tile_size: Vector2i = _atlas.tileSize
	var source := Rect2(Vector2(index % int(_atlas.columns), index / int(_atlas.columns)) * Vector2(tile_size), Vector2(tile_size))
	draw_texture_rect_region(_atlas.texture, target, source)


func _draw_markers() -> void:
	var extent := float(projection.markerSize)
	for row: Dictionary in _markers:
		var marker: Dictionary = row.marker
		var target := Rect2(Vector2(float(marker.x), float(marker.y)) * extent, Vector2.ONE * extent)
		if int(marker.iconId) in [137, 139]: target = target.grow(float(int((32 - extent) / 2)))
		target = Rect2(target.position * zoom, target.size * zoom)
		if row.texture != null: draw_texture_rect(row.texture, target, false)
		else: draw_rect(target, Color("e8b85c"), false, 2)


func _gui_input(event: InputEvent) -> void:
	if not placing or projection.is_empty() or not projection.mode.ends_with("crop"): return
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		_dragging = event.pressed
		if event.pressed: grab_focus(); _paint_at(event.position)
		accept_event()
	elif event is InputEventMouseMotion and _dragging:
		if not event.button_mask & MOUSE_BUTTON_MASK_LEFT: cancel_pointer(); return
		_paint_at(event.position); accept_event()


func _paint_at(position: Vector2) -> void:
	var point := position / zoom
	var extent := float(projection.get("markerSize", 0))
	if extent <= 0 or not Rect2(0, 0, 320, 320).has_point(point): return
	marker_placed.emit(Vector2i(floor(point.x / extent), floor(point.y / extent)))


func cancel_pointer() -> void:
	_dragging = false


func move_marker(slot: int, cell: Vector2i) -> void:
	for row: Dictionary in _markers:
		if int(row.slot) == slot:
			row.marker.x = cell.x; row.marker.y = cell.y
	queue_redraw()


func _unhandled_key_input(event: InputEvent) -> void:
	if placing and event.is_pressed() and event is InputEventKey and event.keycode == KEY_ESCAPE:
		painting_stopped.emit(); get_viewport().set_input_as_handled()
