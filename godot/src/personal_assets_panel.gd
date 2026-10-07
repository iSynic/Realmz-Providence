extends HBoxContainer

signal authoring_requested(action: String, context: Dictionary)
signal library_changed
signal scenario_changed(projection: Dictionary)
signal artwork_applied(projection: Dictionary, record_index: int)
@export var unified_browser := false

const PAGE_SIZE := 25
const UNAVAILABLE = preload("res://src/artwork_unavailable.svg")
const TextPresentation = preload("res://src/text_asset_presentation.gd")
var _bridge
var _operations: ProvidenceEditorOperation
var _catalog := preload("res://src/asset_catalog_controller.gd").new()
var _library_commands := preload("res://src/asset_library_commands.gd").new()
var scenario_remover: Callable
var resource_opener: Callable
var _revision := 0
var _rows: Array = []
var _selected := -1
var _generation := 0
var _previews: Dictionary = {}
var _pending: Dictionary = {}
var _name_command := "personal-library.rename"
var _collection_offset := 0
var _collection := ""
var _scope := "personal"
var _transfer := preload("res://src/artwork_transfer_controller.gd").new()
var _preview_scale := 4
var _asset_kind := "all"
var _icons_only := false
var _pairing: Dictionary = {}
var _paired_identity_filter := ""
var _seek_identity := ""
var _page_start := 0
var _catalog_current := false
var authoring_locked := false
@onready var _audition: Control = %MusicAudition


func _ready() -> void:
	_bind_preview()
	theme_changed.connect(_refresh_theme_glyphs)
	%EditResource.pressed.connect(_open_selected_resource)
	%TextDialog.applied.connect(func(projection: Dictionary, identity: String):
		scenario_changed.emit(projection)
		await refresh_selection(identity))
	$BrowseInset/Browse/FilterInset/Filters/Kind.item_selected.connect(_kind_selected)
	%ItemTarget.apply_requested.connect(_use_stock)
	if unified_browser:
		preload("res://src/assets_inspector_layout.gd").configure($InspectorInset, true)
	TextPresentation.configure(self)
	for entry: Array in [["One", 1], ["Two", 2], ["Four", 4]]:
		$InspectorInset/Selection/PreviewScale.get_node(entry[0]).pressed.connect(_zoom_preview.bind(entry[1]))
	%Search.text_submitted.connect(func(_text):
		_seek_identity = ""
		_paired_identity_filter = ""
		await reload(_bridge))
	%ReplaceScenario.pressed.connect(func():
		if _selected >= 0 and _rows[_selected].get("kind") == "text-resource": _open_selected_resource()
		else: _request_authoring("replace"))
	%AddToLibrary.pressed.connect(func(): _request_authoring("transfer"))
	%RemoveScenario.pressed.connect(func():
		if unified_browser: _request_authoring("remove"); return
		if not %RemoveScenario.disabled:
			scenario_remover.call(str(_rows[_selected].identity)))
	%FindScenarioUses.pressed.connect(func():
		if not %FindScenarioUses.disabled:
			%ItemUsesMenu.show_uses(_bridge, str(_rows[_selected].identity), %FindScenarioUses))
	%More.hide()
	%Paging.page_requested.connect(func(offset): _seek_identity = ""; await _load_page(offset))
	%Paging.settings_changed.connect(func(): _seek_identity = ""; await reload(_bridge))
	%Paging.card_size_changed.connect(func(size): %Gallery.fixed_icon_size = Vector2i(size, size); %Gallery.call_deferred("_fit_columns"))
	%Gallery.item_selected.connect(_select)
	%Import.pressed.connect(func(): %ImportFile.popup_centered())
	%ImportFile.file_selected.connect(import_file)
	%Rename.pressed.connect(_rename_dialog)
	%RenameDialog.confirmed.connect(func(): _mutate(_name_command, {"name": %NewName.text}))
	%NewCollection.pressed.connect(_new_collection)
	%Move.pressed.connect(_move_dialog)
	%CollectionMore.pressed.connect(_collection_page)
	%Collections.item_selected.connect(func(_index): %CollectionDialog.get_ok_button().disabled = false)
	%CollectionDialog.confirmed.connect(_move_selected)
	%Copy.pressed.connect(_copy_dialog)
	%UseStock.pressed.connect(_use_stock)
	%Remove.pressed.connect(_remove_dialog)
	%RemoveDialog.confirmed.connect(func(): _mutate("personal-library.remove", {}))


func configure_operations(operations: ProvidenceEditorOperation) -> void:
	_operations = operations
	_catalog.operations = operations
	_library_commands.operations = operations
	_transfer.configure_operations(operations)
	%TextDialog.configure_operations(operations)
	%ItemUsesMenu.operations = operations


func reload(bridge, borrowed: ProvidenceEditorOperation = null) -> Dictionary:
	if bridge != null and borrowed == null and _operations != null and _operations.busy:
		return {"ok": false, "busy": true, "error": "Wait for the current asset operation to finish."}
	_stop_audio()
	_bridge = bridge
	_library_commands.attach_session(bridge)
	_transfer.attach_session(bridge)
	_generation += 1
	if bridge == null:
		%TextDialog.discard_draft()
		_reset_browser()
		return {"ok": true}
	return await _load_page(0, borrowed)


func _ensure_operations() -> void:
	if _operations != null: return
	_operations = ProvidenceEditorOperation.new()
	add_child(_operations)
	configure_operations(_operations)


func _reset_browser() -> void:
	_catalog_current = false
	_stop_audio()
	%SoundPreview.stream = null
	%PlayPreview.hide()
	%MusicAudition.hide()
	%TextPreview.hide()
	%TextPreview.text = ""
	%StyleDescription.hide()
	%StyleGlyph.hide()
	%TextLimitation.hide()
	_pairing.clear()
	for name in ["PreviewHost", "PreviewScaleLabel", "PreviewScale"]:
		$InspectorInset/Selection.get_node(name).visible = not _icons_only and (name == "PreviewHost" or not unified_browser)
	%EditResource.disabled = true
	%ItemUsesMenu.reset()
	%FindScenarioUses.disabled = true
	%RemoveScenario.disabled = true
	%ReplaceScenario.disabled = true
	%AddToLibrary.disabled = true
	%Status.text = "No library is open." if _bridge == null else ""
	for dialog: Window in [%RenameDialog, %RemoveDialog, %CollectionDialog, %CopyDialog, %StockPickerWindow]:
		dialog.hide()
	_pending.clear()
	_transfer.cancel()
	_rows.clear()
	_previews.clear()
	_selected = -1
	%Gallery.clear()
	%Preview.texture = null
	%OpenPreview.disabled = true
	_zoom_preview(_preview_scale)
	%Name.text = "Choose an asset"
	$InspectorInset/Selection/SelectionBox/Labels/Label.text = "SELECTION"
	%Name.tooltip_text = ""
	%Dimensions.text = ""
	%Rename.disabled = true
	%Remove.disabled = true
	%Move.disabled = true
	%Copy.disabled = true
	%UseStock.disabled = true
	%ItemTarget.set_proposed(null, false)
	%NewCollection.disabled = true
	%More.hide()
	%Paging.clear()
	%Import.disabled = true


func show_collection(identity: String) -> void:
	if _operations != null and _operations.busy: return
	_collection = identity
	await reload(_bridge)


func recheck_selection(borrowed: ProvidenceEditorOperation = null) -> Dictionary:
	if _scope != "scenario" or _bridge == null or _selected < 0 or _selected >= _rows.size():
		return {"ok": true}
	_ensure_operations()
	return await _operations.run_workflow(_bridge, "Recheck artwork uses",
		_recheck_workflow.bind(_selected, _generation), borrowed)


func _recheck_workflow(operation: ProvidenceEditorOperation, index: int, generation: int) -> Dictionary:
	var row: Dictionary = _rows[index]
	var response := await operation.request("project-asset.open", {"identity": row.identity, "offset": 0, "limit": 1})
	if generation != _generation or index != _selected:
		return {"ok": false, "stale": true, "error": "The asset selection changed while rechecking uses."}
	%ItemUsesMenu.reset()
	row.removable = false
	row.removalReason = "Artwork could not be rechecked. Return to Assets to retry."
	var result: Dictionary = response.get("result", {})
	if response.get("ok", false) and str(result.get("asset", {}).get("identity", "")) == str(row.identity):
		row.removable = bool(result.get("removable", false))
		row.removalReason = str(result.get("removalReason", ""))
		row.usedBy = result.get("paging", {}).get("usedByTotal", row.get("usedBy", 0))
		%Status.text = "No remaining uses. Artwork can be removed." if row.removable else row.removalReason
	else:
		%Status.text = "Could not recheck selected artwork. Return to Assets to retry."
	_present_selection(index)
	return response


func show_scope(bridge, scope: String) -> Dictionary:
	if _operations != null and _operations.busy:
		return {"ok": false, "busy": true, "error": "Wait for the current asset operation to finish."}
	_seek_identity = ""
	assert(scope in ["personal", "scenario", "stock"])
	if scope != _scope: _reset_browser()
	_scope = scope
	_paired_identity_filter = ""
	%EditResource.visible = scope == "scenario" and not _icons_only
	_collection = "all" if scope == "personal" else ""
	%Paging.configure(scope)
	_asset_kind = "icon" if _icons_only else "all"
	_configure_kind_filter()
	%Search.text = ""
	$BrowseInset/Browse/Heading/Title.text = {"personal": "My additions", "scenario": "Scenario Assets", "stock": "Stock Assets"}[scope]
	%Search.placeholder_text = "Search assets…"
	%Import.visible = scope == "personal"
	%Copy.visible = scope == "personal"
	%UseStock.visible = true
	%NewCollection.visible = scope == "personal"
	for control: Button in [%Rename, %Move, %Remove]:
		control.visible = scope == "personal"
	for control: Control in [%ReplaceScenario, %AddToLibrary, %RemoveScenario, %ScenarioUses, %FindScenarioUses]:
		control.visible = unified_browser and scope == "scenario"
	$InspectorInset/Selection/Rights.text = {"personal": "Your reusable original. Scenario copies stay unchanged when you edit this entry.", "stock": "Available in Realmz. Using this artwork adds a reference, not a copy.", "scenario": "Ships with this scenario. Library originals stay unchanged."}[scope]
	return await reload(bridge)


func _load_page(offset: int, borrowed: ProvidenceEditorOperation = null) -> Dictionary:
	if _bridge == null: return {"ok": true}
	_ensure_operations()
	var generation := _generation
	var state := _catalog_state()
	var response: Dictionary = await _catalog.load_page(_bridge, _scope, _catalog.page_params(state, offset),
		_apply_page.bind(offset), func(): return generation == _generation and state == _catalog_state(), borrowed)
	if generation != _generation:
		return {"ok": false, "connectionChanged": true, "error": "The asset browser session changed while loading."}
	if not response.get("ok", false):
		_catalog_current = false
		%Status.text = str(response.get("error", "Assets could not load."))
		for action: Button in [%OpenPreview, %FindScenarioUses, %UseStock, %Copy, %ReplaceScenario, %AddToLibrary, %RemoveScenario, %Rename, %Move, %Remove, %EditResource]:
			action.disabled = true
	return response


func _catalog_state() -> Dictionary:
	return {"scope": _scope, "query": %Search.text, "kind": _asset_kind, "collection": _collection,
		"paired": _paired_identity_filter, "seek": _seek_identity, "selection": _selected, "status": %Paging.status, "limit": %Paging.page_size}


func _apply_page(result: Dictionary, previews: Dictionary, offset: int) -> Dictionary:
	var revision := int(result.get("revision", 0))
	if offset > 0 and _catalog_current and revision != _revision:
		return {"ok": false, "error": "The asset library changed. Refresh before loading more assets."}
	_revision = revision
	_reset_browser()
	_page_start = int(result.get("offset", offset))
	_catalog_current = true
	%Import.disabled = false
	%NewCollection.disabled = false
	var page: Array = (result.get("items", []) as Array).slice(0, %Paging.page_size)
	%Gallery.set_music_rows(_asset_kind == "music")
	_rows.append_array(page)
	for row: Dictionary in page:
		var kind := str(row.get("kind", ""))
		%Gallery.add_item(preload("res://src/media_card_presentation.gd").caption(row, _scope) if unified_browser else str(row.get("name", row.get("label", "Unnamed asset"))), TextPresentation.glyph(kind) if kind in ["text-resource", "text-style-resource"] else UNAVAILABLE)
		if kind == "music": %Gallery.set_item_icon(%Gallery.item_count - 1, preload("res://src/music_note.svg")); %Gallery.set_item_icon_modulate(%Gallery.item_count - 1, preload("res://src/media_card_presentation.gd").color(row, self))
		if unified_browser: %Gallery.set_item_custom_fg_color(%Gallery.item_count - 1, preload("res://src/media_card_presentation.gd").color(row, self))
	var total := int(result.get("total", 0))
	%Status.text = "%d of %d assets shown" % [_rows.size(), total] if total else "No matching assets."
	if result.get("scenarioMusicSlots", false): %Status.text = "%d scenario music slots · %d assigned" % [total, int(result.assigned)]
	if _page_start > 0: %Status.text = "Assets %d–%d of %d" % [_page_start + 1, _page_start + _rows.size(), total]
	if not _paired_identity_filter.is_empty() and total > 0:
		%Status.text = "Paired text · Enter a search to browse other assets."
	if not bool(result.get("configured", true)):
		%Status.text = "The stock library is not configured."
	%More.hide()
	%Paging.present(result)
	for index in _rows.size():
		var identity := str(_rows[index].identity)
		if not previews.has(identity): continue
		_previews[index] = previews[identity]
		if _previews[index].has("texture"): %Gallery.set_item_icon(index, _previews[index].texture)
	_refresh_theme_glyphs()
	%Gallery.call_deferred("_fit_columns")
	return {"ok": true, "result": result}


func _select(index: int, borrowed: ProvidenceEditorOperation = null) -> Dictionary:
	if index < 0 or index >= _rows.size(): return {"ok": true}
	if _scope != "scenario" or str(_rows[index].get("kind", "")) != "text-style-resource":
		_present_selection(index)
		return {"ok": true}
	_ensure_operations()
	return await _operations.run_workflow(_bridge, "Open asset details",
		_select_workflow.bind(index, _generation, str(_rows[index].identity)), borrowed)


func _select_workflow(operation: ProvidenceEditorOperation, index: int, generation: int, identity: String) -> Dictionary:
	var detail := await operation.request("project-asset.open", {"identity": identity, "offset": 0, "limit": 1})
	if not detail.get("ok", false): return detail
	if generation != _generation or index >= _rows.size() or str(_rows[index].identity) != identity:
		return {"ok": false, "stale": true, "error": "The asset selection changed while loading."}
	var pairing: Dictionary = {}
	if str(detail.get("result", {}).get("asset", {}).get("identity", "")) == identity:
		pairing = detail.result.get("pairedText", {})
	_present_selection(index, pairing)
	return detail


func _present_selection(index: int, pairing: Dictionary = {}) -> void:
	if _selected != index:
		_stop_audio()
		%ItemUsesMenu.reset()
	_selected = index
	_pairing = pairing
	%Gallery.select(index)
	var preview: Dictionary = _previews.get(index, {})
	$InspectorInset.present(_rows[index], preview, {"scope": "supplied" if _rows[index].get("ownership") == "supplied" else _scope, "icons_only": _icons_only,
		"editable": resource_opener.is_valid() or unified_browser, "removable": scenario_remover.is_valid() or unified_browser,
		"navigable": %ItemUsesMenu.source_opener.is_valid() or %ItemUsesMenu.item_opener.is_valid(), "unified": unified_browser,
		"project_backed": _bridge != null and _bridge.is_project_backed(), "item_context": not %ItemTarget.item.is_empty(),
		"current": _catalog_current, "locked": authoring_locked})
	TextPresentation.apply(self, _rows[index], preview, _scope, _icons_only,
		_bridge != null and _bridge.is_project_backed(), _pairing, _catalog_current and not authoring_locked)
	_audition.present_selection()


func _open_selected_resource() -> void:
	if %EditResource.disabled or _selected < 0:
		return
	var row: Dictionary = _rows[_selected]
	if str(row.get("kind", "")) == "text-style-resource":
		await _select(_selected)
		if _pairing.get("status") != "ready":
			return
		var identity := str(_pairing.get("identity", ""))
		_paired_identity_filter = identity
		_asset_kind = "text-resource"
		_configure_kind_filter()
		%Search.text = "Text %s" % str(row.get("classicResource", {}).get("resourceId", ""))
		await refresh_selection(identity)
	elif str(row.get("kind", "")) == "text-resource":
		var result: Dictionary = await %TextDialog.open_text(_bridge, str(row.identity))
		if not result.get("ok", false):
			%Status.text = str(result.get("error", "Text could not be opened."))
	elif unified_browser:
		_request_authoring("edit")
	else:
		resource_opener.call(row.duplicate(true))


func select_created_text(identity: String) -> void:
	_paired_identity_filter = ""
	_asset_kind = "all"
	%Search.text = ""
	_configure_kind_filter()
	await refresh_selection(identity)


func refresh_selection(identity: String, borrowed: ProvidenceEditorOperation = null, recheck := false) -> Dictionary:
	if _bridge == null: return {"ok": true}
	_ensure_operations()
	return await _operations.run_workflow(_bridge, "Refresh assets",
		_refresh_selection_workflow.bind(identity, recheck), borrowed)


func _refresh_selection_workflow(operation: ProvidenceEditorOperation, identity: String, recheck: bool) -> Dictionary:
	var focus := get_viewport().gui_get_focus_owner()
	var scroll: float = %Gallery.get_v_scroll_bar().value
	_seek_identity = identity
	var response := await reload(_bridge, operation)
	if not response.get("ok", false) or identity.is_empty(): return response
	for index in _rows.size():
		if str(_rows[index].identity) != identity: continue
		response = await _select(index, operation)
		var resource: Dictionary = _rows[index].get("classicResource") if _rows[index].get("classicResource") is Dictionary else {}
		if response.get("ok", false) and recheck and str(resource.get("resourceType", "")) == "cicn":
			response = await recheck_selection(operation)
		%Gallery.get_v_scroll_bar().value = scroll
		if is_instance_valid(focus) and focus.is_visible_in_tree(): focus.grab_focus()
		return response
	%Status.text = "The selected asset is no longer in this view. Refresh the search to find it."
	return response


func selected_asset_kind() -> String:
	return _asset_kind


func selected_asset_identity() -> String:
	if _selected < 0 or _selected >= _rows.size(): return ""
	return str(_rows[_selected].get("identity", ""))


func refresh_after_history(bridge, borrowed: ProvidenceEditorOperation = null) -> Dictionary:
	if has_unapplied_changes(): return {"ok": false, "draft": true, "error": "Finish or cancel the open asset dialog before refreshing."}
	var identity := ""
	if _selected >= 0 and _selected < _rows.size(): identity = str(_rows[_selected].identity)
	_bridge = bridge
	return await refresh_selection(identity, borrowed, true)


func set_icons_only(enabled: bool, reload_view := true) -> void:
	_icons_only = enabled
	%EditResource.visible = _scope == "scenario" and not enabled
	_asset_kind = "icon" if enabled else "all"
	_configure_kind_filter()
	if _bridge != null and reload_view:
		await reload(_bridge)


func _configure_kind_filter() -> void:
	var selector: OptionButton = $BrowseInset/Browse/FilterInset/Filters/Kind
	selector.clear()
	var kinds := [["All types", "all"], ["Icons", "icon"], ["Monster artwork", "combat-icon"], ["Pictures", "picture"], ["Sounds", "sound"], ["Text & formatting", "all-text"], ["Text", "text-resource"], ["Text styles", "text-style-resource"], ["Land tiles", "special-land-tile"], ["Music", "music"]]
	if _icons_only:
		kinds = [["Icons", "icon"]]
	for entry in kinds:
		selector.add_item(entry[0])
		var index := selector.item_count - 1
		selector.set_item_metadata(index, entry[1])
		if entry[1] == _asset_kind:
			selector.select(index)
	selector.disabled = kinds.size() == 1
	selector.tooltip_text = "Item artwork requires icons." if _icons_only else ("Filter the full asset inventory by type.")


func _kind_selected(index: int) -> void:
	if _operations != null and _operations.busy:
		_configure_kind_filter()
		return
	_seek_identity = ""
	_paired_identity_filter = ""
	_asset_kind = str($BrowseInset/Browse/FilterInset/Filters/Kind.get_item_metadata(index))
	await reload(_bridge)


func _zoom_preview(scale: int) -> void:
	_preview_scale = scale
	$InspectorInset.zoom(scale)


func _stop_audio() -> void:
	_audition.stop()
	%MediaPreview.cancel()
	%SoundPreview.stop(); %PlayPreview.text = "Play Sound"


func _use_stock() -> void:
	if %UseStock.disabled: return
	await _transfer.use_artwork()


func _transfer_selection() -> Dictionary:
	if not _catalog_current or _selected < 0 or _selected >= _rows.size(): return {}
	return {"scope": "supplied" if _rows[_selected].get("ownership") == "supplied" else _scope, "identity": str(_rows[_selected].identity),
		"libraryRevision": _revision, "texture": _previews.get(_selected, {}).get("texture")}


func import_file(path: String) -> void:
	if _bridge == null or _scope != "personal":
		return
	_ensure_operations()
	await _library_commands.import_image(path, _revision, _collection, _refresh_library_change.bind(true, _catalog_state()))


func _refresh_library_change(operation: ProvidenceEditorOperation, applied: bool, importing: bool, state: Dictionary) -> Dictionary:
	if state != _catalog_state():
		return {"ok": false, "error": "the asset search changed. Refresh to load the current view."}
	if importing and applied: %Search.text = ""
	return await reload(_bridge, operation)


func _rename_dialog() -> void:
	if unified_browser: _request_authoring("organize"); return
	_name_command = "personal-library.rename"
	%RenameDialog.title = "Rename personal asset"
	_pending = {"identity": _rows[_selected]["identity"], "expectedRevision": _revision}
	%NewName.text = str(_rows[_selected]["name"])
	%RenameDialog.popup_centered()
	%NewName.grab_focus()
	%NewName.select_all()


func _new_collection() -> void:
	_name_command = "personal-library.create-collection"
	_pending = {"identity": "collection:" + Crypto.new().generate_random_bytes(16).hex_encode(), "expectedRevision": _revision}
	%RenameDialog.title = "New collection"
	%NewName.text = ""
	%RenameDialog.popup_centered()
	%NewName.grab_focus()


func _move_dialog() -> void:
	if _operations != null and _operations.busy: return
	_pending = {"identity": _rows[_selected]["identity"], "expectedRevision": _revision}
	_collection_offset = 0
	%Collections.clear()
	%Collections.add_item("No collection")
	%Collections.set_item_metadata(0, null)
	%CollectionDialog.get_ok_button().disabled = true
	%CollectionDialog.popup_centered()
	await _collection_page()


func _collection_page() -> void:
	if _bridge == null: return
	_ensure_operations()
	var generation := _generation
	var offset := _collection_offset
	var pending := _pending.duplicate()
	var response := await _operations.run_workflow(_bridge, "Load library collections", func(operation):
		return await operation.request("personal-library.collections", {"offset": offset, "limit": PAGE_SIZE}))
	if generation != _generation or offset != _collection_offset or pending != _pending or not %CollectionDialog.visible: return
	if not bool(response.get("ok", false)):
		%Status.text = str(response.get("error", "Collections could not be opened."))
		%CollectionDialog.hide()
		return
	var result: Dictionary = response.get("result", {})
	if int(result.get("revision", -1)) != _revision:
		%CollectionDialog.hide()
		await reload(_bridge)
		%Status.text = "My Library changed. Review the asset and try again."
		return
	var rows: Array = (result.get("items", []) as Array).slice(0, %Paging.page_size)
	for row: Dictionary in rows:
		var index: int = %Collections.add_item(str(row.get("name", "")))
		%Collections.set_item_metadata(index, row.get("identity"))
	_collection_offset += rows.size()
	%CollectionMore.visible = bool(result.get("truncated", false)) and not rows.is_empty()


func _move_selected() -> void:
	var selected: PackedInt32Array = %Collections.get_selected_items()
	if not selected.is_empty():
		_mutate("personal-library.move", {"collection": %Collections.get_item_metadata(selected[0])})


func _remove_dialog() -> void:
	if unified_browser: _request_authoring("remove-personal"); return
	_pending = {"identity": _rows[_selected]["identity"], "expectedRevision": _revision}
	%RemoveDialog.popup_centered()


func _copy_dialog() -> void:
	if unified_browser and %ItemTarget.item.is_empty(): _request_authoring("copy" if _rows[_selected].get("prepared", false) and _rows[_selected].get("kind") != "music" else "prepare-original"); return
	if %Copy.disabled: return
	await _transfer.begin_copy()


func _copy_selected() -> void:
	await _transfer.copy_selected()


func has_unapplied_changes() -> bool:
	return _transfer.has_draft() or %RenameDialog.visible or %RemoveDialog.visible or %CollectionDialog.visible


func discard_draft() -> void:
	%TextDialog.discard_draft()
	%MediaPreview.cancel()
	_transfer.cancel()
	_pending.clear()
	for dialog: Window in [%RenameDialog, %RemoveDialog, %CollectionDialog]: dialog.hide()


func _mutate(method: String, fields: Dictionary) -> void:
	if _scope != "personal":
		return
	var params := _pending.duplicate()
	params.merge(fields)
	_ensure_operations()
	await _library_commands.mutate(method, params, _refresh_library_change.bind(false, _catalog_state()))


func selection_context() -> Dictionary:
	if _selected < 0 or _selected >= _rows.size() or not _catalog_current: return {}
	return {"row": _rows[_selected].duplicate(true), "preview": _previews.get(_selected, {}).duplicate(),
		"scope": "supplied" if _rows[_selected].get("ownership") == "supplied" else _scope, "revision": _revision, "collection": _collection, "origin": %Gallery,
		"epoch": _bridge.connection_epoch() if _bridge != null else -1, "generation": _generation}


func _request_authoring(action: String) -> void:
	if authoring_locked: return
	var context := selection_context()
	if context.get("row", {}).get("emptySlot", false):
		context["initialMusicSlot"] = int(context.row.slot); context["kind"] = "music"
		context.erase("row"); action = "import"
	if not context.is_empty(): authoring_requested.emit(action, context)


func set_authoring_locked(locked: bool) -> void:
	authoring_locked = locked
	if _selected >= 0 and _selected < _rows.size(): _present_selection(_selected, _pairing)


func show_kind(kind: String) -> void:
	if _icons_only and kind != "icon": return
	if _operations != null and _operations.busy: return
	_seek_identity = ""
	_paired_identity_filter = ""
	_asset_kind = kind
	_configure_kind_filter()
	await reload(_bridge)


func read_navigation_state() -> Dictionary:
	return {"query": %Search.text, "kind": _asset_kind, "collection": _collection, "identity": selected_asset_identity(), "scroll": %Gallery.get_v_scroll_bar().value, "epoch": _bridge.connection_epoch() if _bridge != null else -1}


func restore_navigation_state(state: Dictionary) -> bool:
	if _bridge == null or state.get("epoch", -1) != _bridge.connection_epoch(): return false
	%Search.text = str(state.get("query", ""))
	_asset_kind = str(state.get("kind", "all"))
	_collection = str(state.get("collection", ""))
	_configure_kind_filter()
	var response := await refresh_selection(str(state.get("identity", "")))
	if response.get("ok", false):
		%Gallery.get_v_scroll_bar().value = float(state.get("scroll", 0))
		%Gallery.grab_focus()
	return response.get("ok", false)


func _bind_preview() -> void:
	%OpenPreview.pressed.connect(_open_preview)
	%Gallery.item_activated.connect(func(index): await _select(index); _open_preview())
	_transfer.initialize(%CopyDialog, %StockPicker, %StockPickerWindow, %ItemTarget, _transfer_selection)
	_transfer.artwork_applied.connect(func(projection, index): artwork_applied.emit(projection, index))
	_transfer.scenario_changed.connect(func(projection): scenario_changed.emit(projection))
	_transfer.status_changed.connect(func(message): %Status.text = message)
	_transfer.picker_closed.connect(func():
		if %UseStock.is_visible_in_tree() and not %UseStock.disabled: %UseStock.grab_focus())
	_library_commands.library_changed.connect(func(): library_changed.emit())
	_library_commands.status_changed.connect(func(message): %Status.text = message)
	_audition.initialize(func(params): return await _catalog.music_source(_bridge, params), selection_context)
	%MediaPreview.configure_music(func(params): return await _catalog.music_source(_bridge, params))
	%PlayPreview.pressed.connect(func():
		if %SoundPreview.playing: _stop_audio()
		elif %SoundPreview.stream != null: %SoundPreview.play(); %PlayPreview.text = "Stop Sound")
	%SoundPreview.finished.connect(_stop_audio)
	visibility_changed.connect(func():
		if not is_visible_in_tree():
			_stop_audio())


func _open_preview() -> void:
	var context := selection_context()
	if context.is_empty() or %OpenPreview.disabled: return
	_stop_audio()
	context["origin"] = %OpenPreview
	%MediaPreview.open_preview(context)


func _refresh_theme_glyphs() -> void:
	if not is_node_ready(): return
	%StyleGlyph.modulate = get_theme_color("font_color", "ItemRestrictionsHeading")
	for index in mini(_rows.size(), %Gallery.item_count):
		if unified_browser: %Gallery.set_item_custom_fg_color(index, preload("res://src/media_card_presentation.gd").color(_rows[index], self))
		if _rows[index].get("kind") in ["text-resource", "text-style-resource"]:
			%Gallery.set_item_icon_modulate(index, get_theme_color("font_color", "ItemRestrictionsHeading"))
		elif _previews.get(index, {}).get("audio") is AudioStreamWAV:
			var waveform := preload("res://src/media_audio_presentation.gd").waveform(_previews[index].audio, preload("res://src/media_card_presentation.gd").color(_rows[index], self))
			if waveform != null: %Gallery.set_item_icon(index, waveform)

func configure_text_links(source_opener: Callable, preview_opener: Callable) -> void:
	%TextDialog.configure_link_actions(source_opener,preview_opener)
