extends PopupMenu

var item_opener: Callable
var source_opener: Callable
var _bridge
var _asset_identity := ""
var _revision := 0
var _offset := 0
var _rows: Array = []
var operations: ProvidenceEditorOperation
var _generation := 0
var _busy := false


func _ready() -> void:
	id_pressed.connect(_activate)
	add_theme_color_override("font_disabled_color", get_theme_color("font_color"))


func reset() -> void:
	_generation += 1
	hide()
	clear()
	_rows.clear()
	_bridge = null
	_offset = 0


func show_uses(bridge, identity: String, anchor: Control) -> void:
	if _busy or (operations != null and operations.busy): return
	reset()
	_bridge = bridge
	_asset_identity = identity
	add_item("Checking artwork uses…")
	set_item_disabled(0, true)
	position = Vector2i(anchor.get_screen_position() + Vector2(0, anchor.size.y))
	popup()
	var state := await _run("Read artwork uses", _read_first_page)
	if state.get("discarded", false): return
	clear()
	if not state.get("ok", false):
		add_item(str(state.get("error", "Artwork uses unavailable.")))
		set_item_disabled(0, true)
	else:
		_present_page(state)


func _read_first_page(request: Callable) -> Dictionary:
	var state: Dictionary = await request.call("session.describe")
	if not state.get("ok", false): return state
	_revision = int(state.result.revision)
	return await _request(request)


func _run(label: String, workflow: Callable) -> Dictionary:
	if _busy: return {"ok": false, "busy": true}
	var generation := _generation
	_busy = true
	var response: Dictionary
	if operations == null:
		response = await workflow.call(_bridge.request)
	else:
		response = await operations.browse_media(_bridge, func(operation): return await workflow.call(operation.request))
	_busy = false
	if generation != _generation: return {"ok": false, "discarded": true}
	return response


func _request(request: Callable) -> Dictionary:
	var response: Dictionary = await request.call("project-asset.open", {"identity": _asset_identity, "expectedRevision": _revision, "offset": _offset, "limit": 32})
	if response.get("ok", false):
		var result: Dictionary = response.get("result", {})
		if str(result.get("asset", {}).get("identity", "")) != _asset_identity or int(result.get("revision", -1)) != _revision or not result.get("useTargets") is Array or not result.get("paging") is Dictionary:
			return {"ok": false, "error": "Artwork uses could not be verified. Recheck this artwork."}
	return response


func _load_page() -> void:
	var response := await _run("Read more artwork uses", _request)
	if response.get("discarded", false): return
	clear()
	_rows.clear()
	if not response.get("ok", false):
		add_item(str(response.get("error", "Artwork uses changed. Search again.")))
		set_item_disabled(0, true)
		return
	_present_page(response)


func _present_page(response: Dictionary) -> void:
	_rows = (response.result.get("useTargets", []) as Array).slice(0, 32)
	for row: Dictionary in _rows:
		add_item("%s · %s%s" % [str(row.label), str(row.field), "" if _can_open(row) else " — editor unavailable"])
		set_item_disabled(item_count - 1, not _can_open(row))
		set_item_tooltip(item_count - 1, "Open the source record to repair this use." if _can_open(row) else "This use is retained, but opening its editor from Assets is not connected yet.")
	if _rows.is_empty():
		add_item("No known uses")
		set_item_disabled(0, true)
	elif response.result.get("paging", {}).get("usedByTruncated", false):
		add_separator()
		add_item("More uses…", 100)


func _activate(id: int) -> void:
	if _busy or (operations != null and operations.busy): return
	if id == 100:
		if _rows.is_empty():
			return
		_offset += _rows.size()
		await _load_page()
		call_deferred("_show_again")
		return
	if id < 0 or id >= _rows.size() or not _can_open(_rows[id]):
		return
	var selected: Dictionary = _rows[id].duplicate(true)
	var response := await _run("Recheck selected artwork use", _request)
	if response.get("discarded", false): return
	if not response.get("ok", false) or not response.result.get("useTargets", []).has(selected):
		clear()
		_rows.clear()
		add_item("Artwork uses changed. Search again.")
		set_item_disabled(0, true)
		call_deferred("_show_again")
		return
	if selected.sourceKind == "item":
		item_opener.call(str(selected.source))
	else:
		source_opener.call(selected)


func _can_open(row: Dictionary) -> bool:
	if row.get("sourceKind", "") == "item": return item_opener.is_valid()
	return source_opener.is_valid() and str(row.get("source", "")).get_slice(":", 0) in ["land", "dungeon", "map", "player-map", "monster", "battle", "spell", "action-point", "extra-action-point", "simple-encounter", "complex-encounter", "rogue-encounter", "timed-encounter"]


func _show_again() -> void:
	if _bridge != null:
		popup()
