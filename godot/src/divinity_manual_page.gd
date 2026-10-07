extends Control

signal link_requested(target: String)

const ASSET_ROOT := "res://data/divinity_help/pages/"
var page: Dictionary = {}
var zoom := 1.25
var _scroll: ScrollContainer
var _textures: Dictionary = {}
var _hovered := ""


func attach_scroll(scroll: ScrollContainer) -> void:
	_scroll = scroll
	scroll.get_v_scroll_bar().value_changed.connect(func(_value): queue_redraw())
	scroll.get_h_scroll_bar().value_changed.connect(func(_value): queue_redraw())
	scroll.resized.connect(queue_redraw)


func present(layout: Dictionary, scale: float) -> void:
	page = layout
	zoom = scale
	_textures.clear()
	_hovered = ""
	custom_minimum_size = Vector2(float(page.get("width", 578)), float(page.get("height", 0))) * zoom
	queue_redraw()


func loaded_strip_count() -> int:
	return _textures.size()


func _draw() -> void:
	if page.is_empty() or _scroll == null: return
	draw_rect(Rect2(Vector2.ZERO, size), Color.WHITE)
	var top := maxf(0, _scroll.get_global_rect().position.y - global_position.y) / zoom
	var bottom := top + _scroll.size.y / zoom
	var retained: Array = []
	for strip: Dictionary in page.strips:
		var y := float(strip.y)
		var height := float(strip.height)
		if y + height < top - 1024 or y > bottom + 1024: continue
		var asset := str(strip.asset)
		retained.append(asset)
		if not _textures.has(asset):
			_textures[asset] = load(ASSET_ROOT + asset) as Texture2D
		var texture: Texture2D = _textures[asset]
		if texture != null:
			draw_texture_rect(texture, Rect2(0, y * zoom, float(page.width) * zoom, height * zoom), false)
	for asset in _textures.keys():
		if asset not in retained: _textures.erase(asset)


func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion:
		_hovered = _link_at(event.position / zoom)
		mouse_default_cursor_shape = Control.CURSOR_ARROW if _hovered.is_empty() else Control.CURSOR_POINTING_HAND
	elif event is InputEventMouseButton and event.pressed:
		if event.button_index == MOUSE_BUTTON_LEFT:
			var target := _link_at(event.position / zoom)
			if not target.is_empty():
				link_requested.emit(target)
				accept_event()


func _link_at(position: Vector2) -> String:
	for link: Dictionary in page.get("links", []):
		for box: Array in link.rects:
			if Rect2(float(box[0]), float(box[1]), float(box[2]), float(box[3])).has_point(position):
				return str(link.target)
	return ""
