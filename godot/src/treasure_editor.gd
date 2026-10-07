class_name ProvidenceTreasureEditor
extends "res://src/economy_record_editor.gd"

signal discovery_requested(direction: String)

@onready var _experience: LineEdit = %Experience
@onready var _gold: LineEdit = %Gold
@onready var _gems: LineEdit = %Gems
@onready var _jewelry: LineEdit = %Jewelry
@onready var _item_slots: ItemList = %TreasureItemSlots
@onready var _item_pool: ItemList = %ItemPool
@onready var _add_item: Button = find_child("AddItem", true, false)
@onready var _replace_item: Button = find_child("ReplaceItem", true, false)
@onready var _clear_item: Button = find_child("ClearItem", true, false)
@onready var _reward_icons := {
	2002: %GoldIcon,
	2014: %GemsIcon,
	2012: %JewelryIcon,
}


func route_identity() -> String: return "economy.treasure"


func discovery_selection() -> Dictionary:
	return {"kind": "treasure", "identity": str(_applied_record.get("identity", "")), "nativeId": str(_applied_native_id), "scope": "scenario"}


func read_navigation_state() -> Dictionary:
	return {"nativeId": _applied_native_id, "query": _search.text, "scroll": _records.get_v_scroll_bar().value}


func restore_navigation_state(state: Dictionary) -> bool:
	var response := await open_native_id(int(state.get("nativeId", -1)))
	if not response.get("ok", false): return false
	_search.text = str(state.get("query", "")); _search.text_changed.emit(_search.text)
	_records.get_v_scroll_bar().set_deferred("value", float(state.get("scroll", 0)))
	%Callers.grab_focus()
	return true


func focus_source(identity: String, _slot: int, field: String) -> bool:
	if identity != str(_draft_record.get("identity", "")) or not field.begins_with("itemIds["): return false
	var slot := field.get_slice("[", 1).get_slice("]", 0).to_int()
	if slot < 0 or slot >= _item_slots.item_count: return false
	_item_slots.select(slot)
	_item_slots.ensure_current_is_visible()
	_item_slots.grab_focus()
	return true
func _list_method() -> String: return "treasure.list"
func _open_method() -> String: return "treasure.open"
func _update_method() -> String: return "treasure.update"
func _create_method() -> String: return "treasure.create"
func _clear_method() -> String: return "treasure.clear"
func _record_key() -> String: return "treasure"
func _record_label() -> String: return "Treasure"
func _identity_prefix() -> String: return "treasure"
func _native_family() -> String: return "Data TD"
func _record_bytes() -> int: return 48
func _new_button_name() -> String: return "NewTreasure"
func _clear_button_name() -> String: return "ClearTreasure"
func _apply_button_name() -> String: return "ApplyTreasure"


func _ready() -> void:
	super._ready()
	for field in [_experience, _gold, _gems, _jewelry]: field.text_changed.connect(_reward_changed)
	_item_slots.item_selected.connect(func(_index): _update_economy_actions())
	_add_item.pressed.connect(_add_selected_item)
	_replace_item.pressed.connect(_replace_selected_item)
	_clear_item.pressed.connect(_clear_selected_slot)
	%Callers.pressed.connect(func(): discovery_requested.emit("incoming"))


func _summary_label(summary: Dictionary) -> String:
	var native_id := int(summary.get("nativeId", -1))
	return "Treasure %03d · %d item%s · %d problem%s" % [
		native_id,
		int(summary.get("populatedItems", 0)),
		"" if int(summary.get("populatedItems", 0)) == 1 else "s",
		int(summary.get("problems", 0)),
		"" if int(summary.get("problems", 0)) == 1 else "s",
	]


func _render_draft(record: Dictionary) -> void:
	_rendering = true
	_identity.text = "TREASURE %03d  ·  %s" % [_applied_native_id, str(record.get("identity", ""))]
	_experience.text = str(int(record.get("experience", 0)))
	_gold.text = str(int(record.get("gold", 0)))
	_gems.text = str(int(record.get("gems", 0)))
	_jewelry.text = str(int(record.get("jewelry", 0)))
	_rendering = false
	_refresh_record_items()


func _refresh_record_items() -> void:
	var scroll := _item_slots.get_v_scroll_bar().value
	var selection := _item_slots.get_selected_items()
	_item_slots.clear()
	var item_ids := _draft_record.get("itemIds", []) as Array
	for slot in range(20):
		var item_id := int(item_ids[slot]) if slot < item_ids.size() and item_ids[slot] != null else 0
		var metadata := row_artwork(item_id) if item_id > 0 else {"classicId": item_id, "iconId": 0, "name": "Empty / none"}
		metadata["slot"] = slot
		var state := "preserved non-runtime value" if item_id < 0 else str(metadata.name)
		var row := _item_slots.add_item("SLOT %02d   %s%s" % [slot, state, "  (%d)" % item_id if item_id > 0 else ""])
		_item_slots.set_item_metadata(row, metadata)
		apply_known_row_artwork(_item_slots, row, metadata)
	for slot in selection:
		if slot < _item_slots.item_count: _item_slots.select(slot, false)
	_item_slots.get_v_scroll_bar().set_deferred("value", scroll)


func _clear_document() -> void:
	if _experience != null:
		_rendering = true
		_experience.text = ""
		_gold.text = ""
		_gems.text = ""
		_jewelry.text = ""
		_item_slots.clear()
		_item_pool.clear()
		_rendering = false


func _reward_changed(_value: String) -> void:
	if _rendering or _draft_record.is_empty(): return
	for pair in [["experience", _experience, "Victory Points"], ["gold", _gold, "Gold"], ["gems", _gems, "Gems"], ["jewelry", _jewelry, "Jewelry"]]:
		var parsed := _parse_i16(pair[1], pair[2])
		if parsed.get("ok", false): _draft_record[pair[0]] = parsed.value
	_state_serial += 1
	_draft_serial += 1
	_form_dirty = true
	_update_authoring_state()


func _add_selected_item() -> void:
	var item := selected_catalog_item()
	if item.is_empty(): return
	var item_ids := (_draft_record.get("itemIds", []) as Array).duplicate()
	var slot := -1
	for index in range(item_ids.size()):
		if int(item_ids[index]) == 0:
			slot = index
			break
	if slot < 0:
		_reason.text = "All 20 Treasure item slots are occupied. Clear or replace a slot first."
		return
	_set_draft_array_value("itemIds", slot, int(item.classicId))
	_render_draft(_draft_record)
	_item_slots.select(slot)
	_update_authoring_state()


func _replace_selected_item() -> void:
	var item := selected_catalog_item()
	var selected := _item_slots.get_selected_items()
	if item.is_empty() or selected.is_empty(): return
	_set_draft_array_value("itemIds", selected[0], int(item.classicId))
	_render_draft(_draft_record)
	_item_slots.select(selected[0])
	_update_authoring_state()


func _clear_selected_slot() -> void:
	var selected := _item_slots.get_selected_items()
	if selected.is_empty(): return
	_set_draft_array_value("itemIds", selected[0], 0)
	_render_draft(_draft_record)
	_item_slots.select(selected[0])
	_update_authoring_state()


func _validate_draft() -> Dictionary:
	if _draft_record.is_empty(): return {}
	for pair in [[_experience, "Victory Points"], [_gold, "Gold"], [_gems, "Gems"], [_jewelry, "Jewelry"]]:
		var parsed := _parse_i16(pair[0], pair[1])
		if not parsed.get("ok", false): return parsed
	return {}


func _synchronize_draft_from_controls() -> void:
	if _draft_record.is_empty(): return
	var before := _draft_record.duplicate(true)
	for pair in [["experience", _experience, "Victory Points"], ["gold", _gold, "Gold"], ["gems", _gems, "Gems"], ["jewelry", _jewelry, "Jewelry"]]:
		var parsed := _parse_i16(pair[1], pair[2])
		if parsed.get("ok", false): _draft_record[pair[0]] = parsed.value
	if _draft_record != before and not _form_dirty:
		_draft_serial += 1
		_form_dirty = true


func _set_authoring_enabled(enabled: bool) -> void:
	if _experience == null: return
	for field in [_experience, _gold, _gems, _jewelry]: field.editable = enabled


func _update_economy_actions() -> void:
	if _add_item == null: return
	var editing := not _draft_record.is_empty()
	%Callers.disabled = not editing
	var has_item := not selected_catalog_item().is_empty()
	var has_slot := not _item_slots.get_selected_items().is_empty()
	var has_open_slot := false
	for item_id in _draft_record.get("itemIds", []):
		if int(item_id) == 0:
			has_open_slot = true
			break
	_add_item.disabled = not editing or not has_item or not has_open_slot
	_replace_item.disabled = not editing or not has_item or not has_slot
	_clear_item.disabled = not editing or not has_slot
	_update_item_navigation()


func _selected_record_item_id() -> int:
	var selected := _item_slots.get_selected_items()
	if selected.is_empty(): return 0
	var metadata: Variant = _item_slots.get_item_metadata(selected[0])
	return int(metadata.get("classicId", 0)) if metadata is Dictionary else 0


func _record_artwork_icon_ids() -> Array[int]:
	var result: Array[int] = [2002, 2014, 2012]
	for item_id in _draft_record.get("itemIds", []):
		if int(item_id) <= 0: continue
		var item := item_presentation(int(item_id))
		_append_icon_id(result, int(item.get("iconId", 0)))
	return result


func _apply_record_artwork(icon_id: int, texture: Texture2D) -> void:
	if _reward_icons.has(icon_id): (_reward_icons[icon_id] as TextureRect).texture = texture
	if icon_id == 2002: %GoldIcon.material = preload("res://src/treasure_reward_artwork.gd").gold_material(texture)
	for row in range(_item_slots.item_count):
		var metadata: Variant = _item_slots.get_item_metadata(row)
		if metadata is Dictionary and int(metadata.get("iconId", 0)) == icon_id:
			apply_known_row_artwork(_item_slots, row, metadata)


func _ready_reason() -> String:
	return ""
