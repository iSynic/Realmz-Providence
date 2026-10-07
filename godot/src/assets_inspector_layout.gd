extends RefCounted


static func configure(inset: MarginContainer, browser := false) -> void:
	inset.add_theme_constant_override("margin_top", 7)
	inset.add_theme_constant_override("margin_right", 12)
	var selection: VBoxContainer = inset.get_node("Selection")
	var names := {"Caption": "Heading", "PreviewLabel": "PreviewScaleLabel", "ArtworkDimensions": "Dimensions", "Matte": "PreviewHost", "Zoom": "PreviewScale", "CopyToScenario": "Copy", "UseInItem": "UseStock"} if browser else {}
	var node := func(path: String) -> Node: return selection.get_node(names.get(path, path))
	selection.custom_minimum_size.x = 236
	selection.add_theme_constant_override("separation", 8 if browser else 12)
	var ui := SystemFont.new()
	ui.font_names = PackedStringArray(["JetBrains Mono", "Consolas"])
	var body := SystemFont.new()
	body.font_names = PackedStringArray(["Source Sans 3", "Segoe UI"])
	var bold := body.duplicate() as SystemFont
	bold.font_weight = 700
	var local_theme := Theme.new()
	local_theme.default_font = ui
	local_theme.default_font_size = 12
	selection.theme = local_theme
	for path: String in ["Caption", "PreviewLabel"]:
		node.call(path).add_theme_font_override("font", bold if path == "Caption" else body)
	var caption: Label = selection.get_node("SelectionBox/Labels/Label")
	caption.add_theme_font_override("font", bold)
	caption.add_theme_font_size_override("font_size", 9)
	node.call("ArtworkDimensions").add_theme_font_size_override("font_size", 11)
	node.call("ArtworkDimensions").custom_minimum_size.y = 15
	var panel: PanelContainer = selection.get_node("SelectionBox")
	var style: StyleBox = panel.get_theme_stylebox("panel").duplicate()
	for side in [SIDE_LEFT, SIDE_TOP, SIDE_RIGHT, SIDE_BOTTOM]:
		style.set_content_margin(side, 9)
	panel.add_theme_stylebox_override("panel", style)
	panel.custom_minimum_size.y = 53
	selection.get_node("SelectionBox/Labels").add_theme_constant_override("separation", 6)
	node.call("Matte").custom_minimum_size.y = 148
	node.call("Zoom").custom_minimum_size.y = 30
	for path: String in ["CopyToScenario", "UseInItem"]:
		node.call(path).custom_minimum_size.y = 34
	if browser:
		selection.get_node("Heading").hide()
		var name: Label = inset.get_node("%Name")
		var title := ui.duplicate() as SystemFont
		title.font_weight = 700
		name.add_theme_font_override("font", title)
		name.add_theme_font_size_override("font_size", 18)
		caption.add_theme_font_override("font", ui)
		caption.add_theme_font_size_override("font_size", 11)
	if not browser:
		selection.get_node("Ownership").text = "Supplied artwork stays unchanged. Your scenario receives its own copy."
