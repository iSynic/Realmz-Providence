extends RefCounted


static func read_command(path: String, after_sequence: int) -> Dictionary:
	# Open once: an atomic replacement may occur between a path existence check
	# and a convenience read. No command is published until a complete file exists.
	var input := FileAccess.open(path, FileAccess.READ)
	if input == null: return {}
	var text := input.get_as_text()
	if text.is_empty(): return {}
	var parser := JSON.new()
	assert(parser.parse(text) == OK, "Malformed published collaboration command: %s" % parser.get_error_message())
	var value: Variant = parser.data
	assert(value is Dictionary, "Published collaboration command must be an object")
	if int(value.get("sequence", -1)) <= after_sequence: return {}
	return value
