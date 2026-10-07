extends TextureRect

var _render_cells: Array = []
var _source: Texture2D
var _dimensions := Vector2i.ONE


func set_resource(resource: Dictionary, projection: Dictionary, render_cells: Array, atlas: Control, special_previews: Array = []) -> void:
	texture = null; _source = null; _render_cells.clear()
	if resource.get("levelType", "land") == "land":
		texture = preload("res://src/paint_resource_art.gd").texture(resource, atlas, special_previews) if atlas != null else null
	elif projection.get("available", false) and projection.get("renderMode", "") == "dungeon-top-down":
		var image: Image = preload("res://src/dungeon_cell_artwork.gd").derive_atlas(projection)
		if image != null:
			_source = ImageTexture.create_from_image(image)
			_dimensions = Vector2i(int(resource.width), int(resource.height))
			_render_cells = render_cells.duplicate(true)
	queue_redraw()


func _draw() -> void:
	if _source == null: return
	var cell_size := minf(size.x / _dimensions.x, size.y / _dimensions.y)
	var origin := (size - Vector2(_dimensions) * cell_size) / 2
	for cell: Dictionary in _render_cells:
		var destination := Rect2(origin + Vector2(int(cell.x), int(cell.y)) * cell_size, Vector2.ONE * cell_size)
		preload("res://src/dungeon_cell_artwork.gd").draw_sprites(self, destination, _source, 4, Vector2i(16, 16), int(cell.spriteLayers))
		preload("res://src/dungeon_cell_artwork.gd").draw_behavior(self, destination, int(cell.behaviorOverlays))
