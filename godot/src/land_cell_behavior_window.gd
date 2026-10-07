extends Window

signal review_requested
signal apply_requested
signal recovery_requested
signal canceled
signal script_requested
signal advanced_requested
var context: Dictionary = {}
var _baseline: Dictionary = {}
var _remove := false
var _busy := false
var _reviewed := false
var _focus: WeakRef
var _action_point: Dictionary = {}


func _ready() -> void:
	for text in ["Normal","Hidden secret","Revealed secret"]: %SecretState.add_item(text)
	for text in ["Passable","Solid"]: %Passability.add_item(text)
	%SecretState.item_selected.connect(func(_index): _changed())
	for index in 3:
		get_node("%" + ["SecretNormal", "SecretHidden", "SecretRevealed"][index]).pressed.connect(func(): %SecretState.select(index); _changed())
	%OpenCellActionPoint.pressed.connect(_request_script)
	%CreateCellActionPoint.pressed.connect(_request_script)
	%CellTechnicalDetails.pressed.connect(func(): if not _busy and not has_unapplied_changes(): advanced_requested.emit())
	%PlacementDetailsToggle.toggled.connect(func(enabled): %PlacementDetails.visible = enabled; size = Vector2i(820, 740 if enabled else 600))
	%Passability.item_selected.connect(func(_index): _changed())
	%RemovePlacement.pressed.connect(func(): _remove = true; _changed(); review_requested.emit())
	%DiscardCellBehavior.pressed.connect(discard_draft)
	%ReviewCellBehavior.pressed.connect(review_requested.emit)
	%ApplyCellBehavior.pressed.connect(apply_requested.emit)
	%RecoverCellBehavior.pressed.connect(recovery_requested.emit)
	%CancelCellBehavior.pressed.connect(cancel); close_requested.connect(cancel)
	%DiscardCellConfirmation.confirmed.connect(func(): dismiss(); canceled.emit())


func present(data: Dictionary, focus: Control) -> void:
	context = {"identity":data.identity,"revision":int(data.revision),"x":int(data.cell.coordinate.x),"y":int(data.cell.coordinate.y)}
	_baseline = data.cell.duplicate(true); _focus = weakref(focus)
	%CellDestination.text = "%s · Cell %d, %d" % [context.identity,context.x,context.y]
	%PassabilityReason.text = str(_baseline.solidityReason)
	%PlacementDetailsToggle.set_pressed_no_signal(false); %PlacementDetails.hide()
	set_busy(false); discard_draft(); popup_centered(Vector2i(820,600)); %SecretNormal.grab_focus()


func present_selection(data: Dictionary) -> void:
	%CellDestination.text = "%s · Cell %d, %d" % [str(data.get("mapName",context.identity)), context.x, context.y]
	%CellArtwork.texture = data.get("base"); %CellOverlay.texture = data.get("overlay")
	%CellArtworkName.text = str(data.get("caption", "Artwork unavailable")) + (" · Special Land %d" % int(data.resourceId) if int(data.get("resourceId", 0)) != 0 else "")
	_action_point = data.get("actionPoint", {}).duplicate(true)
	%CellActionPointSummary.text = "No Action Point on this cell" if _action_point.is_empty() else "Action Point %d · Placed" % int(_action_point.recordIndex)
	%OpenCellActionPoint.text = "Open Action Point %d" % int(_action_point.recordIndex) if not _action_point.is_empty() else "Open Action Point"
	%CellPlacementStatus.text = "This cell already owns AP %d. Choose a free cell to create/place another Action Point." % int(_action_point.recordIndex) if not _action_point.is_empty() else "No Action Point at this cell."
	_buttons()


func _request_script() -> void:
	if visible and not _busy and not context.is_empty() and not has_unapplied_changes(): script_requested.emit()


func present_unavailable(origin: Dictionary, focus: Control, message: String, recovery: bool) -> void:
	context.clear(); _baseline.clear(); _remove = false; _focus = weakref(focus)
	%CellDestination.text = "%s · Cell %d, %d" % [origin.identity,origin.x,origin.y]
	%PassabilityReason.text = "Cell behavior has not loaded."
	%CellImpact.clear(); show_failure(message,recovery)
	%SecretState.disabled = true; %Passability.disabled = true
	%CellArtwork.texture = null; %CellOverlay.texture = null; _action_point.clear()
	%CellArtworkName.text = "Cell details unavailable"; %CellActionPointSummary.text = "Read this cell before opening its references."
	popup_centered(Vector2i(820,600))


func discard_draft() -> void:
	if _busy or _baseline.is_empty(): return
	%SecretState.select(["normal","hidden","revealed"].find(str(_baseline.secret)))
	%Passability.select(1 if _baseline.solid == true else 0)
	_remove = false; _changed()


func draft() -> Dictionary:
	return {"x":context.x,"y":context.y,"secret":["normal","hidden","revealed"][%SecretState.selected],"solid":null if _baseline.solid == null or (%Passability.selected == 1) == _baseline.solid else %Passability.selected == 1,"removePlacement":_remove}


func has_unapplied_changes() -> bool:
	if context.is_empty(): return false
	var edit := draft()
	return _remove or edit.secret != _baseline.secret or edit.solid != null


func _changed() -> void:
	_reviewed = false; %CellImpact.clear()
	%CellBehaviorStatus.text = "Remove this artwork placement to the configured clear tile. Secret state and Action Point records stay intact." if _remove else "Unapplied changes" if has_unapplied_changes() else ""
	_buttons()


func review_is_current() -> bool: return _reviewed and not _busy


func present_review(data: Dictionary) -> void:
	%CellImpact.clear()
	for row in data.cell.affectedMaps: %CellImpact.add_item("%s · %s · %d placements" % [row.identity,row.name,int(row.cells)])
	%CellBehaviorStatus.text = "Reviewed · %d maps use this artwork." % int(data.total)
	_reviewed = bool(data.cell.changed); _buttons()


func set_busy(busy: bool, recovery := false) -> void:
	_busy = busy; %RecoverCellBehavior.visible = recovery
	%SecretState.disabled = busy; %Passability.disabled = busy or _baseline.get("solid") == null
	_buttons()


func _buttons() -> void:
	var dirty := has_unapplied_changes()
	for index in 3:
		var button: Button = get_node("%" + ["SecretNormal", "SecretHidden", "SecretRevealed"][index])
		button.disabled = _busy or context.is_empty(); button.set_pressed_no_signal(index == %SecretState.selected)
	%OpenCellActionPoint.disabled = _busy or dirty or _action_point.is_empty() or context.is_empty()
	%CreateCellActionPoint.disabled = _busy or dirty or not _action_point.is_empty() or context.is_empty()
	%CellTechnicalDetails.disabled = _busy or dirty or context.is_empty()
	for button in [%OpenCellActionPoint, %CreateCellActionPoint, %CellTechnicalDetails]:
		button.tooltip_text = "Apply or discard this draft before opening another editor." if dirty else ""
	%ReviewCellBehavior.disabled = _busy or not dirty
	%ApplyCellBehavior.disabled = _busy or not _reviewed
	%DiscardCellBehavior.disabled = _busy or not dirty
	%CancelCellBehavior.disabled = _busy
	%RemovePlacement.disabled = _busy or dirty or _baseline.get("specialResourceId") == null


func show_failure(message: String, recovery: bool) -> void:
	_reviewed = false; set_busy(recovery,recovery)
	%CellBehaviorStatus.text = message + (" Your draft is kept." if not _baseline.is_empty() else " Reconnect to read this cell." if recovery else " Reopen this cell to try again.")


func cancel() -> void:
	if _busy: return
	if has_unapplied_changes(): %DiscardCellConfirmation.popup_centered(); return
	dismiss(); canceled.emit()


func dismiss() -> void:
	hide(); %DiscardCellConfirmation.hide(); context.clear(); _baseline.clear()
	if _focus != null and is_instance_valid(_focus.get_ref()) and _focus.get_ref().is_inside_tree() and _focus.get_ref().is_visible_in_tree(): _focus.get_ref().grab_focus()


func _input(event: InputEvent) -> void:
	if visible and event.is_action_pressed("ui_cancel"): cancel(); set_input_as_handled()
