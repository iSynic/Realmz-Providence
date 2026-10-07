extends RefCounted

const MAX_IMAGE_BASE64_LENGTH := 5592408


static func decode(response: Dictionary, row: Dictionary) -> Dictionary:
	if not response.get("ok", false):
		return {"error": str(response.get("error", "Preview unavailable."))}
	var result: Dictionary = response.get("result", {})
	var mime := str(result.get("mimeType", ""))
	var encoded := str(result.get("base64", ""))
	if mime == "audio/x-mod": return {"music": true, "title": str(result.get("title", "Music")), "sourceBytes": int(result.get("sourceBytes", 0))}
	if result.get("text") is String:
		return {"text": str(result.text), "truncated": false}
	if mime in ["audio/wav", "audio/x-wav", "text/plain"]:
		return _decode_file(mime, encoded)
	if result.get("pcm8Base64") is String:
		return _decode_pcm(result)
	if encoded.is_empty() or encoded.length() > MAX_IMAGE_BASE64_LENGTH:
		return {"error": "Preview unavailable."}
	var image := Image.new()
	if image.load_png_from_buffer(Marshalls.base64_to_raw(encoded)) != OK:
		return {"error": "Preview unavailable."}
	return {"texture": ImageTexture.create_from_image(image),
		"width": result.get("width", row.get("width", image.get_width())),
		"height": result.get("height", row.get("height", image.get_height()))}


static func _decode_file(mime: String, encoded: String) -> Dictionary:
	if encoded.length() > MAX_IMAGE_BASE64_LENGTH:
		return {"error": "Preview unavailable."}
	var bytes := Marshalls.base64_to_raw(encoded)
	if mime == "text/plain": return {"text": bytes.get_string_from_utf8(), "truncated": false}
	var wav := AudioStreamWAV.load_from_buffer(bytes)
	return {"audio": wav} if wav != null else {"error": "Preview unavailable."}


static func _decode_pcm(result: Dictionary) -> Dictionary:
	var encoded := str(result.pcm8Base64)
	var rate := int(result.get("sampleRate", 0))
	if encoded.is_empty() or encoded.length() > 4000000 or rate <= 0 or rate > 192000:
		return {"error": "Preview unavailable."}
	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_8_BITS
	stream.mix_rate = rate
	stream.stereo = false
	var samples := Marshalls.base64_to_raw(encoded)
	# The adapter transports unsigned PCM; Godot's raw 8-bit buffer is signed.
	for index in samples.size(): samples[index] ^= 128
	stream.data = samples
	return {"audio": stream} if not stream.data.is_empty() else {"error": "Preview unavailable."}
