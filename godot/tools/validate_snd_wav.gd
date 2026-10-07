extends SceneTree


func _init() -> void:
	var arguments := OS.get_cmdline_user_args()
	if arguments.size() != 3:
		fail("expected <providence-cli> <resource-fork> <resource-id>")
		return
	var output: Array[String] = []
	var exit_code := OS.execute(
		arguments[0],
		["inspect-snd-resources", arguments[1], arguments[2]],
		output,
		true,
		true
	)
	if exit_code != 0:
		fail("CLI snd inspection failed: %s" % "\n".join(output))
		return
	var parsed = JSON.parse_string("\n".join(output))
	if not parsed is Dictionary:
		fail("CLI snd inspection did not return an object")
		return
	var sample = (parsed as Dictionary).get("sampleWav")
	if not sample is Dictionary or not (parsed as Dictionary).get("sampleWavValid", false):
		fail("CLI snd inspection did not return a valid sample WAV")
		return
	var bytes := Marshalls.base64_to_raw(str((sample as Dictionary).get("base64", "")))
	var hashing := HashingContext.new()
	hashing.start(HashingContext.HASH_SHA256)
	hashing.update(bytes)
	var actual_sha256 := hashing.finish().hex_encode()
	var expected_sha256 := str((sample as Dictionary).get("sha256", ""))
	if actual_sha256 != expected_sha256:
		fail("sample WAV hash does not match its bounded report")
		return
	var stream := AudioStreamWAV.load_from_buffer(bytes)
	if stream == null:
		fail("Godot rejected the runtime WAV")
		return
	var expected_rate := int((sample as Dictionary).get("sampleRate", 0))
	var expected_channels := int((sample as Dictionary).get("channels", 0))
	var expected_bits := int((sample as Dictionary).get("bitsPerSample", 0))
	var expected_format := AudioStreamWAV.FORMAT_8_BITS if expected_bits == 8 else AudioStreamWAV.FORMAT_16_BITS
	if (
		stream.mix_rate != expected_rate
		or stream.stereo != (expected_channels == 2)
		or stream.format != expected_format
		or stream.data.size() != int((sample as Dictionary).get("pcmBytes", -1))
	):
		fail("Godot loaded WAV geometry differs from the core report")
		return
	print(
		"PROVIDENCE_SND_WAV_OK id=%s rate=%s channels=%s bits=%s pcmBytes=%s sha256=%s"
		% [
			arguments[2],
			expected_rate,
			expected_channels,
			expected_bits,
			stream.data.size(),
			expected_sha256,
		]
	)
	quit(0)


func fail(message: String) -> void:
	push_error("PROVIDENCE_SND_WAV_FAILED %s" % message)
	quit(1)
