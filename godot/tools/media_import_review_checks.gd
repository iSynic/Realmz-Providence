extends RefCounted

const Decoder = preload("res://src/asset_preview_decoder.gd")


static func run(dialog: Window, bridge: RefCounted, commands: RefCounted, paths: Array, check: Callable) -> void:
	for entry in [["picture", 30020, paths[0]], ["sound", 493, paths[1]], ["text-resource", -30003, paths[2]]]:
		await dialog.open_review("import", bridge, commands, {"scope":"scenario", "kind":entry[0]})
		dialog.get_node("%Path").text = entry[2]
		dialog.get_node("%DraftName").text = "Source review"
		dialog.get_node("%Number").value = entry[1]
		dialog.get_node("%PrepareDelay").stop(); await dialog._prepare()
		var previewed: bool = not dialog.get_node("%CurrentText").text.is_empty() if entry[0] == "text-resource" else dialog.get_node("%Current").texture != null
		if not check.call(previewed and not dialog.get_node("%Accept").disabled, "real original %s preview reviewed" % entry[0]): return
		dialog.get_node("%Path").text = str(entry[2]) + ".missing"
		dialog.get_node("%Path").text_changed.emit(dialog.get_node("%Path").text)
		if not check.call(dialog.get_node("%Current").texture == null and dialog.get_node("%CurrentText").text.is_empty() and dialog.get_node("%Accept").disabled, "%s source change clears previous original immediately" % entry[0]): return
		dialog.get_node("%PrepareDelay").stop(); await dialog._prepare()
		if not check.call(dialog.get_node("%Current").texture == null and dialog.get_node("%CurrentText").text.is_empty() and dialog.get_node("%OutputDetails").text.is_empty() and dialog.get_node("%Audio").stream == null, "%s failed import review retains draft without stale original/output" % entry[0]): return
		dialog._cancel()
	if not await _cross_family(dialog, bridge, commands, paths, check): return
	await _replacement(dialog, bridge, commands, paths[0], check)
	await _sound_replacement(dialog, bridge, commands, paths[1], check)


static func _cross_family(dialog: Window, bridge: RefCounted, commands: RefCounted, paths: Array, check: Callable) -> bool:
	await dialog.open_review("import", bridge, commands, {"scope":"scenario", "kind":"text-resource"})
	dialog.get_node("%Path").text = paths[2]; dialog.get_node("%DraftName").text = "Family review"
	dialog.get_node("%Number").value = -30003
	dialog.get_node("%PrepareDelay").stop(); await dialog._prepare()
	dialog.get_node("%Family").select(0); dialog._changed()
	dialog.get_node("%Transparency").select(1)
	dialog.get_node("%Number").value = 30020; dialog.get_node("%Path").text = paths[0]
	dialog.get_node("%PrepareDelay").stop(); await dialog._prepare()
	var passed: bool = check.call(not dialog.get_node("%Accept").disabled and dialog.get_node("%CurrentText").text.is_empty() and not dialog.get_node("%CurrentText").visible and dialog.get_node("%Current").texture != null, "successful TEXT-to-picture review clears prior original text: " + dialog.get_node("%Impact").text)
	dialog._cancel()
	return passed


static func _replacement(dialog: Window, bridge: RefCounted, commands: RefCounted, path: String, check: Callable) -> void:
	var state: Dictionary = bridge.request("session.describe", {})
	var opened: Dictionary = bridge.request("project-asset.open", {"identity":"picture:30000"})
	var preview := Decoder.decode(bridge.request("picture.preview", {"identity":"picture:30000"}), opened.result.asset)
	await dialog.open_review("replace", bridge, commands, {"scope":"scenario", "revision":int(state.result.revision), "row":opened.result.asset, "preview":preview})
	var current: Texture2D = dialog.get_node("%Current").texture
	dialog.get_node("%Path").text = path + ".missing"
	dialog.get_node("%PrepareDelay").stop(); await dialog._prepare()
	check.call(current != null and dialog.get_node("%Current").texture == current and dialog.get_node("%Accept").disabled, "failed replacement preserves actual current destination preview")
	dialog._cancel()


static func _sound_replacement(dialog: Window, bridge: RefCounted, commands: RefCounted, path: String, check: Callable) -> void:
	var wav := AudioStreamWAV.load_from_file(path)
	wav.mix_rate = 22050
	var replacement_path := path + ".replacement.wav"
	wav.save_to_wav(replacement_path)
	var state: Dictionary = bridge.request("session.describe", {})
	var opened: Dictionary = bridge.request("project-asset.open", {"identity":"sound:200"})
	await dialog.open_review("replace", bridge, commands, {"scope":"scenario", "revision":int(state.result.revision), "row":opened.result.asset})
	dialog.get_node("%Path").text = replacement_path
	dialog.get_node("%PrepareDelay").stop(); await dialog._prepare()
	check.call(not dialog.get_node("%Accept").disabled and dialog.get_node("%SourceDetails").text.contains("11025 Hz") and dialog.get_node("%OutputDetails").text.contains("22050 Hz"), "sound replacement compares actual destination with incoming source and prepared output")
	dialog._cancel()
