extends Control

const LABELS := ["Calls", "Checks", "Changes", "Uses", "Eligibility"]

func _ready() -> void:
	custom_minimum_size = Vector2(580, 26)
	mouse_filter = Control.MOUSE_FILTER_IGNORE

func _draw() -> void:
	var controls = get_parent().get_theme_default_font()
	var palette = get_meta("flow_theme", null)
	if palette == null: return
	for index in LABELS.size():
		var left := float(index * 114)
		var color := Color(palette.ACCENTS[palette.mode][2 if index in [1, 2] else (1 if index == 4 else 0)])
		if index == 3: color = Color("126665") if palette.mode == "light" else Color("8edbd6")
		var start := Vector2(left, 13)
		var finish := Vector2(left + 24, 13)
		if index == 0: draw_line(start, finish, color, 1.5, true)
		else: draw_dashed_line(start, finish, color, 1.5, 3 if index >= 3 else 8)
		if index == 2: draw_rect(Rect2(finish - Vector2(3, 3), Vector2(6, 6)), color)
		elif index in [1, 4]: draw_polyline(PackedVector2Array([finish + Vector2(-4, 0), finish + Vector2(0, -3), finish + Vector2(4, 0), finish + Vector2(0, 3), finish + Vector2(-4, 0)]), color, 1.5, true)
		else: draw_polyline(PackedVector2Array([finish + Vector2(-6, -3), finish, finish + Vector2(-6, 3)]), color, 1.5, true)
		draw_string(controls, Vector2(left + 34, 17), LABELS[index], HORIZONTAL_ALIGNMENT_LEFT, -1, 11, color)
