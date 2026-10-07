extends RefCounted


static func decode(projection: Dictionary) -> Dictionary:
	if not projection.get("available", false): return {}
	var dimensions := Vector2i(int(projection.get("tileWidth", 0)), int(projection.get("tileHeight", 0)))
	var columns := int(projection.get("columns", 0))
	var rows := int(projection.get("rows", 0))
	var bytes := Marshalls.base64_to_raw(str(projection.get("base64", "")))
	if dimensions.x <= 0 or dimensions.y <= 0 or columns <= 0 or rows <= 0 or bytes.is_empty(): return {}
	var image := Image.new()
	if image.load_png_from_buffer(bytes) != OK or image.get_size() != dimensions * Vector2i(columns, rows): return {}
	if projection.get("renderMode", "") == "dungeon-top-down":
		image = preload("res://src/dungeon_cell_artwork.gd").derive_atlas(projection, image)
		if image == null: return {}
		dimensions = Vector2i(16, 16); columns = 4; rows = 4
	return {"texture": ImageTexture.create_from_image(image), "tileSize": dimensions, "columns": columns, "rows": rows}


static func overlays(projection: Dictionary) -> Dictionary:
	var textures := {}
	for overlay: Dictionary in projection.get("overlays", []):
		var image := Image.new()
		var bytes := Marshalls.base64_to_raw(str(overlay.get("base64", "")))
		if bytes.is_empty() or image.load_png_from_buffer(bytes) != OK: continue
		var expected := Vector2i(int(overlay.get("width", image.get_width())), int(overlay.get("height", image.get_height())))
		if image.get_size() == expected: textures[int(overlay.get("resourceId", 0))] = ImageTexture.create_from_image(image)
	return textures
