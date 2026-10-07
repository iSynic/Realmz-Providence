extends RefCounted

const MAP_SIZE := 90

var active := false
var orthogonal := false
var cells: Array[Vector2i] = []
var _visited: Dictionary = {}
var _last := Vector2i(-1, -1)


func begin(cell: Vector2i) -> void:
	clear()
	active = true
	append(cell)


func append(cell: Vector2i) -> void:
	if not active:
		return
	if cell.x < 0 or cell.y < 0 or cell.x >= MAP_SIZE or cell.y >= MAP_SIZE:
		_last = Vector2i(-1, -1)
		return
	var cursor := cell if _last.x < 0 else _last
	var distance := Vector2i(absi(cell.x - cursor.x), -absi(cell.y - cursor.y))
	var step := Vector2i(1 if cursor.x < cell.x else -1, 1 if cursor.y < cell.y else -1)
	var error := distance.x + distance.y
	while true:
		if not _visited.has(cursor):
			_visited[cursor] = true
			cells.append(cursor)
		if cursor == cell:
			break
		var doubled := error * 2
		if doubled >= distance.y:
			error += distance.y
			cursor.x += step.x
			if orthogonal and not _visited.has(cursor):
				_visited[cursor] = true
				cells.append(cursor)
		if doubled <= distance.x:
			error += distance.x
			cursor.y += step.y
	_last = cell


func contains(cell: Vector2i) -> bool:
	return _visited.has(cell)


func clear() -> void:
	active = false
	cells.clear()
	_visited.clear()
	_last = Vector2i(-1, -1)
