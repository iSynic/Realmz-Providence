class_name ProvidenceDivinityActionList
extends ScrollContainer

signal item_selected(index: int)
signal item_activated(index: int)

var _items: Array[Button] = []
var _metadata: Array = []
var _selected := -1
var _reveal_frames := 0
@onready var _rows: VBoxContainer = %CodeRows
var item_count: int:
	get: return _items.size()


func _ready() -> void:
	set_process(false)
	_rows.resized.connect(reveal_current_after_layout)
	resized.connect(reveal_current_after_layout)


func clear() -> void:
	_reveal_frames = 0
	set_process(false)
	for item in _items:
		_rows.remove_child(item); item.queue_free()
	_items.clear(); _metadata.clear(); _selected = -1


func add_item(text: String) -> int:
	var index := _items.size()
	var item := Button.new()
	item.text = text
	item.alignment = HORIZONTAL_ALIGNMENT_LEFT
	item.custom_minimum_size.y = 44 if "\n" in text else 28
	item.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	item.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	item.toggle_mode = true
	item.pressed.connect(func(): select(index); item_selected.emit(index))
	item.gui_input.connect(_navigate.bind(index))
	_rows.add_child(item); _items.append(item); _metadata.append(null)
	_style(index)
	return index


func select(index: int) -> void:
	if index < 0 or index >= _items.size(): return
	var previous := _selected
	_selected = index
	if previous >= 0: _items[previous].set_pressed_no_signal(false); _style(previous)
	_items[index].set_pressed_no_signal(true); _style(index)
	reveal_current_after_layout()


func get_selected_items() -> PackedInt32Array:
	return PackedInt32Array([_selected]) if _selected >= 0 else PackedInt32Array()


func set_item_metadata(index: int, value: Variant) -> void: _metadata[index] = value
func get_item_metadata(index: int) -> Variant: return _metadata[index]
func get_item_text(index: int) -> String: return _items[index].text


func ensure_current_is_visible() -> void:
	if _selected >= 0: ensure_control_visible(_items[_selected])


func reveal_current_after_layout() -> void:
	# Containers settle after rows are rebuilt and after the window is shown.
	_reveal_frames = 2
	set_process(true)


func _process(_delta: float) -> void:
	_reveal_frames -= 1
	if _reveal_frames > 0: return
	set_process(false)
	if is_visible_in_tree(): ensure_current_is_visible()


func owns_focus() -> bool:
	return _items.has(get_viewport().gui_get_focus_owner())


func _style(index: int) -> void:
	var selected := index == _selected
	var fill := Color("123c62") if selected else Color("0e151c")
	var border := Color("38bdf8") if selected else Color("2b3c4d")
	_items[index].add_theme_stylebox_override("normal", ProvidenceActionStepList.make_style(fill, border, 1, 4, 7))
	_items[index].add_theme_stylebox_override("pressed", ProvidenceActionStepList.make_style(Color("123c62"), Color("38bdf8"), 1, 4, 7))
	_items[index].add_theme_stylebox_override("hover", ProvidenceActionStepList.make_style(fill.lightened(0.04), border, 1, 4, 7))


func _navigate(event: InputEvent, index: int) -> void:
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT and event.double_click:
		select(index); item_selected.emit(index); item_activated.emit(index)
		_items[index].accept_event()
	elif event is InputEventKey and event.pressed and not event.echo:
		var target := index
		match event.keycode:
			KEY_UP: target = maxi(0, index - 1)
			KEY_DOWN: target = mini(_items.size() - 1, index + 1)
			KEY_HOME: target = 0
			KEY_END: target = _items.size() - 1
			_: return
		select(target); _items[target].grab_focus(); ensure_current_is_visible(); item_selected.emit(target)
		_items[index].accept_event()
