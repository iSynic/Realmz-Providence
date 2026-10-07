extends "res://tools/profile_map_history.gd"

const STROKE_CELLS := 20


func _paint_probe() -> Dictionary:
	var opened := _bridge.request("map.open", {"identity": _shell._maps.document.identity})
	if not _accept(opened): return {}
	var terrain: Array = opened.result.get("terrainTiles", [])
	var words: Array = opened.result.map.tiles
	for tile in [90, 164]:
		for y in 90:
			var cells: Array = []
			for x in 90:
				var value: Variant = terrain[y * 90 + x]
				# Markers and flagged legacy words deliberately require the complete history refresh.
				if value == null or int(value) == tile or int(words[y * 90 + x]) < 1 or int(words[y * 90 + x]) > 200:
					cells.clear()
					continue
				cells.append({"x": x, "y": y, "tile": tile})
				if cells.size() == STROKE_CELLS:
					return {"tilesetId": opened.result.map.runtime.tilesetId, "cells": cells}
	_failed = true
	push_error("No contiguous 20-cell changed-terrain probe was available")
	return {}


func _paint(probe: Dictionary) -> bool:
	_shell._maps.set_tool_mode("paint")
	var tile := int(probe.cells[0].tile)
	if not _shell._maps.paint.workspace.tiles_dock.select_tile(tile):
		_failed = true
		push_error("The actual palette did not expose the stroke tile")
		return false
	var positions: Array = []
	for cell: Dictionary in probe.cells: positions.append(Vector2i(int(cell.x), int(cell.y)))
	var revision: int = _shell._session_view.revision
	_bridge.calls.clear()
	_shell._maps.paint.begin()
	await _shell._maps.paint.finish(positions)
	var methods: Array = _bridge.calls.map(func(call): return call.method)
	var opened: Dictionary = _bridge.request("map.open", {"identity":_shell._maps.document.identity})
	var all_changed: bool = opened.get("ok",false) and probe.cells.all(func(cell): return int(opened.result.terrainTiles[int(cell.y)*90+int(cell.x)]) == int(cell.tile))
	if _shell._session_view.revision != revision + 1 or not all_changed or methods != ["map.preview-terrain", "map.paint-terrain"]:
		_failed = true
		push_error("The 20-cell stroke was not one completed native paint operation: " + str(methods))
		return false
	print("PROVIDENCE_STROKE_PROFILE_PAINT cells=20 revision=%d one-command" % _shell._session_view.revision)
	return true


func _new_report(directory: String, described: Dictionary) -> Dictionary:
	var report := super(directory, described)
	report["paintedCellsPerHistoryEntry"] = STROKE_CELLS
	report["ordinaryTerrainOnly"] = true
	report["scope"] = "disposable full import; contiguous 20-cell single-brush stroke through the actual paint controller; actual asynchronous Undo/Redo; headless Godot"
	return report
