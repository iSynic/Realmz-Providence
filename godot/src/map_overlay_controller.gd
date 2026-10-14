extends Node

var _canvas: ProvidenceMapCanvas
var _filters: Control
var _regions: Control
var _overlay: Control
var _identity := ""


func initialize(canvas: ProvidenceMapCanvas, filters: Control, regions: Control, overlay: Control) -> void:
	_canvas = canvas; _filters = filters; _regions = regions; _overlay = overlay
	filters.changed.connect(_view_changed)
	regions.display_changed.connect(_display_changed)
	regions.regions_changed.connect(_entries_changed)


func set_projection(result: Dictionary) -> void:
	var map: Dictionary = result.get("map", {})
	_identity = str(map.get("identity", ""))
	var hints: Dictionary = result.get("viewOverlays", {})
	var runtime: Dictionary = map.get("runtime") if map.get("runtime") is Dictionary else {}
	_overlay.set_hints(hints)
	_filters.set_action_points(result.get("actionPoints", []), hints.get("unmatchedEntryMarkers", []))
	_filters.set_context(_identity, runtime.get("randomRectangles", []), hints.get("playerMaps", []))
	_entries_changed()


func _view_changed(flags: Dictionary, rectangles: Array, footprints: Array) -> void:
	_canvas.set_real_tiles_visible(bool(flags.realTiles)); _canvas.set_action_points_visible(bool(flags.actionPoints))
	_canvas.set_action_point_filters(flags.get("actionPointFilters", {}))
	_canvas.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR if flags.smooth else CanvasItem.TEXTURE_FILTER_NEAREST
	_overlay.configure(flags, footprints)
	_regions.filter_active = true; _regions.visible_ids.clear()
	for row: Dictionary in rectangles: _regions.visible_ids[str(row.identity)] = true
	if _regions.display_enabled != bool(flags.randomRectangles): _regions.set_display_enabled(bool(flags.randomRectangles))
	_regions.queue_redraw()


func _display_changed(enabled: bool) -> void:
	var state: RefCounted = _filters.state
	if bool(state.flags.randomRectangles) != enabled and not state.entries.randomRectangles.is_empty(): state.set_flag("randomRectangles", enabled)


func _entries_changed() -> void:
	if _filters.state.identity != _identity or _regions.map_identity != _identity: return
	var rows: Array = _regions.regions.duplicate(true)
	var displayed: bool = _regions.display_enabled
	if not _regions.draft.is_empty() and not rows.any(func(row): return row.identity == _regions.draft.identity): rows.append(_regions.draft.duplicate(true))
	_filters.set_context(_identity, rows, _filters.state.entries.playerMaps)
	if displayed and not _filters.state.flags.randomRectangles: _filters.state.set_flag("randomRectangles", true)
