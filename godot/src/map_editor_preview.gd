extends Control

var mode := "off"
var focal := Vector2i(25, 25)
var _blockers: Dictionary = {}
var _canvas: ProvidenceMapCanvas


func create_image_export_overlay() -> Control:
	var copy := preload("res://src/map_editor_preview.gd").new()
	copy.mode = mode
	copy.focal = focal
	copy._blockers = _blockers.duplicate()
	return copy


func _ready() -> void:
	_canvas = get_parent()
	_canvas.draw.connect(queue_redraw)


func configure(next: String, focus: Vector2i) -> void:
	mode = next
	focal = focus.clamp(Vector2i.ZERO, Vector2i(89, 89))
	queue_redraw()


func set_blockers(cells: Array) -> void:
	_blockers.clear()
	for cell: Dictionary in cells: _blockers[Vector2i(int(cell.x), int(cell.y))] = true
	queue_redraw()


func apply_blocker_delta(cells: Array) -> void:
	for cell: Dictionary in cells:
		var coordinate := Vector2i(int(cell.x), int(cell.y))
		if cell.get("blocksLos", false): _blockers[coordinate] = true
		else: _blockers.erase(coordinate)
	queue_redraw()


func _draw() -> void:
	if mode == "off" or _canvas == null: return
	var visible := _canvas.visible_cell_bounds()
	for y in range(visible.position.y, visible.end.y):
		for x in range(visible.position.x, visible.end.x):
			var cell := Vector2i(x, y)
			var destination := _canvas.cell_rect(cell)
			if mode in ["darkness", "both"]: draw_rect(destination, Color(0.012, 0.024, 0.035, 0.42))
			if mode in ["los", "both"]:
				if absi(x - focal.x) + absi(y - focal.y) > 9: draw_rect(destination, Color(0, 0, 0, 0.46))
				elif _blockers.has(cell):
					draw_rect(destination, Color(0.98, 0.8, 0.08, 0.2))
					draw_rect(destination.grow(-1), Color(0.98, 0.8, 0.08, 0.66), false, 1)
	var focus_rect := _canvas.cell_rect(focal)
	draw_arc(focus_rect.get_center(), maxf(3, focus_rect.size.x * 0.28), 0, TAU, 24, Color("facc15"), 2)
