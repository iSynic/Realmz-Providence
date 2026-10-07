extends RefCounted


static func module_bytes() -> PackedByteArray:
	var bytes := PackedByteArray(); bytes.resize(1084 + 1024 + 128)
	bytes[42] = 0; bytes[43] = 64; bytes[45] = 64; bytes[49] = 64
	bytes[950] = 1
	for index in 4: bytes[1080 + index] = "M.K.".to_ascii_buffer()[index]
	bytes[1084] = 1; bytes[1085] = 172; bytes[1086] = 16
	for index in 128: bytes[2108 + index] = int(sin(TAU * index / 128.0) * 120) & 255
	bytes.append_array("preserved source tail".to_ascii_buffer())
	return bytes
