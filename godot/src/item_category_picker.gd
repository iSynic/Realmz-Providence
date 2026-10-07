extends Window

signal accepted(masks: Array, context: Dictionary)

var _masks: Array[int] = [0, 0]
var _context: Dictionary = {}
var _origin_focus: Control
var _binding := false


func _ready() -> void:
	for control in $Margin/Body/Scroll/Categories.get_children():
		control.toggled.connect(_toggle.bind(int(control.get_meta("category_index"))))
	%Search.text_changed.connect(_filter)
	%Search.text_submitted.connect(func(_text: String): _accept())
	%UseCategories.pressed.connect(_accept)
	%Cancel.pressed.connect(cancel)
	close_requested.connect(cancel)


func begin(masks: Array, context: Dictionary, focus: Control) -> void:
	cancel(false)
	_masks = [int(masks[0]), int(masks[1])]
	_context = context.duplicate(true)
	_origin_focus = focus
	%Destination.text = str(context.get("destination", ""))
	_binding = true
	for control in $Margin/Body/Scroll/Categories.get_children():
		var index := int(control.get_meta("category_index"))
		control.set_pressed_no_signal((_masks[index / 32] & (1 << (31 - index % 32))) != 0)
	_binding = false
	%Search.text = ""
	_filter("")
	popup_centered()
	%Search.grab_focus()


func _toggle(pressed: bool, index: int) -> void:
	if _binding: return
	var word := int(index / 32)
	var bit := 1 << (31 - index % 32)
	var value := _masks[word] & 0xffffffff
	value = value | bit if pressed else value & ~bit
	_masks[word] = value - 0x100000000 if value >= 0x80000000 else value
	_filter(%Search.text)


func _filter(query: String) -> void:
	var shown := 0
	var selected := 0
	for control in $Margin/Body/Scroll/Categories.get_children():
		control.visible = query.strip_edges().is_empty() or control.text.to_lower().contains(query.strip_edges().to_lower())
		if control.visible: shown += 1
		if control.button_pressed: selected += 1
	%Count.text = "%d matching categories · %d selected · unknown bits retained" % [shown, selected]


func _accept() -> void:
	accepted.emit(_masks.duplicate(), _context.duplicate(true))
	cancel()


func cancel(restore_focus := true) -> void:
	hide()
	_context.clear()
	if restore_focus and is_instance_valid(_origin_focus) and _origin_focus.is_inside_tree(): _origin_focus.grab_focus()
	_origin_focus = null


func _unhandled_key_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and event.keycode == KEY_ESCAPE:
		cancel()
		get_viewport().set_input_as_handled()
