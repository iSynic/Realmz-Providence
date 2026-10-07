extends Window

signal accepted(identity: String, context: Dictionary)
signal search_requested(query: Dictionary, generation: int)

var context: Dictionary = {}
var generation := 0
var _rows: Array = []
var _offset := 0
var _focus: Control


func _ready() -> void:
	%Search.text_changed.connect(func(_value: String): _search(0))
	%Search.text_submitted.connect(func(_value: String): _accept())
	%Choices.item_selected.connect(_preview)
	%Choices.item_activated.connect(func(index: int): _preview(index); _accept())
	%UseSelection.pressed.connect(_accept)
	%Cancel.pressed.connect(cancel)
	close_requested.connect(cancel)
	%Previous.pressed.connect(func(): _search(maxi(0, _offset - 64)))
	%Next.pressed.connect(func(): _search(_offset + 64))


func begin(destination: Dictionary, focus: Control) -> void:
	cancel(false)
	context = destination.duplicate(true)
	var kind := str(context.get("levelType", "land"))
	title = "Choose " + kind + " map"
	%Search.placeholder_text = "Search %s name or number…" % kind
	%UseSelection.text = "Use " + kind
	_focus = focus
	%Search.text = ""
	%Destination.text = str(context.get("destination", "Scenario · Startup · Land"))
	popup_centered(Vector2i(960, 620))
	%Search.grab_focus()
	_search(0)


func _search(offset: int) -> void:
	if not visible or context.is_empty(): return
	generation += 1
	_offset = offset
	_rows.clear()
	%Choices.clear()
	%Details.text = ""
	%UseSelection.disabled = true
	%Count.text = "Loading %s maps…" % str(context.get("levelType", "land"))
	%Previous.disabled = true
	%Next.disabled = true
	search_requested.emit({"levelType": str(context.get("levelType", "land")), "query": %Search.text, "offset": offset, "limit": 64}, generation)


func receive_page(response: Dictionary, request_generation: int) -> void:
	if request_generation != generation or not visible: return
	if not response.get("ok", false):
		%Count.text = str(response.get("error", "Map catalog unavailable."))
		return
	var page: Dictionary = response.result
	_offset = int(page.get("offset", _offset))
	_rows = page.get("items", [])
	var current := -1
	for index in _rows.size():
		var row: Dictionary = _rows[index]
		%Choices.add_item("%s %d · %s" % [str(row.get("levelType", "land")).capitalize(), int(row.get("nativeIndex", 0)), str(row.get("name", row.identity))])
		if str(row.identity) == str(context.get("current", "")): current = index
	%Count.text = "%d maps match" % int(page.get("total", 0))
	%Previous.disabled = _offset == 0
	%Next.disabled = not page.get("truncated", false)
	if current >= 0:
		%Choices.select(current)
		%Choices.ensure_current_is_visible()
		_preview(current)
	elif _rows.is_empty(): %Details.text = "No matching maps."


func _preview(index: int) -> void:
	if index < 0 or index >= _rows.size(): return
	var row: Dictionary = _rows[index]
	%Details.text = "%s\n%s %d · 90 × 90 tiles\n%s" % [str(row.get("name", row.identity)), str(row.get("levelType", "land")).capitalize(), int(row.get("nativeIndex", 0)), str(context.get("description", "Startup land"))]
	%UseSelection.disabled = false


func _accept() -> void:
	var selection: PackedInt32Array = %Choices.get_selected_items()
	if %UseSelection.disabled or selection.is_empty(): return
	var identity := str(_rows[selection[0]].identity)
	var destination := context.duplicate(true)
	cancel()
	accepted.emit(identity, destination)


func cancel(restore := true) -> void:
	generation += 1
	context.clear()
	hide()
	if restore and is_instance_valid(_focus): _focus.call_deferred("grab_focus")
	_focus = null


func _unhandled_key_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and event.keycode == KEY_ESCAPE:
		cancel()
		get_viewport().set_input_as_handled()
