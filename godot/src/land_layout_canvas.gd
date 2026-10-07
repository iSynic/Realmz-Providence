class_name ProvidenceLandLayoutCanvas
extends Control

signal cell_selected(row: int, column: int)
signal cell_open_requested(row: int, column: int)
signal zoom_changed(percent: int)

const THUMBNAIL_SIZE := 180.0
const GRID_COLOR := Color("394b60")
var cells: Array = []
var selected := Vector2i(-1, -1)
var _extent := 48.0
var _origin := Vector2.ZERO
var _fit := "layout"
var _panning := false
var show_grid := true


func _ready() -> void:
	focus_mode = FOCUS_ALL
	clip_contents = true
	texture_filter = TEXTURE_FILTER_NEAREST
	resized.connect(_resize)
	focus_entered.connect(queue_redraw)
	focus_exited.connect(func(): _panning = false; queue_redraw())


func set_cells(values: Array) -> void:
	cells = values
	_resize()


func set_selected(cell: Vector2i) -> void:
	selected = cell
	queue_redraw()


func set_grid_visible(enabled: bool) -> void:
	show_grid=enabled
	queue_redraw()


func assigned_bounds() -> Rect2:
	var bounds := Rect2()
	for index in cells.size():
		if not cells[index].get("assigned",false): continue
		var rectangle := Rect2(Vector2(index % 16,index / 16),Vector2.ONE)
		bounds = rectangle if not bounds.has_area() else bounds.merge(rectangle)
	return bounds


func fit_layout() -> void:
	_fit = "layout"
	_fit_bounds(Rect2(0,0,16,8))


func fit_assigned() -> void:
	var bounds := assigned_bounds()
	if not bounds.has_area(): return
	_fit = "assigned"
	_fit_bounds(bounds)


func _fit_bounds(bounds: Rect2) -> void:
	_extent = clampf(minf((size.x-24)/bounds.size.x,(size.y-56)/bounds.size.y),1.0,720.0)
	_origin = size * .5 - bounds.get_center() * _extent
	zoom_changed.emit(zoom_percent())
	queue_redraw()


func _resize() -> void:
	if _fit == "layout": fit_layout()
	elif _fit == "assigned": fit_assigned()
	else: queue_redraw()


func zoom_percent() -> int: return roundi(_extent / THUMBNAIL_SIZE * 100)


func zoom_by(factor: float, pointer: Vector2 = Vector2(-1,-1)) -> void:
	if pointer.x<0: pointer=size*.5
	var coordinate := (pointer - _origin) / _extent
	_extent = clampf(_extent * factor,THUMBNAIL_SIZE*.1,THUMBNAIL_SIZE*4)
	_origin = pointer - coordinate * _extent
	_fit = "manual"
	zoom_changed.emit(zoom_percent())
	queue_redraw()


func cell_rect(cell: Vector2i) -> Rect2:
	return Rect2(_origin + Vector2(cell) * _extent,Vector2.ONE * _extent)


func cell_at(point: Vector2) -> Vector2i:
	var cell := Vector2i(((point-_origin)/_extent).floor())
	return cell if cell.x>=0 and cell.x<16 and cell.y>=0 and cell.y<8 else Vector2i(-1,-1)


func _get_tooltip(point: Vector2) -> String:
	var cell := cell_at(point)
	if cell.x<0: return ""
	var entry: Dictionary = cells[cell.y*16+cell.x] if cells.size()==128 else {}
	return "Row %d · Column %d · %s\n%s" % [cell.y+1,cell.x+1,entry.get("caption","Blank layout cell"),entry.get("reason","")]


func _make_custom_tooltip(for_text: String) -> Object:
	var tooltip: PanelContainer = preload("res://src/world_map_tooltip.tscn").instantiate()
	tooltip.get_node("Facts").text=for_text
	return tooltip


func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		if event.button_index==MOUSE_BUTTON_MIDDLE:
			_panning=event.pressed; grab_focus(); accept_event()
		elif event.pressed and event.button_index in [MOUSE_BUTTON_WHEEL_UP,MOUSE_BUTTON_WHEEL_DOWN]:
			zoom_by(1.25 if event.button_index==MOUSE_BUTTON_WHEEL_UP else .8,event.position); accept_event()
		elif event.pressed and event.button_index==MOUSE_BUTTON_LEFT:
			var cell := cell_at(event.position)
			if cell.x<0: return
			grab_focus(); cell_selected.emit(cell.y,cell.x)
			if event.double_click: cell_open_requested.emit(cell.y,cell.x)
			accept_event()
	elif event is InputEventMouseMotion and _panning:
		if not event.button_mask & MOUSE_BUTTON_MASK_MIDDLE: _panning=false; return
		_origin+=event.relative; _fit="manual"; queue_redraw(); accept_event()
	elif event is InputEventKey and event.pressed:
		_key(event)


func _key(event: InputEventKey) -> void:
	var directions := {KEY_UP:Vector2i.UP,KEY_RIGHT:Vector2i.RIGHT,KEY_DOWN:Vector2i.DOWN,KEY_LEFT:Vector2i.LEFT}
	if directions.has(event.keycode):
		var cell: Vector2i = (selected + directions[event.keycode]).clamp(Vector2i.ZERO,Vector2i(15,7)) if selected.x>=0 else Vector2i.ZERO
		cell_selected.emit(cell.y,cell.x); _reveal(cell); accept_event()
	elif event.keycode in [KEY_ENTER,KEY_KP_ENTER] and selected.x>=0:
		cell_open_requested.emit(selected.y,selected.x); accept_event()


func _reveal(cell: Vector2i) -> void:
	var rectangle := cell_rect(cell)
	for axis in 2:
		if rectangle.position[axis]<0: _origin[axis]-=rectangle.position[axis]
		elif rectangle.end[axis]>size[axis]: _origin[axis]-=rectangle.end[axis]-size[axis]
	queue_redraw()


func read_navigation_state() -> Dictionary:
	return {"extent":_extent,"origin":[_origin.x,_origin.y],"fit":_fit,"grid":show_grid}


func restore_navigation_state(state: Dictionary) -> void:
	_extent=clampf(float(state.get("extent",_extent)),1,720)
	var origin: Array = state.get("origin",[_origin.x,_origin.y])
	if origin.size()==2: _origin=Vector2(origin[0],origin[1])
	_fit=str(state.get("fit","layout")); _resize()
	show_grid=bool(state.get("grid",true))
	zoom_changed.emit(zoom_percent()); queue_redraw()


func _draw() -> void:
	var viewport := Rect2(Vector2.ZERO,size)
	for index in 128:
		var cell := Vector2i(index%16,index/16)
		var rectangle := cell_rect(cell)
		if not viewport.intersects(rectangle): continue
		var entry: Dictionary = cells[index] if cells.size()==128 else {}
		var texture: Texture2D = entry.get("texture")
		draw_rect(rectangle,Color("0a1219"))
		if texture!=null: draw_texture_rect(texture,rectangle,false)
		else:
			if entry.get("assigned",false):
				var mark := "?" if entry.get("identity","").is_empty() else "…" if entry.get("loading",true) else "!"
				draw_string(get_theme_default_font(),rectangle.get_center()+Vector2(-4,5),mark,HORIZONTAL_ALIGNMENT_LEFT,-1,12,Color("ffd37a"))
		if cell==selected:
			draw_rect(rectangle.grow(-1),Color("9dcfff") if has_focus() else Color("ffd37a"),false,2)
	if show_grid: _draw_grid()


func _draw_grid() -> void:
	# Borders follow the same cell geometry and stay visible over occupied artwork.
	for column in 17:
		draw_line(_origin+Vector2(column*_extent,0),_origin+Vector2(column*_extent,8*_extent),GRID_COLOR,1)
	for row in 9:
		draw_line(_origin+Vector2(0,row*_extent),_origin+Vector2(16*_extent,row*_extent),GRID_COLOR,1)
