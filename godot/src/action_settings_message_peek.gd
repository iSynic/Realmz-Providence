extends Window

signal editor_requested(identity: String)
var _identity := ""


func _ready() -> void:
	$Panel/Inset/Body/Footer/Back.pressed.connect(hide)
	$Panel/Inset/Body/Footer/OpenMessages.pressed.connect(func(): hide(); editor_requested.emit(_identity))
	close_requested.connect(hide)


func show_message(message: Dictionary) -> void:
	_identity = str(message.identity)
	$Panel/Inset/Body/Heading.text = str(message.label)
	$Panel/Inset/Body/Text.text = str(message.text)
	popup_centered(size)
	position.y -= 15
	$Panel/Inset/Body/Footer/Back.grab_focus()


func _input(event: InputEvent) -> void:
	if visible and event is InputEventKey and event.pressed and not event.echo and event.keycode == KEY_ESCAPE:
		get_viewport().set_input_as_handled()
		hide()
