extends Control

var hints: Dictionary = {}
var flags: Dictionary = {}
var footprints: Array = []
var _canvas: ProvidenceMapCanvas


func create_image_export_overlay() -> Control:
	var copy := preload("res://src/map_view_overlay.gd").new()
	copy.hints = hints.duplicate(true)
	copy.flags = flags.duplicate()
	copy.footprints = footprints.duplicate(true)
	return copy


func _ready() -> void:
	_canvas=get_parent()
	_canvas.draw.connect(queue_redraw)
	mouse_filter=MOUSE_FILTER_IGNORE
	clip_contents=true


func set_hints(value: Dictionary) -> void:
	hints=value.duplicate(true); queue_redraw()


func apply_cell_delta(cells: Array) -> void:
	for field in {"hiddenPathCells": "hiddenPath", "combatClearingCells": "combatClearing"}:
		var values := {}
		for cell: Dictionary in hints.get(field, []): values[Vector2i(int(cell.x), int(cell.y))] = cell
		var flag: String = "hiddenPath" if field == "hiddenPathCells" else "combatClearing"
		for cell: Dictionary in cells:
			var coordinate := Vector2i(int(cell.x), int(cell.y))
			if cell.get(flag, false): values[coordinate] = {"x": cell.x, "y": cell.y}
			else: values.erase(coordinate)
		hints[field] = values.values()
	queue_redraw()


func configure(options: Dictionary, maps: Array) -> void:
	flags=options.duplicate(); footprints=maps.duplicate(true); queue_redraw()


func _draw() -> void:
	if _canvas==null: return
	if flags.get("secrets",false):
		_cells(hints.get("secretCells",[]),Color("c084fc"))
		_cells(hints.get("hiddenPathCells",[]),Color("9dcfff"))
	if flags.get("combatClearing",false): _cells(hints.get("combatClearingCells",[]),Color("a7f3c3"))
	for row: Dictionary in footprints:
		var first := _canvas.cell_rect(Vector2i(row.left,row.top))
		var rectangle := Rect2(first.position,first.size*Vector2(int(row.right)-int(row.left),int(row.bottom)-int(row.top)))
		draw_rect(rectangle,Color("9dcfff"),false,2)
		draw_string(get_theme_default_font(),rectangle.position+Vector2(3,14),"PM%d" % int(row.nativeId),HORIZONTAL_ALIGNMENT_LEFT,-1,11,Color("9dcfff"))
	if flags.get("coordinates",false): _coordinates()


func _cells(values: Array, color: Color) -> void:
	for cell: Dictionary in values:
		var rectangle := _canvas.cell_rect(Vector2i(cell.x,cell.y))
		draw_rect(rectangle.grow(-.5),color,false,1)


func _coordinates() -> void:
	var first := _canvas.cell_rect(Vector2i.ZERO)
	var font := get_theme_default_font()
	for coordinate in range(0,90,10):
		var x := first.position.x+coordinate*first.size.x
		var y := first.position.y+coordinate*first.size.y
		draw_string(font,Vector2(x,maxf(12,first.position.y-5)),str(coordinate),HORIZONTAL_ALIGNMENT_LEFT,-1,11,Color("9eb1c2"))
		draw_string(font,Vector2(maxf(1,first.position.x-23),y+11),str(coordinate),HORIZONTAL_ALIGNMENT_LEFT,-1,11,Color("9eb1c2"))
