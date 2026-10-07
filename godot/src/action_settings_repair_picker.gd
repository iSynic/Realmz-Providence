extends Window

signal chosen(field: String, identity: String)

const Content = preload("res://src/action_settings_repair_picker_content.tscn")
var _bridge
var _draft: Dictionary
var _field := ""
var _offset := 0
var _total := 0
var _items: Array = []
var _search: LineEdit
var _list: ItemList
var _status: Label
var _choose: Button
var _previous: Button
var _next: Button
var operations: ProvidenceEditorOperation
var _generation := 0
var _requested := false
var _loading := false


func _ready() -> void:
	title = "Choose a target"
	transient = true
	exclusive = true
	unresizable = true
	min_size = Vector2i(680, 520)
	size = Vector2i(680, 520)
	var content := Content.instantiate()
	add_child(content)
	_search = content.get_node("Choices/Search")
	_list = content.get_node("Choices/Results")
	_status = content.get_node("Choices/Status")
	_previous = content.get_node("Choices/Footer/Previous")
	_next = content.get_node("Choices/Footer/Next")
	_choose = content.get_node("Choices/Footer/Choose")
	_search.text_changed.connect(func(_value): _offset = 0; refresh())
	_list.item_selected.connect(func(_index): _choose.disabled = false)
	_list.item_activated.connect(func(_index): _commit())
	_previous.pressed.connect(func(): _offset = maxi(0, _offset - 8); refresh())
	_next.pressed.connect(func(): _offset += 8; refresh())
	content.get_node("Choices/Footer/Cancel").pressed.connect(hide)
	_choose.pressed.connect(_commit)
	close_requested.connect(hide)
	visibility_changed.connect(func():
		if not visible:
			_generation += 1
			_requested = false)


func open_choices(bridge, draft: Dictionary, field: String) -> void:
	_bridge = bridge
	_draft = draft.duplicate(true)
	_field = field
	_offset = 0
	_search.set_text("")
	_search.visible = field != "uses"
	_choose.visible = field != "uses"
	title = "Affected actions" if field == "uses" else "Choose " + field.capitalize()
	_choose.text = "Choose " + field.capitalize()
	popup_centered(size)
	refresh()
	if _search.visible: _search.grab_focus()
	else: _list.grab_focus()


func refresh() -> void:
	_generation += 1
	_requested = true
	_list.clear()
	_items = []
	_choose.disabled = true
	_previous.disabled = true
	_next.disabled = true
	_status.text = "Loading choices…"
	if not _loading: _load_latest.call_deferred()


func _load_latest() -> void:
	if _loading: return
	_loading = true
	while _requested and visible:
		while operations.busy and visible: await get_tree().process_frame
		if not visible: break
		_requested = false
		var generation := _generation
		var response: Dictionary = await _load_page()
		if generation == _generation and visible: _present_page(response)
	_loading = false


func _load_page() -> Dictionary:
	var params := {"draft": _draft, "offset": _offset, "limit": 8}
	var method := "action-settings.repair-uses"
	if _field != "uses":
		params.merge({"field": _field, "query": _search.text})
		method = "action-settings.repair-choices"
	return await operations.run_workflow(_bridge, "", func(op): return await op.request(method, params))


func _present_page(response: Dictionary) -> void:
	if not response.get("ok", false):
		_status.text = "Could not refresh choices. Cancel keeps your selection. " + str(response.get("error", ""))
		_previous.disabled = true
		_next.disabled = true
		return
	var page: Dictionary = response.result
	_items = page.items
	_total = int(page.total)
	for item: Dictionary in _items:
		var index := _list.add_item(str(item.label) + (" · " + str(item.detail) if item.has("detail") else ""))
		_list.set_item_disabled(index, not bool(item.get("selectable", true)))
	_previous.disabled = _offset == 0
	_next.disabled = _offset + _items.size() >= _total
	_status.text = "No matches." if _total == 0 else "%d–%d of %d" % [_offset + 1, _offset + _items.size(), _total]
	if _field == "uses": _status.text += " · The repair scope includes every affected action, not just this page."


func _commit() -> void:
	if _field == "uses" or _choose.disabled: return
	var selected := _list.get_selected_items()
	if selected.size() != 1: return
	var item: Dictionary = _items[selected[0]]
	if not item.get("selectable", false): return
	hide()
	chosen.emit(_field, str(item.identity))


func _input(event: InputEvent) -> void:
	if visible and event is InputEventKey and event.pressed and not event.echo and event.keycode == KEY_ESCAPE:
		get_viewport().set_input_as_handled()
		hide()
