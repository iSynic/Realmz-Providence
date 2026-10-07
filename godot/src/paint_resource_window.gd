extends Window

signal query_requested(query: String, kind: String, offset: int)
signal entry_requested(identity: String)
signal save_requested(resource: Dictionary, replace: bool)
signal delete_requested(identity: String)
signal new_requested
signal capture_requested
signal use_requested(resource: Dictionary)
signal closed
signal feature_preview_requested(tile: int, changes: Array, generation: int)
signal resource_preview_requested(resource: Dictionary)
signal geometry_preview_requested(resource: Dictionary, edit: Dictionary, generation: int)
signal special_cell_requested(current: int, destination: String, accept: Callable)

var _original: Dictionary = {}
var _draft: Dictionary = {}
var _creating := false
var _loading := false
var _busy := false
var _built_in := false
var _availability_reason := ""
var _render_cells: Array = []
var _special_previews: Array = []
var _atlas: Control
var _projection: Dictionary = {}
var _next: int = -1
var _offset := 0
var _focus: WeakRef
var _tile_dialog: AcceptDialog
var _tile_atlas: Control
var _feature_dialog: Window
var _feature_index := -1
var _geometry := preload("res://src/paint_resource_geometry.gd").new()


func _ready() -> void:
	_geometry.initialize(self, draft)
	_geometry.preview_requested.connect(geometry_preview_requested.emit)
	_geometry.changed.connect(_accept_geometry)
	_geometry.state_changed.connect(_update_actions)
	get_node("%SpecialResourceCell").pressed.connect(_choose_special)
	close_requested.connect(close)
	get_node("%CancelResources").pressed.connect(close)
	get_node("%SearchResources").text_changed.connect(func(_text): _query(0))
	get_node("%ResourceKind").item_selected.connect(func(_index): _query(0))
	get_node("%ResourceScope").item_selected.connect(func(_index): _query(0))
	get_node("%Entries").item_selected.connect(_choose_entry)
	get_node("%Entries").item_activated.connect(func(_index): _use())
	get_node("%NextResources").pressed.connect(func(): _query(_next))
	get_node("%PreviousResources").pressed.connect(func(): _query(maxi(0, _offset - 64)))
	get_node("%SaveResource").pressed.connect(func(): save_requested.emit(draft(), not _creating))
	get_node("%UseResource").pressed.connect(_use)
	get_node("%NewResource").pressed.connect(_new)
	get_node("%CaptureResource").pressed.connect(func(): capture_requested.emit())
	get_node("%DuplicateResource").pressed.connect(_duplicate)
	get_node("%DeleteResource").pressed.connect(func(): get_node("%ConfirmDelete").popup_centered())
	get_node("%ConfirmDelete").confirmed.connect(func(): delete_requested.emit(str(_draft.get("identity", ""))))
	get_node("%ConfirmDiscard").confirmed.connect(_close_now)
	get_node("%ReplaceResourceCell").pressed.connect(_choose_tile)
	get_node("%ClearResourceCell").pressed.connect(_clear_cell)
	for node_name in ["ResourceName", "ResourceCollection"]:
		get_node("%" + node_name).text_changed.connect(func(_text): _fields_changed())
	get_node("%FavoriteResource").toggled.connect(func(_pressed): _fields_changed())
	get_node("%ResourceCells").item_selected.connect(func(_index): _update_actions())
	for kind in ["All resources", "Palettes", "Stamps"]: get_node("%ResourceKind").add_item(kind)
	for scope in ["All sources", "Favorites", "Recent", "This project", "Built-in"]: get_node("%ResourceScope").add_item(scope)
	_update_actions()


func open(destination: String, atlas: Control, projection: Dictionary, focus: Control, kind := "") -> void:
	_focus = weakref(focus) if is_instance_valid(focus) else null
	_atlas = atlas; _projection = projection.duplicate(true)
	get_node("%ResourceDestination").text = destination + " · This project · local editor settings"
	get_node("%ResourceKind").select(2 if kind == "stamp" else 1 if kind == "palette" else 0)
	popup_centered(); get_node("%SearchResources").grab_focus(); _query(0)


func present_list(result: Dictionary) -> void:
	var entries: ItemList = get_node("%Entries"); entries.clear()
	for item: Dictionary in result.items:
		var label := "%s%s\n%s · %d × %d" % ["★ " if item.favorite else "", item.name, item.collection, int(item.width), int(item.height)]
		var index := entries.add_item(label)
		entries.set_item_metadata(index, str(item.identity))
		entries.set_item_tooltip(index, "%s · %s" % [item.kind, item.tilesetId])
		if item.get("availabilityReason") != null: entries.set_item_tooltip(index, str(item.availabilityReason))
	_next = int(result.nextOffset) if result.get("nextOffset") != null else -1
	get_node("%ResourceCount").text = "%d matching · project-local" % int(result.total)
	get_node("%PreviousResources").disabled = _offset <= 0
	get_node("%NextResources").disabled = _next < 0
	if entries.item_count == 0 and not has_unapplied_changes(): clear_resource("No resources match this search.")


func present_resource(resource: Dictionary, creating := false, built_in := false, availability_reason := "", render_cells: Array = [], special_previews: Array = []) -> void:
	_geometry.reset()
	_loading = true; _original = resource.duplicate(true); _draft = resource.duplicate(true); _creating = creating
	_built_in = built_in; _availability_reason = availability_reason
	_render_cells = render_cells.duplicate(true)
	_special_previews = special_previews.duplicate(true)
	get_node("%ResourceName").text = str(resource.name)
	get_node("%ResourceCollection").text = str(resource.collection)
	get_node("%FavoriteResource").set_pressed_no_signal(bool(resource.favorite))
	get_node("%ResourceStatus").text = "%s · %d × %d · %d cells\n%s" % [str(resource.kind).capitalize(), int(resource.width), int(resource.height), resource.cells.size(), resource.tilesetId]
	_refresh_cells(); _loading = false; _update_actions()
	if not availability_reason.is_empty(): present_error(availability_reason)


func clear_resource(message := "Choose a resource to preview it.") -> void:
	_geometry.reset()
	_loading = true; _original.clear(); _draft.clear(); _creating = false; _built_in = false; _availability_reason = ""
	get_node("%ResourceName").text = ""; get_node("%ResourceCollection").text = ""
	get_node("%ResourceCells").clear(); _render_cells.clear(); get_node("%ResourcePreview").set_resource({}, {}, [], null)
	get_node("%ResourceStatus").text = message; _loading = false; _update_actions()
	_special_previews.clear()


func draft() -> Dictionary:
	var result := _draft.duplicate(true)
	if result.is_empty(): return result
	result.name = get_node("%ResourceName").text.strip_edges()
	result.collection = get_node("%ResourceCollection").text.strip_edges()
	result.favorite = get_node("%FavoriteResource").button_pressed
	return result


func has_unapplied_changes() -> bool:
	return not _draft.is_empty() and (_creating or draft() != _original)


func discard_draft() -> void:
	if _creating: clear_resource()
	elif not _original.is_empty(): present_resource(_original)


func is_existing() -> bool:
	return not _creating


func suspend_reference() -> Dictionary:
	var state := {"original":_original.duplicate(true),"draft":draft(),"creating":_creating,"builtIn":_built_in,
		"reason":_availability_reason,"renderCells":_render_cells.duplicate(true),"specialPreviews":_special_previews.duplicate(true),
		"cells":get_node("%ResourceCells").get_selected_items(),"position":position,"size":size}
	dismiss(); return state


func restore_reference(state: Dictionary, projection: Dictionary) -> void:
	_projection = projection.duplicate(true)
	present_resource(state.draft,state.creating,state.builtIn,state.reason,state.renderCells,state.specialPreviews)
	_original = state.original.duplicate(true); size = state.size; position = state.position; show()
	for index in state.cells:
		if index < get_node("%ResourceCells").item_count: get_node("%ResourceCells").select(index)
	_update_actions(); get_node("%SpecialResourceCell").grab_focus()


func dismiss() -> void:
	hide(); clear_resource()
	if is_instance_valid(_tile_dialog): _tile_dialog.hide()
	if is_instance_valid(_feature_dialog): _feature_dialog.close()


func _fields_changed() -> void:
	if not _loading: _update_actions()


func _update_actions() -> void:
	var empty := _draft.is_empty(); var dirty := has_unapplied_changes()
	get_node("%UseResource").disabled = empty or dirty or not _availability_reason.is_empty() or _draft.get("tilesetId", "") != _projection.get("tilesetId", "")
	get_node("%UseResource").text = "Use stamp" if _draft.get("kind", "") == "stamp" else "Use brush"
	get_node("%SaveResource").disabled = empty or not dirty or _built_in
	get_node("%DuplicateResource").disabled = empty or dirty or _built_in and not _availability_reason.is_empty()
	get_node("%DeleteResource").disabled = empty or _creating or dirty or _built_in
	var cells: ItemList = get_node("%ResourceCells")
	get_node("%ReplaceResourceCell").disabled = empty or cells.get_selected_items().is_empty() or _atlas == null or _built_in
	if _draft.get("levelType", "") == "dungeon": get_node("%ReplaceResourceCell").disabled = empty or cells.get_selected_items().is_empty() or _built_in
	get_node("%ReplaceResourceCell").text = "Edit features…" if _draft.get("levelType", "") == "dungeon" else "Replace tile…"
	get_node("%ClearResourceCell").disabled = empty or cells.get_selected_items().is_empty() or _draft.get("kind", "") != "stamp" or _built_in
	get_node("%SpecialResourceCell").disabled = empty or cells.get_selected_items().is_empty() or _draft.get("kind", "") != "stamp" or _draft.get("levelType", "") != "land" or _built_in or _busy or _geometry.pending()
	get_node("%NewResource").disabled = dirty or _atlas == null
	get_node("%CaptureResource").disabled = dirty
	for node_name in ["ResourceName", "ResourceCollection"]: get_node("%" + node_name).editable = not _built_in and not _busy and not _geometry.pending()
	get_node("%FavoriteResource").disabled = _built_in or _busy or _geometry.pending()
	_geometry.set_state(_draft, _built_in or _busy)
	if _busy or _geometry.pending():
		for node_name in ["UseResource", "SaveResource", "NewResource", "CaptureResource", "DuplicateResource", "DeleteResource", "ReplaceResourceCell", "ClearResourceCell"]:
			get_node("%" + node_name).disabled = true


func _refresh_cells() -> void:
	var cells: ItemList = get_node("%ResourceCells"); cells.clear()
	var specials := preload("res://src/paint_resource_art.gd").special_textures(_special_previews)
	for cell: Dictionary in _draft.get("cells", []):
		var icon: Texture2D = specials.get(int(cell.tile)) if int(cell.tile)<0 else _atlas.tile_texture(int(cell.tile)) if _atlas != null else null
		var index := cells.add_item("%d,%d · %d" % [int(cell.x), int(cell.y), int(cell.tile)], icon)
		cells.set_item_metadata(index, index)
	get_node("%ResourcePreview").set_resource(_draft, _projection, _render_cells, _atlas, _special_previews)


func _choose_entry(index: int) -> void:
	if _geometry.pending(): present_error("Finish or cancel the geometry review before changing resources."); return
	if has_unapplied_changes(): get_node("%ResourceStatus").text = "Save or discard these changes before choosing another resource."; return
	entry_requested.emit(str(get_node("%Entries").get_item_metadata(index)))


func _query(offset: int) -> void:
	_offset = offset
	query_requested.emit(get_node("%SearchResources").text, ["", "palette", "stamp"][get_node("%ResourceKind").selected], offset)


func _new() -> void:
	if not has_unapplied_changes(): new_requested.emit()


func _duplicate() -> void:
	if _built_in and not _availability_reason.is_empty(): present_error("Choose an available recipe before duplicating it."); return
	var value := draft()
	value.identity = "paint:" + Crypto.new().generate_random_bytes(16).hex_encode()
	value.name += " copy"; present_resource(value, true, false, "", _render_cells, _special_previews)


func _choose_tile() -> void:
	var cells: ItemList = get_node("%ResourceCells")
	if cells.get_selected_items().is_empty(): return
	if _draft.get("levelType", "") == "dungeon": _choose_features(cells.get_selected_items()[0]); return
	if not is_instance_valid(_tile_dialog):
		_tile_dialog = AcceptDialog.new(); _tile_dialog.title = "Choose resource tile"
		_tile_dialog.min_size = Vector2i(760, 420); _tile_dialog.size = Vector2i(900, 520)
		_tile_dialog.exclusive = true; _tile_dialog.transient = true; add_child(_tile_dialog)
		var scroll := ScrollContainer.new(); _tile_dialog.add_child(scroll)
		_tile_atlas = preload("res://src/land_tile_atlas.gd").new(); scroll.add_child(_tile_atlas)
		_tile_dialog.get_ok_button().text = "Use tile"; _tile_dialog.add_cancel_button("Cancel")
		_tile_dialog.confirmed.connect(_accept_tile)
	_tile_atlas.set_atlas(_projection)
	_tile_atlas.select_tile(maxi(1, int(_draft.cells[cells.get_selected_items()[0]].tile)), false)
	_tile_dialog.popup_centered(); _tile_atlas.grab_focus()


func _accept_tile() -> void:
	var selected: PackedInt32Array = get_node("%ResourceCells").get_selected_items()
	if selected.is_empty(): return
	_draft.cells[selected[0]].tile = int(_tile_atlas.selected_brush().cells[0])
	_refresh_cells(); get_node("%ResourceCells").select(selected[0]); _update_actions()


func _clear_cell() -> void:
	var selected: PackedInt32Array = get_node("%ResourceCells").get_selected_items()
	if selected.is_empty(): return
	_draft.cells[selected[0]].tile = 0
	_refresh_cells(); get_node("%ResourceCells").select(selected[0]); _update_actions()
	if _draft.get("levelType", "") == "dungeon": resource_preview_requested.emit(draft())


func _use() -> void:
	if not get_node("%UseResource").disabled: use_requested.emit(_original.duplicate(true))


func close() -> void:
	if _busy: present_error("The original operation is still being checked. Your draft is kept."); return
	if has_unapplied_changes(): get_node("%ConfirmDiscard").popup_centered(); return
	_close_now()


func _close_now() -> void:
	hide()
	if is_instance_valid(_tile_dialog): _tile_dialog.hide()
	if is_instance_valid(_feature_dialog): _feature_dialog.close()
	clear_resource(); closed.emit()
	var control: Control = _focus.get_ref() if _focus != null else null
	if is_instance_valid(control): control.grab_focus()


func _unhandled_key_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_ESCAPE: close(); get_viewport().set_input_as_handled()
		elif event.keycode == KEY_ENTER and (event.ctrl_pressed or event.meta_pressed): _use(); get_viewport().set_input_as_handled()


func present_error(message: String) -> void:
	get_node("%ResourceStatus").text = message


func set_busy(value: bool) -> void:
	_busy = value
	for node_name in ["ResourceName", "ResourceCollection", "SearchResources"]: get_node("%" + node_name).editable = not value
	get_node("%FavoriteResource").disabled = value
	get_node("%Entries").mouse_filter = Control.MOUSE_FILTER_IGNORE if value else Control.MOUSE_FILTER_STOP
	_update_actions()


func collection_scope() -> String:
	return ["all", "favorites", "recent", "local", "built-in"][get_node("%ResourceScope").selected]


func _choose_features(index: int) -> void:
	if not is_instance_valid(_feature_dialog):
		_feature_dialog = preload("res://src/dungeon_resource_cell.tscn").instantiate(); add_child(_feature_dialog)
		_feature_dialog.preview_requested.connect(feature_preview_requested.emit)
		_feature_dialog.cell_accepted.connect(_accept_features)
		_feature_dialog.closed.connect(func(): get_node("%ResourceCells").grab_focus())
	_feature_index = index
	var cell: Dictionary = _draft.cells[index]
	_feature_dialog.open(int(cell.tile), "%s · Cell (%d, %d)" % [_draft.name, int(cell.x), int(cell.y)], _projection)


func present_feature_preview(response: Dictionary, generation: int) -> void:
	if not is_instance_valid(_feature_dialog): return
	if response.get("ok", false): _feature_dialog.present(response.result, generation)
	else: _feature_dialog.show_error(str(response.get("error", "The cell preview could not complete.")), generation)


func _accept_features(tile: int, render_cell: Dictionary) -> void:
	if _feature_index < 0 or _feature_index >= _draft.get("cells", []).size(): return
	var cell: Dictionary = _draft.cells[_feature_index]
	cell.tile = tile; render_cell.x = int(cell.x); render_cell.y = int(cell.y)
	if _render_cells.size() == _draft.cells.size(): _render_cells[_feature_index] = render_cell
	_refresh_cells(); get_node("%ResourceCells").select(_feature_index); _update_actions()


func present_resource_preview(identity: String, render_cells: Array, special_previews: Array = []) -> void:
	if _draft.get("identity", "") != identity: return
	_render_cells = render_cells.duplicate(true)
	_special_previews = special_previews.duplicate(true)
	var selected: PackedInt32Array = get_node("%ResourceCells").get_selected_items()
	_refresh_cells()
	if not selected.is_empty() and selected[0] < get_node("%ResourceCells").item_count: get_node("%ResourceCells").select(selected[0])
	_update_actions()


func present_geometry(response: Dictionary, generation: int) -> void:
	_geometry.present(response, generation)


func _accept_geometry(resource: Dictionary, render_cells: Array) -> void:
	_draft = resource.duplicate(true); _render_cells = render_cells.duplicate(true)
	_refresh_cells(); _update_actions()
	get_node("%ResourceStatus").text = "%d × %d · %d cells · geometry staged" % [int(_draft.width), int(_draft.height), _draft.cells.size()]


func _choose_special() -> void:
	var selected: PackedInt32Array = get_node("%ResourceCells").get_selected_items()
	if selected.is_empty(): return
	var cell: Dictionary = _draft.cells[selected[0]].duplicate(true)
	var identity := str(_draft.identity)
	special_cell_requested.emit(int(cell.tile),"%s · Cell (%d, %d)" % [_draft.name,int(cell.x),int(cell.y)],func(choice):
		if _draft.get("identity","") != identity or _busy: return
		for current: Dictionary in _draft.cells:
			if int(current.x) == int(cell.x) and int(current.y) == int(cell.y) and current == cell:
				current.tile = int(choice.value); _refresh_cells(); get_node("%ResourceCells").select(_draft.cells.find(current))
				_update_actions(); resource_preview_requested.emit(draft()); return)


func selection_presentation() -> Dictionary:
	return {"renderCells": _render_cells.duplicate(true), "specialPreviews": _special_previews.duplicate(true)}
