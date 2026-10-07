extends PanelContainer

signal page_requested(role: String, query: String, offset: int, origin: String)
signal source_requested(reference: Dictionary)

@export var role := "checks"
var _page: Dictionary = {}
var _origin := ""
var _restore_scroll := -1.0
var _timer: Timer
var _interaction := 0
var _rendering := false
@onready var _rows := %QuestFlow as Tree
@onready var _filter := %RoleFilter as LineEdit
@onready var _count := %RoleCount as Label

func _ready() -> void:
	_rows.item_activated.connect(open_selected)
	_rows.item_selected.connect(_selection_changed)
	_timer = Timer.new()
	_timer.one_shot = true
	_timer.wait_time = 0.18
	add_child(_timer)
	_timer.timeout.connect(func(): page_requested.emit(role, _filter.text, 0, ""))
	_filter.text_changed.connect(func(_query: String): _interaction += 1; _timer.start())
	%Previous.pressed.connect(func(): page_requested.emit(role, _filter.text, maxi(0, int(_page.get("offset", 0)) - 64), ""))
	%Next.pressed.connect(func(): page_requested.emit(role, _filter.text, int(_page.get("offset", 0)) + 64, ""))
	%OpenSource.pressed.connect(open_selected)
	%Refresh.pressed.connect(func(): page_requested.emit(role, _filter.text, int(_page.get("offset", 0)), ""))
	%RoleTitle.text = "CALLERS / CHECKS" if role == "checks" else "SETTERS / CHANGES"
	%RoleTitle.theme_type_variation = &"ChecksHeading" if role == "checks" else &"ChangesHeading"
	theme_type_variation = &"ChecksPanel" if role == "checks" else &"ChangesPanel"
	_rows.hide_root = true

func set_page(page: Dictionary) -> void:
	_rendering = true
	_page = page.duplicate(true)
	_rows.clear()
	var root := _rows.create_item()
	for value: Dictionary in _page.get("items", []):
		var item := _rows.create_item(root)
		var meaning := str(value.get("condition", "")) if role == "checks" else str(value.get("effect", ""))
		if role == "changes" and value.get("checks", false): meaning += " · " + str(value.get("condition", ""))
		item.set_text(0, "%s\n%s %s" % [value.get("sourceLabel", value.get("source", "")), meaning, value.get("branch", "")])
		item.set_tooltip_text(0, item.get_text(0))
		item.set_metadata(0, value)
		if value.get("occurrence", "") == _origin:
			item.select(0)
			_rows.scroll_to_item(item)
	var total := int(_page.get("total", 0))
	var offset := int(_page.get("offset", 0))
	_count.text = "%d shown · %d %s · %d–%d" % [(_page.get("items", []) as Array).size(), total, role, offset + 1 if total > 0 else 0, mini(offset + 64, total)]
	%Previous.disabled = offset == 0
	%Next.disabled = offset + 64 >= total
	if _restore_scroll >= 0.0:
		preload("res://src/tree_scroll_state.gd").restore(_rows, Vector2(0, _restore_scroll))
		_restore_scroll = -1.0
	_rendering = false
	_selection_changed(false)

func highlight_origin(occurrence: String) -> void:
	_origin = occurrence
	if (_page.get("items", []) as Array).any(func(row): return row.get("occurrence", "") == occurrence): set_page(_page)
	else: page_requested.emit(role, "", 0, occurrence)

func accept_origin(page: Dictionary) -> void:
	if not page.get("originFound", false): return
	_filter.set_block_signals(true)
	_filter.text = ""
	_filter.set_block_signals(false)
	set_page(page)

func open_selected() -> void:
	var item := _rows.get_selected()
	if item != null and item.get_metadata(0) is Dictionary:
		var reference: Dictionary = item.get_metadata(0).duplicate(true)
		reference["expectedRevision"] = _page.get("revision", -1)
		source_requested.emit(reference)

func state() -> Dictionary:
	var item := _rows.get_selected()
	return {"query": _filter.text, "offset": _page.get("offset", 0), "selected": item.get_metadata(0).get("occurrence", "") if item != null else "", "scroll": _rows.get_scroll().y}

func interaction_token() -> int:
	return _interaction

func restore(state: Dictionary) -> void:
	_interaction += 1
	_filter.set_block_signals(true)
	_filter.text = str(state.get("query", ""))
	_filter.set_block_signals(false)
	_origin = str(state.get("selected", ""))
	_restore_scroll = float(state.get("scroll", 0.0))
	page_requested.emit(role, _filter.text, int(state.get("offset", 0)), "")

func reset() -> void:
	_interaction += 1
	_timer.stop()
	_filter.set_block_signals(true)
	_filter.text = ""
	_filter.set_block_signals(false)
	_origin = ""
	_restore_scroll = -1.0
	set_page({})

func show_failure(message: String) -> void:
	_rows.clear()
	_count.text = message + " · Refresh to retry."
	%OpenSource.disabled = true
	%Previous.disabled = true
	%Next.disabled = true

func _selection_changed(user_interaction := true) -> void:
	if user_interaction and not _rendering: _interaction += 1
	%OpenSource.disabled = _rows.get_selected() == null
