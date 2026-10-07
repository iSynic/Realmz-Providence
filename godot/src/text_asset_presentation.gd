extends RefCounted

const TEXT_ICON = preload("res://src/asset_text.svg")
const STYLE_ICON = preload("res://src/asset_text_style.svg")


static func glyph(kind: String) -> Texture2D:
	return TEXT_ICON if kind == "text-resource" else STYLE_ICON


static func configure(panel: Control) -> void:
	var body := SystemFont.new()
	body.font_names = PackedStringArray(["Source Sans 3", "Segoe UI"])
	for name in ["%TextPreview", "%StyleDescription", "%TextLimitation", "InspectorInset/Selection/Rights"]:
		panel.get_node(name).add_theme_font_override("font", body)
		panel.get_node(name).add_theme_font_size_override("font_size", 15 if name in ["%TextPreview", "%StyleDescription"] else 13)
	panel.get_node("%TextPreview").add_theme_color_override("font_readonly_color", panel.get_theme_color("font_color", "Label"))
	panel.get_node("%StyleGlyph").texture = STYLE_ICON
	var edit: Button = panel.get_node("%EditResource")
	edit.add_theme_stylebox_override("normal", edit.get_theme_stylebox("pressed"))


static func apply(panel: Control, row: Dictionary, preview: Dictionary, scope: String, icons_only: bool, project_backed: bool, pairing: Dictionary, enabled: bool = true) -> void:
	var selection: Control = panel.get_node("InspectorInset/Selection")
	var kind := str(row.get("kind", ""))
	var text_kind := kind in ["text-resource", "text-style-resource"]
	selection.get_node("Heading").text = "SELECTED ASSET"
	for name in ["UseStock", "Copy", "ReplaceScenario", "AddToLibrary", "RemoveScenario", "ScenarioUses", "FindScenarioUses"]:
		panel.get_node("%" + name).visible = not icons_only and (scope == "personal" if name == "Copy" else (scope == "stock" or not panel.get_node("%ItemTarget").item.is_empty() if name == "UseStock" else scope == "scenario" and panel.unified_browser))
	panel.get_node("%TextLimitation").visible = text_kind
	panel.get_node("%StyleDescription").visible = kind == "text-style-resource"
	panel.get_node("%StyleGlyph").visible = kind == "text-style-resource"
	if not text_kind:
		selection.get_node("Rights").text = "Protected supplied artwork. Copy it into Scenario to customize it." if row.get("ownership") == "supplied" else {"personal": "Your reusable original. Scenario copies stay unchanged when you edit this entry.", "stock": "Available in Realmz. Using this artwork adds a reference, not a copy.", "scenario": "Ships with this scenario. Library originals stay unchanged."}[scope]
		return
	var key: Dictionary = row.get("classicResource") if row.get("classicResource") is Dictionary else {}
	var resource_id := str(int(key.get("resourceId", 0)))
	panel.get_node("%Name").text = str(row.get("name", "")) if scope == "personal" else ("Style " if kind == "text-style-resource" else "Text ") + resource_id
	if kind == "text-resource" and row.get("source", "") == "authored text": panel.get_node("%Name").text = str(row.get("label", "Text " + resource_id))
	panel.get_node("%Name").tooltip_text = str(row.get("label", ""))
	selection.get_node("SelectionBox/Labels/Label").text = scope.capitalize() + " · " + ("TEXT STYLE" if kind == "text-style-resource" else "TEXT") + (" " + resource_id if not key.is_empty() else " · Original only")
	for name in ["PreviewHost", "PreviewScaleLabel", "PreviewScale"]:
		selection.get_node(name).hide()
	panel.get_node("%TextLimitation").text = "Formatting is retained with its exact TEXT number."
	selection.get_node("Rights").text = "Ships with this scenario. Edit text and formatting together in one local draft." if scope == "scenario" else "Your reusable TEXT. Copying keeps the original and paired formatting intact." if scope == "personal" else "Stock text is read-only in this workspace."
	var edit: Button = panel.get_node("%EditResource")
	edit.custom_minimum_size.y = 34
	if kind == "text-resource":
		edit.text = "Edit Text…"
		edit.disabled = scope != "scenario" or not project_backed or not enabled
		edit.tooltip_text = "Open the complete text in an unapplied draft." if not edit.disabled else "Open a persistent scenario project to edit this text."
		panel.get_node("%TextPreview").custom_minimum_size.y = 248
		panel.get_node("%Dimensions").text = ("Text %s · " % resource_id if not key.is_empty() else "Text · ") + {"scenario":"Scenario Assets", "personal":"My Library", "stock":"Stock Assets"}[scope]
		if preview.has("error"):
			panel.get_node("%TextLimitation").text = str(preview.error)
	else:
		panel.get_node("%TextPreview").hide()
		panel.get_node("%Dimensions").text = "Text formatting · " + ("Scenario Assets" if scope == "scenario" else "Stock Assets")
		panel.get_node("%StyleDescription").text = "Open the paired text to edit supported formatting. Imported attributes remain preserved."
		edit.text = "Open Text %s →" % resource_id
		edit.disabled = scope != "scenario" or pairing.get("status") != "ready" or not enabled
		edit.tooltip_text = "Open the exact paired text without changing it."
		var reason := "Opening the paired text changes nothing."
		match str(pairing.get("status", "unavailable")):
			"missing": reason = "Text %s is missing. Use New Text with this number, review the formatting acknowledgement, then Create. Open stays disabled until text exists." % resource_id if panel.unified_browser else "Text %s is missing. Open the Assets workspace to create the paired text." % resource_id
			"ambiguous": reason = "More than one text resource matches Style %s. Duplicate-text repair is not available in this build; Open is disabled." % resource_id
			"unavailable": reason = "The paired text could not be checked. Reselect this style to retry."
		selection.get_node("Rights").text = reason
