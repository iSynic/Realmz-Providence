extends VBoxContainer

signal item_selected(index: int)

const Row = preload("res://src/item_inventory_row.tscn")
var _rows: Array[Button] = []
var _selected := -1
var _locked := false
var item_count: int:
	get: return _rows.size()


func clear() -> void:
	for row in _rows:
		remove_child(row)
		row.queue_free()
	_rows.clear()
	_selected = -1


func add_record(record: Dictionary) -> void:
	var row: Button = Row.instantiate()
	var index := _rows.size()
	var label := str(record.get("name", ""))
	if label.is_empty(): label = str(record.get("unidentifiedName", ""))
	if label.is_empty(): label = "Unnamed item"
	var context := "%s · %d uses" % ["Scenario" if record.get("scope") == "scenario" else "Stock", int(record.get("usedBy", 0))]
	if int(record.get("problems", 0)) > 0: context += " · %d problems" % int(record.problems)
	row.set_meta("identity", str(record.get("identity", "")))
	row.get_node("Margin/Body/Labels/Name").text = label
	row.get_node("Margin/Body/Labels/Context").text = context
	row.get_node("Margin/Body/Id/Value").text = str(int(record.get("classicId", 0)))
	row.get_node("Margin/Body/Thumbnail/Placeholder").text = "—" if int(record.get("iconId", 0)) == 0 else "…"
	row.tooltip_text = "%s · %s\n%s" % [record.get("classicId", ""), label, context]
	row.disabled = _locked
	row.pressed.connect(func(): select(index); item_selected.emit(index))
	row.gui_input.connect(_key.bind(index))
	_rows.append(row)
	add_child(row)


func set_artwork(index: int, identity: String, picture: Texture2D, reason: String) -> void:
	if index < 0 or index >= _rows.size(): return
	var row := _rows[index]
	if row.get_meta("identity") != identity: return
	row.get_node("Margin/Body/Thumbnail/Picture").texture = picture
	row.get_node("Margin/Body/Thumbnail/Placeholder").visible = picture == null
	row.get_node("Margin/Body/Thumbnail/Placeholder").text = "!" if not reason.is_empty() else "—"
	row.get_node("Margin/Body/Thumbnail").tooltip_text = reason


func select(index: int) -> void:
	deselect_all()
	if index < 0 or index >= _rows.size(): return
	_selected = index
	_rows[index].set_pressed_no_signal(true)


func deselect_all() -> void:
	for row in _rows: row.set_pressed_no_signal(false)
	_selected = -1


func get_selected_items() -> PackedInt32Array:
	return PackedInt32Array([] if _selected < 0 else [_selected])


func set_item_tooltip(index: int, label: String) -> void:
	if index >= 0 and index < _rows.size(): _rows[index].tooltip_text = label + "\n" + _rows[index].get_node("Margin/Body/Labels/Context").text


func get_v_scroll_bar() -> VScrollBar:
	return get_parent().get_v_scroll_bar()


func set_locked(locked: bool) -> void:
	_locked = locked
	for row in _rows: row.disabled = locked


func _key(event: InputEvent, index: int) -> void:
	if _locked: return
	var delta := -1 if event.is_action_pressed("ui_up") else 1 if event.is_action_pressed("ui_down") else 0
	if delta == 0 or _rows.is_empty(): return
	var target := clampi(index + delta, 0, _rows.size() - 1)
	_rows[target].grab_focus()
	select(target)
	item_selected.emit(target)
	accept_event()
