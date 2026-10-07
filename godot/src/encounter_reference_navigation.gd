extends RefCounted

static func focus(field: String, singles: Dictionary, magic: Array, items: Array, scroll: ScrollContainer) -> bool:
	var target: Control = singles.get(field)
	var regex := RegEx.new()
	regex.compile("^(spellIds|itemIds|spellResults|itemResults)\\[(\\d+)\\]$")
	var match := regex.search(field)
	if match != null:
		var rows: Array = magic if match.get_string(1).begins_with("spell") else items
		var index := int(match.get_string(2))
		if index < rows.size(): target = rows[index].result if match.get_string(1).ends_with("Results") else rows[index].choose
	elif field in ["spellResults", "itemResults"]:
		var rows: Array = magic if field == "spellResults" else items
		if not rows.is_empty(): target = rows[0].result
	if not is_instance_valid(target): return false
	scroll.ensure_control_visible(target)
	target.grab_focus()
	return true
