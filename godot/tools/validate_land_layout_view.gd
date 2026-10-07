extends SceneTree

var _view: ProvidenceLandLayoutEditor


func _initialize() -> void: call_deferred("_run")


func _run() -> void:
	root.size=Vector2i(1600,900)
	_view=preload("res://src/land_layout_editor.tscn").instantiate()
	root.add_child(_view)
	_view.size=Vector2(1240,820)
	var cells: Array=[]; cells.resize(128); cells.fill(0); cells[0]=-1; cells[1]=1; cells[16]=99
	_view.set_projection({"layout":{"cells":cells},"landMaps":[{"identity":"land:0","nativeIndex":0},{"identity":"land:1","nativeIndex":1}]})
	await process_frame
	await _geometry()
	await _grid_toggle()
	await _navigation()
	_view.clear()
	assert(_view.get_node("%LayoutFitAssigned").disabled)
	assert(_view.get_node("%LayoutGrid").cells.size()==128)
	assert(not _view.get_node("%LayoutGrid").assigned_bounds().has_area())
	_view.free()
	print("PROVIDENCE_LAND_LAYOUT_VIEW_OK joined-128-cells fit-bounds pointer-zoom pan keyboard hover exact-neighbor stale-clear missing-vs-artwork focus viewport-return ultrawide")
	quit()


func _geometry() -> void:
	var canvas: ProvidenceLandLayoutCanvas = _view.get_node("%LayoutGrid")
	assert(canvas.cells.size()==128 and canvas.cells[0].identity=="land:0")
	assert(canvas.cell_rect(Vector2i.ZERO).end.x==canvas.cell_rect(Vector2i(1,0)).position.x)
	assert(canvas.assigned_bounds()==Rect2(0,0,2,2),"Missing references remain inside Fit assigned bounds.")
	canvas.fit_assigned()
	var pointer := Vector2(130,210)
	var coordinate: Vector2 = (pointer-canvas._origin)/canvas._extent
	canvas.zoom_by(1.25,pointer)
	assert(coordinate.is_equal_approx((pointer-canvas._origin)/canvas._extent))
	var saved: Dictionary = _view.read_navigation_state()
	canvas.zoom_by(.8); canvas.fit_layout()
	assert(_view.restore_navigation_state(saved))
	assert(canvas.read_navigation_state()==saved.viewport)
	var origin: Vector2 = canvas._origin
	var button := InputEventMouseButton.new(); button.button_index=MOUSE_BUTTON_MIDDLE; button.pressed=true
	canvas._gui_input(button)
	var motion := InputEventMouseMotion.new(); motion.relative=Vector2(35,-18); motion.button_mask=MOUSE_BUTTON_MASK_MIDDLE
	canvas._gui_input(motion)
	assert(canvas._origin==origin+motion.relative and canvas.has_focus())
	button.pressed=false; canvas._gui_input(button)
	canvas._gui_input(motion)
	assert(canvas._origin==origin+motion.relative,"Released middle button must stop panning.")
	_view.size=Vector2(3040,1310)
	await process_frame
	canvas.fit_layout()
	assert(canvas.cell_rect(Vector2i(15,7)).end.x<=canvas.size.x+.1)
	assert(canvas.cell_rect(Vector2i(15,7)).end.y<=canvas.size.y+.1)
	assert(canvas.zoom_percent()>40)


func _navigation() -> void:
	var canvas: ProvidenceLandLayoutCanvas = _view.get_node("%LayoutGrid")
	_view._show_selected(0,0)
	assert(_view.get_node("%NorthNeighbor").disabled and _view.get_node("%WestNeighbor").disabled)
	assert(_view.get_node("%SouthNeighbor").get_meta("identity").is_empty())
	assert(_view.get_node("%SouthNeighbor").appearance.state=="Missing map")
	_view.present_thumbnail("land:1",{"available":false,"reason":"Controlled unavailable artwork"})
	assert(_view.get_node("%EastNeighbor").appearance.state=="Art failed")
	var opened: Array=[]
	_view.map_open_requested.connect(func(identity): opened.append(identity))
	_view.get_node("%EastNeighbor").map_activated.emit(_view.get_node("%EastNeighbor").appearance.duplicate())
	assert(opened==["land:1"])
	_view.get_node("%EastNeighbor").pressed.emit()
	assert(_view.get_node("%SelectedLayoutCell").text=="ROW 1 · COLUMN 2" and opened.size()==1)
	var key := InputEventKey.new(); key.keycode=KEY_LEFT; key.pressed=true
	canvas._gui_input(key)
	assert(canvas.selected==Vector2i.ZERO)
	key.keycode=KEY_ENTER; canvas._gui_input(key)
	assert(opened==["land:1","land:0"])
	var tooltip := canvas._get_tooltip(canvas.cell_rect(Vector2i.ZERO).get_center())
	assert(tooltip.contains("Land 0") and tooltip.contains("Row 1"))


func _grid_toggle() -> void:
	var canvas: ProvidenceLandLayoutCanvas = _view.get_node("%LayoutGrid")
	var cells: Array = canvas.cells.duplicate(true)
	var before: Rect2 = canvas.cell_rect(Vector2i(3,2))
	var toggle: CheckBox = _view.get_node("%LayoutGridToggle")
	assert(not toggle.disabled)
	toggle.grab_focus()
	for pressed in [true,false]:
		var event := InputEventKey.new(); event.keycode=KEY_SPACE; event.pressed=pressed
		root.push_input(event); await process_frame
	assert(not canvas.show_grid and canvas.cells==cells and canvas.cell_rect(Vector2i(3,2))==before)
	var saved := _view.read_navigation_state()
	_view.get_node("%LayoutGridToggle").button_pressed=true
	assert(canvas.show_grid)
	assert(_view.restore_navigation_state(saved))
	assert(not canvas.show_grid and not _view.get_node("%LayoutGridToggle").button_pressed)
