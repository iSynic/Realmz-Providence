extends RefCounted


static func texture(resource: Dictionary, atlas: Control, special_previews: Array = []) -> Texture2D:
	if atlas.atlas_texture == null or resource.get("tilesetId", "") != atlas.tileset_id: return null
	var width := int(resource.get("width", 0)); var height := int(resource.get("height", 0))
	if width < 1 or width > 32 or height < 1 or height > 32: return null
	var image := Image.create(width * atlas.tile_size.x, height * atlas.tile_size.y, false, Image.FORMAT_RGBA8)
	var source: Image = atlas.atlas_texture.get_image()
	var specials := special_textures(special_previews)
	for cell: Dictionary in resource.get("cells", []):
		var tile := int(cell.tile)
		if tile < 0 and specials.has(tile):
			image.blit_rect(specials[tile].get_image(), Rect2i(0,0,32,32), Vector2i(int(cell.x),int(cell.y))*atlas.tile_size); continue
		if tile < 1 or tile > 200: continue
		var source_cell := Vector2i((tile - 1) % atlas.columns, (tile - 1) / atlas.columns)
		image.blit_rect(source, Rect2i(source_cell * atlas.tile_size, atlas.tile_size), Vector2i(int(cell.x), int(cell.y)) * atlas.tile_size)
	return ImageTexture.create_from_image(image)


static func special_textures(previews: Array) -> Dictionary:
	var result := {}
	for preview: Dictionary in previews:
		var image := Image.new()
		if image.load_png_from_buffer(Marshalls.base64_to_raw(str(preview.get("base64","")))) == OK and image.get_size() == Vector2i(32,32):
			result[int(preview.resourceId)] = ImageTexture.create_from_image(image)
	return result
