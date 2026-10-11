extends RefCounted


static func decode(projection: Dictionary) -> Dictionary:
	if not projection.get("available", false): return {}
	var cache := preload("res://src/asset_preview_cache.gd").shared()
	var dimensions := Vector2i(int(projection.get("tileWidth", 0)), int(projection.get("tileHeight", 0)))
	var columns := int(projection.get("columns", 0))
	var rows := int(projection.get("rows", 0))
	var bytes := Marshalls.base64_to_raw(str(projection.get("base64", "")))
	if dimensions.x <= 0 or dimensions.y <= 0 or columns <= 0 or rows <= 0 or bytes.is_empty(): return {}
	var key := "atlas:%s:%s:%s:%s:%s:%s" % [str(projection.get("tilesetId", "")), str(projection.get("renderMode", "")), dimensions, columns, rows, str(projection.get("base64", "")).sha256_text()]
	var cached: Dictionary = cache.find_preview(key)
	if not cached.is_empty(): return cached
	var image := Image.new()
	if image.load_png_from_buffer(bytes) != OK or image.get_size() != dimensions * Vector2i(columns, rows): return {}
	if projection.get("renderMode", "") == "dungeon-top-down":
		image = preload("res://src/dungeon_cell_artwork.gd").derive_atlas(projection, image)
		if image == null: return {}
		dimensions = Vector2i(16, 16); columns = 4; rows = 4
	var result := {"texture": ImageTexture.create_from_image(image), "tileSize": dimensions, "columns": columns, "rows": rows}
	cache.remember(key, result)
	return result


static func overlays(projection: Dictionary) -> Dictionary:
	var textures := {}
	for overlay: Dictionary in projection.get("overlays", []):
		var cache := preload("res://src/asset_preview_cache.gd").shared()
		var key := "overlay:%s:%s:%s" % [overlay.get("width", 0), overlay.get("height", 0), str(overlay.get("base64", "")).sha256_text()]
		var cached: Dictionary = cache.find_preview(key)
		if not cached.is_empty():
			textures[int(overlay.get("resourceId", 0))] = cached.texture
			continue
		var image := Image.new()
		var bytes := Marshalls.base64_to_raw(str(overlay.get("base64", "")))
		if bytes.is_empty() or image.load_png_from_buffer(bytes) != OK: continue
		var expected := Vector2i(int(overlay.get("width", image.get_width())), int(overlay.get("height", image.get_height())))
		if image.get_size() == expected:
			var texture := ImageTexture.create_from_image(image)
			textures[int(overlay.get("resourceId", 0))] = texture
			cache.remember(key, {"texture": texture})
	return textures
