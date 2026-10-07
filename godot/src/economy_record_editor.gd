class_name ProvidenceEconomyRecordEditor
extends "res://src/readonly_native_record_editor.gd"

signal navigation_requested(action: Callable, destination: String)
signal create_requested(native_id: int)
signal clear_requested(native_id: int)
signal item_filter_changed(query: String, category: String)
signal catalog_item_selected(item: Dictionary, index: int)
signal item_open_requested(identity: String)
signal route_requested(route: String)

const CATEGORIES := [
	["All categories", "all"],
	["Weapons · IDs 1–199", "weapon"],
	["Armor · IDs 200–399", "armor"],
	["Accessories / Limb Armor · IDs 400–599", "accessory"],
	["Magic · IDs 600–799", "magic"],
	["Supplies / Special · IDs 800–999", "supply"],
]

var commit_handler := Callable()
var _applied_record: Dictionary = {}
var _draft_record: Dictionary = {}
var _catalog_items: Array = []
var _item_references: Dictionary = {}
var _artwork_by_icon_id: Dictionary = {}
var _artwork_reasons: Dictionary = {}
var _item_offset := 0
var _item_total := 0
var _next_native_id := -1
var _state_serial := 0
var _draft_serial := 0
var _form_dirty := false
var _rendering := false
var _new_record: Button
var _clear_record: Button
var _apply_record: Button
var _category_filter: OptionButton
var _item_search: LineEdit
var _clear_confirmation: ConfirmationDialog
var _open_catalog_item: Button
var _open_record_item: Button


func command_state(command_id: String) -> String:
	return "working" if command_id in [_list_method(), _open_method(), _update_method(), _create_method(), _clear_method(), "item.list"] else "visible-disabled"


func has_unapplied_changes() -> bool:
	return not _draft_record.is_empty() and (_form_dirty or _draft_record != _applied_record)


func draft_record() -> Dictionary:
	return _draft_record.duplicate(true)


func read_state() -> Array:
	return [_state_serial, _applied_native_id, _item_search.text if _item_search != null else "", _selected_category()]


func navigation_subject() -> String:
	return "%s %d" % [_record_label(), _applied_native_id]


func discard_draft() -> void:
	if _applied_record.is_empty(): return
	_draft_record = _applied_record.duplicate(true)
	_state_serial += 1
	_draft_serial += 1
	_form_dirty = false
	_render_draft(_draft_record)
	_update_authoring_state()


func commit_selected() -> Dictionary:
	_synchronize_draft_from_controls()
	var problem := draft_error()
	if not problem.is_empty(): return problem
	if not has_unapplied_changes(): return {"ok": true, "unchanged": true}
	if not commit_handler.is_valid(): return {"ok": false, "error": "Economy authoring is not connected."}
	return await commit_handler.call(_draft_record.duplicate(true), _draft_serial)


func draft_error() -> Dictionary:
	return _validate_draft()


func accept_submitted_record(submitted: Dictionary, revision: int, submitted_serial: int) -> void:
	var late_draft := _draft_serial != submitted_serial
	_applied_record = submitted.duplicate(true)
	_applied_result[_record_key()] = submitted.duplicate(true)
	_applied_result["revision"] = revision
	if not late_draft:
		_draft_record = submitted.duplicate(true)
		_form_dirty = false
	_update_authoring_state()
	document_applied.emit(_applied_result.duplicate(true))


func set_item_catalog(result: Dictionary) -> void:
	_catalog_items = (result.get("items", []) as Array).duplicate(true)
	_item_total = int(result.get("total", _catalog_items.size()))
	var pool := _item_pool_control()
	pool.clear()
	for value in _catalog_items:
		var item := value as Dictionary
		var index := pool.add_item("%03d  %s" % [int(item.get("classicId", 0)), str(item.get("name", "Unnamed item"))])
		pool.set_item_metadata(index, item.duplicate(true))
		_apply_catalog_icon(index, item)
	if pool.item_count == 0:
		pool.add_item("No items match this category and search.")
		pool.set_item_disabled(0, true)
	_set_pool_status("%d–%d of %d items" % [_item_offset + 1, _item_offset + _catalog_items.size(), _item_total] if not _catalog_items.is_empty() else "0 matching items", false)
	_update_economy_actions()


func item_catalog_query() -> Dictionary:
	return {"scope": "all", "query": _item_search.text.strip_edges(), "category": _selected_category(), "offset": _item_offset, "limit": 64}


func show_item_pool_loading() -> void:
	_catalog_items.clear(); _item_pool_control().clear()
	_item_pool_control().add_item("Loading items…")
	_item_pool_control().set_item_disabled(0, true)
	_set_pool_status("Loading item pool…", true); _update_economy_actions()


func show_item_pool_error(reason: String) -> void:
	_catalog_items.clear(); _item_pool_control().clear()
	_item_pool_control().add_item("Item pool unavailable · choose Retry")
	_item_pool_control().set_item_disabled(0, true)
	_item_pool_control().set_item_tooltip(0, reason)
	_set_pool_status("Item pool unavailable", true); _update_economy_actions()


func _set_pool_status(message: String, unavailable: bool) -> void:
	var status := find_child("ItemPoolStatus", true, false) as Label
	if status == null: return
	status.text = message
	(find_child("PoolPrevious", true, false) as Button).disabled = unavailable or _item_offset == 0
	(find_child("PoolNext", true, false) as Button).disabled = unavailable or _item_offset + _catalog_items.size() >= _item_total


func _page_items(direction: int) -> void:
	_item_offset = maxi(0, _item_offset + direction * 64)
	item_filter_changed.emit(_item_search.text.strip_edges(), _selected_category())


func reset_item_artwork() -> void:
	_artwork_by_icon_id.clear(); _artwork_reasons.clear()
	if not _draft_record.is_empty(): _refresh_record_items()


func set_catalog_icon(index: int, texture: Texture2D) -> void:
	var pool := _item_pool_control()
	if texture != null and index >= 0 and index < pool.item_count:
		pool.set_item_icon(index, texture)


func set_item_references(items_by_classic_id: Dictionary) -> void:
	_item_references = items_by_classic_id.duplicate(true)
	if not _draft_record.is_empty(): _refresh_record_items()


func visible_artwork_icon_ids() -> Array[int]:
	var result: Array[int] = []
	for item in _catalog_items:
		_append_icon_id(result, int((item as Dictionary).get("iconId", 0)))
	for icon_id in _record_artwork_icon_ids(): _append_icon_id(result, int(icon_id))
	return result


func set_resolved_artwork(icon_id: int, texture: Texture2D, reason := "") -> void:
	if icon_id == 0: return
	_artwork_by_icon_id[icon_id] = texture if texture != null else preload("res://src/artwork_unavailable.svg")
	_artwork_reasons[icon_id] = reason
	var pool := _item_pool_control()
	for index in range(pool.item_count):
		var metadata: Variant = pool.get_item_metadata(index)
		if metadata is Dictionary and int(metadata.get("iconId", 0)) == icon_id:
			pool.set_item_icon(index, _artwork_by_icon_id[icon_id])
			apply_known_row_artwork(pool, index, metadata)
	_apply_record_artwork(icon_id, _artwork_by_icon_id[icon_id])


func item_presentation(classic_id: int) -> Dictionary:
	var value: Variant = _item_references.get(classic_id, {})
	return value as Dictionary if value is Dictionary else {}


func row_artwork(classic_id: int) -> Dictionary:
	var item := item_presentation(classic_id)
	return {
		"classicId": classic_id,
		"iconId": int(item.get("iconId", 0)),
		"name": str(item.get("name", "Classic item %d" % classic_id)),
		"scope": str(item.get("scope", "unresolved")),
	}


func apply_known_row_artwork(list: ItemList, row: int, metadata: Dictionary) -> void:
	var icon_id := int(metadata.get("iconId", 0))
	if _artwork_by_icon_id.has(icon_id): list.set_item_icon(row, _artwork_by_icon_id[icon_id])
	if icon_id != 0:
		var reason := str(_artwork_reasons.get(icon_id, ""))
		list.set_item_tooltip(row, "%s · Realmz cicn %d%s" % [str(metadata.get("name", "Item")), icon_id, "\n" + reason if not reason.is_empty() else ""])


func selected_catalog_item() -> Dictionary:
	var pool := _item_pool_control()
	var selected := pool.get_selected_items()
	if selected.is_empty(): return {}
	var value: Variant = pool.get_item_metadata(selected[0])
	return value.duplicate(true) if value is Dictionary else {}


func clear_selection() -> void:
	_applied_record.clear()
	_draft_record.clear()
	_state_serial += 1
	_draft_serial += 1
	_form_dirty = false
	super.clear_selection()
	_update_authoring_state()


func teardown_session() -> void:
	_item_references.clear()
	_artwork_by_icon_id.clear()
	_artwork_reasons.clear(); _item_offset = 0
	super.teardown_session()


func _ready() -> void:
	super._ready()
	_new_record = find_child(_new_button_name(), true, false) as Button
	_clear_record = find_child(_clear_button_name(), true, false) as Button
	_apply_record = find_child(_apply_button_name(), true, false) as Button
	_category_filter = find_child("CategoryFilter", true, false) as OptionButton
	_item_search = find_child("ItemSearch", true, false) as LineEdit
	_open_catalog_item = find_child("OpenCatalogItem", true, false) as Button
	_open_record_item = find_child("OpenRecordItem", true, false) as Button
	_configure_section_switcher()
	_configure_categories()
	_new_record.pressed.connect(_request_create)
	_clear_record.pressed.connect(_show_clear_confirmation)
	_apply_record.pressed.connect(commit_selected)
	_category_filter.item_selected.connect(func(_index): _item_filter_edited())
	_item_search.text_changed.connect(func(_value): _item_filter_edited())
	_item_pool_control().item_selected.connect(_on_catalog_selected)
	var previous := find_child("PoolPrevious", true, false) as Button
	if previous != null:
		previous.pressed.connect(_page_items.bind(-1))
		(find_child("PoolNext", true, false) as Button).pressed.connect(_page_items.bind(1))
		(find_child("PoolRetry", true, false) as Button).pressed.connect(func(): item_filter_changed.emit(_item_search.text.strip_edges(), _selected_category()))
	if _open_catalog_item != null: _open_catalog_item.pressed.connect(_open_selected_catalog_item)
	if _open_record_item != null: _open_record_item.pressed.connect(_open_selected_record_item)
	_clear_confirmation = ConfirmationDialog.new()
	_clear_confirmation.title = "Clear %s to defaults?" % _record_label()
	_clear_confirmation.dialog_autowrap = true
	_clear_confirmation.get_ok_button().text = "Clear To Defaults"
	_clear_confirmation.confirmed.connect(_confirm_clear)
	add_child(_clear_confirmation)
	var clear_cancel := _clear_confirmation.get_cancel_button()
	clear_cancel.get_parent().move_child(clear_cancel, 0)
	_update_authoring_state()


func _render_document(record: Dictionary) -> void:
	_applied_record = record.duplicate(true)
	_draft_record = record.duplicate(true)
	_state_serial += 1
	_draft_serial += 1
	_form_dirty = false
	_render_draft(_draft_record)
	_update_authoring_state()


func _accept_list_result(result: Dictionary) -> void:
	var next: Variant = result.get("nextNativeId")
	_next_native_id = int(next) if next is int or next is float else -1
	_update_authoring_state()


func _on_record_selected(index: int) -> void:
	if index < 0: return
	var native_id := int(_records.get_item_metadata(index))
	if native_id == _applied_native_id: return
	navigation_requested.emit(open_native_id.bind(native_id), "opening %s %d" % [_record_label(), native_id])
	_select_applied_record()


func _item_filter_edited() -> void:
	_state_serial += 1
	_item_offset = 0
	item_filter_changed.emit(_item_search.text.strip_edges(), _selected_category())


func _on_catalog_selected(index: int) -> void:
	var item := selected_catalog_item()
	_update_economy_actions()
	if not item.is_empty(): catalog_item_selected.emit(item, index)


func _request_create() -> void:
	if _next_native_id < 0: return
	if has_unapplied_changes():
		navigation_requested.emit(_request_create, "creating %s %d" % [_record_label(), _next_native_id])
	else:
		create_requested.emit(_next_native_id)


func _show_clear_confirmation() -> void:
	if _applied_native_id < 0: return
	if has_unapplied_changes():
		navigation_requested.emit(_show_clear_confirmation, "clearing %s %d" % [_record_label(), _applied_native_id])
		return
	_clear_confirmation.dialog_text = "%s %d will keep its identity and references, but all authored fields will return to zero defaults. This is undoable." % [_record_label(), _applied_native_id]
	_clear_confirmation.popup_centered(Vector2i(620, 180))
	_clear_confirmation.get_cancel_button().grab_focus.call_deferred()


func _confirm_clear() -> void:
	if _applied_native_id >= 0 and not has_unapplied_changes(): clear_requested.emit(_applied_native_id)


func _configure_categories() -> void:
	_category_filter.clear()
	for entry in CATEGORIES:
		_category_filter.add_item(str(entry[0]))
		_category_filter.set_item_metadata(_category_filter.item_count - 1, str(entry[1]))
	_category_filter.select(0)


func _configure_section_switcher() -> void:
	$EconomyNavigation.configure(route_identity())
	$EconomyNavigation.route_requested.connect(_request_route)


func _request_route(route: String) -> void:
	navigation_requested.emit(route_requested.emit.bind(route), "opening %s" % route)


func _selected_category() -> String:
	if _category_filter == null or _category_filter.selected < 0: return "all"
	return str(_category_filter.get_item_metadata(_category_filter.selected))


func _set_draft_value(key: String, value: Variant) -> void:
	if _rendering or _draft_record.is_empty(): return
	_draft_record[key] = value
	_state_serial += 1
	_draft_serial += 1
	_form_dirty = true
	_update_authoring_state()


func _set_draft_array_value(key: String, index: int, value: Variant) -> void:
	if _draft_record.is_empty(): return
	var values := (_draft_record.get(key, []) as Array).duplicate()
	if index < 0 or index >= values.size(): return
	values[index] = value
	_draft_record[key] = values
	_state_serial += 1
	_draft_serial += 1
	_form_dirty = true
	_update_authoring_state()


func _update_authoring_state() -> void:
	var selected := _applied_native_id >= 0 and not _draft_record.is_empty()
	var dirty := has_unapplied_changes()
	var problem := draft_error()
	if _new_record != null: _new_record.disabled = _next_native_id < 0
	if _clear_record != null: _clear_record.disabled = not selected
	if _apply_record != null: _apply_record.disabled = not dirty or not problem.is_empty()
	if _category_filter != null: _category_filter.disabled = not selected
	if _item_search != null: _item_search.editable = selected
	_set_authoring_enabled(selected)
	_update_economy_actions()
	_update_item_navigation()
	if _reason != null:
		_reason.text = str(problem.get("error", "")) if not problem.is_empty() else ("Unapplied changes" if dirty else _ready_reason())


func _parse_i16(control: LineEdit, label: String) -> Dictionary:
	var text := control.text.strip_edges()
	if not text.is_valid_int(): return {"ok": false, "error": "%s must be a whole number." % label, "control": control}
	var value := int(text)
	if value < -32768 or value > 32767: return {"ok": false, "error": "%s must be between -32768 and 32767." % label, "control": control}
	return {"ok": true, "value": value}


func _refresh_record_items() -> void:
	pass


func _render_draft(_record: Dictionary) -> void:
	pass


func _validate_draft() -> Dictionary:
	return {}


func _synchronize_draft_from_controls() -> void:
	pass


func _set_authoring_enabled(_enabled: bool) -> void:
	pass


func _update_economy_actions() -> void:
	pass


func _item_pool_control() -> ItemList:
	return find_child("ItemPool", true, false) as ItemList


func _render_problem_summary(result: Dictionary) -> void:
	var references := result.get("references", []) as Array
	var diagnostics := result.get("diagnostics", []) as Array
	_problems.text = "%d item reference%s · %s" % [
		references.size(), "" if references.size() == 1 else "s",
		"No problems" if diagnostics.is_empty() else "%d problem%s" % [diagnostics.size(), "" if diagnostics.size() == 1 else "s"],
	]
	_reason.text = _disabled_reason()


func _update_item_navigation() -> void:
	if _open_catalog_item != null: _open_catalog_item.disabled = selected_catalog_item().is_empty()
	if _open_record_item != null: _open_record_item.disabled = _selected_record_item_id() <= 0


func _open_selected_catalog_item() -> void:
	var item := selected_catalog_item()
	if not item.is_empty(): _request_item_open(str(item.get("identity", "")))


func _open_selected_record_item() -> void:
	var item_id := _selected_record_item_id()
	if item_id <= 0: return
	var item := item_presentation(item_id)
	_request_item_open(str(item.get("identity", "classic.item.%d" % item_id)))


func _request_item_open(identity: String) -> void:
	if not identity.is_empty(): navigation_requested.emit(item_open_requested.emit.bind(identity), "opening item %s" % identity)


func _selected_record_item_id() -> int:
	return 0


func _apply_catalog_icon(index: int, item: Dictionary) -> void:
	apply_known_row_artwork(_item_pool_control(), index, item)


func _append_icon_id(result: Array[int], icon_id: int) -> void:
	if icon_id != 0 and not result.has(icon_id): result.append(icon_id)


func _record_artwork_icon_ids() -> Array[int]:
	return []


func _apply_record_artwork(_icon_id: int, _texture: Texture2D) -> void:
	pass


func _new_button_name() -> String:
	return ""


func _clear_button_name() -> String:
	return ""


func _apply_button_name() -> String:
	return ""


func _update_method() -> String:
	return ""


func _create_method() -> String:
	return ""


func _clear_method() -> String:
	return ""


func _ready_reason() -> String:
	return "No record selected."


func route_identity() -> String:
	return ""


func _read_catalog(operation: ProvidenceEditorOperation) -> Dictionary:
	var generation := _read_generation
	return await preload("res://src/economy_record_catalog.gd").load_all(
		func(method, params): return await _request(operation, method, params),
		_list_method(), func(): return generation == _read_generation)


func _disabled_reason() -> String:
	return "No editable record."
