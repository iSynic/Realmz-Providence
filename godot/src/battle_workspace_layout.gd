extends HSplitContainer

var _preferred_width := -1.0


func _ready() -> void:
	resized.connect(_fit_default)
	drag_ended.connect(func(): _preferred_width = $PalettePanel.size.x)
	get_drag_area_controls()[0].tooltip_text = "Drag to resize Scenario Monsters"
	_fit_default.call_deferred()


func _fit_default() -> void:
	var width := _preferred_width if _preferred_width >= 0 else (380.0 if get_viewport_rect().size.x >= 1800 else 300.0)
	var offset := int(width) - floori((size.x - get_theme_constant("separation")) * 0.5)
	if split_offsets != PackedInt32Array([offset]):
		split_offsets = PackedInt32Array([offset])
