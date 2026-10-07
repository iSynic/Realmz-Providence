extends MarginContainer

var _scale := 4


func present(row: Dictionary, preview: Dictionary, context: Dictionary) -> void:
	%Name.text = str(row.get("name", row.get("label", "")))
	%Name.tooltip_text = %Name.text
	var kind := str(row.get("kind", ""))
	_preview(preview, context)
	_commands(row, preview, context)
	%OpenPreview.disabled = not context.current or row.get("emptySlot", false) or not (preview.has("texture") or preview.has("audio") or preview.has("text") or preview.has("music"))
	var resource: Dictionary = row.get("classicResource") if row.get("classicResource") is Dictionary else {}
	if resource.is_empty() and row.get("media") is Dictionary:
		resource = row.media.get("primary", {}).get("classicResource", {})
	var identity := "%s · %s%s" % [context.scope.capitalize(), kind.capitalize(), " %d" % int(resource.resourceId) if resource.has("resourceId") else ""]
	if row.get("emptySlot", false): %Dimensions.text = str(row.get("slotReason", "No music assigned."))
	if row.has("usedBy"): identity += " · %d uses" % int(row.usedBy)
	$Selection/SelectionBox/Labels/Label.text = identity


func _commands(row: Dictionary, preview: Dictionary, context: Dictionary) -> void:
	var scenario: bool = context.scope == "scenario"
	var personal: bool = context.scope == "personal"
	var kind := str(row.get("kind", ""))
	var editable := kind in ["picture", "sound", "music", "icon", "combat-icon", "portrait", "special-land-tile", "text-resource"]
	%EditResource.text = "Edit…"
	%EditResource.disabled = not scenario or not context.editable or not editable
	%EditResource.tooltip_text = "Edit a local draft, then Apply." if not %EditResource.disabled else "This family is preserved as reference content."
	%RemoveScenario.disabled = not scenario or not context.removable
	%RemoveScenario.tooltip_text = str(row.get("removalReason", "Review affected uses before removing."))
	%FindScenarioUses.disabled = not scenario or not context.navigable
	%FindScenarioUses.tooltip_text = "Open the exact owning field."
	%ReplaceScenario.disabled = not scenario or not editable
	%ReplaceScenario.tooltip_text = "Review replacement content, exact keys and affected uses."
	%ReplaceScenario.text = "Replace Music…" if kind == "music" else "Replace…"
	%AddToLibrary.disabled = not scenario or not editable
	for button: Button in [%Rename, %Move, %Remove]: button.disabled = not personal
	%Rename.text = "Name / Collection…" if context.unified else "Rename…"
	%Move.visible = personal and not context.unified
	%Copy.disabled = not personal or not context.project_backed or not (row.get("prepared", false) or preview.has("texture"))
	if context.unified:
		%Copy.disabled = context.scope not in ["personal", "supplied"] or not context.project_backed or not (row.get("prepared", false) or preview.has("texture") or preview.has("audio") or preview.has("text") or kind == "music")
	%Copy.text = "Prepare / Copy to Scenario…" if personal and not row.get("prepared", false) else "Copy to Scenario…"
	%Copy.tooltip_text = "Prepare this original and review its scenario allocation." if personal and not row.get("prepared", false) and context.unified else "Review an unused scenario resource number."
	var key: Dictionary = row.get("classicResource") if row.get("classicResource") is Dictionary else {}
	var compatible: bool = preview.has("texture") and (personal or context.scope == "supplied" or key.get("resourceType", "") == "cicn")
	var number := int(key.get("resourceId", 0))
	if context.scope == "stock": compatible = compatible and number != 0 and number >= -32768 and number <= 32767
	%UseStock.disabled = not context.project_backed or not compatible or not context.item_context
	%UseStock.tooltip_text = "Open this picker from a compatible destination to use media." if not context.item_context else "Apply the selected icon to the originating item."
	%ItemTarget.set_proposed(%Preview.texture, not %UseStock.disabled)
	if not context.current or context.locked:
		for button: Button in [%UseStock, %Copy, %RemoveScenario, %Rename, %Move, %Remove, %EditResource, %ReplaceScenario, %AddToLibrary]: button.disabled = true
		%ItemTarget.set_proposed(%Preview.texture, false)
	if not context.current: %FindScenarioUses.disabled = true
	if row.get("emptySlot", false):
		for button: Button in [%EditResource, %RemoveScenario, %FindScenarioUses, %AddToLibrary, %OpenPreview]: button.disabled = true
		%ReplaceScenario.text = "Import Music…"; %ReplaceScenario.disabled = not row.get("canImport", false) or context.locked or not context.current
		%ReplaceScenario.tooltip_text = str(row.get("slotReason", ""))


func _preview(preview: Dictionary, context: Dictionary) -> void:
	var image_controls: bool = not context.icons_only and not preview.has("text") and not preview.has("audio") and not preview.has("music")
	for name in ["PreviewHost", "PreviewScaleLabel", "PreviewScale"]: $Selection.get_node(name).visible = image_controls and (name == "PreviewHost" or not context.unified)
	%TextPreview.visible = preview.has("text")
	%TextPreview.text = str(preview.get("text", ""))
	%PlayPreview.visible = preview.has("audio")
	%SoundPreview.stream = preview.get("audio")
	%Preview.texture = preview.get("texture")
	zoom(_scale)
	%Dimensions.text = str(preview.get("error", "Preview unavailable.")) if not preview.has("texture") else "%d × %d pixels" % [preview.width, preview.height]
	if preview.has("text"): %Dimensions.text = "Text preview"
	elif preview.has("audio"): %Dimensions.text = "Sound preview · press Play"
	elif preview.has("music"): %Dimensions.text = "Music · Play prepares native audio from the exact module."


func zoom(scale: int) -> void:
	assert(scale in [1, 2, 4])
	_scale = scale
	for entry: Array in [["One", 1], ["Two", 2], ["Four", 4]]:
		var button: Button = $Selection/PreviewScale.get_node(entry[0])
		button.disabled = %Preview.texture == null
		button.set_pressed_no_signal(scale == entry[1])
	if %Preview.texture == null:
		$Selection/PreviewScaleLabel.text = "Preview size"
		%Preview.custom_minimum_size = Vector2(128, 128)
		%Preview.tooltip_text = ""
		return
	var requested: Vector2 = %Preview.texture.get_size() * scale
	var fit := minf(1.0, minf(216.0 / requested.x, 144.0 / requested.y))
	%Preview.custom_minimum_size = requested * fit
	%Preview.tooltip_text = "%d× preview%s" % [scale, " · fitted to Inspector" if fit < 1.0 else ""]
	$Selection/PreviewScaleLabel.text = "Preview size · %.1f× fitted" % (scale * fit) if fit < 1.0 else "Preview size"
