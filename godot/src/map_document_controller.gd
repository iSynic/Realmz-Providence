class_name ProvidenceMapDocumentController
extends RefCounted

signal catalog_changed(maps: Array)
signal document_opened(map: Dictionary, reset_selection: bool)
signal document_cleared
signal tile_catalog_changed(catalog: Dictionary)
signal status_changed(message: String)
signal failed(message: String)
signal region_requested(slot: int)

var identity := ""
var is_dungeon := false
var selected_cell := Vector2i(-1, -1)
var original_tile := 0
var selected_action_point: Dictionary = {}
var maps: Array = []
var refresh_selection: Callable

var _land: ProvidenceLandEditor
var _dungeon: Control
var _inspector: ProvidenceMapInspector
var _sidebar: ProvidenceMapContextSidebar
var _bridge: RefCounted
var _operations: ProvidenceEditorOperation
var _generation := 0


func initialize(land: ProvidenceLandEditor, dungeon: Control, inspector: ProvidenceMapInspector, sidebar: ProvidenceMapContextSidebar, operations: ProvidenceEditorOperation) -> void:
	_land = land
	_dungeon = dungeon
	_inspector = inspector
	_sidebar = sidebar
	_operations = operations


func attach_session(bridge: RefCounted) -> void:
	_generation += 1
	_land.cancel_paint_stroke()
	_bridge = bridge


func teardown() -> void:
	_generation += 1
	_bridge = null
	maps.clear()
	clear()
	catalog_changed.emit(maps)


func dispose() -> void:
	_generation += 1
	_bridge = null
	refresh_selection = Callable()
	for relay in [catalog_changed, document_opened, document_cleared, tile_catalog_changed, status_changed, failed, region_requested]:
		for connection in relay.get_connections(): relay.disconnect(connection.callable)


func select_cell(x: int, y: int, tile: int, action_point: Dictionary) -> void:
	selected_cell = Vector2i(x, y)
	original_tile = tile
	selected_action_point = action_point.duplicate(true)


func preview_control() -> Control:
	return (_dungeon if is_dungeon else _land).get_node("%MapEditorPreview")


func read_rectangle(rectangle_identity: String) -> Dictionary:
	return await _operations.run_workflow(_bridge, "Open referenced rectangle", func(operation):
		return await operation.request("random-rectangle.open", {"identity": rectangle_identity}))


func reveal_region(slot: int) -> void:
	region_requested.emit(slot)


func reload_catalog(borrowed: ProvidenceEditorOperation = null) -> Dictionary:
	if _bridge == null: return _session_changed()
	var response := await _operations.run_workflow(_bridge, "Load maps", _reload_catalog.bind(_generation), borrowed)
	if not response.get("ok", false): failed.emit(str(response.get("error", "Map catalog failed.")))
	return response


func _reload_catalog(operation: ProvidenceEditorOperation, generation: int) -> Dictionary:
	var items: Array = []
	var revision := -1
	var total := -1
	while true:
		var response := await operation.request("map.catalog", {"offset": items.size(), "limit": 128, "levelType": "all", "includeDiagnostics":false,"includeReferences":false})
		if not response.get("ok", false): return response
		if generation != _generation: return _session_changed()
		var page: Dictionary = response.result
		var rows: Array = page.get("items", [])
		if revision < 0:
			revision = int(page.get("revision", 0))
			total = int(page.get("total", rows.size()))
		if int(page.get("revision", revision)) != revision or int(page.get("total", total)) != total:
			return {"ok": false, "error": "The map catalog changed while loading. Reload it to continue."}
		if rows.size() > 128 or int(page.get("offset", items.size())) != items.size() or total < items.size() + rows.size():
			return {"ok": false, "error": "The map catalog returned an inconsistent page."}
		items.append_array(rows)
		if items.size() == total:
			var catalog := {"revision": revision, "items": items, "total": total, "truncated": false}
			apply_catalog(catalog)
			return {"ok": true, "result": catalog}
		if rows.is_empty(): return {"ok": false, "error": "The map catalog ended before all records were loaded."}
	return _session_changed()


func apply_catalog(catalog: Dictionary) -> void:
	maps = catalog.get("items", []).duplicate(true)
	catalog_changed.emit(maps)
	if catalog.get("truncated", false):
		push_warning("Map catalog returned %d of %d maps." % [maps.size(), int(catalog.get("total", maps.size()))])


func load_first() -> void:
	if _bridge == null: return
	var response := await _operations.run_workflow(_bridge, "Open map", _load_first.bind(_generation))
	if not response.get("ok", false): failed.emit(str(response.get("error", "Map could not be opened.")))


func load_first_async(operation: ProvidenceEditorOperation) -> Dictionary:
	return await _operations.run_workflow(_bridge, "Open map", _load_first.bind(_generation), operation)


func _load_first(operation: ProvidenceEditorOperation, generation: int) -> Dictionary:
	var catalog := await _reload_catalog(operation, generation)
	if not catalog.get("ok", false): return catalog
	if maps.is_empty():
		clear()
		return {"ok": true}
	return await _load_map(operation, str(maps[0].identity), generation)


func load_map(map_identity: String, borrowed: ProvidenceEditorOperation = null) -> Dictionary:
	if _bridge == null: return _session_changed()
	var response := await _operations.run_workflow(_bridge, "Open map", _load_map.bind(map_identity, _generation), borrowed)
	if not response.get("ok", false): failed.emit(str(response.get("error", "Map could not be opened.")))
	return response


func _load_map(operation: ProvidenceEditorOperation, map_identity: String, generation: int) -> Dictionary:
	var response := await operation.request("map.open", {"identity": map_identity, "includeDiagnostics":false,"includeReferences":false})
	if not response.get("ok", false): return response
	if generation != _generation: return _session_changed()
	apply_document(response.result, true)
	var atlas := await operation.request("map.render-atlas", {"identity": map_identity})
	if generation != _generation: return _session_changed()
	if not atlas.get("ok", false):
		status_changed.emit("Map opened with compatibility colors · %s" % str(atlas.get("error", "tileset preview unavailable")))
		return atlas
	var applied := apply_atlas(atlas.result)
	_show_atlas_status(atlas.result, applied)
	return {"ok": true}


func _session_changed() -> Dictionary:
	return {"ok": false, "connectionChanged": true, "error": "The map session changed before loading finished."}


func apply_document(result: Dictionary, reset_selection: bool) -> void:
	var map: Dictionary = result.get("map", {})
	identity = str(map.get("identity", ""))
	_land.document_identity = identity if str(map.get("levelType","land"))=="land" else ""
	is_dungeon = str(map.get("levelType", "land")) == "dungeon"
	var preview_view: Control = _dungeon if is_dungeon else _land
	preview_view.get_node("%MapEditorPreview").set_blockers(result.get("losBlockers", []))
	_sidebar.set_selected_map(identity)
	_inspector.set_commit_allowed(not is_dungeon, "Dungeon cells use bounded primitive commands in the dedicated Dungeon Editor." if is_dungeon else "Commit this one signed-short land tile.")
	_land.set_map_title("%s %d  ·  %s  ·  90 × 90" % [str(map.get("levelType", "land")).to_upper(), int(map.get("nativeIndex", 0)), str(map.get("name", "Unnamed Map")).to_upper()])
	_land.name = str(map.get("name", "Land Map"))
	if reset_selection:
		selected_cell = Vector2i(-1, -1)
		selected_action_point.clear()
		if is_dungeon: _dungeon.clear_render_atlas()
		else: _land.clear_render_atlas()
	if is_dungeon:
		if reset_selection: _dungeon.set_document(result)
		else: _dungeon.refresh_document(result)
	elif reset_selection:
		_land.set_document(map.get("tiles", []), result.get("actionPoints", []), result.get("terrainTiles", []))
	else:
		_land.refresh_document(map.get("tiles", []), result.get("actionPoints", []), result.get("terrainTiles", []))
	preview_view.get_node("%RandomRegionOverlay").set_document(identity, (map.get("runtime") if map.get("runtime") is Dictionary else {}).get("randomRectangles", []))
	_land.set_view_projection({} if is_dungeon else result)
	tile_catalog_changed.emit(result.get("tileCatalog", {}))
	document_opened.emit(map, reset_selection)


func apply_atlas(atlas: Dictionary) -> bool:
	return _dungeon.set_render_atlas(atlas) if is_dungeon else _land.set_render_atlas(atlas)


func _show_atlas_status(atlas: Dictionary, applied: bool) -> void:
	if not applied:
		status_changed.emit("Map opened with compatibility colors · %s" % str(atlas.get("reason", "tileset preview unavailable")))
		return
	var missing := (atlas.get("unresolvedOverlayResourceIds", []) as Array).size()
	status_changed.emit("Map opened · source artwork · %s · %d overlays%s" % [
		str(atlas.get("tilesetId", "Realmz tileset")), _land.render_overlay_count(),
		" · %d unresolved" % missing if missing > 0 else ""])


func refresh_history(operation: ProvidenceEditorOperation = null, projection: Dictionary = {}) -> Dictionary:
	if _bridge == null: return _session_changed()
	return await _operations.run_workflow(_bridge, "Refresh map", _refresh_history.bind(_generation, projection), operation)


func restore_location(state: Dictionary) -> bool:
	var target := str(state.get("identity",""))
	if target.is_empty(): return false
	var generation := _generation
	var loaded := await load_map(target)
	if not loaded.get("ok",false) or generation!=_generation: return false
	if is_dungeon and not state.get("cells",[]).is_empty():
		var selected := await _operations.run_workflow(_bridge,"Restore Dungeon selection",_restore_selection.bind(target,state.cells,generation))
		if not selected.get("ok",false): return false
	if generation!=_generation or identity!=target: return false
	return await (_dungeon if is_dungeon else _land).restore_navigation_state(state)


func _restore_selection(operation: ProvidenceEditorOperation, target: String, cells: Array, generation: int) -> Dictionary:
	var selected := await operation.request("dungeon-cell.selection",{"identity":target,"cells":cells})
	if selected.get("ok",false) and generation==_generation and identity==target: _dungeon.set_selection_projection(selected.result)
	return selected


func _refresh_history(operations: ProvidenceEditorOperation, generation: int, projection: Dictionary) -> Dictionary:
	if generation != _generation: return _session_changed()
	var direct := _can_refresh_current(projection)
	if direct and _apply_history_terrain_delta(projection):
		if refresh_selection.is_valid(): return await refresh_selection.call(operations)
		return {"ok": true}
	if not direct:
		var catalog: Dictionary = await _reload_catalog(operations, generation)
		if not catalog.get("ok", false): return catalog
	if maps.is_empty():
		clear()
		return {"ok": true}
	var next_identity := identity
	if not maps.any(func(map): return str(map.identity) == next_identity):
		next_identity = str(maps[0].identity)
	var opened: Dictionary = await operations.request("map.open", {"identity": next_identity, "includeDiagnostics":false,"includeReferences":false})
	if direct and not opened.get("ok", false):
		var catalog: Dictionary = await _reload_catalog(operations, generation)
		if not catalog.get("ok", false): return catalog
		if maps.is_empty():
			clear()
			return {"ok": true}
		next_identity = identity if maps.any(func(map): return str(map.identity) == identity) else str(maps[0].identity)
		opened = await operations.request("map.open", {"identity": next_identity, "includeDiagnostics":false,"includeReferences":false})
	if not opened.get("ok", false): return opened
	if generation != _generation: return _session_changed()
	var result: Dictionary = opened.result
	var runtime: Dictionary = result.map.runtime if result.map.get("runtime") is Dictionary else {}
	var refresh_atlas := str(runtime.get("tilesetId", "")) != _land.render_atlas_identity()
	refresh_atlas = refresh_atlas or _land.requires_atlas_refresh(result.map.tiles)
	var replaced := identity != next_identity or is_dungeon != (str(result.map.levelType) == "dungeon")
	apply_document(result, replaced)
	if refresh_atlas or is_dungeon or replaced:
		var atlas: Dictionary = await operations.request("map.render-atlas", {"identity": identity})
		if not atlas.get("ok", false): return atlas
		if generation != _generation: return _session_changed()
		apply_atlas(atlas.result)
	if is_dungeon: return await _refresh_dungeon_selection(operations, generation)
	if refresh_selection.is_valid(): return await refresh_selection.call(operations)
	return {"ok": true}


func _apply_history_terrain_delta(projection: Dictionary) -> bool:
	var delta: Dictionary = projection.get("mapTerrainDelta", {})
	if is_dungeon or delta.get("identity", "") != identity: return false
	var cells: Array = delta.get("cells", [])
	if cells.is_empty() or cells.size() > 1024: return false
	for cell: Dictionary in cells:
		_land.update_cell(int(cell.x), int(cell.y), int(cell.tile))
		if selected_cell == Vector2i(int(cell.x), int(cell.y)):
			original_tile = int(cell.tile)
	_land.apply_terrain_delta({"terrainCells": cells})
	_land.get_node("%MapEditorPreview").apply_blocker_delta(cells)
	_land.get_node("%MapViewOverlay").apply_cell_delta(cells)
	if selected_cell.x >= 0: _land.select_cell(selected_cell.x, selected_cell.y, false)
	return true


func _can_refresh_current(projection: Dictionary) -> bool:
	if identity.is_empty() or bool(projection.get("truncated", true)) \
		or not bool(projection.get("referencesUnchanged", false)): return false
	var changed: Array = projection.get("changedEntities", [])
	var affected: Array = projection.get("affectedEntities", [])
	return int(projection.get("changedEntitiesTotal", 0)) == 1 \
		and int(projection.get("affectedEntitiesTotal", 0)) == 1 \
		and changed == [identity] and affected == [identity] \
		and (projection.get("referenceChanges", []) as Array).is_empty() \
		and (projection.get("affectedDiagnostics", []) as Array).is_empty()


func _refresh_dungeon_selection(operation: ProvidenceEditorOperation, generation: int) -> Dictionary:
	var cell: Vector2i = _dungeon.selected_coordinate()
	if cell.x < 0: return {"ok": true}
	var cells: Array = _dungeon.draft.cells.duplicate(true)
	if cells.size() > 1:
		var selected := await operation.request("dungeon-cell.selection", {"identity": identity, "cells": cells})
		if not selected.get("ok", false): return selected
		if generation != _generation: return _session_changed()
		if _dungeon.draft.cells == cells: _dungeon.set_selection_projection(selected.result)
		return {"ok": true}
	var response := await operation.request("dungeon-cell.open", {"identity": identity, "x": cell.x, "y": cell.y})
	if not response.get("ok", false): return response
	if generation != _generation: return _session_changed()
	if _dungeon.selected_coordinate() == cell: _dungeon.set_cell_projection(response.result)
	return {"ok": true}


func refresh_after_change(projection: Dictionary, project_id: String) -> void:
	var changed: Array = projection.get("changedEntities", [])
	var project_changed := project_id in changed or bool(projection.get("truncated", false))
	var maps_changed := changed.any(func(item): return str(item).begins_with("land:") or str(item).begins_with("dungeon:"))
	if not project_changed and not maps_changed: return
	_land.cancel_paint_stroke()
	var response := await refresh_history()
	if not response.get("ok", false): failed.emit(str(response.get("error", "Map could not be refreshed.")))


func clear() -> void:
	tile_catalog_changed.emit({})
	identity = ""
	is_dungeon = false
	selected_cell = Vector2i(-1, -1)
	original_tile = 0
	selected_action_point.clear()
	_land.set_document([], [])
	_land.clear_render_atlas()
	_land.set_map_title("No map open")
	_land.document_identity = ""
	_land.set_view_projection({})
	_land.name = "No Map Open"
	_dungeon.set_document({})
	_dungeon.clear_render_atlas()
	for view in [_land, _dungeon]: view.get_node("%RandomRegionOverlay").set_document("", [])
	_sidebar.set_selected_map("")
	_inspector.set_overview("", "land", false, "Open or import a map to edit terrain.")
	document_cleared.emit()

func session_epoch() -> int:
	return _bridge.connection_epoch() if _bridge!=null else -1
