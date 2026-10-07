extends RefCounted


static func compose(land: Dictionary, shared: Dictionary) -> Dictionary:
	var land_image := _image(land, Vector2i(20, 10))
	if land_image == null:
		return {"available":false,"reason":"The current Landlook artwork is unavailable or has invalid tile geometry."}
	var shared_image := _image(shared, Vector2i(20, 20))
	if shared_image == null:
		return {"available":false,"reason":str(shared.get("reason", "The shared combat artwork is unavailable or has invalid tile geometry."))}
	# Castle loads the active Landlook into cells 1–200 of its shared drawing surface.
	# This derived image belongs only to the editor preview, never to resource storage.
	shared_image.convert(Image.FORMAT_RGBA8)
	land_image.convert(Image.FORMAT_RGBA8)
	shared_image.blit_rect(land_image, Rect2i(0, 0, 640, 320), Vector2i.ZERO)
	var result := shared.duplicate(true)
	result.base64 = Marshalls.raw_to_base64(shared_image.save_png_to_buffer())
	result["previewSources"] = [str(land.get("assetIdentity", land.get("tilesetId", ""))), str(shared.get("assetIdentity", shared.get("tilesetId", "")))]
	return result


static func _image(projection: Dictionary, geometry: Vector2i) -> Image:
	if not projection.get("available", false): return null
	if Vector2i(int(projection.get("columns", 0)), int(projection.get("rows", 0))) != geometry: return null
	if int(projection.get("tileWidth", 0)) != 32 or int(projection.get("tileHeight", 0)) != 32: return null
	var encoded := str(projection.get("base64", ""))
	if encoded.is_empty() or encoded.length() > 6000000: return null
	var result := Image.new()
	if result.load_png_from_buffer(Marshalls.base64_to_raw(encoded)) != OK: return null
	return result if result.get_size() == geometry * 32 else null
