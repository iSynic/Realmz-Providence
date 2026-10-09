class_name ProvidenceActionStepList
extends VBoxContainer

signal item_selected(index: int)

const GOLD := Color("eab308")
const RED := Color("f87171")
const VIOLET := Color("c084fc")
const BLUE := Color("38bdf8")
const NEUTRAL := Color("cbd5e1")
const SELECTED := Color("123c62")
const SURFACE := Color("0e151c")

var _items: Array[Button] = []
var _metadata: Array = []
var _colors: Array[Color] = []
var _selected := -1

var item_count: int:
	get: return _items.size()


func _ready() -> void:
	add_theme_constant_override("separation", 4)


func clear() -> void:
	for item in _items:
		remove_child(item)
		item.queue_free()
	_items.clear()
	_metadata.clear()
	_colors.clear()
	_selected = -1


func add_item(text: String) -> void:
	var index := _items.size()
	var item := Button.new()
	item.set_meta("base_text", text)
	item.text = text
	item.tooltip_text = text
	item.alignment = HORIZONTAL_ALIGNMENT_LEFT
	item.custom_minimum_size.y = 39
	item.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	item.toggle_mode = true
	item.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	item.pressed.connect(_choose.bind(index))
	item.focus_entered.connect(_focus_changed.bind(index))
	item.focus_exited.connect(_focus_changed.bind(index))
	item.gui_input.connect(_navigate.bind(index))
	add_child(item)
	_items.append(item)
	_metadata.append(null)
	_colors.append(NEUTRAL)
	_apply_item_style(index)


func set_item(index: int, text: String, metadata: Variant, color: Color) -> void:
	if index < 0 or index > _items.size(): return
	if index == _items.size(): add_item(text)
	var item := _items[index]
	# Keep the mouse-release target alive while draft reads update its presentation.
	if item.get_meta("base_text") == text and _metadata[index] == metadata and _colors[index] == color: return
	item.set_meta("base_text", text)
	item.text = ("› " if item.has_focus() else "") + text
	item.tooltip_text = text
	_metadata[index] = metadata; _colors[index] = color
	_apply_item_style(index)


func set_item_metadata(index: int, value: Variant) -> void:
	if index >= 0 and index < _metadata.size(): _metadata[index] = value


func get_item_metadata(index: int) -> Variant:
	return _metadata[index] if index >= 0 and index < _metadata.size() else null


func set_item_semantic_color(index: int, color: Color) -> void:
	if index < 0 or index >= _items.size(): return
	_colors[index] = color
	_apply_item_style(index)


func item_semantic_color(index: int) -> Color:
	return _colors[index] if index >= 0 and index < _colors.size() else NEUTRAL


func select(index: int) -> void:
	if index < 0 or index >= _items.size(): return
	if _selected == index:
		_items[index].set_pressed_no_signal(true)
		return
	_selected = index
	for item_index in range(_items.size()):
		_items[item_index].button_pressed = item_index == index
		_apply_item_style(item_index)


func _choose(index: int) -> void:
	select(index)
	item_selected.emit(index)


func _focus_changed(index: int) -> void:
	var item := _items[index]
	item.text = ("› " if item.has_focus() else "") + str(item.get_meta("base_text"))


func _navigate(event: InputEvent, index: int) -> void:
	if not (event is InputEventKey) or not event.pressed or event.echo: return
	var target := index
	match event.keycode:
		KEY_UP: target = maxi(0, index - 1)
		KEY_DOWN: target = mini(_items.size() - 1, index + 1)
		KEY_HOME: target = 0
		KEY_END: target = _items.size() - 1
		_: return
	select(target)
	_items[target].grab_focus()
	item_selected.emit(target)
	_items[index].accept_event()


func _apply_item_style(index: int) -> void:
	var item := _items[index]
	var color := _colors[index]
	var selected := index == _selected
	item.add_theme_stylebox_override("normal", make_style(SELECTED if selected else SURFACE, color, 2 if selected else 1, 3, 7 if selected else 8))
	item.add_theme_stylebox_override("hover", make_style(SELECTED.lightened(0.05) if selected else SURFACE.lightened(0.05), color, 2, 3, 7))
	item.add_theme_stylebox_override("pressed", make_style(SELECTED, color, 2, 3, 7))
	item.add_theme_stylebox_override("hover_pressed", make_style(SELECTED.lightened(0.05), color, 2, 3, 7))
	item.add_theme_stylebox_override("focus", StyleBoxEmpty.new())


static func semantic_color(definition: Dictionary) -> Color:
	var category := str(definition.get("category", "")).to_lower()
	var label := str(definition.get("label", "")).to_lower()
	var form := str(definition.get("formId", "")).to_lower()
	var target := str(definition.get("targetKind", "")).to_lower()
	if form == "battle" or label.contains("battle") or target in ["battle", "monster"]: return RED
	if category in ["dialogue", "choices"] or target in ["message", "text-resource"]: return GOLD
	if category in ["flow", "logic", "extra action points", "quests"] or target == "extra-action-point": return VIOLET
	if category in ["map", "travel", "party", "characters"] or target in ["map", "land", "dungeon"]: return BLUE
	return NEUTRAL


static func make_style(fill: Color, border: Color, width: int, vertical: float, horizontal: float) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = fill
	style.border_color = border
	style.set_border_width_all(width)
	style.set_corner_radius_all(4)
	style.content_margin_top = vertical
	style.content_margin_bottom = vertical
	style.content_margin_left = horizontal
	style.content_margin_right = horizontal
	return style
