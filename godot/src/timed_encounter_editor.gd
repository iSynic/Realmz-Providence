class_name ProvidenceTimedEncounterEditor
extends ProvidenceEncounterRecordEditor

var cell_handler: Callable

const FIELDS := {"Day": "day", "Increment": "increment", "Chance": "percent", "ExactX": "requiredX", "ExactY": "requiredY"}


func route_identity() -> String: return "encounters.timed"


func _ready() -> void:
	kind = "timed"
	super._ready()
	for node_name: String in FIELDS:
		var input := find_child(node_name, true, false) as SpinBox
		input.value_changed.connect(func(v): change(FIELDS[node_name], int(v)))
	for field in [%ExtraAP, %RequiredItem, %RequiredQuest, %RequiredLevel, %Rectangle]: bind_reference(field)
	%Position.item_selected.connect(_location_changed)
	%ChooseMap.pressed.connect(func(): _choose_reference(%RequiredLevel))
	%PickCell.pressed.connect(_pick_cell)
	%AcceptCell.pressed.connect(func():
		change("requiredX", int(%CellX.value)); change("requiredY", int(%CellY.value))
		updating = true; _present_form(); updating = false; _close_modal(%CellDialog))
	%CancelCell.pressed.connect(func(): _close_modal(%CellDialog))
	%CellCanvas.cell_selected.connect(func(x, y, _tile, _ap): %CellX.set_value_no_signal(x); %CellY.set_value_no_signal(y); %AcceptCell.disabled = false)
	%CellDialog.close_requested.connect(_close_modal.bind(%CellDialog))


func _present_form() -> void:
	if draft.is_empty(): return
	for node_name: String in FIELDS: (find_child(node_name, true, false) as SpinBox).set_value_no_signal(int(draft[FIELDS[node_name]]))
	for field in [%ExtraAP, %RequiredItem, %RequiredQuest, %RequiredLevel, %Rectangle]:
		field.set_value(int(draft[field.field_key]), targets.get(field.field_key, {}))
	%Position.select(["any", "land", "dungeon"].find(str(draft.locationKind)))
	_update_summary()


func _update_summary() -> void:
	if draft.is_empty(): return
	var anywhere := str(draft.locationKind) == "any"
	for field in [%RequiredLevel, %Rectangle]:
		field.get_node("Choose").disabled = anywhere
		field.get_node("Open").disabled = anywhere or field.target.is_empty()
	%ExactX.editable = not anywhere; %ExactY.editable = not anywhere
	%ChooseMap.disabled = anywhere; %PickCell.disabled = anywhere or int(draft.requiredLevel) < 0
	var place := "any location" if anywhere else "%s %d" % [str(draft.locationKind).capitalize(), int(draft.requiredLevel)]
	var coords: Array[String] = []
	if not anywhere:
		if int(draft.requiredX) >= 0: coords.append("X = %d" % int(draft.requiredX))
		if int(draft.requiredY) >= 0: coords.append("Y = %d" % int(draft.requiredY))
	%ScheduleSummary.text = ("Dormant day %d" if int(draft.day) < 0 else "Midnight on day %d") % int(draft.day) + " · %d%% chance · %s" % [int(draft.percent), place]
	if not coords.is_empty(): %ScheduleSummary.text += " · " + ", ".join(coords)
	var gates: Array[String] = []
	if int(draft.requiredItem) > 0: gates.append("item %d required" % int(draft.requiredItem))
	if int(draft.requiredQuest) >= 0: gates.append("quest %d must be set" % int(draft.requiredQuest))
	if not anywhere and int(draft.requiredRandomRect) >= 0: gates.append("inside rectangle %d" % int(draft.requiredRandomRect))
	%Eligibility.text = "; ".join(gates) if not gates.is_empty() else "No item or quest prerequisite."
	%ChecksSummary.text = str(draft_error().get("error", "Open Extra AP %d to inspect its eight-step program." % int(draft.door)))
	if not diagnostics.is_empty() and draft_error().is_empty(): %ChecksSummary.text = str(diagnostics[0].message)
	%Eligibility.text += " Runs Extra Action Point %d. Schedule advances before chance and gates." % int(draft.door)
	%LocationHelp.text = "Any location bypasses level, rectangle and coordinates; stored values are retained." if anywhere else "Rebuilt checks X and Y independently. -1 clears that axis; 0 is a valid exact coordinate."
	%PreviewScope.text = "Timed preview is unavailable: use its Extra AP or playtest the scenario."


func _clear_form() -> void:
	%ScheduleSummary.text = "Open a project, then select or create a Timed Encounter."
	%Eligibility.text = ""; %LocationHelp.text = ""; %EncounterStatus.text = ""


func _pick_cell() -> void:
	%CellX.set_value_no_signal(maxi(0, int(draft.requiredX)))
	%CellY.set_value_no_signal(maxi(0, int(draft.requiredY)))
	%CellContext.text = "%s %d · choose an exact map cell" % [str(draft.locationKind).capitalize(), int(draft.requiredLevel)]
	_focus_origin = %PickCell
	%AcceptCell.disabled = true; %CellCanvas.set_document([], [])
	%CellDialog.popup_centered()
	if cell_handler.is_valid(): await cell_handler.call(str(targets.get("requiredLevel", {}).get("identity", "")))


func target_context(field: ProvidenceEncounterReferenceField) -> Dictionary:
	if field.field_key == "requiredLevel": return {"levelType": str(draft.get("locationKind", "land"))}
	if field.field_key == "requiredRandomRect": return {"mapIdentity": str(targets.get("requiredLevel", {}).get("identity", "")), "levelType": str(draft.locationKind)}
	return {}


func copy_groups() -> Array:
	return [["day", "increment", "percent", "door"], ["requiredItem", "requiredQuest"], ["locationKind", "requiredLevel", "requiredRandomRect", "requiredX", "requiredY"]]


func set_cell_map(document: Dictionary) -> void:
	if not %CellDialog.visible: return
	%CellCanvas.set_document(document.map.get("tiles", []), document.get("actionPoints", []))
	var has_art: bool = %CellCanvas.set_render_atlas(document.get("atlas", {}))
	%CellContext.text += " · click a cell or type coordinates" + (" · artwork unavailable" if not has_art else "")
	%AcceptCell.disabled = false


func draft_error() -> Dictionary:
	var problem := super.draft_error()
	if not problem.is_empty() or draft.is_empty(): return problem
	if draft.percent != baseline.percent and not int(draft.percent) in range(101): return {"error": "Chance must be between 0% and 100%.", "control": %Chance}
	if str(draft.locationKind) != "any":
		for axis in [["requiredX", %ExactX], ["requiredY", %ExactY]]:
			if draft[axis[0]] != baseline[axis[0]] and not int(draft[axis[0]]) in range(-1, 90): return {"error": "Each exact map axis must be -1 (Any) or 0–89.", "control": axis[1]}
	return {}


func _location_changed(index: int) -> void:
	change("locationKind", ["any", "land", "dungeon"][index])
	targets.erase("requiredLevel"); targets.erase("requiredRandomRect")
	updating = true; _present_form(); updating = false
	if reference_refresh_handler.is_valid(): await reference_refresh_handler.call()


func _reference_changed(key: String) -> void:
	if key != "requiredLevel": return
	targets.erase("requiredRandomRect")
	updating = true; _present_form(); updating = false
	if reference_refresh_handler.is_valid(): await reference_refresh_handler.call()


func failure_problem(response: Dictionary) -> Dictionary:
	var problem := draft_error()
	if not problem.is_empty(): return problem
	var error := str(response.get("error", "")).to_lower()
	for entry in [["day", %Day], ["chance", %Chance], ["extra action point", %ExtraAP.get_node("Choose")], ["rectangle", %Rectangle.get_node("Choose")], ["level", %RequiredLevel.get_node("Choose")]]:
		if error.contains(entry[0]): return {"control": entry[1]}
	return {}
