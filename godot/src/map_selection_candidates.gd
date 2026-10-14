extends VBoxContainer

signal item_activated(index: int)
var _items: Array[Button] = []
var _selected := -1
var item_count: int:
	get: return _items.size()


func clear() -> void:
	for item in _items: remove_child(item); item.queue_free()
	_items.clear(); _selected = -1


func add_item(caption: String) -> void:
	var index := _items.size()
	var item := Button.new()
	item.text = caption; item.tooltip_text = caption
	item.alignment = HORIZONTAL_ALIGNMENT_LEFT
	item.custom_minimum_size.y = 48
	item.size_flags_horizontal = SIZE_EXPAND_FILL
	item.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	item.pressed.connect(select.bind(index))
	item.focus_entered.connect(select.bind(index))
	item.gui_input.connect(_input_candidate.bind(index))
	add_child(item); _items.append(item)


func select(index: int) -> void:
	if index < 0 or index >= _items.size(): return
	_selected = index
	for slot in _items.size():
		_items[slot].add_theme_stylebox_override("normal", ProvidenceActionStepList.make_style(Color("123c62") if slot == index else Color("0e151c"), Color("85cfff") if slot == index else Color("2b3c4d"), 1, 8, 6))


func get_selected_items() -> PackedInt32Array:
	return PackedInt32Array([_selected]) if _selected >= 0 else PackedInt32Array()


func _input_candidate(event: InputEvent, index: int) -> void:
	if event is InputEventMouseButton and event.double_click and event.button_index == MOUSE_BUTTON_LEFT:
		item_activated.emit(index); return
	if not event is InputEventKey or not event.pressed: return
	if event.keycode == KEY_ENTER or event.keycode == KEY_KP_ENTER:
		get_viewport().set_input_as_handled(); item_activated.emit(index)
	elif event.keycode == KEY_UP or event.keycode == KEY_DOWN:
		var next := clampi(index + (-1 if event.keycode == KEY_UP else 1), 0, _items.size() - 1)
		get_viewport().set_input_as_handled(); select(next); _items[next].grab_focus()


func focus_selected() -> void:
	if _selected >= 0: _items[_selected].grab_focus()
