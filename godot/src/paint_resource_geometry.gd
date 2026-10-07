extends RefCounted

signal preview_requested(resource: Dictionary, edit: Dictionary, generation: int)
signal changed(resource: Dictionary, render_cells: Array)
signal state_changed

var _view: Window
var _read: Callable
var _source: Dictionary = {}
var _candidate: Dictionary = {}
var _generation := 0
var _waiting := false
var _read_only := true


func initialize(view: Window, read: Callable) -> void:
	_view = view; _read = read
	_view.get_node("%ResizeResource").pressed.connect(_resize)
	_view.get_node("%AddResourceCell").pressed.connect(_add)
	_view.get_node("%HoleResourceCell").pressed.connect(_hole)
	_view.get_node("%ConfirmGeometry").confirmed.connect(_accept)
	_view.get_node("%ConfirmGeometry").canceled.connect(_cancel)
	_view.get_node("%ResourceCells").item_selected.connect(_select)


func set_state(resource: Dictionary, read_only: bool) -> void:
	_read_only = read_only or resource.is_empty()
	for node_name in ["ResourceWidth", "ResourceHeight", "ResourceCellX", "ResourceCellY"]:
		_view.get_node("%" + node_name).editable = not _read_only and not _waiting
	if not _waiting and not resource.is_empty():
		_view.get_node("%ResourceWidth").set_value_no_signal(int(resource.width))
		_view.get_node("%ResourceHeight").set_value_no_signal(int(resource.height))
		_view.get_node("%ResourceCellX").max_value = int(resource.width) - 1
		_view.get_node("%ResourceCellY").max_value = int(resource.height) - 1
	var selected: PackedInt32Array = _view.get_node("%ResourceCells").get_selected_items()
	_view.get_node("%ResizeResource").disabled = _read_only or _waiting
	_view.get_node("%AddResourceCell").disabled = _read_only or _waiting or resource.get("kind", "") != "stamp"
	_view.get_node("%HoleResourceCell").disabled = _read_only or _waiting or resource.get("kind", "") != "stamp" or selected.is_empty() or resource.get("cells", []).size() < 2


func pending() -> bool:
	return _waiting


func reset() -> void:
	_generation += 1; _waiting = false; _source.clear(); _candidate.clear()
	_view.get_node("%ConfirmGeometry").hide()


func _resize() -> void:
	var resource: Dictionary = _read.call()
	_request({"operation": "resize", "width": int(_view.get_node("%ResourceWidth").value),
		"height": int(_view.get_node("%ResourceHeight").value), "fill": _selected_tile(resource)})


func _add() -> void:
	var resource: Dictionary = _read.call()
	_request({"operation": "set-cell", "x": int(_view.get_node("%ResourceCellX").value),
		"y": int(_view.get_node("%ResourceCellY").value), "tile": _selected_tile(resource)})


func _hole() -> void:
	var resource: Dictionary = _read.call()
	var selected: PackedInt32Array = _view.get_node("%ResourceCells").get_selected_items()
	if selected.is_empty() or resource.is_empty(): return
	var cell: Dictionary = resource.cells[selected[0]]
	_request({"operation": "remove-cell", "x": int(cell.x), "y": int(cell.y)})


func _selected_tile(resource: Dictionary) -> int:
	var selected: PackedInt32Array = _view.get_node("%ResourceCells").get_selected_items()
	return int(resource.cells[selected[0] if not selected.is_empty() else 0].tile)


func _select(index: int) -> void:
	var resource: Dictionary = _read.call()
	if resource.is_empty() or index >= resource.cells.size(): return
	_view.get_node("%ResourceCellX").value = int(resource.cells[index].x)
	_view.get_node("%ResourceCellY").value = int(resource.cells[index].y)


func _request(edit: Dictionary) -> void:
	if _read_only or _waiting: return
	_source = _read.call().duplicate(true); _waiting = true; _generation += 1
	state_changed.emit(); preview_requested.emit(_source.duplicate(true), edit, _generation)


func present(response: Dictionary, generation: int) -> void:
	if generation != _generation or _read.call() != _source or not _view.visible: return
	if not response.get("ok", false):
		_cancel(); _view.present_error(str(response.get("error", "The geometry could not be reviewed."))); return
	_candidate = response.result.duplicate(true)
	var preview: Dictionary = _candidate.preview
	var removed: Array = preview.removed
	var details := "%d × %d · %d cells\n%d cells added · %d removed" % [int(preview.resource.width), int(preview.resource.height), preview.resource.cells.size(), int(preview.added), removed.size()]
	if not removed.is_empty():
		details += "\nRemoved: " + ", ".join(removed.slice(0, 12).map(func(cell): return "(%d, %d)" % [int(cell.x), int(cell.y)]))
		if removed.size() > 12: details += " …"
	if preview.resource.kind == "stamp": details += "\nHoles leave destination cells untouched. Tile 0 clears a cell."
	else: details += "\nNew palette cells use the selected tile."
	details += "\nAccept stages this geometry. Save collection changes commits it."
	_view.get_node("%ConfirmGeometry").dialog_text = details
	_view.get_node("%ConfirmGeometry").popup_centered(Vector2i(520, 260))


func _accept() -> void:
	if _candidate.is_empty() or _read.call() != _source: _cancel(); return
	var candidate := _candidate.duplicate(true)
	reset(); changed.emit(candidate.preview.resource, candidate.renderCells); state_changed.emit()
	_view.get_node("%ResourceCells").grab_focus()


func _cancel() -> void:
	reset(); state_changed.emit()
	_view.get_node("%ResourceCells").grab_focus()
