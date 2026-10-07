extends SceneTree

# Measures redraw CPU work and gesture emissions, rather than claiming GPU frame rate.
class TimedCanvas extends "res://src/map_canvas.gd":
	var draw_times: Array[float] = []
	func _draw() -> void:
		var started := Time.get_ticks_usec()
		super._draw()
		draw_times.append(float(Time.get_ticks_usec() - started) / 1000.0)

var _changes := 0
var _released := false

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	var canvas := TimedCanvas.new()
	canvas.size = Vector2(1100, 720)
	root.add_child(canvas)
	var cells: Array = []; cells.resize(8100); cells.fill(1)
	canvas.set_document(cells, [])
	var report := {"scope": "headless canvas redraw CPU and actual overlay mouse input", "draws": {}}
	for zoom in [1.0, 2.44, 4.0]:
		canvas._set_zoom_at(zoom, canvas.size * 0.5)
		canvas.draw_times.clear()
		for sample in 65:
			canvas._pan_offset = Vector2((sample % 10) * 4, 0)
			canvas.queue_redraw()
			await process_frame
		var times := canvas.draw_times.slice(5); times.sort()
		report.draws[str(zoom)] = {"medianMs": times[times.size() / 2], "p95Ms": times[int(ceil(times.size() * 0.95)) - 1]}
	var overlay := preload("res://src/land_area_overlay.gd").new()
	canvas.add_child(overlay); overlay.size = canvas.size
	await process_frame
	overlay.set_active(true)
	overlay.gesture_changed.connect(func(_start, _end, _positions): _changes += 1)
	var rectangle := canvas.cell_rect(Vector2i(45, 45))
	var down := InputEventMouseButton.new(); down.button_index = MOUSE_BUTTON_LEFT
	down.pressed = true; down.position = rectangle.get_center(); overlay._gui_input(down)
	for index in 600:
		var move := InputEventMouseMotion.new(); move.button_mask = MOUSE_BUTTON_MASK_LEFT
		move.position = down.position + Vector2(float(index % 3) / 10.0, 0)
		overlay._gui_input(move)
	report.sameCellMotionPreviewEmissions = _changes
	overlay.gesture_finished.connect(func(_start, _end, _positions): _released = true)
	down.pressed = false; overlay._gui_input(down)
	report.releaseObserved = _released
	var file := FileAccess.open(OS.get_cmdline_user_args()[0], FileAccess.WRITE)
	file.store_string(JSON.stringify(report, "\t")); file.close()
	print("PROVIDENCE_MAP_INTERACTION_PROFILE_OK ", JSON.stringify(report))
	quit()
