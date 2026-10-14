extends RefCounted

const Target = preload("res://src/map_selection_target.gd")


static func collect(canvas: ProvidenceMapCanvas, map: String, cell: Vector2i, point: Vector2, regions: Control, footprints: Control) -> Array:
	var hits: Array = []
	if canvas.action_point_marker_contract().get("visible", true):
		for ap: Dictionary in canvas.action_points_at(cell):
			hits.append(Target.create(Target.Kind.ACTION_POINT, str(ap.identity), map, cell,
				"AP %03d\n%s" % [int(ap.get("recordIndex", 0)), str(ap.get("descriptor", "")).strip_edges() if not str(ap.get("descriptor", "")).strip_edges().is_empty() else "%d%% chance · %s" % [int(ap.get("chancePercent", 0)), str(ap.get("kind", "Action Point"))]]))
	if regions.display_enabled:
		for row: Dictionary in regions.regions:
			if row.is_empty() or regions.filter_active and not regions.visible_ids.has(str(row.identity)): continue
			if not contains(canvas, point, row): continue
			var slot := str(row.identity).get_slice(":rect:", 1).to_int()
			hits.append(Target.create(Target.Kind.RANDOM_RECTANGLE, str(row.identity), map, cell,
				"Rectangle %d\n%d,%d → %d,%d" % [slot, row.left, row.top, row.right, row.bottom], slot))
	for row: Dictionary in footprints.footprints:
		if contains(canvas, point, row):
			hits.append(Target.create(Target.Kind.PLAYER_MAP, str(row.identity), map, cell,
				"Player Map %d\n%s" % [int(row.nativeId), str(row.get("name", ""))]))
	return hits


static func contains(canvas: ProvidenceMapCanvas, point: Vector2, row: Dictionary) -> bool:
	var first := canvas.cell_rect(Vector2i(clampi(int(row.left), 0, 90), clampi(int(row.top), 0, 90)))
	var width := clampi(int(row.right), 0, 90) - clampi(int(row.left), 0, 90)
	var height := clampi(int(row.bottom), 0, 90) - clampi(int(row.top), 0, 90)
	return width > 0 and height > 0 and Rect2(first.position, first.size * Vector2(width, height)).has_point(point)
