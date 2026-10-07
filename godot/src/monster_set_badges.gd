extends HBoxContainer

const SETS := {"Normal": 0, "Monster": 1, "Mega": -1}


func set_availability(available: Variant, current_set: int) -> void:
	var known := available is Array
	var ids: Array[int] = []
	if known:
		for id in available:
			if not (id is int or id is float) or float(id) not in [0.0, 1.0, -1.0]:
				known = false
				break
			ids.append(int(id))
	for node_name in SETS:
		var badge := get_node(node_name) as Label
		var present: bool = known and ids.has(SETS[node_name])
		var active: bool = current_set == SETS[node_name]
		var state := "available" if present else ("missing" if known else "unknown")
		badge.set_meta("availability", state)
		badge.set_meta("current_set", active)
		badge.text = node_name.to_upper() + (" —" if state == "missing" else (" ?" if state == "unknown" else ""))
		badge.tooltip_text = "%s: %s%s" % [node_name, state, " · current set" if active else ""]
		var panel := badge.get_theme_stylebox("normal").duplicate() as StyleBoxFlat
		panel.border_color = Color("2b8fd8") if active else (Color("225a3b") if present else Color("263847"))
		badge.add_theme_stylebox_override("normal", panel)
		badge.add_theme_color_override("font_color", Color("d9f0ff") if active else (Color("9af1be") if present else Color("7f92a3")))
