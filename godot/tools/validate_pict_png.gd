extends SceneTree


func _init() -> void:
	var arguments := OS.get_cmdline_user_args()
	if arguments.size() != 3:
		fail("expected <providence-cli> <resource-fork> <resource-id>")
		return
	var output: Array[String] = []
	var exit_code := OS.execute(
		arguments[0],
		["inspect-pict-resources", arguments[1], arguments[2]],
		output,
		true,
		true
	)
	if exit_code != 0:
		fail("CLI PICT inspection failed: %s" % "\n".join(output))
		return
	var parsed = JSON.parse_string("\n".join(output))
	if not parsed is Dictionary:
		fail("CLI PICT inspection did not return an object")
		return
	var sample = (parsed as Dictionary).get("samplePng")
	if not sample is Dictionary or not (parsed as Dictionary).get("samplePngValid", false):
		fail("CLI PICT inspection did not return a valid sample PNG")
		return
	var bytes := Marshalls.base64_to_raw(str((sample as Dictionary).get("base64", "")))
	var hashing := HashingContext.new()
	hashing.start(HashingContext.HASH_SHA256)
	hashing.update(bytes)
	var actual_sha256 := hashing.finish().hex_encode()
	var expected_sha256 := str((sample as Dictionary).get("sha256", ""))
	if actual_sha256 != expected_sha256:
		fail("sample PNG hash does not match its bounded report")
		return
	var image := Image.new()
	var error := image.load_png_from_buffer(bytes)
	var expected := Vector2i(
		int((sample as Dictionary).get("width", 0)),
		int((sample as Dictionary).get("height", 0))
	)
	if error != OK or image.get_size() != expected or image.get_format() != Image.FORMAT_RGBA8:
		fail("Godot rejected the PNG or decoded the wrong dimensions or format")
		return
	print(
		"PROVIDENCE_PICT_PNG_OK id=%s size=%sx%s sha256=%s"
		% [arguments[2], expected.x, expected.y, expected_sha256]
	)
	quit(0)


func fail(message: String) -> void:
	push_error("PROVIDENCE_PICT_PNG_FAILED %s" % message)
	quit(1)
