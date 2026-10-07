class_name ProvidenceDomainToolButton
extends Button

@export var glyph := ""
@export var caption := ""
@export var accent := Color("9dcfff")

@onready var _glyph: Label = %Glyph
@onready var _caption: Label = %Caption


func _ready() -> void:
	_toggled(button_pressed)


func sync_visual_state() -> void:
	_toggled(button_pressed)


func _toggled(selected: bool) -> void:
	if not is_node_ready():
		return
	_glyph.text = glyph
	_caption.text = caption
	_glyph.add_theme_color_override("font_color", accent.lightened(0.18) if selected else accent)
	_caption.add_theme_color_override("font_color", Color("f8fbff") if selected else Color("bdc8d3"))
