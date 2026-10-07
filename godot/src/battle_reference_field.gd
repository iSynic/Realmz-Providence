extends HBoxContainer

signal choose_requested(field: String)
signal open_requested(field: String)

@export var field_key := ""
var choice: Dictionary = {}
var value := 0
var locked := true


func _ready() -> void:
	$Choose.pressed.connect(func(): choose_requested.emit(field_key))
	$Open.pressed.connect(func(): open_requested.emit(field_key))
	theme_changed.connect(_sync_readable_value)
	_sync_readable_value()


func _sync_readable_value() -> void:
	var color: Color = $Current.get_theme_color("font_color", "LineEdit")
	if $Current.get_theme_color("font_uneditable_color", "LineEdit") != color:
		$Current.add_theme_color_override("font_uneditable_color", color)


func set_value(next: int, resolved: Dictionary = {}) -> void:
	value = next
	choice = resolved.duplicate(true)
	$Current.text = "None" if next == 0 else "%d · %s" % [next, str(choice.get("label", "Missing reference")).replace("\n", " ")]
	$Current.tooltip_text = str(choice.get("detail", choice.get("reason", "")))
	set_locked(locked)


func set_locked(next: bool) -> void:
	locked = next
	$Choose.disabled = locked
	$Open.disabled = locked or value == 0 or choice.get("targetIdentity") == null or not choice.get("available", false)
