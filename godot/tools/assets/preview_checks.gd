extends RefCounted

static func run(tree: SceneTree, bridge) -> void:
	var media_panel = load("res://src/personal_assets_panel.tscn").instantiate()
	tree.root.add_child(media_panel)
	bridge.preview_payload = {"text": "Scenario text"}
	await media_panel.show_scope(bridge, "scenario")
	for frame in 3:
		await tree.process_frame
	await media_panel._select(0)
	assert(media_panel.get_node("%TextPreview").text == "Scenario text")
	assert(not media_panel.get_node("InspectorInset/Selection/PreviewHost").visible)
	assert(not media_panel.get_node("InspectorInset/Selection/PreviewScale").visible)
	assert(media_panel.get_node("%Preview").texture == null)
	bridge.preview_payload = {"pcm8Base64": Marshalls.raw_to_base64(PackedByteArray([128, 129, 128, 127])), "sampleRate": 11025}
	await media_panel.reload(bridge)
	for frame in 3:
		await tree.process_frame
	await media_panel._select(0)
	assert(media_panel.get_node("%PlayPreview").visible)
	assert(not media_panel.get_node("InspectorInset/Selection/PreviewHost").visible)
	assert(media_panel.get_node("%SoundPreview").stream.mix_rate == 11025)
	assert(not media_panel.get_node("%SoundPreview").playing)
	assert(media_panel.get_node("%Gallery").get_item_icon(0).get_width() == 64)
	var quiet_bounds: Rect2i = media_panel.get_node("%Gallery").get_item_icon(0).get_image().get_used_rect()
	bridge.preview_payload.pcm8Base64 = Marshalls.raw_to_base64(PackedByteArray([128, 255, 0, 128]))
	await media_panel.reload(bridge)
	await media_panel._select(0)
	assert(media_panel.get_node("%Gallery").get_item_icon(0).get_image().get_used_rect().size.y > quiet_bounds.size.y)
	media_panel.get_node("%PlayPreview").pressed.emit()
	assert(media_panel.get_node("%PlayPreview").text == "Stop Sound")
	await media_panel.show_scope(bridge, "stock")
	assert(not media_panel.get_node("%SoundPreview").playing)
	assert(media_panel.get_node("%SoundPreview").stream == null)
	await media_panel.reload(null)
	bridge.stop()
	bridge.preview_payload = {"mimeType": "text/plain", "base64": Marshalls.raw_to_base64("Stock text".to_utf8_buffer())}
	await media_panel.show_scope(bridge, "stock")
	for frame in 3:
		await tree.process_frame
	await media_panel._select(0)
	assert(media_panel.get_node("%TextPreview").text == "Stock text")
	var wav_bytes := PackedByteArray([82,73,70,70,40,0,0,0,87,65,86,69,102,109,116,32,16,0,0,0,1,0,1,0,17,43,0,0,17,43,0,0,1,0,8,0,100,97,116,97,4,0,0,0,128,129,128,127])
	bridge.stop()
	bridge.preview_payload = {"mimeType": "audio/wav", "base64": Marshalls.raw_to_base64(wav_bytes)}
	await media_panel.reload(bridge)
	for frame in 3:
		await tree.process_frame
	await media_panel._select(0)
	assert(media_panel.get_node("%SoundPreview").stream != null)
	assert(not media_panel.get_node("%SoundPreview").playing)
	await media_panel.reload(null)
	await tree.process_frame
	media_panel.queue_free()
	await tree.create_timer(0.1).timeout

