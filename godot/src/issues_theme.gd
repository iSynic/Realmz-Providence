@tool
extends "res://src/story_text_theme.gd"


func _rebuild() -> void:
	if not ITEM_COLORS.has(mode):
		return
	set_block_signals(true)
	super._rebuild()
	var palette: Array = ITEM_COLORS[mode].map(func(hex: String): return Color(hex))
	var app: Color = palette[0]
	var selected: Color = palette[7]
	var gold := Color({"dark": "f2c94c", "light": "805a00", "high-contrast": "ffff00"}[mode])
	var selected_problem := Color("ff80ff") if mode == "high-contrast" else palette[10] as Color
	set_color("app", "Issues", app)
	set_color("panel", "Issues", palette[0])
	set_color("problem", "Issues", palette[10])
	set_color("selected_problem", "Issues", selected_problem)
	set_color("secondary", "Issues", palette[4])
	set_color("gold", "Issues", gold)
	for name in ["IssuesRoot", "IssuesPanel"]:
		set_type_variation(name, "PanelContainer")
	set_stylebox("panel", "IssuesRoot", make_panel_style(app, Color.TRANSPARENT, 0, 0, 0, 0))
	set_stylebox("panel", "IssuesPanel", make_panel_style(palette[0], palette[5], 1, 12, 12, 0))
	for name in ["IssuesHeading", "IssuesPrimary", "IssuesRow"]:
		set_type_variation(name, "Button")
	for type in ["Button", "LineEdit"]:
		set_font_size("font_size", type, 12)
		set_stylebox("normal", type, make_panel_style(palette[1] if type == "Button" else app, palette[5], 1, 7, 14 if type == "Button" else 8))
		set_stylebox("focus", type, make_panel_style(Color.TRANSPARENT, palette[6], 2, 7, 8))
	set_stylebox("pressed", "Button", make_panel_style(selected, palette[6], 1, 7, 14))
	set_stylebox("normal", "IssuesPrimary", make_panel_style(selected, palette[6], 1, 8, 14))
	set_stylebox("hover", "IssuesPrimary", make_panel_style(selected.lightened(0.06), palette[6], 1, 8, 14))
	var row := make_panel_style(palette[0], palette[5], 0, 5, 8, 0)
	row.border_width_bottom = 1
	set_stylebox("normal", "IssuesRow", row)
	set_stylebox("pressed", "IssuesRow", make_panel_style(selected, palette[5], 0, 5, 8, 0))
	set_stylebox("hover_pressed", "IssuesRow", make_panel_style(selected, palette[6], 1, 5, 8, 0))
	set_stylebox("hover", "IssuesRow", make_panel_style(palette[1], palette[6], 1, 5, 8, 0))
	set_stylebox("focus", "IssuesRow", make_panel_style(Color.TRANSPARENT, palette[6], 2, 5, 8, 0))
	set_block_signals(false)
	emit_changed()
