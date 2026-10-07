extends Control

signal bounds_staged(bounds: Rect2i)
signal drawing_canceled
signal display_changed(enabled: bool)
signal regions_changed

var regions: Array = []
var draft: Dictionary = {}
var selected_slot := -1
var drawing := false
var display_enabled := false
var map_identity := ""
var _anchor := Vector2i(-1, -1)
var _endpoint := Vector2i(-1, -1)
var _canvas: ProvidenceMapCanvas
var filter_active := false
var visible_ids: Dictionary = {}


func create_image_export_overlay() -> Control:
	var copy := preload("res://src/random_region_overlay.gd").new()
	copy.regions = regions.duplicate(true)
	copy.display_enabled = display_enabled
	copy.filter_active = filter_active
	copy.visible_ids = visible_ids.duplicate()
	return copy


func _ready() -> void:
	_canvas = get_parent()
	_canvas.draw.connect(queue_redraw)
	mouse_filter = MOUSE_FILTER_IGNORE
	focus_mode = FOCUS_ALL
	clip_contents = true


func configure(rows: Array, selected: Dictionary, slot: int) -> void:
	regions = rows.duplicate(true)
	draft = selected.duplicate(true)
	selected_slot = slot
	regions_changed.emit()
	queue_redraw()


func set_document(identity: String, rows: Array) -> void:
	if map_identity != identity: clear_draft()
	map_identity = identity
	regions = rows.duplicate(true)
	regions_changed.emit()
	queue_redraw()


func clear_draft() -> void:
	set_drawing(false)
	draft.clear()
	selected_slot = -1
	regions_changed.emit()
	queue_redraw()


func set_display_enabled(enabled: bool) -> void:
	display_enabled = enabled
	visible = enabled
	if not enabled:
		set_drawing(false)
		drawing_canceled.emit()
	display_changed.emit(enabled)


func set_drawing(enabled: bool) -> void:
	cancel_gesture()
	if enabled: set_display_enabled(true)
	drawing = enabled
	mouse_filter = MOUSE_FILTER_STOP if enabled else MOUSE_FILTER_IGNORE
	if enabled: grab_focus()


func cancel_gesture() -> void:
	_anchor = Vector2i(-1, -1)
	_endpoint = _anchor
	queue_redraw()


func _cell(position: Vector2) -> Vector2i:
	var origin := _canvas.cell_rect(Vector2i.ZERO)
	return Vector2i((position - origin.position) / origin.size).clamp(Vector2i.ZERO, Vector2i(89, 89))


func _gui_input(event: InputEvent) -> void:
	if not drawing: return
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		if event.pressed:
			if not _map_rect().has_point(event.position): return
			_anchor = _cell(event.position); _endpoint = _anchor
		elif _anchor.x >= 0:
			_endpoint = _cell(event.position)
			bounds_staged.emit(_gesture_bounds())
			cancel_gesture()
		accept_event(); queue_redraw()
	elif event is InputEventMouseMotion and _anchor.x >= 0:
		_endpoint = _cell(event.position)
		accept_event(); queue_redraw()
	elif event.is_action_pressed("ui_cancel"):
		cancel_gesture(); set_drawing(false); drawing_canceled.emit(); accept_event()


func _notification(what: int) -> void:
	if what in [NOTIFICATION_APPLICATION_FOCUS_OUT, NOTIFICATION_VISIBILITY_CHANGED] and is_inside_tree(): cancel_gesture()


func _gesture_bounds() -> Rect2i:
	return Rect2i(_anchor.min(_endpoint), _anchor.max(_endpoint) - _anchor.min(_endpoint) + Vector2i.ONE)


func _map_rect() -> Rect2:
	var first := _canvas.cell_rect(Vector2i.ZERO)
	return Rect2(first.position, first.size * 90)


func _draw() -> void:
	if _canvas == null: return
	for row: Dictionary in regions:
		if row.is_empty() or row.identity == draft.get("identity"): continue
		if filter_active and not visible_ids.has(str(row.identity)): continue
		_draw_region(row, Color("ffd37a"), false)
	if not draft.is_empty() and (not filter_active or visible_ids.has(str(draft.identity))): _draw_region(draft, Color(0.61, 0.81, 1, 1), true)
	if _anchor.x >= 0:
		var bounds := _gesture_bounds()
		_draw_region({"left": bounds.position.x, "top": bounds.position.y, "right": bounds.end.x, "bottom": bounds.end.y}, Color(0.96, 0.78, 0.38, 1), true)


func _draw_region(row: Dictionary, color: Color, fill: bool) -> void:
	var left := clampi(int(row.left), 0, 90); var top := clampi(int(row.top), 0, 90)
	var right := clampi(int(row.right), 0, 90); var bottom := clampi(int(row.bottom), 0, 90)
	if left >= right or top >= bottom: return
	var first := _canvas.cell_rect(Vector2i(left, top))
	var rectangle := Rect2(first.position, first.size * Vector2(right - left, bottom - top))
	if fill: draw_rect(rectangle, Color(color, 0.14))
	draw_rect(rectangle, color, false, 2)
	if row.has("identity"):
		draw_string(get_theme_default_font(),rectangle.position+Vector2(3,14),"R"+str(row.identity).get_slice(":rect:",1),HORIZONTAL_ALIGNMENT_LEFT,-1,11,color)
