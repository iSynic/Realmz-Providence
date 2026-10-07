class_name ProvidenceRogueEncounterEditor
extends ProvidenceEncounterRecordEditor

const ACTION_LABELS := ["Acrobatic Act", "Detect Trap", "Disarm Trap", "Hear Noise", "Force Lock", "Move Silently", "Pick Lock", "Pick Pocket"]
const NUMERIC := {"LowDamage": "lowDamage", "HighDamage": "highDamage", "Tumblers": "tumblers"}
var _owner_id := -1
var _owner_identity := ""
var _preferred_owner_id := -1
var _owners_offset := 0
var owner_page_handler: Callable


func route_identity() -> String: return "encounters.rogue"


func _ready() -> void:
	kind = "rogue"
	super._ready()
	%CallerResult.select(0)
	for slot in range(8): %ActionRows.get_child(slot).initialize(self, slot, ACTION_LABELS[slot])
	for field in [%TrapPrompt, %TrapSound, %TrapSpell, %OpeningSound]: bind_reference(field)
	for node_name: String in NUMERIC:
		var control := find_child(node_name, true, false) as SpinBox
		control.value_changed.connect(func(v): change(NUMERIC[node_name], int(v)))
	%Armed.toggled.connect(func(v): change_array("typeFlags", 9, v))
	%RogueOnly.toggled.connect(func(v): change_array("typeFlags", 8, v))
	%Power.value_changed.connect(func(v): change_array("prompts", 2, int(v)))
	%DisarmMagic.value_changed.connect(func(v): change_array("promptSounds", 2, int(v)))
	%OpenMagic.value_changed.connect(func(v): change_array("promptSounds", 1, int(v)))
	%OwnerChoice.item_selected.connect(_owner_selected)
	%PreviousCaller.pressed.connect(func(): if owner_page_handler.is_valid(): await owner_page_handler.call(maxi(0, _owners_offset - 128)))
	%NextCaller.pressed.connect(func(): if owner_page_handler.is_valid(): await owner_page_handler.call(_owners_offset + 128))
	%OpenOwner.pressed.connect(func(): _open_owner(-1))
	%OpenResult.pressed.connect(func(): _open_owner(%CallerResult.selected))
	%EditPrompt.pressed.connect(func(): %TrapPrompt.open_requested.emit(%TrapPrompt))


func _present_form() -> void:
	if draft.is_empty(): return
	for slot in range(8): %ActionRows.get_child(slot).present(draft, targets, slot)
	for field in [%TrapPrompt, %TrapSound, %TrapSpell, %OpeningSound]:
		var value: int
		if field.field_key.contains("["): value = int(draft[field.field_key.get_slice("[", 0)][field.field_key.get_slice("[", 1).trim_suffix("]").to_int()])
		else: value = int(draft[field.field_key])
		field.set_value(value, targets.get(field.field_key, {}))
	for node_name: String in NUMERIC: (find_child(node_name, true, false) as SpinBox).set_value_no_signal(int(draft[NUMERIC[node_name]]))
	%Armed.set_pressed_no_signal(bool(draft.typeFlags[9])); %RogueOnly.set_pressed_no_signal(bool(draft.typeFlags[8]))
	%Power.set_value_no_signal(int(draft.prompts[2])); %DisarmMagic.set_value_no_signal(int(draft.promptSounds[2])); %OpenMagic.set_value_no_signal(int(draft.promptSounds[1]))
	_update_summary()


func set_owners(items: Array, total: int = -1, page_offset: int = 0) -> void:
	if total < 0: total = items.size()
	_owners_offset = page_offset
	%PreviousCaller.visible = total > 128; %NextCaller.visible = total > 128
	%PreviousCaller.disabled = page_offset == 0; %NextCaller.disabled = page_offset + items.size() >= total
	var previous := _preferred_owner_id if _preferred_owner_id >= 0 else _owner_id
	_preferred_owner_id = -1
	%OwnerChoice.clear(); _owner_id = -1; _owner_identity = ""
	if total != 1:
		%OwnerChoice.add_item("No calling Complex Encounter" if items.is_empty() else "Choose calling Complex Encounter…")
		%OwnerChoice.set_item_metadata(0, {})
	for item: Dictionary in items:
		%OwnerChoice.add_item("Complex Encounter %d" % int(item.nativeId))
		%OwnerChoice.set_item_metadata(%OwnerChoice.item_count - 1, item)
		if int(item.nativeId) == previous or total == 1: %OwnerChoice.select(%OwnerChoice.item_count - 1)
	%OwnerChoice.disabled = items.is_empty()
	_owner_selected(%OwnerChoice.selected)


func _owner_selected(index: int) -> void:
	var owner: Dictionary = %OwnerChoice.get_item_metadata(index) if index >= 0 else {}
	_owner_id = int(owner.get("nativeId", -1)); _owner_identity = str(owner.get("identity", ""))
	%OpenOwner.disabled = _owner_id < 0; %OpenResult.disabled = _owner_id < 0
	%OwnerHelp.text = "Result codes return to this caller." if _owner_id >= 0 else "No caller selected."
	_update_state()


func trusted_applied_owner_native_id(has_draft: bool = false) -> int:
	return -1 if has_draft or has_unapplied_changes() or uncertain else _owner_id


func _open_owner(result: int) -> void:
	if _owner_id < 0: return
	reference_open_requested.emit("complex-encounter", _owner_id, _owner_identity, {"encounterResult": result})


func _update_summary() -> void:
	%PromptPreview.visible = int(draft.get("prompts", [0])[0]) != 0
	%PromptPreview.text = str(targets.get("prompts[0]", {}).get("detail", "Choose or create a trap prompt."))
	%EditPrompt.disabled = int(draft.get("prompts", [0])[0]) == 0 or not targets.has("prompts[0]")
	%PreviewScope.text = "Apply the draft before previewing." if has_unapplied_changes() else ("Preview uses the selected calling Complex Encounter." if _owner_id >= 0 else "Preview unavailable: no exact caller is selected.")


func _clear_form() -> void:
	%OwnerChoice.clear(); _owner_id = -1; _owner_identity = ""
	%OwnerHelp.text = "No Rogue Encounter selected."
	%PromptPreview.visible = int(draft.get("prompts", [0])[0]) != 0
	%PromptPreview.text = ""; %EncounterStatus.text = ""


func target_context(_field: ProvidenceEncounterReferenceField) -> Dictionary: return {}


func copy_groups() -> Array:
	return [["typeFlags", "modifiers", "successCodes", "failureCodes", "successText", "failureText", "successSounds", "failureSounds"], ["spell", "lowDamage", "highDamage", "tumblers", "prompts", "promptSounds"], ["promptSounds"]]


func _accept_copy() -> void:
	# Flags and audio share native arrays with fields owned by other copy scopes.
	if _copy_source.is_empty(): return
	var retained_flags: Array = draft.typeFlags.duplicate()
	var retained_prompts: Array = draft.promptSounds.duplicate()
	super._accept_copy()
	if %Scope2.button_pressed:
		draft.typeFlags[8] = _copy_source.typeFlags[8]; draft.typeFlags[9] = _copy_source.typeFlags[9]
	if not %Scope2.button_pressed:
		draft.typeFlags[8] = retained_flags[8]; draft.typeFlags[9] = retained_flags[9]
		draft.promptSounds[1] = retained_prompts[1]; draft.promptSounds[2] = retained_prompts[2]
	if not %Scope1.button_pressed:
		for slot in range(8): draft.typeFlags[slot] = retained_flags[slot]
	if not %Scope3.button_pressed: draft.promptSounds[0] = retained_prompts[0]
	updating = true; _present_form(); updating = false; _update_state()
	refresh_copied_references()


func read_navigation_state() -> Dictionary:
	var state := super.read_navigation_state()
	state["ownerPage"] = _owners_offset; state["owner"] = _owner_id; state["result"] = %CallerResult.selected
	return state


func restore_navigation_state(state: Dictionary) -> bool:
	var restored := await super.restore_navigation_state(state)
	if owner_page_handler.is_valid() and int(state.get("ownerPage", 0)) != _owners_offset: await owner_page_handler.call(int(state.get("ownerPage", 0)))
	for index in range(%OwnerChoice.item_count):
		var owner: Dictionary = %OwnerChoice.get_item_metadata(index)
		if int(owner.get("nativeId", -1)) == int(state.get("owner", -1)): %OwnerChoice.select(index); _owner_selected(index); break
	%CallerResult.select(int(state.get("result", 0)))
	return restored


func draft_error() -> Dictionary:
	var problem := super.draft_error()
	if not problem.is_empty() or draft.is_empty(): return problem
	if draft.lowDamage != baseline.lowDamage or draft.highDamage != baseline.highDamage:
		if int(draft.lowDamage) < 0 or int(draft.highDamage) < int(draft.lowDamage): return {"error": "Trap damage must be nonnegative; the upper bound must be at least the lower bound.", "control": %LowDamage}
	return {}


func set_document(result: Dictionary) -> void:
	if selected_identity() != str(result.get("encounter", {}).get("identity", "")): _owners_offset = 0
	_preferred_owner_id = _owner_id if selected_identity() == str(result.get("encounter", {}).get("identity", "")) else -1
	_owner_id = -1; _owner_identity = ""; %OwnerChoice.clear()
	%OpenOwner.disabled = true; %OpenResult.disabled = true
	super.set_document(result)


func failure_problem(response: Dictionary) -> Dictionary:
	var problem := draft_error()
	if not problem.is_empty(): return problem
	var error := str(response.get("error", "")).to_lower()
	for entry in [["damage", %LowDamage], ["trap prompt", %TrapPrompt.get_node("Choose")], ["spell", %TrapSpell.get_node("Choose")], ["disarm", %DisarmMagic], ["open lock", %OpenMagic]]:
		if error.contains(entry[0]): return {"control": entry[1]}
	return {}


func caller_page_offset() -> int: return _owners_offset


func focus_source(identity: String, slot: int, field: String) -> bool:
	if identity != selected_identity(): return false
	var regex := RegEx.new()
	regex.compile("^(successCodes|failureCodes)\\[(\\d+)\\]$")
	var match := regex.search(field)
	if match == null: return super.focus_source(identity, slot, field)
	var index := int(match.get_string(2))
	if index >= %ActionRows.get_child_count(): return false
	var row := %ActionRows.get_child(index)
	var control := row.get_node("Success" if match.get_string(1) == "successCodes" else "Failure") as Control
	%BodyScroll.ensure_control_visible(control)
	control.grab_focus()
	return true

func select_calling_owner(identity: String) -> bool:
	var source := selected_identity()
	while true:
		for index in %OwnerChoice.item_count:
			if str(%OwnerChoice.get_item_metadata(index).get("identity", "")) == identity:
				%OwnerChoice.select(index)
				_owner_selected(index)
				return true
		if %NextCaller.disabled or not owner_page_handler.is_valid(): return false
		var previous := _owners_offset
		await owner_page_handler.call(_owners_offset + 128)
		if selected_identity() != source or previous == _owners_offset: return false
	return false
