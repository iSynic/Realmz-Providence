extends RefCounted


static func resolve(request: Callable, icon_id: int) -> Dictionary:
	if icon_id == 0: return {"ok": true, "texture": null}
	# The core resolves the complete exact-key catalog before a borrowed operation
	# fetches the preview. Ambiguous or invalid scenario ownership never falls back.
	var resolved: Dictionary = await request.call("item-artwork.resolve", {"iconId": icon_id})
	if not resolved.get("ok", false): return resolved
	var choice: Dictionary = resolved.get("result", {}).get("choice", {})
	if not choice.get("available", false): return {"ok": false, "error": choice.get("reason", "This exact artwork is unavailable.")}
	var preview: Dictionary = await request.call("icon.preview" if choice.ownership == "scenario" else "application-media.preview", {"identity": choice.targetIdentity})
	if not preview.get("ok", false): return preview
	var texture := decode_texture(preview)
	return {"ok": texture != null, "texture": texture, "error": "" if texture != null else "This exact artwork payload cannot be previewed."}


static func decode_texture(response: Dictionary) -> Texture2D:
	if not response.get("ok", false): return null
	var result: Dictionary = response.get("result", {})
	var bytes := Marshalls.base64_to_raw(str(result.get("base64", "")))
	if bytes.is_empty(): return null
	var image := Image.new()
	if image.load_png_from_buffer(bytes) != OK: return null
	image.convert(Image.FORMAT_RGBA8)
	return ImageTexture.create_from_image(image)
