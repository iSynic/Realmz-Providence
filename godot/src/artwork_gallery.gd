extends ItemList

@export var fit_content := false
@export var maximum_content_height := 0.0
var _music_rows := false
var _normal := {}


func _ready() -> void:
	resized.connect(_fit_columns)
	get_v_scroll_bar().value_changed.connect(func(_value): queue_redraw())
	get_v_scroll_bar().visibility_changed.connect(_fit_columns)
	call_deferred("_fit_columns")
	if get_parent() is Container:
		get_parent().resized.connect(func(): call_deferred("_fit_content"))


func _fit_columns() -> void:
	var padding := get_theme_stylebox("panel").get_minimum_size().x
	var scrollbar_width := get_v_scroll_bar().size.x if get_v_scroll_bar().visible or not fit_content else 0.0
	fixed_column_width = maxi(96, int((size.x - padding - scrollbar_width) / (1.0 if _music_rows else 5.0)) - get_theme_constant("h_separation"))
	queue_redraw()
	call_deferred("_fit_content")


func set_music_rows(active: bool) -> void:
	if active == _music_rows: return
	if active: _normal = {"columns": max_columns, "mode": icon_mode, "size": fixed_icon_size, "lines": max_text_lines}
	_music_rows = active
	max_columns = 1 if active else int(_normal.columns)
	icon_mode = ItemList.ICON_MODE_LEFT if active else int(_normal.mode)
	fixed_icon_size = Vector2i(32, 32) if active else _normal.size
	max_text_lines = 2 if active else int(_normal.lines)
	_fit_columns()


func _fit_content() -> void:
	var slot: Control = get_parent() if get_parent() is MarginContainer else self
	var column := slot.get_parent()
	if not fit_content or not column is VBoxContainer:
		return
	var remaining: float = column.size.y
	for sibling in column.get_children():
		if sibling != slot and sibling is Control and sibling.visible:
			remaining -= sibling.get_combined_minimum_size().y + column.get_theme_constant("separation")
	var content_height := get_item_rect(item_count - 1).end.y + 4.0 if item_count > 0 else 0.0
	if maximum_content_height > 0:
		content_height = minf(content_height, maximum_content_height)
	custom_minimum_size.y = minf(content_height, maxf(96.0, remaining))


func _draw() -> void:
	var border := get_theme_color("font_color").darkened(0.65)
	var outline := StyleBoxFlat.new()
	outline.draw_center = false
	outline.border_color = border
	outline.set_border_width_all(1)
	outline.set_corner_radius_all(4)
	for index in item_count:
		var card := card_bounds(index)
		card.position.y -= get_v_scroll_bar().value
		if card.end.y > 0 and card.position.y < size.y:
			draw_style_box(outline, card)


func card_bounds(index: int) -> Rect2:
	var cell := get_item_rect(index, false)
	return cell.grow_individual(-4, -4, -6, -6) if fit_content else cell.grow(-4)
