extends PanelContainer

signal slot_requested(slot: int)
signal apply_requested
signal clear_requested
signal draw_requested(enabled: bool)
signal reveal_requested
signal leave_requested
signal draft_changed
signal reference_requested(field: String, context: Dictionary, focus: Control)

const REFERENCE_FIELDS := {"battleLow": "BattleLow", "battleHigh": "BattleHigh", "soundId": "SoundId", "textId": "TextId", "door0": "Door0", "door1": "Door1", "door2": "Door2"}
var identity := ""
var revision := 0
var slot := 19
var edit_generation := 0
var draft: Dictionary = {}
var _baseline: Dictionary = {}
var _names: Dictionary = {}
var _baseline_names: Dictionary = {}
var _map: Dictionary = {}
var _creating := false
var _binding := false
var _locked := false


func _ready() -> void:
	%RegionSlots.item_selected.connect(func(index):
		var selected: int = %RegionSlots.get_item_id(index)
		%RegionSlots.select(19 - slot)
		slot_requested.emit(selected))
	%ApplyRegion.pressed.connect(apply_requested.emit)
	%DiscardRegion.pressed.connect(discard_draft)
	%ClearRegion.pressed.connect(func(): %ClearConfirmation.popup_centered())
	%ClearConfirmation.confirmed.connect(clear_requested.emit)
	%DrawRegion.toggled.connect(draw_requested.emit)
	%RevealRegion.pressed.connect(reveal_requested.emit)
	%LeaveRegions.pressed.connect(leave_requested.emit)
	for field in ["Left", "Top", "Right", "Bottom", "Chance", "Option"]:
		get_node("%Region" + field).value_changed.connect(func(_value): _fields_changed())
	for index in 3: get_node("%DoorPercent" + str(index)).value_changed.connect(func(_value): _fields_changed())
	%RegionOnly.toggled.connect(func(_value): _fields_changed())
	for field in REFERENCE_FIELDS:
		var button: Button = get_node("%" + REFERENCE_FIELDS[field])
		button.pressed.connect(func(): reference_requested.emit(field, reference_context(field), button))
	var bold: Font = %RegionHeading.get_theme_font("font").duplicate()
	if bold is SystemFont: bold.font_weight = 700
	%RegionHeading.add_theme_font_override("font", bold)


func set_projection(result: Dictionary) -> void:
	identity = str(result.map.identity)
	_map = result.map.duplicate(true)
	revision = int(result.revision)
	slot = int(result.slot)
	_creating = not result.region is Dictionary
	_baseline = _default_region() if _creating else result.region.duplicate(true)
	_names = result.referenceNames.duplicate(true)
	_baseline_names = _names.duplicate(true)
	set_meta("slots", result.slots.duplicate(true))
	%RegionSlots.clear()
	for row: Dictionary in result.slots:
		%RegionSlots.add_item("Region %d · %s" % [int(row.slot), "Active" if row.present else "Empty / reusable"], int(row.slot))
	%RegionSlots.select(19 - slot)
	%RegionHeading.text = "ENCOUNTER REGION %d" % slot
	_locked = false
	%ReconcileRegion.hide()
	discard_draft()


func _default_region() -> Dictionary:
	return {"identity": "%s:rect:%d" % [identity, slot], "left": 0, "top": 0, "right": 4, "bottom": 4,
		"chanceTenThousand": 0, "battleRange": [0, 0], "randomDoors": [0, 0, 0], "randomDoorPercent": [0, 0, 0],
		"only": false, "option": 0, "soundId": 0, "textId": 0}


func discard_draft() -> void:
	if _locked or _baseline.is_empty(): return
	draft = _baseline.duplicate(true)
	_names = _baseline_names.duplicate(true)
	_bind_draft()


func _bind_draft() -> void:
	_binding = true
	for pair in [["Left", "left"], ["Top", "top"], ["Right", "right"], ["Bottom", "bottom"], ["Chance", "chanceTenThousand"], ["Option", "option"]]:
		get_node("%Region" + pair[0]).value = draft[pair[1]]
	for index in 3: get_node("%DoorPercent" + str(index)).value = draft.randomDoorPercent[index]
	%RegionOnly.set_pressed_no_signal(draft.only)
	_binding = false
	_changed()


func kept_draft() -> Dictionary:
	return {"draft":draft.duplicate(true),"baseline":_baseline.duplicate(true),"names":_names.duplicate(true)}


func restore_kept_draft(kept: Dictionary) -> void:
	var conflicts: PackedStringArray = []
	for field in kept.draft:
		if kept.draft[field] == kept.baseline[field]: continue
		if draft[field] != kept.baseline[field] and draft[field] != kept.draft[field]: conflicts.append(field)
		draft[field] = kept.draft[field]
	_names.merge(kept.names,true); _bind_draft()
	if not conflicts.is_empty(): %RegionStatus.text = "These region fields also changed: " + ", ".join(conflicts) + ". Review before Apply."


func _fields_changed() -> void:
	if _binding or _locked or draft.is_empty(): return
	for pair in [["Left", "left"], ["Top", "top"], ["Right", "right"], ["Bottom", "bottom"], ["Chance", "chanceTenThousand"], ["Option", "option"]]:
		draft[pair[1]] = int(get_node("%Region" + pair[0]).value)
	for index in 3: draft.randomDoorPercent[index] = int(get_node("%DoorPercent" + str(index)).value)
	draft.only = %RegionOnly.button_pressed
	_changed()


func _changed() -> void:
	edit_generation += 1
	_update_references()
	%ApplyRegion.text = "Create region" if _creating else "Apply"
	%ApplyRegion.disabled = _locked or (not _creating and not has_unapplied_changes())
	%DiscardRegion.disabled = _locked or not has_unapplied_changes()
	%ClearRegion.disabled = _locked or _creating
	%RegionStatus.text = "Draft only · Apply creates the slot. Chance 0 is inactive." if _creating else ("Local changes · Apply once" if has_unapplied_changes() else "")
	draft_changed.emit()


func has_unapplied_changes() -> bool:
	return not draft.is_empty() and draft != _baseline


func submitted() -> Dictionary:
	return {"mapIdentity": identity, "expectedRevision": revision, "region": draft.duplicate(true)}


func reference_value(field: String) -> int:
	if field == "battleLow": return int(draft.battleRange[0])
	if field == "battleHigh": return int(draft.battleRange[1])
	if field.begins_with("door"): return int(draft.randomDoors[int(field.trim_prefix("door"))])
	return int(draft.get(field, 0))


func reference_context(field: String) -> Dictionary:
	return {"field": field, "currentValue": reference_value(field), "revision": revision, "mapIdentity": identity, "slot": slot,
		"editGeneration": edit_generation, "allowNone": not field.begins_with("battle"), "label": field.capitalize(), "soundPreview":field=="soundId",
		"destination": "%s %d · %s · Region %d · %s" % [str(_map.levelType).capitalize(), int(_map.nativeIndex), _map.name, slot, field.capitalize()]}


func accept_reference(choice: Dictionary, context: Dictionary) -> void:
	if _locked or context.mapIdentity != identity or int(context.slot) != slot or int(context.revision) != revision or int(context.editGeneration) != edit_generation: return
	var field := str(context.field)
	var value := int(choice.value)
	if value == reference_value(field): return
	if field == "battleLow": draft.battleRange[0] = value
	elif field == "battleHigh": draft.battleRange[1] = value
	elif field.begins_with("door"): draft.randomDoors[int(field.trim_prefix("door"))] = value
	else: draft[field] = value
	_names[field] = str(choice.label)
	_changed()


func _update_references() -> void:
	for field in REFERENCE_FIELDS:
		var button: Button = get_node("%" + REFERENCE_FIELDS[field])
		var value := reference_value(field)
		var text := str(_names.get(field, "None" if value == 0 and not field.begins_with("battle") else "ID %d" % value))
		button.text = "%s · %s · Choose…" % [str(value), text]
		button.tooltip_text = button.text


func set_preview(result: Dictionary, generation: int) -> void:
	if generation != edit_generation: return
	if not result.get("ok", false):
		%RegionStatus.text = str(result.get("error", "The draft could not be previewed."))
		%ApplyRegion.disabled = true
		return
	var preview: Dictionary = result.result.preview
	var overlap_text: PackedStringArray = []
	for row: Dictionary in preview.overlaps: overlap_text.append("Region %d (priority %d)" % [int(row.slot), int(row.prioritySlot)])
	%RegionPriority.text = "Higher slots take priority. " + ("No overlaps." if overlap_text.is_empty() else "Overlaps " + ", ".join(overlap_text))
	%RegionStatus.text = "%d covered cells · %s" % [int(preview.coveredCells), "Local draft" if preview.canApply else "Current region"]
	if not preview.preservedWarnings.is_empty(): %RegionStatus.text += "\n" + "\n".join(preview.preservedWarnings)
	%ApplyRegion.disabled = _locked or not preview.canApply


func set_loading(value: bool) -> void:
	_locked = value
	for field in ["RegionSlots", "RegionLeft", "RegionTop", "RegionRight", "RegionBottom", "RegionChance", "RegionOption", "DoorPercent0", "DoorPercent1", "DoorPercent2", "RegionOnly"]:
		var control = get_node("%" + field)
		if control is SpinBox: control.editable = not value
		else: control.disabled = value
	for field in REFERENCE_FIELDS: get_node("%" + REFERENCE_FIELDS[field]).disabled = value
	for button in [%ApplyRegion, %ClearRegion, %DrawRegion, %DiscardRegion, %LeaveRegions]: button.disabled = value
	if not value: _changed()


func show_failure(response: Dictionary) -> void:
	var unknown: bool = response.get("outcomeUnknown", false) or response.get("viewRefreshPending", false)
	set_loading(unknown)
	%ReconcileRegion.visible = unknown
	%RegionStatus.text = str(response.get("error", "The region draft is kept."))


func stage_bounds(bounds: Rect2i) -> void:
	if _locked: return
	_binding = true
	%RegionLeft.value = bounds.position.x; %RegionTop.value = bounds.position.y
	%RegionRight.value = bounds.end.x; %RegionBottom.value = bounds.end.y
	_binding = false
	_fields_changed()


func close_pickers() -> void:
	%RegionReferencePicker.cancel()
	%ClearConfirmation.hide()
	%DrawRegion.set_pressed_no_signal(false)


func clear_document() -> void:
	close_pickers()
	identity = ""
	draft.clear(); _baseline.clear(); _names.clear(); _baseline_names.clear(); _map.clear()
	_locked = false
	%ReconcileRegion.hide()
	if has_meta("slots"): remove_meta("slots")
