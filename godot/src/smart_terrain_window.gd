extends PanelContainer

signal review_requested
signal apply_requested
signal draw_requested(options: Dictionary)
signal reshape_requested(operation: String)
signal recovery_requested
signal canceled
signal review_invalidated
signal recovery_changed(enabled: bool)
signal comparison_changed
signal history_requested(redo: bool)
signal history_changed

const PRESETS := ["water", "mountains", "forest"]
const SHAPES := ["freehand", "line", "rectangle", "ellipse", "connected"]
const COMBINES := ["replace", "add", "subtract"]
@onready var counts: Label = %SmartCounts
@onready var status: Label = %SmartStatus
var context: Dictionary = {}
var mask: Array = []
var _original: Dictionary = {}
var _plan: Dictionary = {}
var _focus: WeakRef
var _busy := false
var _cancelable := false
var _undo_masks: Array = []
var _redo_masks: Array = []


func _ready() -> void:
	%TerrainFamily.item_selected.connect(func(_index): invalidate(); if not mask.is_empty(): review_requested.emit())
	%Tolerance.item_selected.connect(func(_index): invalidate(); if not mask.is_empty(): review_requested.emit())
	%ShowBefore.toggled.connect(func(_value): comparison_changed.emit())
	%UndoStroke.pressed.connect(history_requested.emit.bind(false))
	%RedoStroke.pressed.connect(history_requested.emit.bind(true))
	%MaskShape.item_selected.connect(func(_index): draw_requested.emit(shape_options()))
	%MaskCombine.item_selected.connect(func(_index): draw_requested.emit(shape_options()))
	%FilledMask.toggled.connect(_set_filled)
	%GrowMask.pressed.connect(reshape_requested.emit.bind("grow"))
	%ShrinkMask.pressed.connect(reshape_requested.emit.bind("shrink"))
	%ClearMask.pressed.connect(reshape_requested.emit.bind("clear"))
	%ReviewSmart.pressed.connect(review_requested.emit)
	%ApplySmart.pressed.connect(apply_requested.emit)
	%RecoverSmart.pressed.connect(recovery_requested.emit)
	%CancelSmart.pressed.connect(cancel)


func _set_filled(enabled: bool) -> void:
	if enabled and not mask.is_empty():
		reshape_requested.emit("fill")
	else:
		draw_requested.emit(shape_options())


func open(data: Dictionary, cells: Array, origin: Control, history: Dictionary = {}) -> void:
	context = data.duplicate(true); mask = cells.duplicate(true); _focus = weakref(origin)
	_undo_masks.assign(history.get("undo",[]).duplicate(true))
	_redo_masks.assign(history.get("redo",[]).duplicate(true)); %ShowBefore.set_pressed_no_signal(false)
	for index in PRESETS.size():
		var matches: Array = data.get("presets", []).filter(func(row): return row.identity == PRESETS[index])
		var available: bool = not matches.is_empty() and matches[0].get("available", data.get("available", false))
		%TerrainFamily.set_item_disabled(index, not available)
		%TerrainFamily.set_item_tooltip(index, "" if available else str(matches[0].get("unavailableReason", "Terrain artwork is unavailable.")) if not matches.is_empty() else "Terrain artwork is unavailable.")
	if %TerrainFamily.is_item_disabled(%TerrainFamily.selected):
		for index in PRESETS.size():
			if not %TerrainFamily.is_item_disabled(index): %TerrainFamily.select(index); break
	%SmartDestination.text = "SMART TERRAIN · %s" % data.mapIdentity.replace(":", " ").capitalize()
	_original = draft(); _plan.clear(); set_busy(false); invalidate()
	show(); %TerrainFamily.grab_focus()


func draft() -> Dictionary:
	return {"tilesetId":context.get("tilesetId", ""),"atlasBlob":context.get("atlasBlob"),"mappingRevision":int(context.get("mappingRevision",0)),"preset":PRESETS[%TerrainFamily.selected],"tolerance":["literal","gentle","balanced","strong"][%Tolerance.selected],"mask":mask.map(func(cell): return {"x":int(cell.x),"y":int(cell.y)})}


func shape_options() -> Dictionary:
	return {"shape":SHAPES[%MaskShape.selected],"filled":%FilledMask.button_pressed,"combine":COMBINES[%MaskCombine.selected]}


func accept_mask(cells: Array) -> void:
	cells = cells.map(func(cell): return {"x":int(cell.x),"y":int(cell.y)})
	if not preload("res://src/document_value_equality.gd").equal(mask,cells):
		_undo_masks.append(mask.duplicate(true)); _redo_masks.clear()
		if _undo_masks.size() > 128: _undo_masks.pop_front()
	mask = cells.duplicate(true); invalidate()
	_history_buttons()


func step_history(redo: bool) -> bool:
	var source: Array = _redo_masks if redo else _undo_masks
	var destination: Array = _undo_masks if redo else _redo_masks
	if source.is_empty() or _busy: return false
	destination.append(mask.duplicate(true)); mask = source.pop_back()
	invalidate(); _history_buttons(); return true


func _history_buttons() -> void:
	%UndoStroke.disabled = _busy or _undo_masks.is_empty()
	%RedoStroke.disabled = _busy or _redo_masks.is_empty()
	history_changed.emit()


func mask_history() -> Dictionary:
	return {"undo":_undo_masks.duplicate(true),"redo":_redo_masks.duplicate(true)}


func history_state() -> Dictionary:
	return {"canUndo":not _busy and not _undo_masks.is_empty(),"canRedo":not _busy and not _redo_masks.is_empty()}


func invalidate() -> void:
	_plan.clear(); %ApplySmart.disabled = true
	counts.text = "%d mask cells · review to resolve edges" % mask.size()
	status.text = "Preview pending." if context.get("available", false) else str(context.get("unavailableReason", "Smart terrain is unavailable."))
	%ReviewSmart.disabled = _busy or not context.get("available", false) or mask.is_empty()
	review_invalidated.emit()


func review_plan() -> Dictionary:
	return _plan.get("data", {})


func display_plan() -> Dictionary:
	return {"originalMask":mask} if %ShowBefore.button_pressed else review_plan()


func present(plan: Dictionary) -> void:
	_plan = {"draft":draft(),"data":plan.duplicate(true)}
	counts.text = "%d mask cells · %d changed · %d unchanged · %d transition warnings" % [mask.size(),plan.paintedCells.size(),plan.unchangedCells,plan.unresolvedCells.size()]
	if not plan.get("retiledNeighbors", []).is_empty(): counts.text += " · %d re-tiled neighbors" % plan.retiledNeighbors.size()
	counts.text += " · %d added · %d removed" % [plan.get("addedCells",[]).size(),plan.get("removedCells",[]).size()]
	status.text = str(plan.get("unresolvedReason") if plan.get("unresolvedReason") != null else "Warning: approximate transitions. Apply keeps the previewed tiles.") if not plan.unresolvedCells.is_empty() else ""
	if not plan.canApply and plan.unresolvedCells.is_empty():
		status.text = "No changes; selected cells already match."
	elif not plan.canApply:
		status.text = "No tile changes. " + status.text
	%ApplySmart.disabled = _busy or not plan.canApply
	%ApplySmart.tooltip_text = "" if plan.canApply else status.text


func review_is_current() -> bool:
	return not _plan.is_empty() and _plan.draft == draft() and _plan.data.canApply


func has_unapplied_changes() -> bool:
	return draft() != _original or review_is_current()


func set_busy(enabled: bool, recovery := false, cancelable := false) -> void:
	_busy = enabled
	_cancelable = cancelable
	_history_buttons()
	for node in [%TerrainFamily,%MaskShape,%MaskCombine,%Tolerance]: node.disabled = enabled
	%FilledMask.disabled = enabled
	for node in [%GrowMask,%ShrinkMask,%ClearMask]: node.disabled = enabled
	%CancelSmart.disabled = enabled and not cancelable
	%ReviewSmart.disabled = enabled or mask.is_empty() or not context.get("available",false)
	%ApplySmart.disabled = enabled or not review_is_current()
	%RecoverSmart.visible = recovery; %RecoverSmart.disabled = enabled and not recovery
	recovery_changed.emit(recovery)


func show_failure(message: String) -> void:
	status.text = message


func cancel() -> void:
	if _busy and not _cancelable: return
	canceled.emit(); dismiss()


func dismiss() -> void:
	hide()
	if _focus != null and is_instance_valid(_focus.get_ref()) and _focus.get_ref().is_inside_tree(): _focus.get_ref().grab_focus()


func _unhandled_key_input(event: InputEvent) -> void:
	if is_visible_in_tree() and event.is_action_pressed("ui_cancel"): cancel(); get_viewport().set_input_as_handled()


func _input(event: InputEvent) -> void:
	if not is_visible_in_tree() or not event is InputEventKey or not event.pressed or event.echo: return
	if (event.ctrl_pressed or event.meta_pressed) and event.keycode in [KEY_Z,KEY_Y]:
		history_requested.emit(event.keycode == KEY_Y or event.shift_pressed)
		get_viewport().set_input_as_handled()
