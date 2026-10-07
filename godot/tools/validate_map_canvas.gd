extends SceneTree

const MapCanvas = preload("res://src/map_canvas.gd")

var _selected_action_point := ""
var _activated_action_point := ""
var _painted_cell := Vector2i(-1, -1)


func _initialize() -> void:
	var canvas := MapCanvas.new()
	canvas.size = Vector2(900, 700)
	canvas.cell_selected.connect(_on_cell_selected)
	canvas.action_point_activated.connect(_on_action_point_activated)
	canvas.paint_stroke_requested.connect(_on_paint_stroke_requested)
	root.add_child(canvas)
	await process_frame

	var tiles: Array = []
	tiles.resize(90 * 90)
	tiles.fill(1)
	canvas.set_document(tiles, [{
		"identity": "action-point:land:0:17",
		"recordIndex": 17,
		"coordinate": {"x": 9, "y": 14},
		"overlayKind": "battle",
	}])
	var marker_contract := canvas.action_point_marker_contract()
	if str(marker_contract.get("shape", "")) != "diamond-with-center-dot":
		_fail("Action Point markers lost the donor diamond-with-center-dot geometry.")
		return
	var marker_colors := marker_contract.get("colors", {}) as Dictionary
	var expected_colors := {
		"battle": Color("f87171"),
		"encounter": Color("9dcfff"),
		"map": Color("38bdf8"),
		"quest": Color("c084fc"),
		"text": Color("eab308"),
		"trigger": Color("cbd5e1"),
	}
	for marker_kind: String in expected_colors:
		if marker_colors.get(marker_kind, Color.TRANSPARENT) != expected_colors[marker_kind]:
			_fail("Action Point marker color changed for %s." % marker_kind)
			return
	canvas.select_cell(9, 14)
	if _selected_action_point != "action-point:land:0:17":
		_fail("Selecting a placed cell did not expose its Action Point.")
		return
	canvas.activate_selected_action_point()
	if _activated_action_point != "action-point:land:0:17":
		_fail("Activating a placed cell did not open its Action Point identity.")
		return
	canvas.set_interaction_mode("paint")
	var paint_click := InputEventMouseButton.new()
	paint_click.button_index = MOUSE_BUTTON_LEFT
	paint_click.pressed = true
	var paint_cell_size := float(canvas.call("_cell_size"))
	var paint_origin := canvas.call("_origin", paint_cell_size) as Vector2
	paint_click.position = paint_origin + Vector2(9.5, 14.5) * paint_cell_size
	canvas.call("_gui_input", paint_click)
	if _painted_cell != Vector2i(-1, -1):
		_fail("Paint committed before the stroke was released.")
		return
	paint_click.pressed = false
	canvas.call("_gui_input", paint_click)
	if _painted_cell != Vector2i(9, 14):
		_fail("Paint mode did not emit the clicked bounded cell.")
		return
	canvas.set_interaction_mode("select")

	canvas.zoom_in()
	canvas.zoom_in()
	if canvas.zoom_percent() <= 100:
		_fail("Map zoom did not increase above the fitted view.")
		return
	var middle_down := InputEventMouseButton.new()
	middle_down.button_index = MOUSE_BUTTON_MIDDLE
	middle_down.pressed = true
	canvas.call("_gui_input", middle_down)
	var motion := InputEventMouseMotion.new()
	motion.relative = Vector2(40, 20)
	canvas.call("_gui_input", motion)
	var middle_up := InputEventMouseButton.new()
	middle_up.button_index = MOUSE_BUTTON_MIDDLE
	middle_up.pressed = false
	canvas.call("_gui_input", middle_up)
	if canvas.pan_offset().is_zero_approx():
		_fail("Middle-button drag did not pan a zoomed map.")
		return
	if not _visible_edges_are_drawn(canvas): return
	canvas.zoom_fit()
	if canvas.zoom_percent() != 100 or not canvas.pan_offset().is_zero_approx():
		_fail("Fit did not restore the complete centered map.")
		return

	preload("res://tools/dungeon_artwork_checks.gd").new().run(canvas)
	canvas.queue_redraw()
	await process_frame

	print("PROVIDENCE_MAP_CANVAS_OK zoom=%d activated=%s paint=%d,%d dungeon=%s markers=%s" % [
		canvas.zoom_percent(),
		_activated_action_point,
		_painted_cell.x,
		_painted_cell.y,
		canvas.render_atlas_identity(),
		str(marker_contract.get("shape", "")),
	])
	canvas.queue_free()
	await process_frame
	quit(0)


func _visible_edges_are_drawn(canvas: Control) -> bool:
	for zoom in [1.0, 2.44, 4.0]:
		canvas._set_zoom_at(zoom, canvas.size * 0.5)
		for offset in [Vector2.ZERO, Vector2(-200, 100), Vector2(500, -400)]:
			canvas._pan_offset = offset
			var bounds: Rect2i = canvas.visible_cell_bounds()
			for y in 90:
				for x in 90:
					var cell := Vector2i(x, y)
					if canvas.cell_rect(cell).intersects(Rect2(Vector2.ZERO, canvas.size)) and not bounds.has_point(cell):
						_fail("Viewport culling removed a partially visible map cell.")
						return false
			if zoom > 2 and bounds.get_area() >= 8100:
				_fail("Zoomed panning still redraws the complete map.")
				return false
	return true


func _on_cell_selected(_x: int, _y: int, _tile: int, action_point: Dictionary) -> void:
	_selected_action_point = str(action_point.get("identity", ""))


func _on_action_point_activated(identity: String) -> void:
	_activated_action_point = identity


func _on_paint_stroke_requested(cells: Array) -> void:
	if cells.size() == 1:
		_painted_cell = cells[0]


func _fail(message: String) -> void:
	push_error("PROVIDENCE_MAP_CANVAS_FAILED %s" % message)
	quit(1)
