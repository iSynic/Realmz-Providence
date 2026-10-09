extends VBoxContainer

signal item_selected(index: int)
signal item_activated(index: int)
signal visible_items_changed

const TileScene = preload("res://src/battle_palette_tile.tscn")
const Presentation = preload("res://src/battle_monster_presentation.gd")
var _rows: Array = []
var _cards: Array[Button] = []
var _selected := -1
var _generation := 0
var _set_name := ""
var item_count: int:
	get: return _rows.size()


func _ready() -> void:
	focus_mode = Control.FOCUS_ALL
	resized.connect(_layout_tiles)
	focus_entered.connect(_render_focus)
	focus_exited.connect(_render_focus)
	get_v_scroll_bar().value_changed.connect(func(_value): visible_items_changed.emit())
	%TileScroll.resized.connect(func(): visible_items_changed.emit())
	_layout_tiles()


func _layout_tiles() -> void:
	if is_node_ready(): %Tiles.columns = 5 if size.x >= 360 else 4


func clear() -> void:
	_generation += 1
	for card in _cards:
		%Tiles.remove_child(card)
		card.queue_free()
	_cards.clear(); _rows.clear(); _selected = -1
	_render_selection()


func render_page(rows: Array, current_id: int, set_name: String) -> void:
	var scroll := get_v_scroll_bar().value
	if rows == _rows and set_name == _set_name:
		select(_rows.find_custom(func(row): return int(row.nativeId) == current_id))
		return
	clear()
	_rows = rows.duplicate(true); _set_name = set_name
	for index in _rows.size():
		var card: Button = TileScene.instantiate()
		%Tiles.add_child(card); _cards.append(card)
		card.get_node("Identity").text = str(int(_rows[index].nativeId))
		card.pressed.connect(_choose.bind(index, _generation))
		card.gui_input.connect(_tile_input.bind(index, _generation))
		_update_card(index)
		if int(_rows[index].nativeId) == current_id: select(index)
	get_v_scroll_bar().set_deferred("value", scroll)


func receive_art(icon_id: int, texture: Texture2D, reason := "") -> void:
	for index in _rows.size():
		var record: Variant = _rows[index].get("monster")
		if record is Dictionary and int(record.get("iconId", 0)) == icon_id:
			_cards[index].get_node("Appearance").texture = texture
			_cards[index].set_meta("artReason", reason)
			_update_card(index)
	_render_selection()


func clear_art() -> void:
	for index in _cards.size():
		_cards[index].get_node("Appearance").texture = null
		_cards[index].set_meta("artReason", "")
		_update_card(index)
	_render_selection()


func _update_card(index: int) -> void:
	var row: Dictionary = _rows[index]
	var card := _cards[index]
	var reason := str(card.get_meta("artReason", ""))
	card.get_node("Warning").visible = not row.available or not reason.is_empty()
	card.get_node("Warning").text = "!" if not row.available else "?"
	card.tooltip_text = "%s · Monster %d\n%s · Scenario monster\n%s" % [row.label, int(row.nativeId), _set_name, Presentation.details(row)]
	if not reason.is_empty(): card.tooltip_text += "\n" + reason
	card.tooltip_text += "\nClick to choose · Double-click to edit" if row.available else "\nPaint unavailable; no variant substitution."


func select(index: int) -> void:
	if index < -1 or index >= _rows.size(): return
	_selected = index
	for current in _cards.size(): _cards[current].set_pressed_no_signal(current == index)
	_render_selection()
	_render_focus()


func _render_focus() -> void:
	for index in _cards.size():
		var card := _cards[index]
		card.remove_theme_stylebox_override("pressed")
		if index != _selected or not has_focus(): continue
		var style := card.get_theme_stylebox("pressed").duplicate() as StyleBoxFlat
		var focus := card.get_theme_stylebox("focus") as StyleBoxFlat
		if style != null and focus != null:
			style.set_border_width_all(2); style.border_color = focus.border_color
			card.add_theme_stylebox_override("pressed", style)


func _render_selection() -> void:
	if not is_node_ready(): return
	%SelectionName.visible = not _rows.is_empty()
	%SelectionDetails.visible = not _rows.is_empty()
	%SelectionName.text = "No brush selected."
	%SelectionDetails.text = "Hover for details · Arrows browse\nEnter or double-click opens Monster"
	if _selected < 0 or _selected >= _rows.size(): return
	var row: Dictionary = _rows[_selected]
	%SelectionName.text = "%s · Monster %d · %s" % [row.label, int(row.nativeId), _set_name]
	%SelectionDetails.text = Presentation.details(row)
	var reason := str(_cards[_selected].get_meta("artReason", ""))
	if not reason.is_empty(): %SelectionDetails.text += "\n" + reason


func get_selected_items() -> PackedInt32Array:
	return PackedInt32Array([_selected]) if _selected >= 0 else PackedInt32Array()


func get_v_scroll_bar() -> VScrollBar:
	return %TileScroll.get_v_scroll_bar()


func visible_records() -> Array:
	var rows: Array = []
	var viewport_rect: Rect2 = %TileScroll.get_global_rect()
	for index in _cards.size():
		if viewport_rect.intersects(_cards[index].get_global_rect()): rows.append(_rows[index])
	return rows


func _choose(index: int, generation := -1) -> void:
	if generation != -1 and generation != _generation: return
	if index < 0 or index >= _rows.size(): return
	select(index); grab_focus(); %TileScroll.ensure_control_visible(_cards[index]); item_selected.emit(index)


func _tile_input(event: InputEvent, index: int, generation: int) -> void:
	if generation != _generation: return
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed and event.double_click:
		_choose(index, generation)
		if _rows[index].available: item_activated.emit(index)


func _gui_input(event: InputEvent) -> void:
	if not event.is_pressed() or _rows.is_empty(): return
	var next := maxi(0, _selected)
	if event.is_action_pressed("ui_left"): next = maxi(0, next - 1)
	elif event.is_action_pressed("ui_right"): next = mini(_rows.size() - 1, next + 1)
	elif event.is_action_pressed("ui_up"): next = maxi(0, next - %Tiles.columns)
	elif event.is_action_pressed("ui_down"): next = mini(_rows.size() - 1, next + %Tiles.columns)
	elif event is InputEventKey and event.keycode == KEY_HOME: next = 0
	elif event is InputEventKey and event.keycode == KEY_END: next = _rows.size() - 1
	elif event.is_action_pressed("ui_accept"):
		if _selected >= 0 and _rows[_selected].available: item_activated.emit(_selected)
		accept_event(); return
	else: return
	_choose(next)
	accept_event()
