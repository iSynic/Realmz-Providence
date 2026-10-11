extends RefCounted

# Font resources are immutable after construction and shared by native controls.
static var _fonts: Dictionary = {}


static func get_font(names: PackedStringArray, weight := 400) -> SystemFont:
	var key := "%s:%d" % [JSON.stringify(names), weight]
	if not _fonts.has(key):
		var font := SystemFont.new()
		font.font_names = names
		font.font_weight = weight
		_fonts[key] = font
	return _fonts[key]
