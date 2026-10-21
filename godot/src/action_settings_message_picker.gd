extends Window

signal choice_requested(field: String, identity: Variant, waits: bool)
var operations: ProvidenceEditorOperation
var _bridge
var _draft: Dictionary = {}
var _field := ""
var _waits := true
var _items: Array = []
var _offset := 0
var _total := 0
var _generation := 0
var _requested := false
var _loading := false
var _submitting := false
@onready var body := {
	"Heading": $Panel/Inset/Body/Heading, "Caption": $Panel/Inset/Body/Caption,
	"Search": $Panel/Inset/Body/Search, "Wait": $Panel/Inset/Body/Wait,
	"Results": $Panel/Inset/Body/Results, "Pager": $Panel/Inset/Body/Pager,
	"NoMessage": $Panel/Inset/Body/NoMessage, "Selection": $Panel/Inset/Body/Selection,
	"Footer": $Panel/Inset/Body/Footer,
}


func _ready() -> void:
	body.Search.text_changed.connect(func(_text): _offset = 0; refresh())
	body.Results.item_selected.connect(func(_index): _selection())
	body.Results.item_activated.connect(func(_index): _choose())
	body.Wait.get_node("Pause").pressed.connect(func(): _waits = true; _selection())
	body.Wait.get_node("Continue").pressed.connect(func(): _waits = false; _selection())
	body.Pager.get_node("Previous").pressed.connect(func(): _offset = maxi(0, _offset - 4); refresh())
	body.Pager.get_node("Next").pressed.connect(func(): _offset += 4; refresh())
	body.NoMessage.pressed.connect(func(): choice_requested.emit(_field, null, false))
	body.Footer.get_node("Choose").pressed.connect(_choose)
	body.Footer.get_node("Cancel").pressed.connect(hide)
	close_requested.connect(func(): if not _submitting: hide())
	visibility_changed.connect(func():
		if not visible: _generation += 1; _requested = false)


func open_choices(bridge, draft: Dictionary, field: String) -> void:
	_bridge = bridge
	_draft = draft.duplicate(true)
	_field = field
	_waits = not str(draft.input[field]).begins_with("-")
	_offset = 0
	body.Heading.text = "Choose first message" if field == "firstMessage" else "Choose last message"
	body.Search.text = ""
	popup_centered(size)
	refresh()
	body.Search.grab_focus()


func refresh() -> void:
	_generation += 1
	_requested = true
	body.Results.clear()
	_items = []
	body.Pager.get_node("Status").text = "Loading messages…"
	_selection()
	if not _loading: _load_latest.call_deferred()


func _load_latest() -> void:
	if _loading: return
	_loading = true
	while _requested and visible:
		while operations.busy and visible: await get_tree().process_frame
		if not visible: break
		_requested = false
		var generation := _generation
		var params := {"draft": _draft, "field": _field, "query": body.Search.text, "offset": _offset, "limit": 4}
		var response: Dictionary = await operations.run_workflow(_bridge, "", func(op): return await op.request("action-settings.repair-choices", params))
		if generation != _generation or not visible: continue
		if not response.get("ok", false): show_error(str(response.get("error", "Could not load messages."))); continue
		_items = response.result.items
		_total = int(response.result.total)
		for item: Dictionary in _items:
			var index: int = body.Results.add_item(str(item.label) + " — " + str(item.detail))
			body.Results.set_item_disabled(index, not bool(item.selectable))
		body.Pager.get_node("Status").text = "Messages %d–%d of %d" % [_offset + 1, _offset + _items.size(), _total] if _total > 0 else "No matches"
		_selection()
	_loading = false


func set_submitting(value: bool) -> void:
	_submitting = value
	for control in [body.Search, body.Results, body.Wait.get_node("Pause"), body.Wait.get_node("Continue"), body.NoMessage, body.Footer.get_node("Cancel")]:
		if control is LineEdit: control.editable = not value
		elif control is ItemList: control.mouse_filter = Control.MOUSE_FILTER_IGNORE if value else Control.MOUSE_FILTER_STOP
		else: control.disabled = value
	_selection()


func _selection() -> void:
	body.Wait.get_node("Pause").text = ("● " if _waits else "○ ") + "Pause for a click"
	body.Wait.get_node("Continue").text = ("○ " if _waits else "● ") + "Continue immediately"
	var selected: PackedInt32Array = body.Results.get_selected_items()
	var valid := selected.size() == 1 and selected[0] < _items.size() and bool(_items[selected[0]].selectable)
	body.Footer.get_node("Choose").disabled = _submitting or not valid
	body.Pager.get_node("Previous").disabled = _submitting or _offset == 0
	body.Pager.get_node("Next").disabled = _submitting or _offset + _items.size() >= _total
	body.Footer.get_node("Choose").text = "Choose " + str(_items[selected[0]].label) if valid else "Choose Message"
	body.Caption.text = "Choosing a message keeps %s. The repair is still unapplied." % ("Pause for a click" if _waits else "Continue immediately")
	body.Selection.text = "Clear leaves the endpoint blank. No Message explicitly sets zero."
	if valid:
		var id := str(_items[selected[0]].identity).trim_prefix("message:")
		body.Selection.text = "%s will become %s%s. Clear leaves the field blank." % ["First message" if _field == "firstMessage" else "Last message", "" if _waits else "-", id]


func show_error(message: String) -> void:
	body.Selection.text = message


func _choose() -> void:
	if body.Footer.get_node("Choose").disabled: return
	var selected: PackedInt32Array = body.Results.get_selected_items()
	if selected.size() == 1: choice_requested.emit(_field, str(_items[selected[0]].identity), _waits)


func _input(event: InputEvent) -> void:
	if visible and not _submitting and event is InputEventKey and event.pressed and not event.echo and event.keycode == KEY_ESCAPE:
		get_viewport().set_input_as_handled()
		hide()
