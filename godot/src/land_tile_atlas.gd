extends Control

signal brush_selected(brush: Dictionary)
signal reveal_requested(bounds: Rect2)

var atlas_texture: Texture2D
var tile_size := Vector2i(32, 32)
var columns := 0
var rows := 0
var tileset_id := ""
var selection := Rect2i(0, 0, 1, 1)
var _dragging := false
var _anchor := Vector2i.ZERO
var _cursor := Vector2i.ZERO
var _selection_before_drag := Rect2i(0, 0, 1, 1)
var _tile_catalog: Dictionary = {}


func set_tile_catalog(rows: Dictionary) -> void:
	_tile_catalog = rows.duplicate(true)


func _get_tooltip(at_position: Vector2) -> String:
	if atlas_texture == null or not Rect2(Vector2.ZERO, Vector2(columns, rows) * Vector2(tile_size)).has_point(at_position): return ""
	var cell := _cell(at_position)
	var tile := cell.y * columns + cell.x + 1
	return preload("res://src/land_tile_description.gd").tooltip(tile, _tile_catalog.get(tile, {}))


func _ready() -> void:
	focus_mode = Control.FOCUS_ALL
	texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	mouse_default_cursor_shape = Control.CURSOR_CROSS
	get_window().focus_exited.connect(_cancel_drag)


func set_atlas(projection: Dictionary, expected_cells := 200) -> bool:
	_tile_catalog.clear()
	atlas_texture = null
	columns = 0
	rows = 0
	tileset_id = ""
	_cancel_drag(false)
	custom_minimum_size = Vector2.ZERO
	queue_redraw()
	if not projection.get("available", false) or projection.get("renderMode", "") != "outdoor-landlook":
		return false
	var identity := str(projection.get("tilesetId", ""))
	if identity.is_empty(): return false
	var geometry := Vector2i(int(projection.get("columns", 0)), int(projection.get("rows", 0)))
	var pixels := Vector2i(int(projection.get("tileWidth", 0)), int(projection.get("tileHeight", 0)))
	if geometry.x <= 0 or geometry.y <= 0 or geometry.x * geometry.y != expected_cells or pixels.x <= 0 or pixels.y <= 0:
		return false
	var image := Image.new()
	if image.load_png_from_buffer(Marshalls.base64_to_raw(str(projection.get("base64", "")))) != OK:
		return false
	if image.get_size() != geometry * pixels:
		return false
	atlas_texture = ImageTexture.create_from_image(image)
	tile_size = pixels
	columns = geometry.x
	rows = geometry.y
	tileset_id = identity
	custom_minimum_size = Vector2(geometry * pixels)
	select_region(Rect2i(0, 0, 1, 1), false)
	return true


func select_tile(tile: int, notify := true) -> bool:
	if tile < 1 or tile > columns * rows or atlas_texture == null:
		return false
	return select_region(Rect2i(Vector2i((tile - 1) % columns, (tile - 1) / columns), Vector2i.ONE), notify)


func select_region(bounds: Rect2i, notify := true) -> bool:
	if atlas_texture == null or bounds.size.x <= 0 or bounds.size.y <= 0 or not Rect2i(0, 0, columns, rows).encloses(bounds):
		return false
	selection = bounds
	_anchor = selection.position
	_cursor = selection.end - Vector2i.ONE
	_publish(notify)
	return true


func selected_brush() -> Dictionary:
	if atlas_texture == null:
		return {}
	var cells: Array = []
	for y in range(selection.position.y, selection.end.y):
		for x in range(selection.position.x, selection.end.x):
			cells.append(y * columns + x + 1)
	return {"tilesetId": tileset_id, "width": selection.size.x, "height": selection.size.y, "cells": cells, "anchor": "top-left"}


func tile_texture(tile: int) -> Texture2D:
	if tile < 1 or tile > columns * rows or atlas_texture == null:
		return null
	var result := AtlasTexture.new()
	result.atlas = atlas_texture
	result.region = Rect2(Vector2((tile - 1) % columns, (tile - 1) / columns) * Vector2(tile_size), Vector2(tile_size))
	return result


func _gui_input(event: InputEvent) -> void:
	if atlas_texture == null:
		return
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		if event.pressed:
			grab_focus()
			_selection_before_drag = selection
			_anchor = _cell(event.position)
			_dragging = true
			_update_drag(_anchor)
		else:
			_dragging = false
		accept_event()
	elif event is InputEventMouseMotion and _dragging:
		if event.button_mask & MOUSE_BUTTON_MASK_LEFT:
			_update_drag(_cell(event.position))
		else:
			_dragging = false
		accept_event()
	elif event is InputEventKey and event.pressed:
		var delta := Vector2i.ZERO
		match event.keycode:
			KEY_LEFT: delta = Vector2i.LEFT
			KEY_RIGHT: delta = Vector2i.RIGHT
			KEY_UP: delta = Vector2i.UP
			KEY_DOWN: delta = Vector2i.DOWN
			KEY_ESCAPE: _cancel_drag()
			_: return
		if delta != Vector2i.ZERO:
			var cursor := _cursor if event.shift_pressed else selection.position
			cursor = (cursor + delta).clamp(Vector2i.ZERO, Vector2i(columns - 1, rows - 1))
			if not event.shift_pressed:
				_anchor = cursor
			_update_drag(cursor)
		accept_event()


func _cell(position: Vector2) -> Vector2i:
	return Vector2i((position / Vector2(tile_size)).floor()).clamp(Vector2i.ZERO, Vector2i(columns - 1, rows - 1))


func _update_drag(cell: Vector2i) -> void:
	_cursor = cell
	var top_left := Vector2i(mini(cell.x, _anchor.x), mini(cell.y, _anchor.y))
	selection = Rect2i(top_left, Vector2i(absi(cell.x - _anchor.x), absi(cell.y - _anchor.y)) + Vector2i.ONE)
	_publish()


func _publish(notify := true) -> void:
	queue_redraw()
	reveal_requested.emit(Rect2(Vector2(selection.position * tile_size), Vector2(selection.size * tile_size)))
	if notify:
		brush_selected.emit(selected_brush())


func _cancel_drag(restore := true) -> void:
	var was_dragging := _dragging
	_dragging = false
	if restore and was_dragging and atlas_texture != null:
		selection = _selection_before_drag
		_anchor = selection.position
		_cursor = selection.end - Vector2i.ONE
		_publish()


func _draw() -> void:
	if atlas_texture == null:
		return
	draw_texture(atlas_texture, Vector2.ZERO)
	var extent := Vector2(columns, rows) * Vector2(tile_size)
	for x in range(1, columns):
		draw_line(Vector2(x * tile_size.x, 0), Vector2(x * tile_size.x, extent.y), Color(0, 0, 0, 0.35))
	for y in range(1, rows):
		draw_line(Vector2(0, y * tile_size.y), Vector2(extent.x, y * tile_size.y), Color(0, 0, 0, 0.35))
	var selected := Rect2(Vector2(selection.position * tile_size), Vector2(selection.size * tile_size)).grow(-1)
	draw_rect(selected, Color("f2c94c"), false, 2)
	if has_focus():
		draw_rect(selected.grow(-2), Color.WHITE, false, 1)
