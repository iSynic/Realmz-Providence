@tool
extends "res://theme/scenario_control_theme.gd"

const SECTION_COLORS := {
	"dark": ["f2c16a","afd9ff","a7f3c3"],
	"light": ["795100","005fa8","176236"],
	"high-contrast": ["ffe161","7ad7ff","71ff91"],
}
var _body_font: Font
var _heading_font: SystemFont


func _rebuild() -> void:
	if not SECTION_COLORS.has(mode): return
	set_block_signals(true)
	super._rebuild()
	# Theme changes keep font identities alive while existing text is reshaped.
	if _body_font==null: _body_font=default_font
	default_font=_body_font
	var colors: Array = SECTION_COLORS[mode].map(func(value): return Color(value))
	if _heading_font==null:
		_heading_font=SystemFont.new()
		_heading_font.font_names=(_body_font as SystemFont).font_names
		_heading_font.font_weight=700
	for index in 3:
		var variation: String = ["WorldHeading","WorldTitle","WorldUsesHeading"][index]
		set_type_variation(variation,"Label")
		set_font("font",variation,_heading_font)
		set_color("font_color",variation,colors[index])
	set_font_size("font_size","WorldHeading",20)
	set_font_size("font_size","WorldTitle",17)
	set_type_variation("WorldHint","Label")
	set_color("font_color","WorldHint",Color(PALETTES[mode][6]))
	set_type_variation("WorldSection","PanelContainer")
	var palette: Array = PALETTES[mode].map(func(value): return Color(value))
	set_stylebox("panel","WorldSection",make_panel_style(palette[0],palette[2],1,8.5))
	set_stylebox("panel","PopupPanel",make_panel_style(palette[0],palette[2],1,0,0))
	set_block_signals(false)
	emit_changed()
