extends Control

var _route: Dictionary = {}
var _canvas: ProvidenceMapCanvas


func _ready() -> void:
	_canvas = get_parent()
	_canvas.draw.connect(queue_redraw)
	mouse_filter = MOUSE_FILTER_IGNORE
	clip_contents = true


func present(route: Dictionary) -> void:
	_route = route.duplicate(true)
	queue_redraw()


func _draw() -> void:
	if _canvas == null or _route.is_empty(): return
	var color := Color("91ddb8") if _route.get("status", "unknown") == "connected" else Color("f5cc71")
	var points := PackedVector2Array()
	for cell: Dictionary in _route.get("path", []): points.append(_rectangle(cell).get_center())
	if points.size() > 1: draw_polyline(points, color, 3.0, true)
	for cell: Dictionary in _route.get("problematicCells", []): draw_rect(_rectangle(cell), Color("ffac9a"), false, 2.0)
	var connection: Dictionary = _route.get("connection", {})
	var font := ThemeDB.fallback_font
	for entry in [["A", "from"], ["B", "to"]]:
		if not connection.has(entry[1]): continue
		var cell: Dictionary = connection[entry[1]]
		var center := _rectangle(cell).get_center()
		draw_circle(center, 5.0, color)
		draw_string(font, center + Vector2(8, -6), "%s %d,%d" % [entry[0], cell.x, cell.y], HORIZONTAL_ALIGNMENT_LEFT, -1, 13, color)


func _rectangle(cell: Dictionary) -> Rect2:
	return _canvas.cell_rect(Vector2i(int(cell.x), int(cell.y)))
