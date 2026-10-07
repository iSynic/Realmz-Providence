extends Control

var cells: Array = []
var selection: Array = []
var _texture: Texture2D
var _tile_size := Vector2i.ZERO
var _columns := 0


func _ready() -> void:
	get_parent().draw.connect(queue_redraw)
	texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST


func set_atlas(projection: Dictionary) -> void:
	_texture = null
	var image: Image = preload("res://src/dungeon_cell_artwork.gd").derive_atlas(projection)
	if image != null:
		_texture = ImageTexture.create_from_image(image)
		_tile_size = Vector2i(16, 16)
		_columns = 4
	queue_redraw()


func present(render_cells: Array) -> void:
	cells = render_cells.duplicate(true)
	queue_redraw()


func select_cells(coordinates: Array) -> void:
	selection = coordinates.duplicate(true)
	queue_redraw()


func clear() -> void:
	cells.clear()
	queue_redraw()


func _draw() -> void:
	var canvas: ProvidenceMapCanvas = get_parent()
	for cell: Dictionary in cells:
		var destination := canvas.cell_rect(Vector2i(int(cell.x), int(cell.y)))
		if _texture != null and _columns > 0:
			preload("res://src/dungeon_cell_artwork.gd").draw_sprites(self, destination, _texture, _columns, _tile_size, int(cell.spriteLayers))
			preload("res://src/dungeon_cell_artwork.gd").draw_behavior(self, destination, int(cell.behaviorOverlays))
		draw_rect(destination, Color("b69ae7"), false, 1.0)
	for cell: Dictionary in selection:
		draw_rect(canvas.cell_rect(Vector2i(int(cell.x), int(cell.y))), Color("82bfff"), false, 1.0)
