extends Control

signal item_selected(index: int)
signal visible_records_changed(rows: Array)

const Row = preload("res://src/item_inventory_row.tscn")
const ROW_HEIGHT := 56
const ROW_PITCH := 62
var _records: Array = []
var _rows: Array[Button] = []
var _active: Dictionary = {}
var _selected := -1
var _locked := false
var _queued := false
var _window := Vector2i(-1, -1)
var _generation := 0
var item_count: int:
	get: return _records.size()


func _ready() -> void:
	get_v_scroll_bar().value_changed.connect(func(_value): _queue_window())
	get_parent().resized.connect(_queue_window)
	resized.connect(_queue_window)


func clear() -> void:
	_clear_rows()
	_records.clear(); _selected = -1; _window = Vector2i(-1, -1)
	custom_minimum_size.y = 0


func set_records(records: Array) -> void:
	clear()
	_records = records.duplicate(true)
	custom_minimum_size.y = maxi(0, _records.size() * ROW_PITCH - 6)
	_queue_window()


func add_record(record: Dictionary) -> void:
	_records.append(record.duplicate(true))
	custom_minimum_size.y = _records.size() * ROW_PITCH - 6
	_queue_window()


func _queue_window() -> void:
	if _queued: return
	_queued = true
	_render_window.call_deferred()


func _render_window() -> void:
	_queued = false
	if not is_inside_tree(): return
	var bar := get_v_scroll_bar()
	var start := clampi(floori(bar.value / ROW_PITCH) - 1, 0, _records.size())
	var end := mini(_records.size(), ceili((bar.value + get_parent().size.y) / ROW_PITCH) + 2)
	if _window == Vector2i(start, end):
		for row in _rows: row.size.x = size.x
		return
	_window = Vector2i(start, end)
	_clear_rows()
	var visible: Array = []
	for index in range(start, end):
		var row: Button = Row.instantiate()
		add_child(row); _rows.append(row); _active[index] = row
		row.position = Vector2(0, index * ROW_PITCH)
		row.size = Vector2(size.x, ROW_HEIGHT)
		_bind_row(row, index)
		var record: Dictionary = _records[index].duplicate(true)
		record["catalogIndex"] = index
		visible.append(record)
	visible_records_changed.emit(visible)


func _clear_rows() -> void:
	_generation += 1
	for row in _rows:
		remove_child(row); row.queue_free()
	_rows.clear(); _active.clear()


func _bind_row(row: Button, index: int) -> void:
	var record: Dictionary = _records[index]
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
	row.set_pressed_no_signal(index == _selected)
	var generation := _generation
	row.pressed.connect(func():
		if generation == _generation: select(index); item_selected.emit(index))
	row.gui_input.connect(func(event: InputEvent):
		if generation == _generation: _key(event, index))


func set_artwork(index: int, identity: String, picture: Texture2D, reason: String) -> void:
	if not _active.has(index): return
	var row: Button = _active[index]
	if row.get_meta("identity") != identity: return
	row.get_node("Margin/Body/Thumbnail/Picture").texture = picture
	row.get_node("Margin/Body/Thumbnail/Placeholder").visible = picture == null
	row.get_node("Margin/Body/Thumbnail/Placeholder").text = "!" if not reason.is_empty() else "—"
	row.get_node("Margin/Body/Thumbnail").tooltip_text = reason


func select(index: int) -> void:
	_selected = index if index >= 0 and index < _records.size() else -1
	for logical in _active: _active[logical].set_pressed_no_signal(logical == _selected)


func ensure_current_is_visible() -> void:
	if _selected < 0: return
	var bar := get_v_scroll_bar()
	var top := _selected * ROW_PITCH
	if top < bar.value: bar.value = top
	elif top + ROW_HEIGHT > bar.value + bar.page: bar.value = top + ROW_HEIGHT - bar.page
	_queue_window()


func deselect_all() -> void: select(-1)


func get_selected_items() -> PackedInt32Array:
	return PackedInt32Array([] if _selected < 0 else [_selected])


func set_item_tooltip(index: int, label: String) -> void:
	if _active.has(index): _active[index].tooltip_text = label + "\n" + _active[index].get_node("Margin/Body/Labels/Context").text


func get_v_scroll_bar() -> VScrollBar: return get_parent().get_v_scroll_bar()


func set_locked(locked: bool) -> void:
	_locked = locked
	for row in _rows: row.disabled = locked


func _key(event: InputEvent, index: int) -> void:
	if _locked: return
	var delta := -1 if event.is_action_pressed("ui_up") else 1 if event.is_action_pressed("ui_down") else 0
	if delta == 0 or _records.is_empty(): return
	var target := clampi(index + delta, 0, _records.size() - 1)
	select(target); ensure_current_is_visible(); item_selected.emit(target)
	_queue_focus.call_deferred(target)
	accept_event()


func _queue_focus(index: int) -> void:
	if _active.has(index): _active[index].grab_focus()
