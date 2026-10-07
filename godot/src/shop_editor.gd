class_name ProvidenceShopEditor
extends "res://src/economy_record_editor.gd"

const CATEGORY_NAMES := ["Weapons", "Armor", "Limb Armor", "Magic", "Supplies"]
const CATEGORY_SIZE := 200
signal discovery_requested(direction: String)

@onready var _inflation: LineEdit = %Inflation
@onready var _stock: ItemList = %ShopStock
@onready var _category_summary: Label = %CategorySummary
@onready var _item_pool: ItemList = %ItemPool
@onready var _add_stock: Button = find_child("AddStock", true, false)
@onready var _replace_stock: Button = find_child("ReplaceStock", true, false)
@onready var _clear_slot: Button = find_child("ClearSlot", true, false)
@onready var _clear_stock: Button = find_child("ClearStock", true, false)
@onready var _quantity: SpinBox = find_child("Quantity", true, false)
var _stock_confirmation: ConfirmationDialog
var _link_selection: Dictionary = {}
var _browser_generation := 0
var _browser_total := 0
var _browser_all_total := 0
var _browser_truncated := false
@onready var _source_browser: VBoxContainer = %UnverifiedRecords


func route_identity() -> String: return "economy.shops"


func discovery_selection() -> Dictionary:
	if not _link_selection.is_empty(): return _link_selection.duplicate(true)
	return {"kind": "shop", "identity": str(_applied_record.get("identity", "")), "nativeId": str(_applied_native_id), "scope": "scenario"}


func read_navigation_state() -> Dictionary:
	return {"nativeId": _applied_native_id, "query": _search.text, "scroll": _records.get_v_scroll_bar().value,
		"problemsOnly": %ProblemsOnly.button_pressed, "showUnverified": %ShowUnverified.button_pressed,
		"unverified": _source_browser.navigation_state(), "links": _link_selection.duplicate(true)}


func restore_navigation_state(state: Dictionary) -> bool:
	var native_id := int(state.get("nativeId", -1))
	if native_id >= 0:
		var response := await open_native_id(native_id)
		if not response.get("ok", false): return false
	else: clear_selection()
	%ProblemsOnly.set_pressed_no_signal(state.get("problemsOnly", false))
	%ShowUnverified.set_pressed_no_signal(state.get("showUnverified", false))
	_source_browser.visible = %ShowUnverified.button_pressed
	await _refresh_shop_browser()
	if _source_browser.visible: await _source_browser.restore(state.get("unverified", {}))
	_link_selection = state.get("links", {}).duplicate(true)
	_search.text = str(state.get("query", "")); _search.text_changed.emit(_search.text)
	_records.get_v_scroll_bar().set_deferred("value", float(state.get("scroll", 0)))
	if _link_selection.get("linkOnly", false): _source_browser.get_node("Actions/Callers").grab_focus()
	else: %Callers.grab_focus()
	return true


func focus_source(identity: String, _slot: int, field: String) -> bool:
	if identity != str(_draft_record.get("identity", "")) or not field.begins_with("itemIds["): return false
	var slot := field.get_slice("[", 1).get_slice("]", 0).to_int()
	for index in _stock.item_count:
		var metadata: Variant = _stock.get_item_metadata(index)
		if metadata is Dictionary and int(metadata.get("slot", -1)) == slot:
			_stock.select(index)
			_stock.ensure_current_is_visible()
			_stock.grab_focus()
			_update_quantity_from_selection()
			return true
	return false
func _list_method() -> String: return "shop.list"
func _open_method() -> String: return "shop.open"
func _update_method() -> String: return "shop.update"
func _create_method() -> String: return "shop.create"
func _clear_method() -> String: return "shop.clear"
func _record_key() -> String: return "shop"
func _record_label() -> String: return "Shop"
func _identity_prefix() -> String: return "shop"
func _native_family() -> String: return "Data SD"
func _record_bytes() -> int: return 3002
func _new_button_name() -> String: return "NewShop"
func _clear_button_name() -> String: return "ClearShop"
func _apply_button_name() -> String: return "ApplyShop"


func _ready() -> void:
	super._ready()
	%Callers.pressed.connect(func(): _link_selection.clear(); discovery_requested.emit("incoming"))
	%ProblemsOnly.toggled.connect(func(_enabled): _refresh_shop_browser())
	%ShowUnverified.toggled.connect(_show_unverified)
	_source_browser.callers_requested.connect(func(record): _link_selection = record; discovery_requested.emit("incoming"))
	_inflation.text_changed.connect(_inflation_changed)
	_stock.item_selected.connect(_stock_selected)
	_add_stock.pressed.connect(_add_selected_stock)
	_replace_stock.pressed.connect(_replace_selected_stock)
	_clear_slot.pressed.connect(_clear_selected_stock)
	_clear_stock.pressed.connect(_show_clear_stock_confirmation)
	_quantity.value_changed.connect(_quantity_changed)
	_stock_confirmation = ConfirmationDialog.new()
	_stock_confirmation.title = "Clear all Shop stock?"
	_stock_confirmation.dialog_autowrap = true
	_stock_confirmation.dialog_text = "All 1,000 item and quantity slots will become zero in the local draft. Apply Shop to commit the change."
	_stock_confirmation.get_ok_button().text = "Clear Stock Draft"
	_stock_confirmation.confirmed.connect(_confirm_clear_stock)
	add_child(_stock_confirmation)
	var stock_cancel := _stock_confirmation.get_cancel_button()
	stock_cancel.get_parent().move_child(stock_cancel, 0)


func _summary_label(summary: Dictionary) -> String:
	var native_id := int(summary.get("nativeId", -1))
	return "Shop %03d · %d%% · %d active · %d problem%s" % [
		native_id, int(summary.get("inflation", 0)), int(summary.get("activeItems", 0)),
		int(summary.get("problems", 0)), "" if int(summary.get("problems", 0)) == 1 else "s",
	]


func _render_draft(record: Dictionary) -> void:
	_link_selection.clear()
	_rendering = true
	_identity.text = "SHOP %03d  ·  %s" % [_applied_native_id, str(record.get("identity", ""))]
	_inflation.text = str(int(record.get("inflation", 0)))
	_rendering = false
	_refresh_record_items()


func _refresh_record_items() -> void:
	var scroll := _stock.get_v_scroll_bar().value
	var selected_slots: Array = []
	for index in _stock.get_selected_items():
		var selected_metadata: Variant = _stock.get_item_metadata(index)
		selected_slots.append(int(selected_metadata.get("slot", -1)) if selected_metadata is Dictionary else int(selected_metadata))
	_rendering = true
	_stock.clear()
	var item_ids := _draft_record.get("itemIds", []) as Array
	var quantities := _draft_record.get("quantities", []) as Array
	var category_counts: Array[int] = []
	for category in range(CATEGORY_NAMES.size()):
		var active := 0
		var start := category * CATEGORY_SIZE
		for slot in range(start, mini(start + CATEGORY_SIZE, item_ids.size())):
			var item_id := int(item_ids[slot])
			if item_id < 0: break
			if item_id == 0: continue
			var quantity := int(quantities[slot]) if slot < quantities.size() else 0
			var metadata := row_artwork(item_id)
			metadata["slot"] = slot
			var row := _stock.add_item("QTY %3d   %s · %03d   %s (%d)" % [quantity, CATEGORY_NAMES[category], slot - start, str(metadata.name), item_id])
			_stock.set_item_metadata(row, metadata)
			apply_known_row_artwork(_stock, row, metadata)
			if selected_slots.has(slot): _stock.select(row, false)
			active += 1
		category_counts.append(active)
	var category_text := PackedStringArray()
	for index in range(CATEGORY_NAMES.size()): category_text.append("%s %d" % [CATEGORY_NAMES[index], category_counts[index]])
	_category_summary.text = "  ·  ".join(category_text)
	if _stock.item_count == 0:
		_stock.add_item("No active stock before the five category terminators.")
		_stock.set_item_disabled(0, true)
	_stock.get_v_scroll_bar().set_deferred("value", scroll)
	_rendering = false
	_update_quantity_from_selection()


func _clear_document() -> void:
	if _inflation != null:
		_rendering = true
		_inflation.text = ""
		_stock.clear()
		_item_pool.clear()
		_category_summary.text = "No Shop selected."
		_quantity.value = 0
		_rendering = false


func _inflation_changed(_value: String) -> void:
	if _rendering or _draft_record.is_empty(): return
	var parsed := _parse_i16(_inflation, "Inflation")
	if parsed.get("ok", false): _draft_record.inflation = parsed.value
	_state_serial += 1
	_draft_serial += 1
	_form_dirty = true
	_update_authoring_state()


func _stock_selected(_index: int) -> void:
	_update_quantity_from_selection()
	_update_economy_actions()


func _add_selected_stock() -> void:
	var item := selected_catalog_item()
	if item.is_empty(): return
	var item_id := int(item.classicId)
	var band := _band_for_item(item_id)
	if band < 0: return
	var item_ids := (_draft_record.get("itemIds", []) as Array).duplicate()
	var quantities := (_draft_record.get("quantities", []) as Array).duplicate()
	var start := band * CATEGORY_SIZE
	var finish := start + CATEGORY_SIZE
	var terminator := -1
	var open_slot := -1
	for slot in range(start, finish):
		if int(item_ids[slot]) < 0:
			terminator = slot
			break
		if int(item_ids[slot]) == 0 and open_slot < 0: open_slot = slot
	if open_slot >= 0:
		item_ids[open_slot] = item_id
		quantities[open_slot] = 1
	elif terminator >= 0 and terminator < finish - 1:
		item_ids[terminator] = item_id
		quantities[terminator] = 1
		item_ids[terminator + 1] = -1
		quantities[terminator + 1] = 0
		open_slot = terminator
	else:
		_reason.text = "%s stock is full. Clear or replace a slot in that band first." % CATEGORY_NAMES[band]
		return
	_draft_record.itemIds = item_ids
	_draft_record.quantities = quantities
	_state_serial += 1
	_draft_serial += 1
	_form_dirty = true
	_render_draft(_draft_record)
	_select_stock_slot(open_slot)
	_update_authoring_state()


func _replace_selected_stock() -> void:
	var item := selected_catalog_item()
	var slot := _selected_stock_slot()
	if item.is_empty() or slot < 0: return
	_set_draft_array_value("itemIds", slot, int(item.classicId))
	_render_draft(_draft_record)
	_select_stock_slot(slot)
	_update_authoring_state()


func _clear_selected_stock() -> void:
	var slot := _selected_stock_slot()
	if slot < 0: return
	var item_ids := (_draft_record.get("itemIds", []) as Array).duplicate()
	var quantities := (_draft_record.get("quantities", []) as Array).duplicate()
	item_ids[slot] = 0
	quantities[slot] = 0
	_draft_record.itemIds = item_ids
	_draft_record.quantities = quantities
	_state_serial += 1
	_draft_serial += 1
	_form_dirty = true
	_render_draft(_draft_record)
	_update_authoring_state()


func _quantity_changed(value: float) -> void:
	if _rendering: return
	var slot := _selected_stock_slot()
	if slot < 0: return
	_set_draft_array_value("quantities", slot, clampi(int(value), 0, 255))
	_render_draft(_draft_record)
	_select_stock_slot(slot)


func _show_clear_stock_confirmation() -> void:
	if not _draft_record.is_empty():
		_stock_confirmation.popup_centered(Vector2i(620, 170))
		_stock_confirmation.get_cancel_button().grab_focus.call_deferred()


func _confirm_clear_stock() -> void:
	if _draft_record.is_empty(): return
	_draft_record.itemIds = _filled_array(1000, 0)
	_draft_record.quantities = _filled_array(1000, 0)
	_state_serial += 1
	_draft_serial += 1
	_form_dirty = true
	_render_draft(_draft_record)
	_update_authoring_state()


func _validate_draft() -> Dictionary:
	if _draft_record.is_empty(): return {}
	var parsed := _parse_i16(_inflation, "Inflation")
	return {} if parsed.get("ok", false) else parsed


func _synchronize_draft_from_controls() -> void:
	if _draft_record.is_empty(): return
	var before := _draft_record.duplicate(true)
	var parsed := _parse_i16(_inflation, "Inflation")
	if parsed.get("ok", false): _draft_record.inflation = parsed.value
	if _draft_record != before and not _form_dirty:
		_draft_serial += 1
		_form_dirty = true


func _set_authoring_enabled(enabled: bool) -> void:
	if _inflation == null: return
	_inflation.editable = enabled
	_clear_stock.disabled = not enabled


func _update_economy_actions() -> void:
	if _add_stock == null: return
	var editing := not _draft_record.is_empty()
	%Callers.disabled = not editing
	var has_item := not selected_catalog_item().is_empty()
	var has_slot := _selected_stock_slot() >= 0
	_add_stock.disabled = not editing or not has_item
	_replace_stock.disabled = not editing or not has_item or not has_slot
	_clear_slot.disabled = not editing or not has_slot
	_clear_stock.disabled = not editing
	_quantity.editable = editing and has_slot
	_update_item_navigation()


func _selected_record_item_id() -> int:
	var selected := _stock.get_selected_items()
	if selected.is_empty(): return 0
	var metadata: Variant = _stock.get_item_metadata(selected[0])
	return int(metadata.get("classicId", 0)) if metadata is Dictionary else 0


func _update_quantity_from_selection() -> void:
	if _quantity == null: return
	var slot := _selected_stock_slot()
	_rendering = true
	_quantity.value = int((_draft_record.get("quantities", []) as Array)[slot]) if slot >= 0 else 0
	_rendering = false


func _selected_stock_slot() -> int:
	var selected := _stock.get_selected_items() if _stock != null else PackedInt32Array()
	if selected.is_empty(): return -1
	var value: Variant = _stock.get_item_metadata(selected[0])
	if value is Dictionary: return int(value.get("slot", -1))
	return int(value) if value is int or value is float else -1


func _select_stock_slot(slot: int) -> void:
	for row in range(_stock.item_count):
		var metadata: Variant = _stock.get_item_metadata(row)
		var row_slot := int(metadata.get("slot", -1)) if metadata is Dictionary else int(metadata)
		if row_slot == slot:
			_stock.select(row)
			_update_quantity_from_selection()
			return


func _band_for_item(item_id: int) -> int:
	if item_id >= 1 and item_id <= 199: return 0
	if item_id >= 200 and item_id <= 399: return 1
	if item_id >= 400 and item_id <= 599: return 2
	if item_id >= 600 and item_id <= 799: return 3
	if item_id >= 800 and item_id <= 999: return 4
	return -1


func _filled_array(size: int, value: int) -> Array:
	var result: Array = []
	result.resize(size)
	result.fill(value)
	return result


func _record_artwork_icon_ids() -> Array[int]:
	var result: Array[int] = []
	for item_id in _draft_record.get("itemIds", []):
		if int(item_id) <= 0: continue
		var item := item_presentation(int(item_id))
		_append_icon_id(result, int(item.get("iconId", 0)))
	return result


func _apply_record_artwork(icon_id: int, texture: Texture2D) -> void:
	for row in range(_stock.item_count):
		var metadata: Variant = _stock.get_item_metadata(row)
		if metadata is Dictionary and int(metadata.get("iconId", 0)) == icon_id:
			apply_known_row_artwork(_stock, row, metadata)


func _ready_reason() -> String:
	return ""


func _read_catalog(operation: ProvidenceEditorOperation) -> Dictionary:
	var response := await _request(operation, "shop.list", {"offset": 0, "limit": 128, "problemsOnly": %ProblemsOnly.button_pressed})
	if response.get("ok", false) and _source_browser.visible: await _source_browser.reload(_bridge, _operations, operation)
	return response


func _accept_list_result(result: Dictionary) -> void:
	super._accept_list_result(result)
	_browser_total = int(result.get("total", 0))
	_browser_all_total = int(result.get("allTotal", _browser_total))
	_browser_truncated = result.get("truncated", false)


func _render_record_list() -> void:
	super._render_record_list()
	_record_status.text = "%d / %d SHOPS%s" % [_records.item_count, _browser_all_total, " · first 128" if _browser_truncated else ""]
	if _records.item_count == 0: _record_status.text += " · no matches"


func _refresh_shop_browser() -> void:
	_browser_generation += 1
	var generation := _browser_generation
	var bridge = _bridge
	if bridge == null: return
	var epoch: int = bridge.connection_epoch()
	while _operations.busy:
		await get_tree().process_frame
		if generation != _browser_generation or epoch != bridge.connection_epoch(): return
	var response: Dictionary = await _operations.run_workflow(bridge, "Filter Shops", func(op): return await _read_catalog(op))
	if generation != _browser_generation or epoch != bridge.connection_epoch(): return
	if not response.get("ok", false): _record_status.text = "Shop filter unavailable · retry the filter"; return
	_accept_list_result(response.result)
	_summaries = response.result.get("items", []).duplicate(true)
	_render_record_list()


func _show_unverified(enabled: bool) -> void:
	_link_selection.clear()
	_source_browser.visible = enabled
	_source_browser.reset()
	if enabled: await _source_browser.reload(_bridge, _operations)


func teardown_session() -> void:
	_browser_generation += 1
	_link_selection.clear()
	_source_browser.reset()
	super.teardown_session()
