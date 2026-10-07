class_name ProvidenceLandLayoutEditor
extends VBoxContainer

signal cell_update_requested(row: int, column: int, target: Variant)
signal layout_remove_requested
signal map_open_requested(identity: String)
signal previews_requested

@onready var _status: Label = %LayoutStatus
@onready var _grid: ProvidenceLandLayoutCanvas = %LayoutGrid
@onready var _map_palette: ItemList = %LandMapPalette
@onready var _selected_cell: Label = %SelectedLayoutCell
@onready var _selected_value: Label = %SelectedLayoutValue
@onready var _place: Button = %PlaceCurrentLand
@onready var _clear_cell: Button = %ClearLayoutCell
@onready var _open_map: Button = %OpenLinkedLand
@onready var _clear_layout: Button = %ClearLayout

var _cells: Array = []
var _maps: Array = []
var _selected := Vector2i(-1, -1)
var commit_handler: Callable
var _pending := false
var _locked := false
var catalog_revision := 0
var _thumbnails: Dictionary = {}
var _preview_generation := 0


func _ready() -> void:
	%LayoutSearch.text_changed.connect(func(_text): _render_palette(); _set_control_state(); previews_requested.emit())
	%LandMapPalette.item_selected.connect(func(_index): _set_control_state())
	%LandMapPalette.get_v_scroll_bar().value_changed.connect(func(_value): previews_requested.emit())
	%NeighborPreview.toggled.connect(func(_enabled): _show_neighbors(); previews_requested.emit())
	%LayoutZoomOut.pressed.connect(func(): _grid.zoom_by(.8))
	%LayoutZoomIn.pressed.connect(func(): _grid.zoom_by(1.25))
	%LayoutFit.pressed.connect(_grid.fit_layout)
	%LayoutFitAssigned.pressed.connect(_grid.fit_assigned)
	%LayoutGridToggle.toggled.connect(_grid.set_grid_visible)
	_grid.zoom_changed.connect(func(percent): %LayoutZoom.text="%d%%" % percent)
	_grid.cell_selected.connect(_show_selected)
	_grid.cell_open_requested.connect(func(row,column): _show_selected(row,column); _on_open_map_pressed())
	resized.connect(_size_neighbors)
	visibility_changed.connect(func(): if is_visible_in_tree(): previews_requested.emit())
	for name in ["NorthNeighbor","EastNeighbor","SouthNeighbor","WestNeighbor","CenterNeighbor"]:
		get_node("%" + name).cell_selected.connect(_select_neighbor)
		get_node("%" + name).map_activated.connect(_open_neighbor)
	_size_neighbors()

func focus_source(_identity: String, _slot: int, field: String) -> bool:
	var regex := RegEx.new()
	regex.compile("^cells\\[(\\d+)\\]\\[(\\d+)\\]$")
	var match := regex.search(field)
	if match == null: return false
	var row := int(match.get_string(1))
	var column := int(match.get_string(2))
	if row >= 8 or column >= 16: return false
	_show_selected(row, column)
	_grid.grab_focus()
	return true


func set_projection(result: Dictionary) -> void:
	_preview_generation+=1
	catalog_revision = int(result.get("revision",0)); _thumbnails.clear()
	_maps = (result.get("landMaps", []) as Array).duplicate(true)
	var layout_value: Variant = result.get("layout")
	_cells = ((layout_value as Dictionary).get("cells", []) as Array).duplicate(true) if layout_value is Dictionary else []
	_status.text = "%d Land maps · %d findings" % [_maps.size(),int(result.get("diagnosticCount",0))]
	_render_palette()
	_render_grid()
	_clear_layout.disabled = _cells.is_empty()
	if _selected.x >= 0:
		_show_selected(_selected.y, _selected.x)
	else: _show_neighbors()
	_set_control_state()
	previews_requested.emit()


func clear() -> void:
	_selected = Vector2i(-1, -1)
	set_projection({"layout": null, "landMaps": [], "diagnosticCount": 0, "sourcePresent": false})
	_selected_cell.text = "SELECT A LAYOUT CELL"
	_selected_value.text = "No cell selected."
	_place.disabled = true
	_clear_cell.disabled = true
	_open_map.disabled = true


func _render_palette() -> void:
	var selected := ""
	var indices := _map_palette.get_selected_items()
	if not indices.is_empty(): selected = str(_map_palette.get_item_metadata(indices[0]))
	var scroll := _map_palette.get_v_scroll_bar().value
	_map_palette.clear()
	for value in _maps:
		var map := value as Dictionary
		var caption := "Land %02d · %s" % [int(map.get("nativeIndex",0)),str(map.get("name","Unnamed Land"))]
		if not %LayoutSearch.text.strip_edges().is_empty() and not caption.to_lower().contains(%LayoutSearch.text.strip_edges().to_lower()): continue
		_map_palette.add_item(caption,_thumbnail(str(map.identity)))
		_map_palette.set_item_metadata(_map_palette.item_count - 1, str(map.get("identity", "")))
		if str(map.get("identity", "")) == selected: _map_palette.select(_map_palette.item_count - 1)
	if _map_palette.item_count > 0 and _map_palette.get_selected_items().is_empty():
		_map_palette.select(0)
	_map_palette.get_v_scroll_bar().value = scroll
	%LayoutResultCount.text = "%d shown · %d maps" % [_map_palette.item_count,_maps.size()]
	%LayoutNoResults.visible = _map_palette.item_count == 0


func _render_grid() -> void:
	var entries: Array = []
	for index in 128:
		entries.append(_cell_preview(Vector2i(index%16,index/16)))
	_grid.set_cells(entries)
	_grid.set_selected(_selected)
	%LayoutFitAssigned.disabled = not _grid.assigned_bounds().has_area()
	%LayoutFitAssigned.tooltip_text = "Place a map before fitting assigned cells" if %LayoutFitAssigned.disabled else "Fit all assigned cells, including missing references"


func _show_selected(row: int, column: int) -> void:
	_selected = Vector2i(column, row)
	_grid.set_selected(_selected)
	var encoded := int(_cells[row * 16 + column]) if row * 16 + column < _cells.size() else -32768
	_selected_cell.text = "ROW %d · COLUMN %d" % [row + 1, column + 1]
	_selected_value.text = _cell_description(encoded)
	_place.disabled = _map_palette.get_selected_items().is_empty()
	_clear_cell.disabled = encoded == -32768
	_open_map.disabled = _identity_for_encoded(encoded).is_empty()
	_set_control_state()
	_show_neighbors(); previews_requested.emit()


func _thumbnail(identity: String) -> Texture2D:
	return _thumbnails.get(identity,{}).get("texture")


func thumbnail_candidates() -> Array:
	var identities := {}
	for value in _cells:
		var identity := _identity_for_encoded(int(value))
		if not identity.is_empty(): identities[identity] = true
	var first := maxi(0,int(_map_palette.get_v_scroll_bar().value / 54))
	for index in range(first,mini(first+12,_map_palette.item_count)): identities[str(_map_palette.get_item_metadata(index))] = true
	return identities.keys().filter(func(identity): return not _thumbnails.has(identity))


func present_thumbnail(identity: String, projection: Dictionary) -> void:
	if int(projection.get("revision",catalog_revision)) != catalog_revision: return
	var result := {"texture":null,"reason":str(projection.get("reason","Artwork unavailable"))}
	if projection.get("available",false):
		var image := Image.new()
		if image.load_png_from_buffer(Marshalls.base64_to_raw(str(projection.base64))) == OK and image.get_size() == Vector2i(180,180):
			result.texture = ImageTexture.create_from_image(image)
			var unresolved: Array = projection.get("unresolvedOverlayResourceIds",[])
			result.reason = "Map preview" if unresolved.is_empty() else "%d special artwork references unavailable" % unresolved.size()
	_thumbnails[identity] = result
	for index in _map_palette.item_count:
		if str(_map_palette.get_item_metadata(index)) == identity:
			_map_palette.set_item_icon(index,result.texture); _map_palette.set_item_tooltip(index,result.reason)
	_render_grid()
	_show_neighbors()


func _show_neighbors() -> void:
	%LayoutNeighbors.visible = %NeighborPreview.button_pressed
	var directions := {"NorthNeighbor":Vector2i.UP,"EastNeighbor":Vector2i.RIGHT,"SouthNeighbor":Vector2i.DOWN,"WestNeighbor":Vector2i.LEFT,"CenterNeighbor":Vector2i.ZERO}
	for name in directions:
		var button: Button = get_node("%" + name)
		var cell: Vector2i = _selected + directions[name]
		var entry := _cell_preview(cell) if _selected.x>=0 else {"state":"Select cell","caption":"Select a layout cell"}
		entry.selected = name=="CenterNeighbor"
		entry.generation = _preview_generation
		button.present(entry)
		button.disabled = _locked or _selected.x<0 or cell.x<0 or cell.x>=16 or cell.y<0 or cell.y>=8


func _cell_preview(cell: Vector2i) -> Dictionary:
	if cell.x<0 or cell.x>=16 or cell.y<0 or cell.y>=8: return {"state":"World edge","caption":"World edge","reason":"No layout cell exists in this direction"}
	var index := cell.y*16+cell.x
	var encoded := int(_cells[index]) if index<_cells.size() else 0
	var identity := _identity_for_encoded(encoded)
	var assigned := encoded not in [-32768,0]
	var loaded := _thumbnails.has(identity)
	var thumbnail: Dictionary = _thumbnails.get(identity,{})
	return {"cell":cell,"assigned":assigned,"identity":identity,"caption":_cell_description(encoded),"texture":thumbnail.get("texture"),
		"loading":not loaded,"reason":str(thumbnail.get("reason","Loading map artwork…")) if not identity.is_empty() else "Choose a Land map to repair this cell" if assigned else "Place a Land map here",
		"state":"Missing map" if assigned and identity.is_empty() else "Loading…" if not identity.is_empty() and not loaded else "Art failed" if not identity.is_empty() and thumbnail.get("texture")==null else "Unassigned"}


func _size_neighbors() -> void:
	if not is_node_ready(): return
	var extent := 64 if get_window().size.y<=900 else 88
	for child: Control in %LayoutNeighbors.get_children(): child.custom_minimum_size=Vector2(extent,extent)


func _select_neighbor(target: Dictionary) -> void:
	if _locked or int(target.get("generation",-1))!=_preview_generation: return
	var cell: Vector2i = target.get("cell",Vector2i(-1,-1))
	if cell.x>=0 and cell.x<16 and cell.y>=0 and cell.y<8: _show_selected(cell.y,cell.x)


func _open_neighbor(target: Dictionary) -> void:
	if _locked or int(target.get("generation",-1))!=_preview_generation: return
	var identity := str(target.get("identity",""))
	var cell: Vector2i = target.get("cell",Vector2i(-1,-1))
	var index := cell.y*16+cell.x
	if cell.x<0 or cell.x>=16 or cell.y<0 or cell.y>=8 or index>=_cells.size(): return
	if not identity.is_empty() and _identity_for_encoded(int(_cells[index]))==identity: map_open_requested.emit(identity)


func read_navigation_state() -> Dictionary:
	var focus := get_viewport().gui_get_focus_owner()
	var indices := _map_palette.get_selected_items()
	return {"row":_selected.y,"column":_selected.x,"query":%LayoutSearch.text,"palette":str(_map_palette.get_item_metadata(indices[0])) if not indices.is_empty() else "",
		"scroll":_map_palette.get_v_scroll_bar().value,"neighbors":%NeighborPreview.button_pressed,"viewport":_grid.read_navigation_state(),
		"focus":str(get_path_to(focus)) if focus != null and is_ancestor_of(focus) else ""}


func restore_navigation_state(state: Dictionary) -> bool:
	%LayoutSearch.text = str(state.get("query","")); %NeighborPreview.set_pressed_no_signal(state.get("neighbors",true))
	_render_palette(); _render_grid()
	for index in _map_palette.item_count:
		if str(_map_palette.get_item_metadata(index)) == str(state.get("palette","")): _map_palette.select(index)
	_map_palette.get_v_scroll_bar().value = float(state.get("scroll",0))
	var row := int(state.get("row",-1)); var column := int(state.get("column",-1))
	if row >= 0 and row < 8 and column >= 0 and column < 16: _show_selected(row,column)
	_grid.restore_navigation_state(state.get("viewport",{}))
	%LayoutGridToggle.set_pressed_no_signal(_grid.show_grid)
	var focus := get_node_or_null(str(state.get("focus","")))
	if focus is Control and focus.is_visible_in_tree(): focus.grab_focus()
	previews_requested.emit(); return true


func _on_place_pressed() -> void:
	if _selected.x < 0:
		return
	var selected_maps := _map_palette.get_selected_items()
	if selected_maps.is_empty():
		return
	cell_update_requested.emit(_selected.y, _selected.x, _map_palette.get_item_metadata(int(selected_maps[0])))


func _on_clear_cell_pressed() -> void:
	if _selected.x >= 0:
		cell_update_requested.emit(_selected.y, _selected.x, null)


func _on_open_map_pressed() -> void:
	if _selected.x < 0 or _locked:
		return
	var encoded := int(_cells[_selected.y * 16 + _selected.x]) if _selected.y * 16 + _selected.x < _cells.size() else -32768
	var identity := _identity_for_encoded(encoded)
	if not identity.is_empty():
		map_open_requested.emit(identity)


func _on_clear_layout_pressed() -> void:
	%ClearLayoutConfirmation.popup_centered(Vector2i(520, 220))


func _on_clear_layout_confirmed() -> void:
	layout_remove_requested.emit()


func _cell_description(encoded: int) -> String:
	if encoded in [-32768, 0]:
		return "Blank layout cell"
	var native_index := 0 if encoded == -1 else encoded
	for value in _maps:
		var map := value as Dictionary
		if int(map.get("nativeIndex", -999)) == native_index:
			return "Land %d · %s" % [native_index, str(map.get("name", "Unnamed Land"))]
	return "Missing Land %d" % native_index


func _identity_for_encoded(encoded: int) -> String:
	if encoded in [-32768, 0]:
		return ""
	var native_index := 0 if encoded == -1 else encoded
	for value in _maps:
		var map := value as Dictionary
		if int(map.get("nativeIndex", -999)) == native_index:
			return str(map.get("identity", ""))
	return ""


func has_unapplied_changes() -> bool: return _pending


func commit_selected() -> Dictionary:
	return await commit_handler.call() if commit_handler.is_valid() else {"ok": false, "error": "Open a project first."}


func discard_draft() -> void:
	if not recovery_button().visible: get_node("%LayoutPlacementReview").cancel()


func recovery_button() -> Button: return get_node("%ReconcileLayout")


func set_pending(value: bool) -> void:
	_pending = value
	_locked = false
	recovery_button().visible = false
	_set_control_state()


func set_loading(value: bool) -> void:
	_locked = value
	_set_control_state()


func show_submission_failure(message: String, recovery: bool) -> void:
	_status.text = message
	_pending = true
	_locked = recovery
	recovery_button().visible = recovery
	_set_control_state()


func _set_control_state() -> void:
	if not is_node_ready(): return
	_clear_layout.disabled = _locked or _cells.is_empty()
	_place.disabled = _locked or _selected.x < 0 or _map_palette.get_selected_items().is_empty()
	var index := _selected.y * 16 + _selected.x
	_clear_cell.disabled = _locked or _selected.x < 0 or index >= _cells.size() or int(_cells[index]) in [-32768, 0]
	_open_map.disabled = _locked or index<0 or index>=_cells.size() or _identity_for_encoded(int(_cells[index])).is_empty()
	_show_neighbors()
