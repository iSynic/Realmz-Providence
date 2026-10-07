extends VBoxContainer

signal cancelled
signal apply_requested
var item: Dictionary = {}
var revision := -1
var _scale := 4


func _ready() -> void:
	$Cancel.pressed.connect(func(): cancelled.emit())
	$Apply.pressed.connect(func(): apply_requested.emit())
	$Apply.add_theme_stylebox_override("normal", $Apply.get_theme_stylebox("pressed"))
	for entry in [["One", 1], ["Two", 2], ["Four", 4]]:
		$Zoom.get_node(entry[0]).pressed.connect(_zoom.bind(entry[1]))
	hide()


func begin(definition: Dictionary, expected_revision: int, picture: Texture2D) -> void:
	item = definition.duplicate(true)
	revision = expected_revision
	var label := str(item.get("name", "")).strip_edges()
	$Identity.text = "%s · Item %d" % [label if not label.is_empty() else "Unnamed item", int(item.get("classicId", 0))]
	$Comparison/Current/Area/Picture.texture = picture
	$Comparison/Current/Label.text = "Current" if picture != null else "Unavailable"
	show()


func clear() -> void:
	item.clear()
	revision = -1
	$Comparison/Current/Area/Picture.texture = null
	set_proposed(null, false)
	hide()


func set_proposed(picture: Texture2D, enabled: bool) -> void:
	$Comparison/Proposed/Area/Picture.texture = picture
	$Apply.disabled = not enabled
	_zoom(_scale)


func show_zoom(available: bool) -> void:
	$Zoom.visible = available
	_zoom(_scale if available else 4)


func _zoom(scale: int) -> void:
	_scale = scale
	for entry in [["One", 1], ["Two", 2], ["Four", 4]]:
		$Zoom.get_node(entry[0]).set_pressed_no_signal(scale == entry[1])
	for name in ["Current", "Proposed"]:
		var picture: TextureRect = $Comparison.get_node(name + "/Area/Picture")
		var requested := picture.texture.get_size() * scale if picture.texture != null else Vector2(32, 32)
		var fit := minf(1.0, 112.0 / maxf(requested.x, requested.y))
		picture.custom_minimum_size = requested * fit
	$Scale.text = "%d×" % scale if $Zoom.visible else "Fitted"


func record_index() -> int:
	return int(item.get("classicId", 0)) - 800
