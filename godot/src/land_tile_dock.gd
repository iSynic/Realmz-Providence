extends PanelContainer

signal brush_selected(brush: Dictionary)
signal assets_requested
signal resources_requested(kind: String)
signal save_brush_requested
signal favorite_tile_requested
signal behavior_requested(tile: int)
signal customization_requested
signal terrain_palette_requested
signal special_art_requested

var ui: Dictionary = {}
var brush: Dictionary = {}
var _projection: Dictionary = {}
var _recent_tiles: Array[int] = []
var _tab := "Atlas"
var _expanded: AcceptDialog
var _expanded_atlas: Control
var _tile_names: Dictionary = {}
var _brush_title := ""
var _special_palette_active := false


func _ready() -> void:
	theme = preload("res://theme/scenario_controls.tres").duplicate(true)
	theme.default_font_size = 12
	custom_minimum_size.x = 352
	size_flags_vertical = Control.SIZE_EXPAND_FILL
	ui = preload("res://src/land_tile_dock_layout.gd").build(self)
	ui.atlas.brush_selected.connect(_select_brush)
	ui.atlas.reveal_requested.connect(_reveal)
	ui.atlas_scroll.get_h_scroll_bar().value_changed.connect(func(_value): _update_columns())
	ui.atlas_scroll.resized.connect(_update_columns)
	ui.expand.pressed.connect(_enlarge)
	ui.open_assets.pressed.connect(func(): assets_requested.emit())
	ui.search.text_changed.connect(func(_text): _refresh_results())
	ui.category.item_selected.connect(func(_index): _refresh_results())
	ui.clear_search.pressed.connect(func(): ui.search.text = ""; ui.category.select(0); _show_tab("Atlas"))
	ui.previous.pressed.connect(func(): ui.atlas_scroll.scroll_horizontal -= 320)
	ui.next.pressed.connect(func(): ui.atlas_scroll.scroll_horizontal += 320)
	ui.results.item_selected.connect(_select_result)
	ui.save_brush.pressed.connect(func(): save_brush_requested.emit())
	ui.favorite.pressed.connect(favorite_tile_requested.emit)
	ui.behavior.pressed.connect(func(): if not brush.is_empty(): behavior_requested.emit(int(brush.cells[0])))
	ui.customization.pressed.connect(customization_requested.emit)
	ui.special.pressed.connect(special_art_requested.emit)
	ui.special_selector.pressed.connect(special_art_requested.emit)
	ui.terrain_palette.pressed.connect(terrain_palette_requested.emit)
	for title in ui.tabs:
		ui.tabs[title].pressed.connect(_show_tab.bind(title))
	_show_tab("Atlas")


func set_atlas(projection: Dictionary) -> bool:
	_projection = projection.duplicate(true)
	set_tile_catalog({})
	brush.clear()
	_brush_title = ""
	_recent_tiles.clear()
	ui.preview.texture = null
	ui.brush_name.text = "No brush selected"
	ui.brush_source.text = "No brush selected."
	var available: bool = ui.atlas.set_atlas(projection)
	ui.source.text = "Landlook %s" % str(projection.get("landlook", "—"))
	ui.scope.text = ("Scenario" if projection.get("sourceRole", "") == "scenario-override" else "Stock") if available else ""
	ui.expand.disabled = not available
	ui.save_brush.disabled = not available
	ui.favorite.disabled = not available
	ui.search.editable = available
	ui.empty.text = str(projection.get("reason", "Tile artwork is unavailable for this map."))
	if available:
		ui.atlas.select_tile(1, false)
		_select_brush(ui.atlas.selected_brush(), false)
	_refresh_results()
	_refresh_recents()
	_refresh_behavior()
	if is_instance_valid(_expanded): _expanded.hide()
	return available


func is_available() -> bool:
	return not brush.is_empty() and ui.atlas.atlas_texture != null


func tile_description(tile: int) -> String:
	return preload("res://src/land_tile_description.gd").label(tile, _tile_names.get(tile, {}))


func select_tile(tile: int) -> bool:
	if not ui.atlas.select_tile(tile):
		return false
	ui.search.text = ""
	ui.category.select(0)
	_show_tab("Atlas")
	return true


func _select_brush(value: Dictionary, notify := true) -> void:
	brush = value.duplicate(true)
	_brush_title = ""
	var tile := int(brush.cells[0])
	ui.brush_name.text = _tile_label(tile) if int(brush.width) * int(brush.height) == 1 else "Multi-tile brush"
	ui.brush_name.tooltip_text = _tile_tooltip(tile) if int(brush.width) * int(brush.height) == 1 else ""
	ui.brush_source.text = "%s · %s" % [ui.source.text, ui.scope.text]
	ui.brush_size.text = "%d × %d · terrain only" % [int(brush.width), int(brush.height)]
	ui.favorite.disabled = int(brush.width) * int(brush.height) != 1
	var image := Image.create(int(brush.width) * ui.atlas.tile_size.x, int(brush.height) * ui.atlas.tile_size.y, false, Image.FORMAT_RGBA8)
	var source: Image = ui.atlas.atlas_texture.get_image()
	for index in brush.cells.size():
		var source_index := int(brush.cells[index]) - 1
		image.blit_rect(source, Rect2i(Vector2i(source_index % ui.atlas.columns, source_index / ui.atlas.columns) * ui.atlas.tile_size, ui.atlas.tile_size), Vector2i(index % int(brush.width), index / int(brush.width)) * ui.atlas.tile_size)
	ui.preview.texture = ImageTexture.create_from_image(image)
	if int(brush.width) * int(brush.height) == 1:
		_recent_tiles.erase(tile)
		_recent_tiles.push_front(tile)
		if _recent_tiles.size() > 4: _recent_tiles.resize(4)
	_refresh_recents()
	_refresh_behavior()
	if notify: brush_selected.emit(brush.duplicate(true))


func set_map_context(available: bool) -> void:
	for button in [ui.customization, ui.special, ui.tabs.Stamps, ui.tabs.Saved]:
		button.disabled = not available
		button.tooltip_text = "" if available else "Create or open a Land map first."


func _refresh_recents() -> void:
	for child in ui.recents.get_children():
		ui.recents.remove_child(child)
		child.queue_free()
	for tile in _recent_tiles:
		var recent := Button.new()
		recent.icon = ui.atlas.tile_texture(tile)
		recent.tooltip_text = _tile_tooltip(tile)
		recent.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
		recent.pressed.connect(select_tile.bind(tile))
		ui.recents.add_child(recent)


func _show_tab(title: String) -> void:
	if title in ["Stamps", "Saved"]: resources_requested.emit("stamp" if title == "Stamps" else ""); return
	_tab = title
	for candidate in ui.tabs:
		ui.tabs[candidate].set_pressed_no_signal(candidate == title)
	_refresh_results()


func _refresh_results() -> void:
	var query: String = ui.search.text.strip_edges().to_lower()
	var available: bool = ui.atlas.atlas_texture != null
	var category: String = str(ui.category.get_item_metadata(ui.category.selected)) if ui.category.selected >= 0 else ""
	var filtered := not query.is_empty() or not category.is_empty() or _tab == "Browse"
	ui.atlas_scroll.visible = available and not filtered
	ui.results.visible = available and filtered
	ui.results.clear()
	if available and filtered:
		for tile in range(1, ui.atlas.columns * ui.atlas.rows + 1):
			var row: Dictionary = _tile_names.get(tile, {})
			if not category.is_empty() and row.get("category", "") != category: continue
			var label := _tile_label(tile)
			var normalized := query.trim_prefix("tile:").trim_prefix("tile ")
			var search: String = preload("res://src/land_tile_description.gd").search_text(tile, row)
			if not query.is_empty() and normalized != str(tile) and not search.contains(query): continue
			var index: int = ui.results.add_item(label, ui.atlas.tile_texture(tile))
			ui.results.set_item_metadata(index, tile)
			ui.results.set_item_tooltip(index, _tile_tooltip(tile))
	ui.count.text = "%d / %d tiles" % [ui.results.item_count if filtered else ui.atlas.columns * ui.atlas.rows, ui.atlas.columns * ui.atlas.rows] if available else ""
	ui.empty.visible = not available or (filtered and ui.results.item_count == 0)
	ui.open_assets.visible = not available
	if available: ui.empty.text = "No tiles match this search."
	ui.clear_search.visible = available and filtered
	ui.previous.disabled = not available or filtered
	ui.next.disabled = not available or filtered
	_update_columns()
	if _special_palette_active: _palette_visibility()


func set_tile_catalog(catalog: Dictionary) -> void:
	_tile_names.clear(); ui.category.clear(); ui.category.add_item("All categories"); ui.category.set_item_metadata(0, "")
	if catalog.get("tilesetId", "") == _projection.get("tilesetId", "") and catalog.has("items"):
		for row in catalog.items: _tile_names[int(row.tile)] = row.duplicate(true)
		for row in catalog.get("categories", []):
			ui.category.add_item(str(row.name)); ui.category.set_item_metadata(ui.category.item_count - 1, str(row.identity))
	ui.category.select(0); ui.category.disabled = _tile_names.is_empty()
	ui.atlas.set_tile_catalog(_tile_names)
	if is_instance_valid(_expanded_atlas): _expanded_atlas.set_tile_catalog(_tile_names)
	_refresh_results(); _refresh_recents()
	if not brush.is_empty() and int(brush.width) * int(brush.height) == 1 and _brush_title.is_empty(): ui.brush_name.text = _tile_label(int(brush.cells[0]))


func _tile_label(tile: int) -> String:
	return preload("res://src/land_tile_description.gd").label(tile, _tile_names.get(tile, {}))


func _tile_tooltip(tile: int) -> String:
	return preload("res://src/land_tile_description.gd").tooltip(tile, _tile_names.get(tile, {}))


func _select_result(index: int) -> void:
	ui.atlas.select_tile(int(ui.results.get_item_metadata(index)))


func use_saved_brush(resource: Dictionary) -> void:
	if resource.kind != "palette" or resource.tilesetId != _projection.get("tilesetId", ""): return
	var cells: Array = resource.cells.duplicate(true)
	cells.sort_custom(func(a, b): return int(a.y) < int(b.y) or int(a.y) == int(b.y) and int(a.x) < int(b.x))
	_select_brush({"tilesetId": resource.tilesetId, "width": int(resource.width), "height": int(resource.height), "cells": cells.map(func(cell): return int(cell.tile))})
	ui.brush_name.text = str(resource.name)
	_brush_title = str(resource.name)


func _refresh_behavior() -> void:
	var custom: bool = int(_projection.get("landlook", -1)) in [6, 7, 8]
	ui.behavior.disabled = not custom or brush.is_empty() or int(brush.get("width", 0)) * int(brush.get("height", 0)) != 1
	ui.behavior.tooltip_text = "Review and edit this scenario-owned tile's behavior." if custom else "Stock behavior is protected. Create or choose Custom 1–3 to edit it."


func _reveal(bounds: Rect2) -> void:
	var scroll: ScrollContainer = ui.atlas_scroll
	if bounds.position.x < scroll.scroll_horizontal:
		scroll.scroll_horizontal = int(bounds.position.x)
	elif bounds.end.x > scroll.scroll_horizontal + scroll.size.x:
		scroll.scroll_horizontal = int(bounds.end.x - scroll.size.x)
	if bounds.position.y < scroll.scroll_vertical:
		scroll.scroll_vertical = int(bounds.position.y)
	elif bounds.end.y > scroll.scroll_vertical + scroll.size.y:
		scroll.scroll_vertical = int(bounds.end.y - scroll.size.y)


func _update_columns() -> void:
	if ui.is_empty(): return
	var first := 1 + int(ui.atlas_scroll.scroll_horizontal / maxi(1, ui.atlas.tile_size.x))
	var last := mini(ui.atlas.columns, first + maxi(1, int(ui.atlas_scroll.size.x / maxi(1, ui.atlas.tile_size.x))) - 1)
	ui.columns.text = "Columns %d–%d / %d" % [first, last, ui.atlas.columns] if ui.atlas.columns > 0 else "No atlas"


func _enlarge() -> void:
	if not is_available(): return
	if not is_instance_valid(_expanded):
		_expanded = AcceptDialog.new()
		_expanded.title = "Tiles · full atlas"
		_expanded.ok_button_text = "Use brush"
		_expanded.add_cancel_button("Cancel")
		_expanded.theme = theme
		add_child(_expanded)
		_expanded_atlas = preload("res://src/land_tile_atlas.gd").new()
		_expanded.add_child(_expanded_atlas)
		_expanded.confirmed.connect(func():
			ui.atlas.select_region(_expanded_atlas.selection)
		)
	_expanded_atlas.set_atlas(_projection)
	_expanded_atlas.set_tile_catalog(_tile_names)
	_expanded_atlas.select_region(ui.atlas.selection, false)
	_expanded.popup_centered(Vector2i(680, 390))


func show_special_palette(enabled: bool) -> void:
	_special_palette_active = enabled
	_palette_visibility()
	if not enabled: _refresh_results()


func _palette_visibility() -> void:
	for child in ui.content.get_node("Body").get_children():
		if child.name not in ["Header","Source","PaletteSelector","SpecialPalette"]: child.visible = not _special_palette_active
	ui.special_palette.visible = _special_palette_active
	ui.special_selector.set_pressed_no_signal(_special_palette_active)
	ui.terrain_palette.set_pressed_no_signal(not _special_palette_active)
	ui.expand.visible = not _special_palette_active
