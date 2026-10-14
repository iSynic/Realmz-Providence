extends RefCounted

var _cells: Dictionary = {}


func set_rows(rows: Array) -> void:
	_cells.clear()
	for row: Dictionary in rows:
		var coordinate: Dictionary = row.get("coordinate", {}) if row.get("coordinate") is Dictionary else {}
		var cell := Vector2i(int(coordinate.get("x", -1)), int(coordinate.get("y", -1)))
		if cell.x < 0 or cell.y < 0 or cell.x >= 90 or cell.y >= 90: continue
		if not _cells.has(cell): _cells[cell] = []
		_cells[cell].append(row)


func first(cell: Vector2i) -> Dictionary:
	var rows: Array = _cells.get(cell, [])
	return rows[0] if not rows.is_empty() else {}


func all_at(cell: Vector2i) -> Array:
	return (_cells.get(cell, []) as Array).duplicate(true)
