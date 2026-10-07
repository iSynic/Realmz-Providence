class_name ProvidenceDivinityManualReader
extends Window

var _catalog := ProvidenceDivinityHelpCatalog.new()
var _visible_sections: Array = []
var _history: Array[int] = []
var _history_index := -1
var _page := 1
var _zoom := 1.25
var _origin: Control
var _positions: Dictionary = {}
var _available := false
@onready var _search: LineEdit = %ManualSearch
@onready var _contents: ItemList = %ManualContents
@onready var _title: Label = %ManualTitle
@onready var _canvas = %ManualPage
@onready var _scroll: ScrollContainer = %PageScroll


func _ready() -> void:
	close_requested.connect(close_reader)
	_search.text_changed.connect(_filter)
	_contents.item_selected.connect(_select)
	%ManualBack.pressed.connect(func(): _travel(-1))
	%ManualForward.pressed.connect(func(): _travel(1))
	%PreviousPage.pressed.connect(func(): _show_page(_page - 1, true))
	%NextPage.pressed.connect(func(): _show_page(_page + 1, true))
	%ZoomOut.pressed.connect(func(): _set_zoom(_zoom - 0.25))
	%ZoomIn.pressed.connect(func(): _set_zoom(_zoom + 0.25))
	%ZoomFit.pressed.connect(func(): _set_zoom((_scroll.size.x - 16) / 578.0))
	_canvas.attach_scroll(_scroll)
	_canvas.link_requested.connect(_follow_link)
	var error := _catalog.load_bundled()
	_available = error.is_empty()
	if not _available: _title.text = error
	else: _filter("")
	_update_controls()


func open_page(page: int = 1, origin: Control = null) -> void:
	_origin = origin if origin != null else get_parent().get_viewport().gui_get_focus_owner()
	popup_centered_clamped(Vector2i(1180, 800), 0.9)
	_show_page(page, true)
	_contents.grab_focus()


func close_reader() -> void:
	hide()
	if is_instance_valid(_origin):
		_origin.get_window().grab_focus()
		_origin.grab_focus()


func current_page() -> int:
	return _page


func _input(event: InputEvent) -> void:
	if not visible or not event is InputEventKey or not event.pressed or event.echo: return
	if event.keycode == KEY_ESCAPE: close_reader()
	elif event.alt_pressed and event.keycode == KEY_LEFT: _travel(-1)
	elif event.alt_pressed and event.keycode == KEY_RIGHT: _travel(1)
	elif event.ctrl_pressed and event.keycode == KEY_PAGEUP: _show_page(_page - 1, true)
	elif event.ctrl_pressed and event.keycode == KEY_PAGEDOWN: _show_page(_page + 1, true)
	elif event.ctrl_pressed and event.keycode == KEY_C:
		if get_viewport().gui_get_focus_owner() is LineEdit: return
		# Page artwork is immutable; its original source text remains copyable.
		var section: Dictionary = _catalog.sections[_page - 1]
		DisplayServer.clipboard_set(str(section.text))
	else: return
	get_viewport().set_input_as_handled()


func _filter(query: String) -> void:
	_visible_sections = _catalog.matching_sections(query)
	_contents.clear()
	for section: Dictionary in _visible_sections:
		_contents.add_item("%02d  %s" % [int(section.page), section.title])
		_contents.set_item_tooltip(_contents.item_count - 1, str(section.title))
	%SearchStatus.text = "%d chapters" % _visible_sections.size() if not _visible_sections.is_empty() else "No matching chapters"
	_sync_contents()


func _select(index: int) -> void:
	if index >= 0 and index < _visible_sections.size():
		_show_page(int(_visible_sections[index].page), true)


func _show_page(page: int, remember: bool) -> void:
	if not _available or not _catalog.layouts.has(page): return
	_positions[_page] = Vector2i(_scroll.scroll_horizontal, _scroll.scroll_vertical)
	if remember and (_history.is_empty() or _history[_history_index] != page):
		_history = _history.slice(0, _history_index + 1)
		_history.append(page)
		_history_index = _history.size() - 1
	_page = page
	var layout: Dictionary = _catalog.layouts[page]
	_title.text = "%02d / 38 · %s" % [page, layout.title]
	_canvas.present(layout, _zoom)
	var position: Vector2i = _positions.get(page, Vector2i.ZERO) if not remember else Vector2i.ZERO
	_scroll.set_deferred("scroll_horizontal", position.x)
	_scroll.set_deferred("scroll_vertical", position.y)
	_sync_contents()
	_update_controls()


func _sync_contents() -> void:
	for index in _visible_sections.size():
		if int(_visible_sections[index].page) == _page:
			_contents.select(index)
			_contents.ensure_current_is_visible()
			return
	_contents.deselect_all()


func _travel(offset: int) -> void:
	var next := _history_index + offset
	if next < 0 or next >= _history.size(): return
	_history_index = next
	_show_page(_history[_history_index], false)


func _set_zoom(value: float) -> void:
	var fraction := Vector2(_scroll.scroll_horizontal, _scroll.scroll_vertical) / _zoom
	_zoom = clampf(value, 0.5, 2.0)
	_canvas.present(_catalog.layouts.get(_page, {}), _zoom)
	_scroll.set_deferred("scroll_horizontal", int(fraction.x * _zoom))
	_scroll.set_deferred("scroll_vertical", int(fraction.y * _zoom))
	_update_controls()


func _follow_link(target: String) -> void:
	if target.begins_with("#page-"):
		_show_page(target.trim_prefix("#page-").to_int(), true)
	elif target == "#top": _scroll.scroll_vertical = 0
	elif target.begins_with("https://") or target.begins_with("http://") or target.begins_with("mailto:"):
		OS.shell_open(target)


func _update_controls() -> void:
	%ManualBack.disabled = _history_index <= 0
	%ManualForward.disabled = _history_index < 0 or _history_index + 1 >= _history.size()
	%PreviousPage.disabled = not _available or _page == 1
	%NextPage.disabled = not _available or _page == 38
	%ZoomOut.disabled = not _available or _zoom <= 0.5
	%ZoomIn.disabled = not _available or _zoom >= 2.0
	%ZoomFit.disabled = not _available
	%ZoomValue.text = "%d%%" % roundi(_zoom * 100)
