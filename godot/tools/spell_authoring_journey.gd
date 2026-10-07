extends SceneTree

var _bridge: ProvidenceNativeBridge
var _operations: ProvidenceEditorOperation
var _view: ProvidenceSpellEditor
var _controller := preload("res://src/spell_workbench_controller.gd").new()
var _revision := 0
var _failed := false


func _initialize() -> void: _run.call_deferred()


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if not _check(args.size() == 1 and DirAccess.dir_exists_absolute(args[0]), "Expected a disposable journey root"): return
	root.size = Vector2i(1600, 900); root.gui_embed_subwindows = true
	_bridge = ProvidenceNativeBridge.new(args[0].path_join("settings.cfg"))
	_operations = ProvidenceEditorOperation.new(); root.add_child(_operations)
	if not _ok(_bridge.create_project("spell-authoring-journey", args[0].path_join("project"))): return
	_view = load("res://src/spell_editor.tscn").instantiate()
	_view.theme = load("res://theme/providence_theme.tres"); root.add_child(_view); _view.size = Vector2(1600, 900)
	_controller.initialize(_view, _operations, func(): return {"revision": _revision}, func(): return _bridge, func(response): return response.get("ok", false))
	_controller.projection_applied.connect(func(change): _revision = int(change.revision))
	_controller.attach_session(_bridge)
	if not _ok(await _controller.reload()): return
	await _create_and_edit()
	if _failed: return
	await _picker_and_catalog()
	if _failed: return
	await _history_and_persistence(args[0].path_join("project"))
	if _failed: return
	await _copy_and_clear()
	if _failed: return
	await _idle()
	_controller.dispose(); _bridge.stop(); _view.queue_free(); _operations.queue_free(); await process_frame
	print("PROVIDENCE_SPELL_AUTHORING_JOURNEY_OK complete-form atomic-create MacRoman signed-values allocation draft-safe-search preview-cancel same-selection stale-picker invalid-kept undo-redo save-reopen stock-copy clear-stage-apply-undo")
	quit()


func _create_and_edit() -> void:
	await _controller._records.review_record("new")
	var review = _controller._records._review
	if not _check(review.visible, "New opens the guarded allocation review"): return
	review.get_node("%UseDraft").pressed.emit()
	if not _check(_view.draft.allocation != null and _revision == 0, "Allocation starts only a local draft"): return
	_text("name", "  Éclat  ")
	_text("description", "First line\nSecond line")
	for pair in [["cost", 255], ["toHitBonus", -128], ["saveBonus", -2], ["saveAdjust", -1], ["resistanceAdjust", 127], ["damageMin", 2], ["damageMax", 8], ["powerDamageMin", 1], ["powerDamageMax", 4], ["durationMin", 1], ["durationMax", 3], ["powerDurationMin", 2], ["powerDurationMax", 6], ["rangeMin", 3], ["rangeMax", 7], ["fixedTargetCount", 1], ["size", 2], ["spellClass", 4], ["special", 0]]:
		_view.form.control_for(pair[0]).value = pair[1]
	_view.form.control_for("inCombat").button_pressed = true
	_view.form.control_for("inCamp").button_pressed = true
	if not _ok(await _view.commit_selected()): return
	if not _check(_revision == 1 and not _view.has_unapplied_changes(), "One form makes one acknowledged history change"): return
	var saved := _bridge.request("spell.open-authoring", {"identity": "classic.spell.5101"})
	if not _ok(saved): return
	_check(saved.result.definition.name == "  Éclat  " and saved.result.definition.cost == 255 and saved.result.definition.toHitBonus == -128 and saved.result.definition.damageMax == 8 and saved.result.definition.powerDurationMax == 6, "Every section persists exact text, signed values and independent range endpoints")


func _picker_and_catalog() -> void:
	await _idle()
	_view.form.control_for("cost").value = 100
	var input: LineEdit = _view.get_node("%SpellSearch"); input.text = "no matching spell"; input.text_changed.emit(input.text)
	await create_timer(0.3).timeout; await _idle()
	if not _check(_view.get_node("%SpellRecordList").item_count == 0 and _view.draft.definition.cost == 100 and _view.has_unapplied_changes(), "No-result catalog filtering preserves the active draft"): return
	_view.discard_draft()
	_controller._references.open_picker("lookEnd"); await _idle()
	var picker = _controller._references._picker
	if not _check(picker.visible and not _view.has_unapplied_changes(), "Single-click picker preview does not write"): return
	picker.cancel(false)
	if not _check(not _view.has_unapplied_changes(), "Cancel leaves the draft unchanged"): return
	_controller._references.open_picker("lookEnd"); await _idle()
	if not _check(not picker.get_node("%UseSelection").disabled, "The complete default animation can be accepted"): return
	picker.get_node("%UseSelection").pressed.emit()
	if not _check(not _view.has_unapplied_changes(), "The current stored animation is a no-op"): return
	_controller._references.open_picker("lookEnd"); await _idle()
	input = picker.get_node("%Search"); input.text = "12032"; input.text_changed.emit(input.text)
	await create_timer(0.3).timeout; await _idle()
	var choices: ItemList = picker.get_node("%Choices")
	if not _check(choices.item_count == 2, "A frame alias retains distinct stored values zero and five"): return
	choices.select(1); choices.item_selected.emit(1); await _idle()
	picker.get_node("%UseSelection").pressed.emit()
	if not _check(_view.draft.definition.lookEnd == 5 and _view.has_unapplied_changes(), "Explicit acceptance keeps the canonical stored identity"): return
	_view.discard_draft()
	_controller._references.open_picker("lookEnd"); await _idle()
	var context: Dictionary = picker.context.duplicate(true)
	_text("name", "Changed picker origin")
	_controller._references.accept({"available": true, "value": 5}, context)
	if not _check(_view.draft.definition.lookEnd == 0, "Stale picker acceptance cannot affect an edited draft"): return
	picker.cancel(false); _view.discard_draft()


func _history_and_persistence(project: String) -> void:
	_text("name", "Unrepresentable 🌙")
	var result: Dictionary = await _view.commit_selected()
	if not _check(not result.get("ok", false) and _view.has_unapplied_changes() and _revision == 1, "Invalid MacRoman Apply keeps the draft and revision"): return
	_view.discard_draft()
	if not _check(not _view.get_node("%SubmissionNotice").visible and _view.get_node("%NameFeedback").text == "9 / 255 MacRoman bytes", "Discard immediately clears the invalid draft's error and byte count"): return
	await _idle()
	var undone := _bridge.request("history.undo", {"expectedRevision": _revision})
	if not _ok(undone): return
	_revision = int(undone.result.revision)
	if not _check(_bridge.request("spell.open-authoring", {"identity": "classic.spell.5101"}).result.empty, "Undo removes the complete fresh spell family"): return
	var redone := _bridge.request("history.redo", {"expectedRevision": _revision})
	if not _ok(redone): return
	_revision = int(redone.result.revision)
	if not _ok(_bridge.request("project.save", {"expectedRevision": _revision})): return
	_bridge.stop()
	if not _ok(_bridge.start_project(project)): return
	_controller.attach_session(_bridge)
	if not _ok(await _controller.open_spell("classic.spell.5101")): return
	_check(_view.draft.definition.name == "  Éclat  " and _view.draft.definition.toHitBonus == -128 and not _view.has_unapplied_changes(), "Save/reopen restores the exact acknowledged baseline")


func _copy_and_clear() -> void:
	if not _ok(await _controller.open_spell("classic.spell.1101")): return
	if not _check(not _view.draft.editable and not _view.form.control_for("name").editable, "Stock definitions are protected"): return
	await _controller._records.review_record("copy")
	var review = _controller._records._review
	if not _check(review.visible and review.get_node("%Summary").text.contains("classic.spell.1101"), "Copy review names the exact Stock source"): return
	review.get_node("%UseDraft").pressed.emit()
	if not _check(_view.draft.definition.classicId == 5102 and _view.has_unapplied_changes(), "Stock copy allocates a separate Custom identity locally"): return
	if not _ok(await _view.commit_selected()): return
	var copied := _view.selected_definition()
	await _controller._records.review_record("clear")
	if not _check(review.visible, "Clear opens incoming-use impact review"): return
	review.get_node("%Cancel").pressed.emit()
	if not _check(not _view.has_unapplied_changes(), "Cancelling Clear preserves the spell"): return
	await _controller._records.review_record("clear")
	review.get_node("%UseDraft").pressed.emit()
	if not _check(_view.has_unapplied_changes() and _bridge.request("spell.open-authoring", {"identity": copied.id}).result.definition == copied, "Staged Clear leaves canonical truth unchanged"): return
	if not _ok(await _view.commit_selected()): return
	var undone := _bridge.request("history.undo", {"expectedRevision": _revision})
	if not _ok(undone): return
	_revision = int(undone.result.revision)
	_check(_bridge.request("spell.open-authoring", {"identity": copied.id}).result.definition == copied, "One Undo restores the complete copied spell")


func _text(field: String, value: String) -> void:
	var control: Control = _view.form.control_for(field)
	control.text = value
	if control is TextEdit: control.text_changed.emit()
	else: control.text_changed.emit(value)


func _idle() -> void:
	var stable := 0
	for frame in 900:
		await process_frame
		stable = stable + 1 if not _operations.busy and not _bridge.operation_busy() else 0
		if stable >= 12: return
	_check(false, "The Spell workflow exceeded its bounded wait")


func _ok(response: Dictionary) -> bool: return _check(response.get("ok", false), str(response.get("error", "Native spell command failed")))


func _check(condition: bool, message: String) -> bool:
	if condition: return true
	_failed = true; push_error("SPELL_AUTHORING_JOURNEY_FAILED: " + message)
	if _bridge != null: _bridge.stop()
	quit(1)
	return false
