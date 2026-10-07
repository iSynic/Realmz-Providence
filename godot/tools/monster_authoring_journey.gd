extends SceneTree

var _failed := false
var _bridge: ProvidenceNativeBridge
var _operations: ProvidenceEditorOperation
var _route
var _view
var _dialog
var _output_root := ""


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	root.size = Vector2i(1600, 900)
	root.content_scale_size = Vector2i(1600, 900)
	root.gui_embed_subwindows = true
	var args := OS.get_cmdline_user_args()
	if args.size() != 1: _check(false, "Expected a disposable output root"); return
	_output_root = args[0]
	_bridge = ProvidenceNativeBridge.new(_output_root.path_join("settings.cfg"))
	_operations = ProvidenceEditorOperation.new()
	root.add_child(_operations)
	var project := _output_root.path_join("project")
	var library := _output_root.path_join("monster-library")
	if not _ok(_bridge.create_project("monster-authoring-journey", project)): return
	if not _check(_bridge.current_monster_library_root() == library, "A fresh native project did not provide its personal Monster Library"): return
	if not _ok(_bridge.request("extra-action-point.create", {"expectedRevision": 0, "nativeId": 4})): return
	_route = load("res://src/monster_editor.tscn").instantiate()
	root.add_child(_route)
	_route.configure_operations(_operations, func(): return _bridge)
	_route.configure_authoring(func(response): return response.get("ok", false))
	_view = _route.get_node("Workbench")
	_dialog = _view.get_node("OperationReview")
	if not _ok(await _route.reload(_bridge)): return
	await _create_monster()
	if _failed: return
	await _invalid_and_discard()
	if _failed: return
	await _edit_and_pick()
	if _failed: return
	await _conflict_and_rebase()
	if _failed: return
	await _library_and_transfer()
	if _failed: return
	await _history_and_reopen(project, library)
	if _failed: return
	_bridge.stop()
	_route.queue_free()
	await process_frame
	print("PROVIDENCE_MONSTER_AUTHORING_JOURNEY_OK create review-paging draft-edit picker-preview-cancel-accept signed-enum same-selection conflict-choice rebase-no-write separate-apply library-create library-edit allocation-transfer undo-redo save-reopen")
	quit(0)


func _create_monster() -> void:
	await _route._records.open_review("NewMonster")
	_dialog.get_node("%Target").text = "7"
	await _review_and_commit()
	if _failed: return
	_check(_view.browser.native_id == 7 and _view.form.visible, "Creation did not open the exact new Monster")
	_check(_view.form.field_count() == 123, "The real document lost a primary control")


func _edit_and_pick() -> void:
	var armor = _field("armor")
	armor.get_node("Value").text = "18"
	armor.get_node("Value").text_changed.emit("18")
	var summon = _field("canSummon").get_node("Choice")
	for index in summon.item_count:
		if summon.get_item_metadata(index) == -1:
			summon.select(index)
			summon.item_selected.emit(index)
	_check(_view.draft.fields.get("canSummon") == -1, "NPC selection lost signed -1")
	_route._references.open_picker("deathMacro")
	await _idle()
	var picker = _view.get_node("ReferencePicker")
	_check(picker.visible and _view.draft.fields.get("deathMacro") == null, "Picker browsing mutated the local draft")
	picker.cancel()
	_check(_view.draft.fields.get("deathMacro") == null, "Picker cancellation changed the reference")
	_route._references.open_picker("deathMacro")
	await _idle()
	var choices: ItemList = picker.get_node("%Choices")
	for index in choices.item_count:
		if choices.get_item_text(index).begins_with("4 ·"):
			choices.select(index)
			choices.item_selected.emit(index)
	_check(not picker.get_node("%UseSelection").disabled, "Available macro cannot be accepted")
	picker.get_node("%UseSelection").pressed.emit()
	_check(_view.draft.fields.get("deathMacro") == 4, "Picker acceptance lost the canonical macro")
	if not _ok(await _route.commit_selected()): return
	_check(not _view.has_unapplied_changes(), "Apply left the submitted draft dirty")
	var saved := _bridge.request("monster.open", {"setId": 0, "nativeId": 7})
	if not _ok(saved): return
	_check(saved.result.monster.armor == 18 and saved.result.monster.canSummon == -1 and saved.result.monster.deathMacro == 4, "The native form did not persist its selected values")
	_route._references.open_picker("deathMacro")
	await _idle()
	picker.get_node("%UseSelection").pressed.emit()
	_check(not _view.has_unapplied_changes(), "Accepting the current action changed the draft")


func _invalid_and_discard() -> void:
	var revision: int = _bridge.request("session.describe").result.revision
	_field("armor").get_node("Value").text = "999"
	_field("armor").get_node("Value").text_changed.emit("999")
	_field("conditions.39").get_node("Value").text = "invalid"
	_field("conditions.39").get_node("Value").text_changed.emit("invalid")
	var rejected: Dictionary = await _route.commit_selected()
	_check(not rejected.get("ok", false) and rejected.get("issues", []).size() == 2, "Validation did not identify both invalid controls")
	_check(_view.has_unapplied_changes() and _field("armor").get_node("Error").visible, "Validation discarded the invalid draft or did not mark its control")
	_view.get_node("Failure").hide()
	_view.form.get_node("%FirstError").pressed.emit()
	await process_frame
	_check(_field("armor").get_node("Value").has_focus(), "First error did not focus the exact owning field")
	_check(_bridge.request("session.describe").result.revision == revision, "Invalid Apply changed canonical state")
	_view.form.get_node("%DiscardDraft").pressed.emit()
	_check(not _view.has_unapplied_changes() and not _field("armor").get_node("Error").visible, "Discard did not clear validation and restore the baseline")


func _library_and_transfer() -> void:
	await _route._library_ops.open_review("NewLibrary")
	_dialog.get_node("%Target").text = "9"
	_dialog.get_node("%Label").text = "Library Guardian"
	await _review_and_commit()
	if _failed: return
	print("PROVIDENCE_MONSTER_LIBRARY_SELECTION domain=%s entry=%s active=%s" % [_view.draft_domain(), _view.draft.document.get("entry", {}).get("label", ""), _view.selection_snapshot().active])
	if not _check(_view.draft_domain() == "library" and _view.draft.document.get("entry", {}).get("label") == "Library Guardian", "Library creation did not retain its new identity"): return
	if not _check(_view.form.field_count() == 123 and not _view.form.get_node("Content/SetPanel").visible, "Library template controls or ownership are wrong"): return
	var armor = _field("armor")
	armor.get_node("Value").text = "12"
	armor.get_node("Value").text_changed.emit("12")
	_view.form.get_node("%Description").text = "A custom Guardian from the Library."
	_view.form.get_node("%Description").text_changed.emit()
	if not _ok(await _route.commit_selected()): return
	await _route._library_ops.open_review("Transfer")
	await _review_and_commit()
	if _failed: return
	var saved := _bridge.request("monster.open", {"setId": 0, "nativeId": 9})
	if not _ok(saved): return
	_check(saved.result.monster.armor == 12 and saved.result.description.text == "A custom Guardian from the Library.", "Reviewed transfer did not persist the exact template and description")


func _conflict_and_rebase() -> void:
	_field("armor").get_node("Value").text = "21"
	_field("armor").get_node("Value").text_changed.emit("21")
	var revision: int = _bridge.request("session.describe").result.revision
	var external := _bridge.request("monster.draft.apply", {"expectedRevision": revision,
		"draft": {"setId": 0, "nativeId": 7, "fields": {"armor": 19, "agility": 11}}, "operationId": "e".repeat(64)})
	if not _ok(external): return
	var rejected: Dictionary = await _route.commit_selected()
	_check(not rejected.get("ok", false) and _view.draft.fields.get("armor") == 21, "Stale Apply lost the retained draft")
	_check(_view.get_node("Failure/Body/Actions/Compare").visible, "Revision conflict did not offer comparison")
	await _route._authoring.compare_with_current()
	var comparison = _view.get_node("DraftComparison")
	_check(comparison.visible and comparison.get_node("%Rebase").disabled, "Conflicting field did not require a choice")
	var row: TreeItem = comparison.get_node("%Fields").get_root().get_first_child()
	while row != null:
		if row.get_metadata(0) == "armor": row.set_range(3, 1)
		row = row.get_next()
	comparison.get_node("%Fields").item_edited.emit()
	comparison.get_node("%Rebase").pressed.emit()
	var current := _bridge.request("monster.open", {"setId": 0, "nativeId": 7})
	_check(current.result.revision == revision + 1 and current.result.monster.armor == 19, "Local rebase wrote to canonical state")
	_check(_view.draft.current_value("armor") == 21 and _view.draft.current_value("agility") == 11, "Rebase lost the chosen value or concurrent untouched field")
	if not _ok(await _route.commit_selected()): return
	current = _bridge.request("monster.open", {"setId": 0, "nativeId": 7})
	_check(current.result.monster.armor == 21 and current.result.monster.agility == 11, "Separate Apply did not preserve the rebased fields")
	_view.get_node("Failure").hide()


func _history_and_reopen(project: String, library: String) -> void:
	var current := _bridge.request("session.describe")
	if not _ok(current): return
	var revision: int = current.result.revision
	if not _ok(_bridge.request("history.undo", {"expectedRevision": revision})): return
	_check(not _bridge.request("monster.open", {"setId": 0, "nativeId": 9}).get("ok", false), "Undo retained the transferred record")
	if not _ok(_bridge.request("history.redo", {"expectedRevision": revision + 1})): return
	_bridge.stop()
	if not _ok(_bridge.start_project(project, "", "", library)): return
	var reopened := _bridge.request("monster.open", {"setId": 0, "nativeId": 9})
	if not _ok(reopened): return
	_check(reopened.result.monster.armor == 12 and reopened.result.description.text == "A custom Guardian from the Library.", "Save/reopen lost the connected content")
	_check(_bridge.request("session.describe").result.revision == revision + 2, "Reopen lost durable history")


func _review_and_commit() -> void:
	_dialog.get_node("%Review").pressed.emit()
	await _idle()
	if not _check(not _dialog.get_node("%Commit").disabled, str(_dialog.get_node("%Status").text)): return
	_dialog.get_node("%Commit").pressed.emit()
	await _idle()
	_check(not _dialog.visible and not _view.get_node("Failure").visible, "The reviewed operation did not finish cleanly")


func _idle() -> void:
	var stable_frames := 0
	while stable_frames < 3:
		await process_frame
		stable_frames = stable_frames + 1 if not _operations.busy and not _bridge.operation_busy() else 0


func _field(path: String):
	for node in _view.form.find_children("*", "", true, false):
		if node.has_method("bind_record") and node.field_path == path: return node
	_check(false, "Field is missing: " + path)
	return null


func _ok(response: Dictionary) -> bool:
	return _check(response.get("ok", false), str(response.get("error", "Native command rejected")))


func _check(value: bool, message: String) -> bool:
	if not value:
		_failed = true
		push_error(message)
		if _bridge != null: _bridge.stop()
		quit(1)
	return value
