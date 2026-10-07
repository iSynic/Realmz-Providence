extends RefCounted

const MAX_BYTES := 1024 * 1024


static func decode(resource: Dictionary) -> Texture2D:
	if not bool(resource.get("payloadAvailable", false)):
		return null
	var encoded := str(resource.get("base64", ""))
	if encoded.is_empty() or encoded.length() > 4 * ((MAX_BYTES + 2) / 3):
		return null
	var bytes := Marshalls.base64_to_raw(encoded)
	if bytes.is_empty() or bytes.size() > MAX_BYTES or bytes.size() != int(resource.get("bytes", -1)):
		return null
	var image := Image.new()
	var error := ERR_FILE_UNRECOGNIZED
	match str(resource.get("mimeType", "")):
		"image/png": error = image.load_png_from_buffer(bytes)
		"image/jpeg": error = image.load_jpg_from_buffer(bytes)
		"image/webp": error = image.load_webp_from_buffer(bytes)
		"image/bmp": error = image.load_bmp_from_buffer(bytes)
	return ImageTexture.create_from_image(image) if error == OK else null
