extends HBoxContainer

signal section_requested(section: String)
@export var selected_section := "Canvas"


func _ready() -> void:
	for section in ["Canvas", "LandLayout", "LandTiles", "RandomEncounters"]:
		get_node(section).set_pressed_no_signal(section == selected_section)
		get_node(section).pressed.connect(func(): section_requested.emit(section))


func set_context(has_map: bool) -> void:
	$Canvas.disabled = not has_map
	$RandomEncounters.disabled = not has_map
	for button in [$Canvas, $RandomEncounters]:
		button.tooltip_text = "" if has_map else "Open or create a map first."
