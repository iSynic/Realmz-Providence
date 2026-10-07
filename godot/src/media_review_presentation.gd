extends RefCounted

const Decoder = preload("res://src/asset_preview_decoder.gd")


static func clear_output(dialog: Window, reset_source := false) -> void:
	dialog.get_node("%OutputDetails").text = ""
	dialog.get_node("%SourceDetails").text = ""
	dialog.get_node("%Incoming").texture = null
	dialog.get_node("%IncomingReverse").hide()
	if reset_source:
		dialog.get_node("%Current").texture = null
		dialog.get_node("%CurrentReverse").texture = null
		dialog.get_node("%CurrentReverse").hide()
		dialog.get_node("%CurrentText").text = ""
		dialog.get_node("%CurrentText").hide()


static func render(dialog: Window, result: Dictionary, action: String, kind: String, current_sound: Dictionary, current_sound_preview: Dictionary) -> void:
	var previews: Dictionary = result.get("preview", {})
	var companion := Decoder.decode({"ok": true, "result": previews.get("companion") if previews.get("companion") is Dictionary else {}}, {})
	dialog.get_node("%IncomingReverse").texture = companion.get("texture")
	dialog.get_node("%IncomingReverse").visible = companion.has("texture")
	var incoming := Decoder.decode({"ok": true, "result": previews.get("primary", {})}, {})
	dialog.get_node("%Incoming").texture = incoming.get("texture")
	if incoming.has("audio"):
		dialog.get_node("%Audio").stream = incoming.audio
		dialog.get_node("%Play").show()
	else: dialog.get_node("%Play").hide()
	if incoming.has("text"): dialog.get_node("%Text").text = incoming.text
	var source_data: Dictionary = result.get("source", {})
	var source := Decoder.decode({"ok": true, "result": source_data}, {})
	if action != "replace" and source.has("texture"): dialog.get_node("%Current").texture = source.texture
	if action != "replace" and (source.has("text") or source.has("texture") or source.has("audio")):
		dialog.get_node("%CurrentText").text = str(source.get("text", ""))
	dialog.get_node("%CurrentText").visible = not dialog.get_node("%CurrentText").text.is_empty()
	var media: Dictionary = result.get("media", {})
	var primary: Dictionary = media.get("primary", {})
	var key: Dictionary = primary.get("classicResource", {})
	var details := "Original file · no Realmz allocation" if result.get("originalOnly", false) else "%s %d · Prepared output" % [str(key.get("resourceType", "")), int(key.get("resourceId", 0))]
	if kind == "sound":
		var color: Color = dialog.get_theme_color("font_color", "Label")
		for entry in [[current_sound_preview if action == "replace" else source, "%Current", "%SourceFrame"], [incoming, "%Incoming", "%ProposedFrame"]]:
			var audio: Variant = entry[0].get("audio")
			var waveform: Texture2D = preload("res://src/media_audio_presentation.gd").waveform(audio, color) if audio is AudioStreamWAV else null
			dialog.get_node(entry[1]).texture = waveform
			dialog.get_node(entry[2]).visible = waveform != null
		dialog.get_node("%SourceDetails").text = audio_details(current_sound, true) if action == "replace" else audio_details(source_data) if source_data.has("sampleRate") else "Stored sound · original retained"
		if action == "replace": details += "\nOriginal file: " + audio_details(source_data)
		details += "\n" + (audio_details(source_data) if result.get("originalOnly", false) else audio_details(primary, true))
	elif kind == "text-resource":
		dialog.get_node("%SourceDetails").text = "UTF-8 source · complete text" if source.has("text") else "Stored TEXT · original retained"
		if not result.get("originalOnly", false):
			details += "\nMacRoman · %d bytes\n" % int(primary.get("classicPayloadByteLength", 0))
			details += "Exact paired formatting retained." if media.get("companion") is Dictionary else "Unformatted TEXT · no style companion."
	elif kind == "music":
		dialog.get_node("%SourceDetails").text = "Standard MOD · %d bytes\nOriginal module and trailing bytes unchanged." % int(result.get("sourceBytes", primary.get("byteLength", 0)))
		details = "Exact MOD retained in My Library. No scenario allocation." if result.get("originalOnly", false) else "Slot %d · Custom %d Music\nExact source retained · no transcoding." % [int(primary.get("scenarioMusicSlot", 1)), int(primary.get("scenarioMusicSlot", 1))]
	elif source.has("texture"):
		dialog.get_node("%SourceDetails").text = "%d × %d pixels · source unchanged" % [int(source.get("width", 0)), int(source.get("height", 0))]
	dialog.get_node("%OutputDetails").text = details


static func audio_details(data: Dictionary, native_output := false) -> String:
	return "%d Hz · %.2f s\n%s · %d-bit %s%s" % [int(data.get("sampleRate", 0)), float(data.get("durationMs", 0)) / 1000.0, "Mono" if int(data.get("channels", 1)) == 1 else "%d channels" % int(data.channels), 8 if native_output else int(data.get("bitsPerSample", 8)), "unsigned PCM" if native_output else str(data.get("encoding", "PCM")), " · Classic snd" if native_output else " · WAV"]
