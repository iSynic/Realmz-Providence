extends RefCounted


static func stringify(value: Variant) -> String:
	var encoded := _escape_vertical_tabs(JSON.stringify(value))
	# Godot leaves some U+0000..001F characters literal. The Rust JSON transport
	# requires their escaped form; preserve their value rather than dropping valid MacRoman bytes.
	var control := RegEx.create_from_string("[\\x00-\\x1f]")
	var matches := control.search_all(encoded)
	if matches.is_empty(): return encoded
	var parts := PackedStringArray()
	var cursor := 0
	for found: RegExMatch in matches:
		parts.append(encoded.substr(cursor, found.get_start() - cursor))
		parts.append("\\u%04x" % found.get_string().unicode_at(0))
		cursor = found.get_end()
	parts.append(encoded.substr(cursor))
	return "".join(parts)


static func _escape_vertical_tabs(encoded: String) -> String:
	# Godot emits the C escape \\v, which JSON does not recognize. Even pairs of
	# preceding backslashes identify an escape; an odd count identifies literal text.
	var parts := PackedStringArray()
	var cursor := 0
	var offset := encoded.find("\\v")
	while offset >= 0:
		var preceding := 0
		var index := offset - 1
		while index >= 0 and encoded.unicode_at(index) == 92:
			preceding += 1; index -= 1
		if preceding % 2 == 0:
			parts.append(encoded.substr(cursor, offset - cursor))
			parts.append("\\u000b")
			cursor = offset + 2
		offset = encoded.find("\\v", offset + 2)
	parts.append(encoded.substr(cursor))
	return "".join(parts)
