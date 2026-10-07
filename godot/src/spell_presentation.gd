extends RefCounted


static func decode(response: Dictionary) -> Dictionary:
	if not response.get("ok", false): return {"complete": false, "error": response.get("error", "Preview unavailable.")}
	var result: Dictionary = response.get("result", {})
	var choice: Dictionary = result.get("choice", {})
	var textures: Array = []
	var audio: AudioStreamWAV
	var complete: bool = choice.get("available", false)
	for row in result.get("payloads", []):
		var decoded := preload("res://src/asset_preview_decoder.gd").decode({"ok": true, "result": row.payload}, {})
		if decoded.has("texture"):
			var texture: Texture2D = decoded.texture
			if choice.get("tileRect") is Array:
				var rect: Array = choice.tileRect
				if texture.get_width() != 640 or texture.get_height() != 640: complete = false
				else:
					var tile := AtlasTexture.new()
					tile.atlas = texture
					tile.region = Rect2(rect[0], rect[1], rect[2], rect[3])
					texture = tile
			textures.append(texture)
		elif decoded.has("audio"): audio = decoded.audio
		else: complete = false
	if result.get("payloads", []).size() != choice.get("resources", []).size(): complete = false
	return {"choice": choice, "textures": textures, "audio": audio, "complete": complete, "error": "One or more exact resources could not be previewed. Repair their owner before selecting."}
