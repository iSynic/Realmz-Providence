extends SceneTree

const ROUTES := {
	"maps.dungeon": "res://src/dungeon_editor.tscn",
	"maps.layout": "res://src/land_layout_editor.tscn",
	"maps.special-land": "res://src/special_land_editor.tscn",
	"player-maps.map-records": "res://src/player_maps_editor.tscn",
}

const REQUIRED_NODES := {
	"maps.dungeon": ["DungeonHeader", "DungeonCanvasRegion", "DungeonMapCanvas", "DungeonCellInspector", "DungeonFeatureDock", "PreservedMarkers", "Wall", "HorizontalDoor", "VerticalDoor", "Stairs", "Column", "Archway", "North", "East", "South", "West", "Unmapped", "NoWall", "ApplyDungeonPrimitive", "DiscardFeatures"],
	"maps.layout": ["LayoutHeader", "LayoutGrid", "LandMapPalette", "SelectedLayoutCell", "NeighborPreview", "ClearLayoutConfirmation"],
	"maps.special-land": ["ScenarioPictureFilters", "ScenarioPictureCatalog", "ScenarioPictureGallery", "PictureSelectionInspector", "PicturePreview", "SpecialLandUsedBy", "WorldSpecialCatalog", "SpecialGallery", "SpecialPlace", "SpecialOpen", "SpecialUses", "SpecialRecover"],
	"player-maps.map-records": ["Header", "PlayerMapSearch", "PlayerMapRecordList", "PlayerMapDetailScroll", "PlayerMapPreview", "MarkerSlot", "PlaceMarker", "ClearMarker", "NewPlayerMap", "ApplyPlayerMap", "DiscardPlayerMap"],
}


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	for route_id in ROUTES:
		var packed := load(str(ROUTES[route_id])) as PackedScene
		if packed == null:
			_fail("%s has no loadable scene" % route_id)
			return
		var surface := packed.instantiate() as Control
		# Player Maps owns its browser inside the rail-only authoring profile.
		var document_width := 1490 if route_id == "player-maps.map-records" else 1220
		surface.size = Vector2(document_width, 740)
		root.add_child(surface)
		await process_frame
		for node_name in REQUIRED_NODES[route_id] as Array:
			if surface.find_child(str(node_name), true, false) == null:
				_fail("%s is missing named region %s" % [route_id, node_name])
				return
		if surface.get_combined_minimum_size().x > document_width:
			_fail("%s exceeds the compact document width: %.1f" % [route_id, surface.get_combined_minimum_size().x])
			return
		surface.queue_free()
		await process_frame
	if not _exercise_projections(): return
	print("PROVIDENCE_WORLD_ROUTE_SCENES_OK routes=4 compactDocumentWidth=1220 playerMapDocumentWidth=1490")
	quit(0)


func _exercise_projections() -> bool:
	var layout: Control = load("res://src/land_layout_editor.tscn").instantiate() as Control
	root.add_child(layout)
	layout.set_projection({
		"layout": {"cells": _layout_cells()},
		"landMaps": [{"identity": "land:0", "nativeIndex": 0, "name": "Thornwatch Coast"}],
		"sourcePresent": true,
		"diagnosticCount": 1,
	})
	if layout.find_child("LayoutGrid",true,false).cells.size()!=128:
		_fail("Land Layout did not realize its complete 8 by 16 spatial grid")
		return false
	if not _layout_clear_context(layout): return false
	layout.queue_free()
	var player_maps: Control = load("res://src/player_maps_editor.tscn").instantiate() as Control
	root.add_child(player_maps)
	player_maps.set_catalog({"records": [{"identity": "player-map:0", "nativeId": 0, "name": "Thornwatch Survey"}], "total": 1})
	player_maps.set_document({
		"playerMap": {"identity": "player-map:0", "nativeId": 0, "markers": [], "startX": 4, "startY": 7, "level": 0, "pictureId": 0, "iconSize": 16, "show": 1, "isDungeon": false, "pictureRect": {"top": 0, "left": 0, "bottom": 90, "right": 90}, "note": "North road survey", "authored": false},
		"names": {"availableName": "Thornwatch Survey", "unavailableName": "Uncharted Coast"},
		"runtimeAddressable": true,
		"sourcePresent": true,
		"referenceSummary": {"outgoing": 1, "usedBy": 0},
		"diagnosticCount": 0,
	})
	if (player_maps.find_child("AvailableName", true, false) as LineEdit).text != "Thornwatch Survey":
		_fail("Player Maps did not bind its bounded name projection")
		return false
	player_maps.queue_free()
	return true


func _layout_cells() -> Array:
	var cells: Array = []
	cells.resize(128)
	cells.fill(0)
	cells[0] = -1
	return cells


func _layout_clear_context(layout: Control) -> bool:
	var cells := _layout_cells(); cells[1] = 1
	layout.set_projection({"layout":{"cells":cells},"landMaps":[{"identity":"land:0","nativeIndex":0,"name":"Coast"},{"identity":"land:1","nativeIndex":1,"name":"Harbor"}]})
	layout._show_selected(0,0)
	if layout.get_node("%EastNeighbor").disabled: _fail("Populated Layout did not expose its actual neighbor."); return false
	var opened: Array = []
	layout.map_open_requested.connect(func(identity): opened.append(identity))
	layout.clear()
	for name in ["NorthNeighbor","EastNeighbor","SouthNeighbor","WestNeighbor"]:
		var button: Button = layout.get_node("%"+name)
		if not button.disabled or not button.get_meta("identity","").is_empty() or button.icon != null:
			_fail("Cleared Layout retained a stale neighbor: " + name); return false
		button.pressed.emit()
	if not opened.is_empty(): _fail("Cleared Layout emitted stale navigation."); return false
	print("PROVIDENCE_LAYOUT_EMPTY_CONTEXT_OK populated-clear no-stale-caption-icon-identity-action")
	return true


func _fail(message: String) -> void:
	push_error("PROVIDENCE_WORLD_ROUTE_SCENES_FAILED: %s" % message)
	quit(1)
