extends RefCounted


func run(canvas: ProvidenceMapCanvas) -> void:
	var source := Image.create(640, 640, false, Image.FORMAT_RGBA8)
	source.fill(Color.MAGENTA)
	source.fill_rect(Rect2i(576, 320, 64, 64), Color.WHITE)
	source.fill_rect(Rect2i(624, 368, 16, 16), Color.BLACK)
	source.set_pixel(577, 321, Color.RED)
	var projection := _projection(source)
	var derived: Image = preload("res://src/dungeon_cell_artwork.gd").derive_atlas(projection, source)
	assert(derived.get_size() == Vector2i(64, 64))
	assert(derived.get_pixel(0, 0).a == 0 and derived.get_pixel(1, 1) == Color.RED)
	assert(derived.get_pixel(48, 48) == Color.BLACK and source.get_pixel(576, 320) == Color.WHITE)
	assert(source.get_size() == Vector2i(640, 640) and source.get_pixel(0, 0) == Color.MAGENTA)
	assert(canvas.set_render_atlas(projection))
	assert(canvas.render_mode() == "dungeon-top-down" and canvas._atlas_texture.get_size() == Vector2(64, 64))
	assert(canvas._atlas_tile_size == Vector2i(16, 16) and canvas._atlas_columns == 4)
	assert(canvas.dungeon_cell_render_masks(0) == {"spriteLayers": 0b0101001, "behaviorOverlays": 0b100011})
	_preview_consumers(canvas, projection)
	var malformed := projection.duplicate(true)
	malformed.columns = 4; malformed.rows = 4; malformed.tileWidth = 16; malformed.tileHeight = 16
	malformed.base64 = Marshalls.raw_to_base64(derived.save_png_to_buffer())
	assert(not canvas.set_render_atlas(malformed), "A cropped image cannot impersonate the exact PICT302 resource.")
	assert(canvas.set_render_atlas(projection))
	print("PROVIDENCE_DUNGEON_ARTWORK_OK full302 exact-crop white-key preserved-source all-preview-consumers rejected-cropped-resource")


func _projection(image: Image) -> Dictionary:
	var sprites: Array = []; var behaviors: Array = []
	sprites.resize(8100); sprites.fill(0); sprites[0] = 0b0101001
	behaviors.resize(8100); behaviors.fill(0); behaviors[0] = 0b100011
	return {"available": true, "tilesetId": "dungeon-top-down-302", "renderMode": "dungeon-top-down",
		"base64": Marshalls.raw_to_base64(image.save_png_to_buffer()), "tileWidth": 32, "tileHeight": 32,
		"columns": 20, "rows": 20, "baseTile": null,
		"dungeonRender": {"format": "realmz.dungeon-render.v1", "spriteLayerMasks": sprites, "behaviorOverlayMasks": behaviors}}


func _preview_consumers(canvas: ProvidenceMapCanvas, projection: Dictionary) -> void:
	var dock: Control = preload("res://src/dungeon_feature_dock.tscn").instantiate()
	canvas.add_child(dock); dock.set_atlas(projection)
	for feature: String in ["Wall", "HorizontalDoor", "VerticalDoor", "Stairs", "Column", "Archway"]:
		assert(dock.get_node("%" + feature + "Preview").texture.get_size() == Vector2(16, 16))
	assert(dock.get_node("%WallPreview").texture.get_image().get_pixel(1, 1) == Color.RED)
	var preview: Control = preload("res://src/dungeon_feature_preview.gd").new()
	canvas.add_child(preview); preview.set_atlas(projection)
	assert(preview._texture.get_size() == Vector2(64, 64) and preview._columns == 4)
	var resource: TextureRect = preload("res://src/paint_resource_preview.gd").new()
	canvas.add_child(resource)
	resource.set_resource({"levelType": "dungeon", "width": 1, "height": 1}, projection, [{"x":0, "y":0, "spriteLayers":1, "behaviorOverlays":0}], null)
	assert(resource._source.get_size() == Vector2(64, 64))
	dock.queue_free(); preview.queue_free(); resource.queue_free()
