extends RefCounted

signal projection_applied(projection: Dictionary)
signal status_changed(message: String)
signal special_land_changed
signal cell_committed(tile: int)

var workspace := preload("res://src/land_paint_workspace.gd").new()
var _editor: ProvidenceLandEditor
var _inspector: ProvidenceMapInspector
var _bridge: RefCounted
var _operations: ProvidenceEditorOperation
var _read_context: Callable
var _accept_response: Callable
var _accept_draft_response: Callable
var _context: Dictionary = {}


func dispose() -> void:
	_bridge = null
	_read_context = Callable(); _accept_response = Callable(); _accept_draft_response = Callable()
	workspace.dispose()
	for relay in [projection_applied, status_changed, special_land_changed, cell_committed]:
		for connection in relay.get_connections(): relay.disconnect(connection.callable)


func connect_editor(editor: ProvidenceLandEditor, inspector: ProvidenceMapInspector) -> void:
	_editor = editor
	_inspector = inspector
	editor.paint_stroke_started.connect(begin)
	editor.paint_stroke_changed.connect(progress)
	editor.paint_stroke_requested.connect(finish)
	editor.paint_stroke_cancelled.connect(cancel)


func configure_commands(bridge: RefCounted, operations: ProvidenceEditorOperation, read_context: Callable, accept_response: Callable, accept_draft_response: Callable) -> void:
	if is_instance_valid(_editor): _editor.cancel_paint_stroke()
	_bridge = bridge
	_operations = operations
	_read_context = read_context
	_accept_response = accept_response
	_accept_draft_response = accept_draft_response


func begin() -> void:
	_context.clear()
	var current: Dictionary = _read_context.call()
	if not _can_paint(current):
		_editor.cancel_paint_stroke()
		return
	_context = {"identity": current.identity, "revision": current.revision,
		"epoch": _bridge.connection_epoch(), "bridge": _bridge.get_instance_id(), "tile": _inspector.paint_tile_value(),
		"brush": workspace.current_brush()}
	if _context.brush.is_empty(): _editor.set_paint_preview_tile(int(_context.tile))


func progress(count: int) -> void:
	if _context.is_empty(): return
	if not _context.brush.is_empty():
		workspace.preview_stroke(_context.brush)
	else:
		status_changed.emit("Paint preview · %d cells · release to apply · Esc cancels" % count)


func cancel() -> void:
	if _context.is_empty(): return
	_context.clear()
	status_changed.emit("Paint stroke canceled · no changes applied")


func finish(positions: Array) -> void:
	if _context.is_empty(): return
	var context := _context.duplicate()
	_context.clear()
	var current: Dictionary = _read_context.call()
	if not _can_paint(current) or not _matches(current, context):
		status_changed.emit("Paint not applied: the map or project changed. Start a new stroke.")
		return
	if positions.is_empty(): return
	if not _operations.begin(_bridge, "Paint"): return
	var response: Dictionary
	if not context.brush.is_empty():
		response = await _commit_terrain_stroke(context, positions)
	else:
		response = await _commit_raw_stroke(context, positions)
	_operations.finish(response)
	if response.get("refreshSpecial", false): special_land_changed.emit()


func paint_cell(x: int, y: int) -> void:
	begin()
	await finish([Vector2i(x, y)])


func commit_cell() -> void:
	var current: Dictionary = _read_context.call()
	if current.cell.x < 0 or current.dungeon:
		if current.dungeon:
			status_changed.emit("Dungeon bitfields cannot be committed through the Land tile control.")
		return
	var committed_tile := int(_inspector.tile_value())
	if not _operations.begin(_bridge, "Apply Tile"):
		_accept_draft_response.call({"ok": false, "error": "Wait for the current operation, or reopen the project if its outcome was not confirmed."})
		return
	var response: Dictionary = await _request_for_map("map.paint-cells", {
		"expectedRevision": current.revision, "identity": current.identity,
		"cells": [{"x": current.cell.x, "y": current.cell.y, "tile": committed_tile}]})
	if not _accept_draft_response.call(response):
		_operations.finish(response)
		return
	var projection: Dictionary = response.result
	projection_applied.emit(projection)
	var painted: Array = projection.get("paintedCells", [])
	if painted.is_empty():
		status_changed.emit("Map paint returned no cell delta.")
		_operations.finish(response)
		return
	var actual_tile := int(painted[0].get("tile", committed_tile))
	_editor.update_cell(current.cell.x, current.cell.y, actual_tile)
	_editor.apply_terrain_delta(projection)
	cell_committed.emit(actual_tile)
	_operations.finish(response)
	if current.originalTile < 0 or actual_tile < 0: special_land_changed.emit()


func _commit_raw_stroke(context: Dictionary, positions: Array) -> Dictionary:
	var cells: Array = []
	for cell: Vector2i in positions:
		cells.append({"x": cell.x, "y": cell.y, "tile": int(context.tile)})
	var refresh_special := int(context.tile) < 0 or _editor.paint_touches_special_land(positions)
	var response: Dictionary = await _request_for_map("map.paint-cells", {
		"expectedRevision": context.revision, "identity": context.identity, "cells": cells})
	if not _accept_response.call(response): return response
	var projection: Dictionary = response.result
	projection_applied.emit(projection)
	for painted: Dictionary in projection.get("paintedCells", []):
		_editor.update_cell(int(painted.x), int(painted.y), int(painted.tile))
	_editor.apply_terrain_delta(projection)
	var last: Vector2i = positions.back()
	_editor.select_cell(last.x, last.y)
	status_changed.emit("Painted %d cells · revision %d" % [cells.size(), projection.revision])
	response["refreshSpecial"] = refresh_special
	return response


func _commit_terrain_stroke(context: Dictionary, positions: Array) -> Dictionary:
	var planned := workspace.plan_stroke(context.brush, positions)
	if not planned.ok:
		status_changed.emit(planned.error)
		return planned
	var params := {"expectedRevision": context.revision, "identity": context.identity,
		"paint": {"tilesetId": context.brush.tilesetId, "cells": planned.cells}}
	var preview: Dictionary = await _request_for_map("map.preview-terrain", params)
	if not _accept_response.call(preview): return preview
	if preview.result.paintedCells.is_empty():
		status_changed.emit("The selected cells already match this terrain.")
		return preview
	var response: Dictionary = await _request_for_map("map.paint-terrain", params)
	if not _accept_response.call(response): return response
	projection_applied.emit(response.result)
	_editor.apply_painted_terrain(response.result.paintedCells, planned.cells)
	var last: Vector2i = positions.back()
	_editor.select_cell(last.x, last.y)
	status_changed.emit("Painted %d terrain cells · revision %d" % [response.result.paintedCells.size(), response.result.revision])
	return response


func _request_for_map(method: String, params: Dictionary) -> Dictionary:
	var connection := _bridge.get_instance_id()
	var epoch: int = _bridge.connection_epoch()
	var response: Dictionary = await _operations.request(method, params)
	if not response.get("ok", false): return response
	var current: Dictionary = _read_context.call()
	if connection != _bridge.get_instance_id() or epoch != _bridge.connection_epoch() or current.identity != params.identity:
		# An acknowledged write must never be replayed onto another map/session.
		# Reopening reconciles the durable result without retrying that write.
		return {"ok": false, "outcomeUnknown": true, "error": "The map session changed before the paint result could be displayed. Reopen the project before editing again."}
	return response


func _can_paint(current: Dictionary) -> bool:
	return current.connected and current.active and current.mode == "paint" and not current.dungeon and not str(current.identity).is_empty() and workspace.can_paint()


func _matches(current: Dictionary, context: Dictionary) -> bool:
	return context.identity == current.identity and int(context.revision) == int(current.revision) and int(context.epoch) == _bridge.connection_epoch() and int(context.bridge) == _bridge.get_instance_id()
