extends RefCounted

signal assets_requested
signal tool_mode_requested(mode: String)
signal status_changed(message: String)
signal availability_changed
signal authoring_tool_requested(tool: String)
signal authoring_cell_requested

var tiles_dock: PanelContainer
var _editor: ProvidenceLandEditor
var _inspector: ProvidenceMapInspector
var _dialog_owner: Node
var _inspector_parent: Node
var _visual_brush := true
var _special_mode := false
var _special_texture: Texture2D
var _details: AcceptDialog
var _atlas_epoch := 0
var _active := false
var _connected := false
var _dungeon := false


func dispose() -> void:
	_atlas_epoch += 1
	for relay in [assets_requested, tool_mode_requested, status_changed, availability_changed, authoring_tool_requested, authoring_cell_requested]:
		for connection in relay.get_connections(): relay.disconnect(connection.callable)


func initialize(editor: ProvidenceLandEditor, inspector: ProvidenceMapInspector, tiles_host: Node, dialog_owner: Node) -> void:
	_editor = editor
	_inspector = inspector
	_dialog_owner = dialog_owner
	tiles_dock = preload("res://src/land_tile_dock.gd").new()
	tiles_dock.name = "LandTilesDock"
	tiles_host.add_child(tiles_dock)
	tiles_dock.assets_requested.connect(func(): assets_requested.emit())
	tiles_dock.brush_selected.connect(_select_brush)
	_inspector.raw_brush_changed.connect(func(): _visual_brush = false)
	_editor.atlas_changed.connect(set_atlas)
	_editor.cell_details_requested.connect(authoring_cell_requested.emit)
	_editor.terrain_sample_requested.connect(_sample)
	_editor.paint_tool_requested.connect(set_tool)
	set_atlas(_editor.atlas_projection)


func set_environment(active: bool, connected: bool, dungeon: bool) -> void:
	_active = active
	_connected = connected
	_dungeon = dungeon
	if not is_instance_valid(tiles_dock): return
	tiles_dock.visible = active and not dungeon
	_editor.set_paint_available(active and connected and can_paint())


func set_atlas(projection: Dictionary) -> void:
	_atlas_epoch += 1
	if not is_instance_valid(tiles_dock): return
	_editor.cancel_paint_stroke()
	tiles_dock.set_atlas(projection)
	_visual_brush = not _special_mode
	if _special_mode: _editor.set_special_paint_artwork(_inspector.paint_tile_value(),_special_texture)
	set_environment(_active, _connected, _dungeon)
	availability_changed.emit()


func can_paint() -> bool:
	if _special_mode: return _special_texture != null
	return not is_instance_valid(tiles_dock) or not _visual_brush or tiles_dock.is_available()


func current_brush() -> Dictionary:
	if not is_instance_valid(tiles_dock) or not _visual_brush or not tiles_dock.is_available(): return {}
	var result: Dictionary = tiles_dock.brush.duplicate(true)
	result["atlasEpoch"] = _atlas_epoch
	return result


func _select_brush(brush: Dictionary) -> void:
	_inspector.set_paint_tile_value(int(brush.cells[0]))
	_visual_brush = true
	tool_mode_requested.emit("paint")


func set_tool(tool: String) -> void:
	if tool == "paint" and not _special_mode and tiles_dock.is_available(): _visual_brush = true
	tool_mode_requested.emit("paint" if tool == "paint" else "select")
	_editor.present_paint_tool(tool)
	authoring_tool_requested.emit(tool)
	if tool == "sample": status_changed.emit("Sample · click terrain to select its exact atlas tile")
	if tool == "pan": status_changed.emit("Pan · drag the map · middle-button pan also remains available")
	if tool == "action-point": status_changed.emit("Action Point placement · click an empty cell to review · click an existing AP to open · Esc selects")


func present_mode(mode: String) -> void:
	if not is_instance_valid(_editor): return
	_editor.present_paint_tool(mode)
	authoring_tool_requested.emit(mode)
	status_changed.emit("Paint mode · drag to paint · release to apply · Esc cancels" if mode == "paint" else "Select mode · inspect cells and placed Action Points")
	if mode == "paint" and not can_paint():
		status_changed.emit("Painting paused · tile artwork is unavailable · open Assets to inspect the source")


func preview_stroke(brush: Dictionary) -> void:
	var planned := _stroke_cells(brush, _editor.paint_positions())
	var preview := _editor.preview_terrain(planned)
	status_changed.emit("Cannot paint here · move the entire brush inside the map · Esc cancels" if not planned.invalid.is_empty() else "Terrain preview · %d cells · release to apply · Esc cancels" % preview.painted)


func plan_stroke(brush: Dictionary, positions: Array) -> Dictionary:
	if int(brush.atlasEpoch) != _atlas_epoch:
		return {"ok": false, "error": "Paint not applied: tile artwork changed. Start a new stroke."}
	var planned := _stroke_cells(brush, positions)
	if not planned.invalid.is_empty():
		return {"ok": false, "error": "Paint not applied: the entire brush must fit inside the map."}
	return {"ok": true, "cells": planned.cells}


func _stroke_cells(brush: Dictionary, positions: Array) -> Dictionary:
	var values := {}
	var invalid: Array[Vector2i] = []
	var width := int(brush.width)
	var height := int(brush.height)
	for origin: Vector2i in positions:
		if origin.x < 0 or origin.y < 0 or origin.x + width > 90 or origin.y + height > 90:
			for y in height:
				for x in width: invalid.append(origin + Vector2i(x, y))
			return {"cells": [], "invalid": invalid}
		for y in height:
			for x in width:
				var cell := origin + Vector2i(x, y)
				values[cell] = int(brush.cells[y * width + x])
	var cells: Array = []
	for cell: Vector2i in values: cells.append({"x": cell.x, "y": cell.y, "tile": values[cell]})
	return {"cells": cells, "invalid": invalid}


func _sample(cell: Vector2i) -> void:
	var tile: Variant = _editor.terrain_tile_at(cell)
	if tile == null:
		status_changed.emit("This cell owns special artwork; it cannot be sampled as ordinary terrain.")
		return
	if tiles_dock.select_tile(int(tile)):
		status_changed.emit("Sampled %s · revealed in its atlas · Brush ready" % tiles_dock.tile_description(int(tile)))


func show_technical_details() -> void:
	if not is_instance_valid(_details):
		_details = preload("res://src/map_cell_details.tscn").instantiate()
		_inspector_parent = _inspector.get_parent()
		_dialog_owner.add_child(_details)
		_details.visibility_changed.connect(func():
			if not _details.visible: call_deferred("_restore_cell_details")
		)
	_inspector.reparent(_details)
	_inspector.set_mode("select")
	_inspector.show()
	_details.popup_centered(Vector2i(420, 700))


func _restore_cell_details() -> void:
	if not is_instance_valid(_inspector) or not is_instance_valid(_details) or _details.visible: return
	if _inspector.get_parent() == _details and is_instance_valid(_inspector_parent):
		_inspector.hide()
		_inspector.reparent(_inspector_parent)
		availability_changed.emit()


func close_details() -> bool:
	if not is_instance_valid(_details) or not _details.visible: return false
	_details.hide()
	return true


func set_special_brush(choice: Dictionary, texture: Texture2D) -> void:
	_special_mode = true; _visual_brush = false; _special_texture = texture
	_editor.cancel_paint_stroke()
	if not choice.is_empty(): _inspector.set_paint_tile_value(int(choice.value))
	_editor.set_special_paint_artwork(int(choice.get("value",0)),texture)
	set_environment(_active,_connected,_dungeon)
	availability_changed.emit()


func clear_special_brush() -> void:
	_special_mode = false; _special_texture = null; _visual_brush = true
	_editor.set_special_paint_artwork(0,null)
	if tiles_dock.is_available(): _inspector.set_paint_tile_value(int(tiles_dock.brush.cells[0]))
	set_environment(_active,_connected,_dungeon)
