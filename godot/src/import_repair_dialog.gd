class_name ProvidenceImportRepairDialog
extends Window

signal applied(projection: Dictionary)

var operations: ProvidenceEditorOperation
var bridge
var _assessment: Dictionary = {}
var _selected: Dictionary = {}
var _offset := 0
var _busy := false
var _committing := false
var _generation := 0


func _ready() -> void:
	theme = preload("res://src/issues_theme.gd").new()
	close_requested.connect(cancel_review)
	%Cancel.pressed.connect(cancel_review)
	%Apply.pressed.connect(_apply)
	%Previous.pressed.connect(_previous_page)
	%Next.pressed.connect(_next_page)


func apply_theme(mode: String, density: String) -> void:
	theme.mode = mode
	theme.density = density


func review(active_bridge) -> void:
	_generation += 1
	bridge = active_bridge
	_selected.clear()
	_assessment.clear()
	popup_centered(Vector2i(940, 640))
	_load(0)


func _load(offset: int) -> void:
	if _busy:
		return
	var generation := _generation
	var epoch: int = bridge.connection_epoch()
	_set_busy(true)
	%Status.text = "Checking retained scenario content…"
	var response: Dictionary = await operations.run_workflow(bridge, "Review imported content", func(op):
		return await op.request("project.import-repair.assess", {"offset": offset, "limit": 64})
	)
	_set_busy(false)
	# Cancel and reconnect invalidate this completion without changing the reviewed draft.
	if generation != _generation or epoch != bridge.connection_epoch() or not visible:
		return
	if not response.get("ok", false):
		%Status.text = str(response.get("error", "Recovery unavailable."))
		%Apply.disabled = true
		return
	if not _assessment.is_empty() and int(response.result.revision) != int(_assessment.revision):
		_selected.clear()
	_assessment = response.result
	_offset = offset
	_render()


func _render() -> void:
	for child in %Entries.get_children():
		%Entries.remove_child(child)
		child.queue_free()
	var assessment: Dictionary = _assessment.assessment
	%Status.text = "%d corrections · %d authored conflicts" % [int(_assessment.safeCount), int(_assessment.conflictCount)]
	if int(_assessment.total) == 0:
		%Status.text = "No imported content needs correction."
	if not assessment.sourceRequirements.is_empty():
		%Status.text = "\n".join(assessment.sourceRequirements)
	for entry: Dictionary in assessment.entries:
		_add_entry(entry)
	%Previous.disabled = _offset == 0
	%Next.disabled = _offset + 64 >= int(_assessment.total)
	%Page.text = "%d–%d / %d" % [mini(_offset + 1, int(_assessment.total)), mini(_offset + 64, int(_assessment.total)), int(_assessment.total)]
	%Apply.disabled = int(_assessment.total) == 0 or not assessment.sourceRequirements.is_empty()


func _apply() -> void:
	if _busy or _assessment.is_empty():
		return
	_committing = true
	_set_busy(true)
	var assessment: Dictionary = _assessment.assessment
	var params := {"expectedRevision": int(_assessment.revision), "expectedProjectId": _assessment.projectId,
		"expectedSourceIdentity": assessment.sourceIdentity, "expectedInterpretationVersion": int(assessment.previousVersion),
		"replaceConflicts": _selected.keys()}
	var response: Dictionary = await operations.run_workflow(bridge, "Correct imported content", func(op):
		return await op.request("project.import-repair.apply", params)
	)
	_set_busy(false)
	_committing = false
	if response.get("ok", false):
		applied.emit(response.result)
		hide()
	else:
		%Status.text = str(response.get("error", "Recovery failed. Review again."))
		%Apply.disabled = true


func _set_busy(value: bool) -> void:
	_busy = value
	for button in [%Apply, %Previous, %Next]:
		button.disabled = value
	%Cancel.disabled = value and _committing


func cancel_review() -> void:
	if not _committing:
		_generation += 1
		_selected.clear()
		hide()


func _previous_page() -> void:
	_load(maxi(0, _offset - 64))


func _next_page() -> void:
	_load(_offset + 64)


func _add_entry(entry: Dictionary) -> void:
	var row := CheckButton.new()
	row.text = "%s · %s · %s%s" % [entry.family, entry.entity, entry.field, " · replace authored value" if entry.conflict else ""]
	row.tooltip_text = "Current: %s\nCorrection: %s" % [entry.current, entry.recovered]
	row.disabled = not bool(entry.conflict)
	row.button_pressed = not bool(entry.conflict) or _selected.has(entry.key)
	row.toggled.connect(_change_selection.bind(str(entry.key)))
	%Entries.add_child(row)


func _change_selection(enabled: bool, key: String) -> void:
	if enabled:
		_selected[key] = true
	else:
		_selected.erase(key)
