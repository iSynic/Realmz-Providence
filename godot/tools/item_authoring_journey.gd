extends SceneTree

var _bridge: ProvidenceNativeBridge
var _operations: ProvidenceEditorOperation
var _view: ProvidenceItemEditor
var _controller := preload("res://src/item_workbench_controller.gd").new()
var _revision := 0
var _failed := false


func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if not _check(args.size() == 1 and DirAccess.dir_exists_absolute(args[0]), "Expected an existing disposable journey root"): return
	root.size = Vector2i(1600, 900); root.gui_embed_subwindows = true
	_bridge = ProvidenceNativeBridge.new(args[0].path_join("settings.cfg"))
	_operations = ProvidenceEditorOperation.new(); root.add_child(_operations)
	if not _ok(_bridge.create_project("item-authoring-journey", args[0].path_join("project"))): return
	_view = load("res://src/item_editor.tscn").instantiate(); root.add_child(_view)
	_view.theme = load("res://theme/providence_theme.tres"); _view.size = Vector2(1600, 900)
	_controller.initialize(_view, _operations, func(): return {"revision": _revision}, func(response): return response.get("ok", false))
	_controller.projection_applied.connect(func(change): _revision = int(change.revision))
	_controller.attach_session(_bridge)
	if not _ok(await _controller.reload()): return
	await _create_and_edit()
	if _failed: return
	await _catalog_and_picker()
	if _failed: return
	await _invalid_and_history(args[0].path_join("project"))
	if _failed: return
	await _stock_copy_clear()
	if _failed: return
	await _idle()
	_controller.dispose(); _bridge.stop(); _view.queue_free(); _operations.queue_free(); await process_frame
	print("PROVIDENCE_ITEM_AUTHORING_JOURNEY_OK atomic-create complete-form MacRoman signed-masks catalog-draft-preservation picker-preview-cancel-accept same-selection invalid-kept undo-redo save-reopen stock-copy clear-impact-stage-cancel-apply-undo")
	quit()


func _create_and_edit() -> void:
	await _controller._records.review_record("new")
	var review = _controller._records._review
	if not _check(review.visible, "New opens a core-derived allocation review"): return
	review.get_node("%UseDraft").pressed.emit()
	if not _check(_view.draft.allocation != null and _view.draft.definition.classicId == 900, "Reviewed allocation creates only a local draft"): return
	_edit_text("name", "Café Blade")
	_edit_text("unidentifiedName", " Bright blade ")
	_edit_text("description", "First line\nSecond line")
	_view.form.control_for("cost").value = 99
	_view.form.show_section("Equipment")
	_view.form.control_for("damageBonus").value = 7
	_view.form.show_section("Restrictions")
	_view.form.control_for("raceRestrictions").value = -32763
	_view.form.show_section("Special")
	_view.form.control_for("special.0").value = 29
	_view.form.control_for("special.1").value = 2
	if not _ok(await _view.commit_selected()): return
	if not _check(_revision == 1 and not _view.has_unapplied_changes(), "One visible form makes one acknowledged history operation"): return
	var saved := _bridge.request("item.open", {"identity": "classic.item.900"})
	if not _ok(saved): return
	_check(saved.result.item.name == "Café Blade" and saved.result.item.unidentifiedName == " Bright blade " and saved.result.item.damageBonus == 7 and saved.result.item.raceRestrictions == -32763, "All sections persist without trimming text or signed masks")


func _catalog_and_picker() -> void:
	_view.form.control_for("cost").value = 100
	var search: LineEdit = _view.get_node("%ItemSearch"); search.text = "no matches"; search.text_changed.emit(search.text)
	await create_timer(0.5).timeout; await _idle()
	if not _check(_view.catalog_items().is_empty() and _view.draft.definition.cost == 100 and _view.has_unapplied_changes(), "No-result inventory filtering keeps the open draft"): return
	_view.discard_draft()
	_controller._references.open_picker("itemType"); await _idle()
	var picker = _controller._references._picker
	if not _check(picker.visible and not _view.has_unapplied_changes(), "Browsing a contextual picker does not change the draft"): return
	picker.cancel()
	if not _check(not _view.has_unapplied_changes(), "Picker cancellation preserves the current action"): return
	_controller._references.open_picker("itemType"); await _idle()
	var choices: ItemList = picker.get_node("%Choices")
	for index in choices.item_count:
		if choices.get_item_text(index).begins_with("0 ·"): choices.select(index); choices.item_selected.emit(index)
	picker.get_node("%UseSelection").pressed.emit()
	if not _check(not _view.has_unapplied_changes(), "Accepting the current type is a no-op"): return
	_controller._references.open_picker("itemType"); await _idle()
	var input: LineEdit = picker.get_node("%Search"); input.text = "-23"; input.text_changed.emit(input.text)
	await create_timer(0.3).timeout; await _idle()
	if not _check(choices.item_count == 1, "Signed identity search returns the exact type"): return
	choices.select(0); choices.item_selected.emit(0); picker.get_node("%UseSelection").pressed.emit()
	if not _check(_view.draft.definition.itemType == -23 and _view.has_unapplied_changes(), "Picker acceptance retains the exact signed type"): return
	_view.discard_draft()


func _invalid_and_history(project: String) -> void:
	_edit_text("name", "Unrepresentable 🦉")
	var response: Dictionary = await _view.commit_selected()
	if not _check(not response.get("ok", false) and _view.has_unapplied_changes() and _revision == 1, "Invalid MacRoman Apply retains the draft and history"): return
	_view.discard_draft()
	if not _check(not _view.has_unapplied_changes(), "Discard restores the acknowledged complete form"): return
	await _idle()
	var undone := _bridge.request("history.undo", {"expectedRevision": _revision})
	if not _ok(undone): return
	_revision = int(undone.result.revision)
	if not _check(_bridge.request("item.open", {"identity": "classic.item.900"}).get("ok", false) == false, "Undo removes the whole new item"): return
	var redone := _bridge.request("history.redo", {"expectedRevision": _revision})
	if not _ok(redone): return
	_revision = int(redone.result.revision)
	if not _ok(_bridge.request("project.save", {"expectedRevision": _revision})): return
	_bridge.stop()
	if not _ok(_bridge.start_project(project)): return
	_controller.attach_session(_bridge)
	if not _ok(await _controller.open_item("classic.item.900")): return
	_check(_view.draft.definition.name == "Café Blade" and preload("res://src/monster_operation_identity.gd").matches(_view.draft.definition.special, [29, 2, 0, 0, 0]) and not _view.has_unapplied_changes(), "Save and reopen restores the complete native draft baseline: name=%s special=%s dirty=%s" % [_view.draft.definition.name, str(_view.draft.definition.special), str(_view.has_unapplied_changes())])


func _edit_text(field: String, value: String) -> void:
	var control: Control = _view.form.control_for(field)
	control.text = value
	if control is LineEdit: control.text_changed.emit(value)
	else: control.text_changed.emit()


func _stock_copy_clear() -> void:
	if not _ok(await _controller.open_item("classic.item.51")): return
	var stock := _view.selected_definition().duplicate(true)
	if not _check(not _view.draft.editable, "Stock browsing never grants edit authority"): return
	await _controller._records.review_record("copy")
	_controller._records._review.get_node("%UseDraft").pressed.emit()
	if not _check(_view.draft.definition.classicId == 901 and _view.draft.copy_source != null and _view.has_unapplied_changes(), "Copy reviews the protected source and vacant scenario destination"): return
	_edit_text("name", "Custom stock copy")
	if not _ok(await _view.commit_selected()): return
	if not _check(_bridge.request("item.open", {"identity": stock.id}).result.item == stock, "Copy leaves Stock untouched"): return
	var copied := _view.selected_definition().duplicate(true)
	await _controller._records.review_record("clear")
	_controller._records._review.cancel()
	if not _check(_view.selected_definition() == copied and not _view.has_unapplied_changes(), "Cancel clear leaves the acknowledged item untouched"): return
	await _controller._records.review_record("clear")
	_controller._records._review.get_node("%UseDraft").pressed.emit()
	if not _check(_view.has_unapplied_changes() and _view.draft.definition.id == copied.id and _bridge.request("item.open", {"identity": copied.id}).result.item == copied, "Clear retains identity and stays local until Apply"): return
	if not _ok(await _view.commit_selected()): return
	var undone := _bridge.request("history.undo", {"expectedRevision": _revision})
	if not _ok(undone): return
	_revision = int(undone.result.revision)
	_check(_bridge.request("item.open", {"identity": copied.id}).result.item == copied, "One Undo restores the complete copied definition")


func _idle() -> void:
	var stable := 0
	for frame in 600:
		await process_frame
		stable = stable + 1 if not _operations.busy and not _bridge.operation_busy() else 0
		if stable >= 8: return
	_check(false, "The item workflow did not finish within the bounded wait")


func _ok(response: Dictionary) -> bool:
	return _check(response.get("ok", false), str(response.get("error", "Native item command failed")))


func _check(condition: bool, message: String) -> bool:
	if condition: return true
	_failed = true; push_error("ITEM_AUTHORING_JOURNEY_FAILED: " + message)
	if _bridge != null: _bridge.stop()
	quit(1)
	return false
