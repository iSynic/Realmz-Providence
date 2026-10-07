extends RefCounted

static func focus(canvas: ProvidenceMapCanvas, field: String) -> bool:
	var regex := RegEx.new()
	regex.compile("^tiles\\[(\\d+)\\]\\[(\\d+)\\]")
	var match := regex.search(field)
	if match == null: return false
	canvas.select_cell(int(match.get_string(2)), int(match.get_string(1)))
	canvas.grab_focus()
	return true
