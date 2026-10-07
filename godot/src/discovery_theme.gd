@tool
extends "res://theme/scenario_control_theme.gd"

const ACCENTS := {
	"dark": ["8bcfff", "cfb7ff", "90e7b2", "ffd37a"],
	"light": ["005fa8", "67408d", "176236", "795100"],
	"high-contrast": ["7ad7ff", "dabfff", "71ff91", "ffe161"],
}

func _rebuild() -> void:
	if not ACCENTS.has(mode): return
	set_block_signals(true)
	super._rebuild()
	var bold := SystemFont.new()
	bold.font_names = (default_font as SystemFont).font_names
	bold.font_weight = 700
	var accents: Array = ACCENTS[mode].map(func(value): return Color(value))
	for pair in [["DiscoveryHeading",0], ["DiscoveryTitle",0], ["QuestHeading",1], ["QuestTitle",1], ["ChecksHeading",0], ["ChangesHeading",2]]:
		set_type_variation(pair[0], "Label")
		set_font("font", pair[0], bold)
		set_color("font_color", pair[0], accents[pair[1]])
		set_font_size("font_size", pair[0], 19 if pair[0].ends_with("Title") else 17)
	set_type_variation("DiscoveryContext", "Label")
	set_color("font_color", "DiscoveryContext", Color(PALETTES[mode][4]))
	set_font("bold_font", "RichTextLabel", bold)
	set_color("default_color", "RichTextLabel", Color(PALETTES[mode][3]))
	set_color("warning", "Discovery", accents[3])
	for pair in [["ChecksPanel",0], ["ChangesPanel",2]]:
		set_type_variation(pair[0], "PanelContainer")
		var surface := Color(PALETTES[mode][0])
		if mode != "high-contrast": surface = surface.lerp(accents[pair[1]], 0.025)
		set_stylebox("panel", pair[0], make_panel_style(surface, Color(PALETTES[mode][2]), 1, 8))
	set_block_signals(false)
	emit_changed()
