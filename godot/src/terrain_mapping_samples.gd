extends Control

signal tile_selected(tile: int)

var samples: Array = []
var atlas: Texture2D
var selected_tile := 0
var _boxes: Array[Rect2] = []


func present(rows: Array, texture: Texture2D, tile: int) -> void:
	samples = rows; atlas = texture; selected_tile = tile
	custom_minimum_size.y = ceilf(samples.size() / 4.0) * 126.0
	queue_redraw()


func _draw() -> void:
	_boxes.clear()
	if atlas == null: return
	var font := get_theme_default_font()
	var column_width := size.x / 4.0
	for index in samples.size():
		var row: Dictionary = samples[index]
		var origin := Vector2(index % 4 * column_width, index / 4 * 126)
		var rect := Rect2(origin, Vector2(96, 96))
		_boxes.append(rect)
		for cell in 9:
			var tile := int(row.cells[cell]) - 1
			draw_texture_rect_region(atlas, Rect2(origin + Vector2(cell % 3, cell / 3) * 32, Vector2(32,32)), Rect2(Vector2(tile % 20, tile / 20) * 32, Vector2(32,32)))
		draw_rect(Rect2(origin + Vector2(32,32), Vector2(32,32)), Color("ffd166") if int(row.tile) == selected_tile else Color("9badba"), false, 2)
		draw_string(font, origin + Vector2(0,113), "%d · Land %d" % [row.tile,row.level], HORIZONTAL_ALIGNMENT_LEFT, column_width, 12)


func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		for index in _boxes.size():
			if _boxes[index].has_point(event.position): tile_selected.emit(int(samples[index].tile)); accept_event(); return


func _get_tooltip(position: Vector2) -> String:
	for index in _boxes.size():
		if _boxes[index].has_point(position):
			var row: Dictionary = samples[index]
			return "Tile %d · Trouble Land %d (%d, %d)\nSource layout rendered with this map’s artwork" % [row.tile,row.level,row.x,row.y]
	return ""
