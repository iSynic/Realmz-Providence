extends PanelContainer

signal edit_requested(slot: int, detached: bool)
signal flow_requested
signal target_requested(reference: Dictionary)
signal focus_editor_requested
signal reveal_requested(cell: Vector2i)

const Presentation = preload("res://src/action_step_presentation.gd")
var identity := ""
var _document: Dictionary = {}
var _steps: Array = []
var _definitions: Dictionary = {}
var _references: Array = []
var _slot := 0
var _ap := false
var draft_probe: Callable
var _names: Dictionary = {}


func _ready() -> void:
	$DraftMonitor.timeout.connect(func(): if is_visible_in_tree() and draft_probe.is_valid(): draft_probe.call())
	%StepList.item_selected.connect(_select_step)
	%EditStep.pressed.connect(func(): edit_requested.emit(_slot, true))
	%OpenEditor.pressed.connect(func(): edit_requested.emit(_slot, false))
	%OpenWindow.pressed.connect(func(): edit_requested.emit(_slot, true))
	%ViewFlow.pressed.connect(flow_requested.emit)
	%RevealFootprint.pressed.connect(func(): reveal_requested.emit(Vector2i(int(_document.get("startX", 0)), int(_document.get("startY", 0)))))
	%DraftStatus.pressed.connect(focus_editor_requested.emit)
	%LinksToggle.toggled.connect(func(expanded):
		%References.visible = expanded
		%OpenTarget.visible = expanded)
	%OpenTarget.pressed.connect(func():
		var reference := selected_reference()
		if not reference.is_empty(): target_requested.emit(reference))
	%References.item_selected.connect(func(_index): %OpenTarget.disabled = str(selected_reference().get("resolution", "missing")) != "resolved")
	%References.item_activated.connect(func(_index):
		var reference := selected_reference()
		if str(reference.get("resolution", "missing")) == "resolved": target_requested.emit(reference))


func loading(id: String, ap: bool) -> void:
	identity = id; _ap = ap; _document.clear(); _references.clear()
	%Title.text = "Loading %s…" % ("Action Point" if ap else "Player Map")
	%Summary.text = ""; %RecordDetails.text = ""; %Warnings.text = ""
	%PlayerPreview.clear(); %StepList.clear(); %StepDetails.text = ""
	%RevealFootprint.hide()
	%References.clear()
	for button in [%EditStep, %OpenEditor, %OpenWindow, %ViewFlow, %OpenTarget]: button.disabled = true
	for node in [%StepHeading, %StepList, %StepDetails, %EditStep, %ViewFlow]: node.visible = ap
	%PlayerPreview.visible = not ap
	%DraftStatus.hide()


func show_failure(message: String) -> void:
	%Warnings.text = message


func present_ap(result: Dictionary, catalog: Dictionary) -> void:
	_document = result.get("actionPoint", {}).duplicate(true)
	_steps = result.get("steps", []).duplicate(true); _references = result.get("references", []).duplicate(true)
	_definitions.clear()
	for definition: Dictionary in catalog.get("items", []): _definitions[str(definition.identity)] = definition
	%Title.text = "AP %03d" % int(_document.get("recordIndex", 0))
	if not str(_document.get("descriptor", "")).is_empty(): %Title.text += " · " + str(_document.descriptor)
	var coordinate: Dictionary = _document.get("coordinate", {}) if _document.get("coordinate") is Dictionary else {}
	var drafts: Dictionary = preload("res://src/action_step_draft_projection.gd").from_steps(_steps, {}).drafts
	Presentation.render_list(%StepList, %StepHeading, drafts, _definitions, _slot)
	%OpenEditor.text = "Open Action Points"
	%RecordDetails.text = "After script: %s %d · %d, %d\nApplied project state" % [str(_document.get("levelType", result.get("map", {}).get("levelType", "land"))), int(_document.get("postActionLevel", 0)), int(_document.get("postActionX", 0)), int(_document.get("postActionY", 0))]
	%RecordDetails.visible = int(_document.get("postActionLevel", 0)) != int(_document.get("levelIndex", 0)) or int(_document.get("postActionX", 0)) != int(coordinate.get("x", -1)) or int(_document.get("postActionY", 0)) != int(coordinate.get("y", -1))
	%Summary.text = preload("res://src/action_point_activation_presentation.gd").summary(_document.get("activation", {}))
	_enable_editor(); _select_step(_slot)


func present_player_map(result: Dictionary) -> void:
	_document = result.get("playerMap", {}).duplicate(true); _references = result.get("references", []).duplicate(true)
	_names = result.get("names", {}).duplicate(true)
	%Title.text = "PLAYER MAP %d" % int(_document.get("nativeId", 0))
	%Summary.text = str(_names.get("effectiveName", ""))
	%RecordDetails.visible = true
	%RecordDetails.text = preload("res://src/map_sidebar_presentation.gd").player_details(_document, _names, {})
	%Warnings.text = preload("res://src/map_sidebar_presentation.gd").player_warnings(_references, result.get("diagnostics", []))
	%OpenEditor.text = "Open Player Maps"
	_enable_editor(); _render_references()


func receive_preview(response: Dictionary) -> void:
	var reason: String = %PlayerPreview.receive(response)
	%RevealFootprint.visible = str(%PlayerPreview.projection.get("mode", "")).ends_with("crop")
	%RecordDetails.text = preload("res://src/map_sidebar_presentation.gd").player_details(_document, _names, %PlayerPreview.projection)
	if not reason.is_empty() and %Warnings.text.is_empty(): %Warnings.text = reason


func present_region(result: Dictionary) -> void:
	var region: Dictionary = result.get("region", {}) if result.get("region") is Dictionary else {}
	%Title.text = "RANDOM RECTANGLE %d" % int(result.get("slot", 0))
	%Summary.text = "%d,%d → %d,%d" % [int(region.get("left", 0)), int(region.get("top", 0)), int(region.get("right", 0)), int(region.get("bottom", 0))]
	var battles: Array = region.get("battleRange", [0, 0])
	%RecordDetails.text = "Battle range %d–%d\nChance %s · Sound %d · Text %d" % [int(battles[0]), int(battles[1]),
		str(region.get("chanceTenThousand", 0)), int(region.get("soundId", 0)), int(region.get("textId", 0))]
	%OpenEditor.text = "Focus Random Rectangles"
	%PlayerPreview.hide(); %OpenTarget.hide(); _enable_editor()


func set_draft_status(dirty: bool) -> void:
	%DraftStatus.visible = dirty


func _enable_editor() -> void:
	for button in [%EditStep, %OpenEditor, %OpenWindow, %ViewFlow]: button.disabled = false


func _select_step(slot: int) -> void:
	_slot = clampi(slot, 0, 7); %StepList.select(_slot)
	var draft: Dictionary = preload("res://src/action_step_draft_projection.gd").from_steps(_steps, {}).drafts.get(_slot, {})
	var definition: Dictionary = preload("res://src/action_step_description_state.gd").definition(draft, _definitions)
	%StepDetails.text = "Step %d · %s\n%s" % [_slot + 1, Presentation.action_label(definition), Presentation.step_detail(draft, definition)]
	%EditStep.text = "Edit step %d…" % (_slot + 1)
	%StepDetails.add_theme_color_override("font_color", ProvidenceActionStepList.semantic_color(definition))
	_render_references()


func selected_reference() -> Dictionary:
	var selected_rows: PackedInt32Array = %References.get_selected_items()
	if not selected_rows.is_empty(): return %References.get_item_metadata(selected_rows[0])
	for reference: Dictionary in _references:
		if not _ap or str(reference.get("field", "")).begins_with("actions[%d]" % _slot): return reference
	return {}


func _render_references() -> void:
	%References.clear()
	for reference: Dictionary in _references:
		if _ap and not str(reference.get("field", "")).begins_with("actions[%d]" % _slot): continue
		var caption := "%s %s · %s" % [str(reference.get("targetKind", "target")).replace("-", " ").capitalize(),
			str(reference.get("targetId", "")).get_slice(":", str(reference.get("targetId", "")).get_slice_count(":") - 1), str(reference.get("resolution", "missing"))]
		var index: int = %References.add_item(caption); %References.set_item_metadata(index, reference)
	%LinksToggle.visible = not _ap and %References.item_count > 0
	%LinksToggle.set_pressed_no_signal(false)
	%References.visible = _ap and %References.item_count > 0
	if _ap and %References.item_count == 1: %References.hide()
	if %References.item_count > 0: %References.select(0)
	%OpenTarget.disabled = str(selected_reference().get("resolution", "missing")) != "resolved"
	var reference := selected_reference()
	%OpenTarget.visible = _ap and not reference.is_empty()
	%OpenTarget.text = "Open %s %s →" % [str(reference.get("targetKind", "target")).replace("-", " ").capitalize(), str(reference.get("targetId", "")).get_slice(":", str(reference.get("targetId", "")).get_slice_count(":") - 1)] if not reference.is_empty() else "Open target"
