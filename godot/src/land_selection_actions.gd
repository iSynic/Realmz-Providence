extends Window

signal options_accepted(options: Dictionary)
signal action_requested(action: String)
const OPTIONS = preload("res://src/land_paint_options.gd")
var _baseline: Dictionary = {}
var _focus: WeakRef


func _ready() -> void:
	for action in {"FillArea":"paint", "ClearArea":"erase", "ReplaceArea":"replace", "CaptureArea":"stamp"}:
		get_node("%" + action).pressed.connect(_action.bind({"FillArea":"paint", "ClearArea":"erase", "ReplaceArea":"replace", "CaptureArea":"stamp"}[action]))
	%CancelSelection.pressed.connect(close); close_requested.connect(close)
	%UseSelection.pressed.connect(func(): var value := draft(); close(); options_accepted.emit(value))


func open(options: Dictionary, focus: Control, destination: String, cells: Array, can_paint: bool) -> void:
	_baseline = options.duplicate(true); _focus = weakref(focus)
	%SelectionDestination.text = destination + " · selection"
	%SelectionShape.select(OPTIONS.SHAPES.find(str(options.shape)))
	%SelectionCombine.select(OPTIONS.COMBINES.find(str(options.combine)))
	%SelectionMatch.select(OPTIONS.MATCHES.find(str(options.match)))
	var bounds := Rect2i(Vector2i(int(cells[0].x), int(cells[0].y)), Vector2i.ONE)
	for cell in cells: bounds = bounds.merge(Rect2i(Vector2i(int(cell.x), int(cell.y)), Vector2i.ONE))
	%SelectionSummary.text = "(%d,%d)–(%d,%d) · %d selected cells" % [bounds.position.x,bounds.position.y,bounds.end.x-1,bounds.end.y-1,cells.size()]
	%FillArea.disabled = not can_paint; %ReplaceArea.disabled = not can_paint
	for button in [%FillArea, %ReplaceArea]: button.tooltip_text = "Choose available artwork before filling or replacing terrain." if not can_paint else ""
	popup_centered(Vector2i(820,560))
	if can_paint: %FillArea.grab_focus()
	else: %UseSelection.grab_focus()


func draft() -> Dictionary:
	var value := _baseline.duplicate(true)
	value.shape = OPTIONS.SHAPES[%SelectionShape.selected]
	value.combine = OPTIONS.COMBINES[%SelectionCombine.selected]
	value.match = OPTIONS.MATCHES[%SelectionMatch.selected]
	return value


func _action(action: String) -> void:
	var value := draft(); close(); options_accepted.emit(value); action_requested.emit(action)


func close() -> void:
	hide()
	if _focus != null and is_instance_valid(_focus.get_ref()) and _focus.get_ref().is_visible_in_tree(): _focus.get_ref().grab_focus()


func _unhandled_key_input(event: InputEvent) -> void:
	if not visible: return
	if event.is_action_pressed("ui_cancel"): close(); set_input_as_handled()
	elif event.is_action_pressed("ui_accept") and not %FillArea.disabled: _action("paint"); set_input_as_handled()
