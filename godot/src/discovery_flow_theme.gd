@tool
extends "res://src/discovery_theme.gd"

func _rebuild() -> void:
	if not PALETTES.has(mode): return
	super._rebuild()
	var colors: Array = PALETTES[mode].map(func(value): return Color(value))
	for spec in [["FlowHeader",1,0,11], ["FlowNotice",1,0,0], ["FlowDetails",1,1,16], ["FlowFooter",0,1,8]]:
		set_type_variation(spec[0], "PanelContainer")
		set_stylebox("panel", spec[0], make_panel_style(colors[spec[1]], colors[2], spec[2], spec[3], 16, 0))
	for state in ["normal", "disabled", "hover", "pressed", "hover_pressed", "focus"]:
		var border: Color = colors[6] if state in ["hover", "pressed", "hover_pressed", "focus"] else colors[2]
		var fill: Color = colors[8] if state in ["pressed", "hover_pressed"] else colors[1]
		set_stylebox(state, "Button", make_panel_style(fill, border, 1, 6, 12, 0))
		set_stylebox(state, "CheckBox", make_panel_style(Color.TRANSPARENT, Color.TRANSPARENT, 0, 0, 0, 0))
	set_stylebox("focus", "CheckBox", make_panel_style(Color.TRANSPARENT, colors[6], 1, 0, 0, 0))
