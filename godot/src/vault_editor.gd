extends HBoxContainer

signal artwork_applied(projection: Dictionary, record_index: int)
signal scenario_changed(projection: Dictionary)
@export var standalone_copy := false
var _copy_pending: Dictionary = {}
const PAGE_SIZE := 25
const UNAVAILABLE_PICTURE = preload("res://src/artwork_unavailable.svg")
var _bridge
var _offset := 0
var _total := 0
var _rows: Array = []
var _textures: Dictionary = {}
var _failed_previews: Dictionary = {}
var _selected := -1
var _generation := 0
var _collection_kind := "vault-icon"
var _collection_label := "Vault of Arcana"
var _operations: ProvidenceEditorOperation
var _read_bridge: Callable
var _queued_search := false
var _selection_epoch := 0
var _catalog_current := false
@onready var _gallery: ItemList = %ArtworkGallery
@onready var _picker = %ItemArtworkPicker


func _ready() -> void:
	%ItemTarget.apply_requested.connect(_use_in_item)
	%CopyToScenario.visible = standalone_copy
	%CopyToScenario.pressed.connect(_copy_dialog)
	%CopyDialog.confirmed.connect(_copy_artwork)
	%CopyDialog.canceled.connect(func(): %CopyToScenario.grab_focus())
	var primary: Button = %CopyToScenario if standalone_copy else %UseInItem
	primary.add_theme_stylebox_override("normal", primary.get_theme_stylebox("pressed"))
	$InspectorInset/Selection/Ownership.visible = standalone_copy
	$BrowseInset/Browse/Heading.visible = not standalone_copy
	$BrowseInset/Browse/Instruction.visible = not standalone_copy
	$BrowseInset/Browse/FilterInset.visible = standalone_copy
	$BrowseInset/Browse/FilterInset/Filters.visible = standalone_copy
	$InspectorInset/Selection/TopInset.visible = standalone_copy
	if standalone_copy:
		$BrowseInset.add_theme_constant_override("margin_left", 4)
		$BrowseInset.add_theme_constant_override("margin_right", 8)
		$BrowseInset/Browse.add_theme_constant_override("separation", 8)
		$BrowseInset/Browse/SearchGroup.add_theme_constant_override("margin_top", 5)
		$BrowseInset/Browse/SearchGroup/Fields.add_theme_constant_override("separation", 3)
		$BrowseInset/Browse/SearchGroup/Fields/SearchLabel.add_theme_font_size_override("font_size", 12)
		%VaultSearch.custom_minimum_size.y = 30
		$BrowseInset/Browse/FilterInset.add_theme_constant_override("margin_top", 4)
		_gallery.fixed_icon_size = Vector2i(96, 96)
		_gallery.set("fit_content", true)
		_gallery.set("maximum_content_height", 310.0)
		_gallery.size_flags_vertical = Control.SIZE_FILL
		$BrowseInset/Browse/GalleryGutter.size_flags_vertical = Control.SIZE_FILL
		$BrowseInset/Browse/GalleryGutter.add_theme_constant_override("margin_left", -4)
		$BrowseInset/Browse/GalleryGutter.add_theme_constant_override("margin_right", -4)
		_gallery.add_theme_stylebox_override("panel", StyleBoxEmpty.new())
		_gallery.add_theme_constant_override("h_separation", 10)
		_gallery.add_theme_constant_override("v_separation", 31)
		%VaultStatus.custom_minimum_size.y = 20
		%VaultStatus.add_theme_font_size_override("font_size", 12)
		%VaultStatus.vertical_alignment = VERTICAL_ALIGNMENT_BOTTOM
		$InspectorInset/Selection.add_theme_constant_override("separation", 12)
		$InspectorInset/Selection/TopInset.hide()
		preload("res://src/assets_inspector_layout.gd").configure($InspectorInset)
	$InspectorInset/Selection/PreviewLabel.visible = standalone_copy
	if not standalone_copy:
		$InspectorInset/Selection/SelectionBox/Labels/Label.hide()
		$InspectorInset/Selection/SelectionBox.add_theme_stylebox_override("panel", StyleBoxEmpty.new())
		$InspectorInset/Selection/Matte.add_theme_stylebox_override("panel", StyleBoxEmpty.new())
	_zoom(4)
	_picker.search_requested.connect(_search_items)
	_picker.current_picture_requested.connect(_current_picture)
	_picker.apply_requested.connect(_apply_artwork)
	_picker.cancelled.connect(_close_picker)
	%PickerWindow.close_requested.connect(_close_picker)


func configure_operations(operations: ProvidenceEditorOperation, read_bridge: Callable = Callable()) -> void:
	_operations = operations
	_read_bridge = read_bridge
	%CopyDialog.configure_operations(operations)


func refresh_workbench(operation: ProvidenceEditorOperation = null) -> Dictionary:
	return await reload(_read_bridge.call(), operation)


func teardown_session() -> void:
	clear()
	_bridge = null


func reload(bridge, operation: ProvidenceEditorOperation = null) -> Dictionary:
	if bridge == null:
		teardown_session()
		return {"ok": true}
	if has_unapplied_changes(): return {"ok": false, "draftKept": true, "error": "Finish or cancel the artwork chooser before refreshing."}
	_bridge = bridge
	return await _run("Load artwork library", _reload, operation)


func _reload(operation: ProvidenceEditorOperation) -> Dictionary:
	var selected := str(_rows[_selected].identity) if _selected >= 0 else ""
	var selection_epoch := _selection_epoch
	var scroll := _gallery.get_v_scroll_bar().value
	var count := maxi(_rows.size(), PAGE_SIZE)
	var response := await _load_page_workflow(operation, 0)
	while response.get("ok", false) and _rows.size() < mini(count, _total) and not %ShowMoreArtwork.disabled:
		response = await _load_page_workflow(operation, _rows.size())
	if not response.get("ok", false): return response
	if selection_epoch == _selection_epoch:
		for index in range(_rows.size()):
			if str(_rows[index].identity) == selected: _select_artwork(index)
		_gallery.get_v_scroll_bar().value = scroll
	return response


func has_unapplied_changes() -> bool:
	return %PickerWindow.visible or %CopyDialog.visible


func discard_draft() -> void:
	%PickerWindow.hide()
	_picker.close_selection()
	%CopyDialog.cancel_selection()
	_copy_pending.clear()


func show_collection(bridge, kind: String, label: String) -> void:
	assert(kind in ["vault-icon", "bag-item"])
	if kind != _collection_kind: clear()
	_collection_kind = kind
	_collection_label = label
	$BrowseInset/Browse/Heading.text = label
	$BrowseInset/Browse/SearchGroup/Fields/SearchLabel.text = "SEARCH ASSETS" if standalone_copy else "SEARCH " + label.to_upper()
	%VaultSearch.placeholder_text = "Search " + label + "…"
	%VaultSearch.text = ""
	await reload(bridge)


func clear() -> void:
	_generation += 1
	_queued_search = false
	_catalog_current = false
	%VaultStatus.text = ""
	_total = 0
	_offset = 0
	_rows = []
	_textures.clear()
	_failed_previews.clear()
	_selected = -1
	_gallery.clear()
	%SelectedArtwork.texture = null
	%ArtworkName.text = "Choose a picture"
	%ArtworkDimensions.text = ""
	%ShowMoreArtwork.disabled = true
	%ShowMoreArtwork.hide()
	%ShownArtwork.text = ""
	%UseInItem.disabled = true
	%ItemTarget.set_proposed(null, false)
	%CopyToScenario.disabled = true
	%CopyDialog.hide()
	%CopyDialog.cancel_selection()
	_copy_pending.clear()
	for button: Button in $InspectorInset/Selection/Zoom.get_children():
		button.disabled = true
	%PickerWindow.hide()
	_picker.close_selection()


func _load_page(offset: int) -> Dictionary:
	if _bridge == null: return {"ok": false, "error": "Open an artwork library first."}
	return await _run("Load artwork page", _load_page_workflow.bind(offset))


func _load_page_workflow(operation: ProvidenceEditorOperation, offset: int) -> Dictionary:
	var generation := _generation
	var query: String = %VaultSearch.text
	var response := await _request(operation, "reference-catalog.list", {
		"kind": _collection_kind, "query": query, "offset": offset, "limit": PAGE_SIZE,
	})
	if response.get("outcomeUnknown", false): return response
	if generation != _generation or query != %VaultSearch.text: return _stale()
	if not bool(response.get("ok", false)):
		_catalog_current = false
		%UseInItem.disabled = true
		%CopyToScenario.disabled = true
		%ItemTarget.set_proposed(%SelectedArtwork.texture, false)
		%VaultStatus.text = str(response.get("error", "The artwork library could not be opened."))
		return response
	if offset == 0:
		clear()
	_catalog_current = true
	_offset = offset
	var result: Dictionary = response.get("result", {})
	var page := (result.get("items", []) as Array).slice(0, PAGE_SIZE)
	var first_new := _rows.size()
	_rows.append_array(page)
	_total = int(result.get("total", 0))
	for row: Dictionary in page:
		_gallery.add_item("Artwork %d" % int((row.get("resource", {}) as Dictionary).get("resourceId", 0)), UNAVAILABLE_PICTURE)
	%VaultStatus.text = ("1 matching picture" if _total == 1 else "%d matching pictures" % _total) if bool(result.get("configured", true)) else "This artwork library is not available. Open reference-library settings to locate it."
	if standalone_copy and bool(result.get("configured", true)):
		%VaultStatus.text = "%s · %d matches · Supplied collection" % [_collection_label, _total]
	%ShowMoreArtwork.visible = _rows.size() < _total
	%ShowMoreArtwork.disabled = page.is_empty()
	%ShownArtwork.text = "1 of 1 picture shown" if _rows.size() == 1 and _total == 1 else "%d of %d pictures shown" % [_rows.size(), _total]
	_gallery.call_deferred("_fit_content")
	if operation == null:
		_load_previews(null, _generation, first_new)
		return response
	return await _load_previews(operation, _generation, first_new)


func _load_previews(operation: ProvidenceEditorOperation, generation: int, first_new: int = 0) -> Dictionary:
	for index: int in range(first_new, _rows.size()):
		await get_tree().process_frame
		if generation != _generation:
			return _stale()
		var response := await _request(operation, "reference-catalog.preview", {"identity": _rows[index]["identity"]})
		if response.get("outcomeUnknown", false): return response
		if generation != _generation: return _stale()
		var texture := preload("res://src/item_artwork_lookup.gd").decode_texture(response)
		if texture != null:
			_textures[index] = texture
			_gallery.set_item_icon(index, texture)
		else:
			_failed_previews[index] = true
			_gallery.set_item_tooltip(index, "Picture unavailable. Choose another picture.")
		if _selected == index:
			_select_artwork(index)
	return {"ok": true}


func _run(label: String, workflow: Callable, borrowed: ProvidenceEditorOperation = null) -> Dictionary:
	if _operations == null: return await workflow.call(null)
	return await _operations.run_workflow(_bridge, label, workflow, borrowed)


func _request(operation: ProvidenceEditorOperation, method: String, params: Dictionary = {}) -> Dictionary:
	return _bridge.request(method, params) if operation == null else await operation.request(method, params)


func _stale() -> Dictionary:
	return {"ok": false, "stale": true, "error": "The artwork library selection or session changed while loading."}


func _select_artwork(index: int) -> void:
	if index < 0 or index >= _rows.size():
		return
	if _selected != index: _selection_epoch += 1
	_selected = index
	_gallery.select(index)
	var row: Dictionary = _rows[index]
	%ArtworkName.text = "Artwork %d" % int((row["resource"] as Dictionary)["resourceId"])
	%ArtworkDimensions.text = "%d × %d pixels" % [int(row.get("width", 0)), int(row.get("height", 0))]
	if not _textures.has(index):
		%ArtworkDimensions.text = "Picture unavailable. Choose another picture." if _failed_previews.has(index) else "Loading picture…"
	%SelectedArtwork.texture = _textures.get(index)
	%UseInItem.disabled = not _catalog_current or not _textures.has(index) or not _bridge.is_project_backed()
	%CopyToScenario.disabled = %UseInItem.disabled
	%ItemTarget.set_proposed(%SelectedArtwork.texture, not %UseInItem.disabled)
	for button: Button in $InspectorInset/Selection/Zoom.get_children():
		button.disabled = not _textures.has(index)


func _copy_dialog() -> void:
	if not standalone_copy or %CopyToScenario.disabled or _selected < 0:
		return
	var generation := _generation
	var identity := str(_rows[_selected].identity)
	var response := await _run("Check artwork copy", _describe)
	if generation != _generation or _selected < 0 or str(_rows[_selected].identity) != identity: return
	if not bool(response.get("ok", false)):
		%VaultStatus.text = str(response.get("error", "The scenario could not be checked."))
		return
	_copy_pending = {"identity": str(_rows[_selected].identity), "expectedRevision": int(response.result.revision)}
	await %CopyDialog.begin(_bridge, int(_copy_pending.expectedRevision), _textures.get(_selected), int((_rows[_selected].resource as Dictionary).resourceId))


func _describe(operation: ProvidenceEditorOperation) -> Dictionary:
	return await _request(operation, "session.describe")


func _copy_artwork() -> void:
	if _copy_pending.is_empty():
		return
	var params := _copy_pending.duplicate()
	params["resourceId"] = %CopyDialog.picture_number()
	var generation := _generation
	var response := await _run("Copy artwork to scenario", _copy_workflow.bind(params, generation))
	if generation != _generation: return
	if not bool(response.get("ok", false)):
		%VaultStatus.text = str(response.get("error", "The artwork could not be copied."))
		%CopyDialog.show_failure(%VaultStatus.text)
		return
	_copy_pending.clear()
	%VaultStatus.text = "Copied to Scenario Assets. The library original is unchanged."
	scenario_changed.emit(response.get("result", {}))


func _copy_workflow(operation: ProvidenceEditorOperation, params: Dictionary, generation: int) -> Dictionary:
	var checked: Dictionary = await %CopyDialog.check_number_response(operation)
	if not checked.get("ok", false): return checked
	if generation != _generation: return _stale()
	if not checked.get("result", {}).get("available", false) or params.resourceId != %CopyDialog.picture_number():
		return {"ok": false, "error": "Choose and check an available picture number before copying."}
	return await _request(operation, "reference-catalog.copy-icon", params)


func _use_in_item() -> void:
	if %UseInItem.disabled or _selected < 0:
		return
	if not %ItemTarget.item.is_empty():
		_apply_artwork(str(_rows[_selected].identity), %ItemTarget.record_index(), %ItemTarget.revision)
		return
	%PickerWindow.popup_centered(Vector2i(1120, 540))
	_picker.begin(str(_rows[_selected]["identity"]), _textures[_selected])


func _search_items(query: String, offset: int, request_id: int) -> void:
	var generation := _generation
	if _operations != null and _operations.busy:
		if not await _wait_for_idle(): return
		if generation != _generation or not _picker.accepts_search(request_id): return
	var response := await _run("Search scenario items", _read_items.bind(query, offset))
	if generation != _generation: return
	if bool(response.get("ok", false)):
		_picker.receive_items(response["result"], request_id)
	else:
		_picker.receive_failure(str(response.get("error", "Items could not be loaded.")), request_id)


func _read_items(operation: ProvidenceEditorOperation, query: String, offset: int) -> Dictionary:
	return await _request(operation, "item.list", {"scope": "scenario", "query": query, "offset": offset, "limit": 32})


func _current_picture(item: Dictionary, request_id: int) -> void:
	var generation := _generation
	if _operations != null and _operations.busy:
		if not await _wait_for_idle(): return
		if generation != _generation or not _picker.accepts_preview(request_id): return
	var response := await _run("Load item picture", _read_picture.bind(int(item.get("iconId", 0))))
	if generation != _generation or response.get("outcomeUnknown", false): return
	_picker.receive_current_picture(response.get("texture"), request_id)


func _read_picture(operation: ProvidenceEditorOperation, icon_id: int) -> Dictionary:
	return await preload("res://src/item_artwork_lookup.gd").resolve(_bridge.request if operation == null else operation.request, icon_id)


func _apply_artwork(identity: String, record_index: int, revision: int) -> void:
	var generation := _generation
	var response := await _run("Apply item artwork", _apply_item.bind(identity, record_index, revision))
	if generation != _generation: return
	if not bool(response.get("ok", false)):
		var message := str(response.get("error", "The artwork could not be applied."))
		if not %ItemTarget.item.is_empty():
			%VaultStatus.text = ("Outcome unknown. Reopen the project before applying again. " if response.get("outcomeUnknown", false) else "Cancel and reopen the chooser to review the current item. ") + message
			return
		if response.get("outcomeUnknown", false): _picker.apply_unknown(message)
		else: _picker.apply_failed(message, message.contains("Review its current state"))
		return
	%PickerWindow.hide()
	artwork_applied.emit(response["result"], record_index)


func _apply_item(operation: ProvidenceEditorOperation, identity: String, record_index: int, revision: int) -> Dictionary:
	return await _request(operation, "scenario-item.apply-library-artwork", {
		"identity": identity, "recordIndex": record_index, "expectedRevision": revision})


func _close_picker() -> void:
	if _picker.is_pending():
		return
	_picker.close_selection()
	%PickerWindow.hide()
	%UseInItem.grab_focus()


func _on_search(_text: String) -> void:
	_generation += 1
	if _operations != null and _operations.busy:
		# Coalesce only read-only search changes. Mutations never queue or retry.
		if _queued_search: return
		_queued_search = true
		if not await _wait_for_idle() or not _queued_search: return
		_queued_search = false
	await _load_page(0)


func _wait_for_idle() -> bool:
	while _operations.busy:
		await _operations.completed
		# Let the completing command publish its projection before a coalesced
		# read acquires the next lease. Completion signals precede its return.
		await get_tree().process_frame
	return not _operations.requires_reopen


func _show_more() -> void:
	if not %ShowMoreArtwork.disabled and _rows.size() < _total:
		await _load_page(_rows.size())


func _zoom(scale: int) -> void:
	%SelectedArtwork.custom_minimum_size = Vector2(32, 32) * scale
	for button: Button in $InspectorInset/Selection/Zoom.get_children():
		button.toggle_mode = true
		button.set_pressed_no_signal(button.text == "%d×" % scale)
