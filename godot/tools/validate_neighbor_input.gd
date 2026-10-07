extends SceneTree

var _view: ProvidenceLandLayoutEditor
var _opened: Array=[]


func _initialize() -> void: call_deferred("_run")


func _run() -> void:
	root.size=Vector2i(1600,900)
	_view=preload("res://src/land_layout_editor.tscn").instantiate()
	root.add_child(_view); _view.size=Vector2(1240,820)
	_view.map_open_requested.connect(func(identity): _opened.append(identity))
	await process_frame
	await _ordinary_double_click()
	await _edge_double_click()
	await _stale_double_click()
	_view.free()
	print("PROVIDENCE_NEIGHBOR_INPUT_OK actual-mouse-press-release-double-click original-destination edge-recenter stale-projection no-second-release-retarget")
	quit()


func _project() -> void:
	var cells: Array=[]; cells.resize(128); cells.fill(0)
	cells[3*16+3]=-1; cells[3*16+4]=1; cells[3*16+5]=2; cells[3*16+14]=2; cells[3*16+15]=3
	var maps: Array=[]
	for index in 4: maps.append({"identity":"land:%d" % index,"nativeIndex":index})
	_view.set_projection({"revision":1,"layout":{"cells":cells},"landMaps":maps})


func _mouse(point: Vector2, pressed: bool, double := false) -> void:
	var event := InputEventMouseButton.new()
	event.position=point; event.global_position=point; event.button_index=MOUSE_BUTTON_LEFT
	event.pressed=pressed; event.double_click=double
	event.button_mask=MOUSE_BUTTON_MASK_LEFT if pressed else 0
	root.push_input(event); await process_frame


func _first_click(column: int) -> Vector2:
	_project(); _view._show_selected(3,column); _opened.clear()
	await process_frame
	var point: Vector2 = _view.get_node("%EastNeighbor").get_global_rect().get_center()
	await _mouse(point,true); await _mouse(point,false)
	assert(_view.get_node("%LayoutGrid").selected==Vector2i(column+1,3),"Real mouse release must select the neighbor.")
	return point


func _ordinary_double_click() -> void:
	var point := await _first_click(3)
	assert(_view.get_node("%EastNeighbor").appearance.identity=="land:2","First click genuinely recenters the preview.")
	await _mouse(point,true,true); await _mouse(point,false)
	assert(_opened==["land:1"],"Double-click must open the first clicked map, not the newly recentered neighbor: "+str(_opened))
	assert(_view.get_node("%LayoutGrid").selected==Vector2i(4,3))


func _edge_double_click() -> void:
	var point := await _first_click(14)
	assert(_view.get_node("%EastNeighbor").disabled)
	await _mouse(point,true,true); await _mouse(point,false)
	assert(_opened==["land:3"],"Recenter at the world edge must retain the original clicked map.")


func _stale_double_click() -> void:
	var point := await _first_click(3)
	_project()
	await _mouse(point,true,true); await _mouse(point,false)
	assert(_opened.is_empty(),"Replacing the projection must reject the old mouse gesture.")
