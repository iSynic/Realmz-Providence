extends RefCounted

const RangeSelection = preload("res://src/monster_library_range.gd")


static func load_membership(reader, state: Dictionary, revision: int, current: Callable) -> Dictionary:
	var selected: Array = state.get("selected", []).duplicate(true)
	selected.sort_custom(func(a: Dictionary, b: Dictionary): return int(a.index) < int(b.index))
	var restored := {}
	var next := 0
	while next < selected.size():
		var first := int(selected[next].index)
		if first < 0: return _changed()
		var stop := next + 1
		while stop < selected.size() and int(selected[stop].index) < first + 128: stop += 1
		var last := int(selected[stop - 1].index)
		var page := await RangeSelection.load_range(reader, str(state.scope), str(state.query).strip_edges(), revision, first, last,
			func(): return not current.call())
		if not page.get("ok", false): return page
		for index in range(next, stop):
			var identity := str(selected[index].identity)
			var position := int(selected[index].index)
			var item: Dictionary = page.items[position - first]
			if restored.has(identity) or str(item.get("identity", "")) != identity: return _changed()
			restored[identity] = {"item": item, "index": position}
		next = stop
	return {"ok": true, "selected": restored}


static func _changed() -> Dictionary:
	return {"ok": false, "stale": true, "error": "The selected Library entries moved or changed. Select them again in the refreshed catalog."}
