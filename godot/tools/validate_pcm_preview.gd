extends SceneTree

const Decoder = preload("res://src/asset_preview_decoder.gd")


func _initialize() -> void: call_deferred("_run")


func _run() -> void:
	var arguments := OS.get_cmdline_user_args()
	var sounds: Array = []
	if not arguments.is_empty():
		sounds = JSON.parse_string(FileAccess.get_file_as_string(arguments[0]))
	var endpoint_wav := PackedByteArray([82,73,70,70,40,0,0,0,87,65,86,69,102,109,116,32,16,0,0,0,1,0,1,0,17,43,0,0,17,43,0,0,1,0,8,0,100,97,116,97,4,0,0,0,0,127,128,255])
	sounds.append({"resourceId": "sample-endpoints", "wavBase64": Marshalls.raw_to_base64(endpoint_wav),
		"preview": {"pcm8Base64": Marshalls.raw_to_base64(PackedByteArray([0, 127, 128, 255])), "sampleRate": 11025}})
	var editor = load("res://src/scenario_sound_editor.tscn").instantiate()
	root.add_child(editor)
	await process_frame
	var silence := {"pcm8Base64": "gICA", "sampleRate": 11025}
	var quiet = Decoder.decode({"ok": true, "result": silence}, {}).audio
	assert(quiet.data == PackedByteArray([0, 0, 0]))
	editor.set_preview_pcm8_base64(silence.pcm8Base64, silence.sampleRate)
	assert(editor._player.stream.data == quiet.data and editor._play.disabled == false)
	editor.set_preview_pcm8_base64("", 11025)
	assert(editor._player.stream == null and editor._play.disabled)
	assert(Decoder.decode({"ok": true, "result": {"pcm8Base64": "gICA", "sampleRate": 0}}, {}).has("error"))
	for sound: Dictionary in sounds:
		_check_sound(editor, sound)
	editor.queue_free()
	await process_frame
	print("PCM_PREVIEW_OK silence=zero invalid=cleared scenario-and-shared=wav-equivalent sounds=%d" % sounds.size())
	quit()


func _check_sound(editor: Control, sound: Dictionary) -> void:
	var reference := AudioStreamWAV.load_from_buffer(Marshalls.base64_to_raw(sound.wavBase64))
	assert(reference != null and not reference.stereo)
	var expected := reference.data
	if reference.format == AudioStreamWAV.FORMAT_16_BITS:
		var reduced := PackedByteArray()
		for index in expected.size() / 2: reduced.append(expected[index * 2 + 1])
		expected = reduced
	else: assert(reference.format == AudioStreamWAV.FORMAT_8_BITS)
	var preview: Dictionary = sound.preview
	var decoded: Dictionary = Decoder.decode({"ok": true, "result": preview}, {})
	assert(decoded.has("audio"))
	var stream: AudioStreamWAV = decoded.audio
	assert(stream.data == expected and stream.mix_rate == reference.mix_rate)
	assert(stream.format == AudioStreamWAV.FORMAT_8_BITS and not stream.stereo)
	editor.set_preview_pcm8_base64(preview.pcm8Base64, preview.sampleRate)
	assert(editor._player.stream.data == expected and not editor._player.playing)
	var file = Decoder.decode({"ok": true, "result": {"mimeType": "audio/wav", "base64": sound.wavBase64}}, {}).audio
	assert(file.data == reference.data and file.mix_rate == reference.mix_rate)
	print("PCM_SOUND_OK id=%s frames=%d rate=%d source-bits=%d" % [sound.resourceId, expected.size(), stream.mix_rate, 8 if reference.format == AudioStreamWAV.FORMAT_8_BITS else 16])
