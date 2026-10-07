extends SceneTree

var _bridge: ProvidenceNativeBridge
var _operations: ProvidenceEditorOperation
var _route
var _view
var _failed := false
var _root := ""
var _before: Dictionary = {}
var _native_id := -1


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	root.size = Vector2i(1600, 900)
	root.gui_embed_subwindows = true
	var args := OS.get_cmdline_user_args()
	if args.size() != 1: _check(false, "Expected a disposable imported fixture root"); return
	_root = args[0]
	if not _check(FileAccess.file_exists(_root.path_join("project/assets-corpus-disposable.marker")), "A disposable full-import fixture is required"): return
	_bridge = ProvidenceNativeBridge.new(_root.path_join("settings.cfg"))
	if not _ok(_bridge.start_project(_root.path_join("project"))): return
	_operations = ProvidenceEditorOperation.new()
	root.add_child(_operations)
	_route = load("res://src/monster_editor.tscn").instantiate()
	root.add_child(_route)
	_route.configure_operations(_operations, func(): return _bridge)
	_route.configure_authoring(func(response): return response.get("ok", false))
	_view = _route.get_node("Workbench")
	if not _ok(await _route.reload(_bridge)): return
	while _native_id < 0:
		var active: Array = _view.browser.catalog.items.filter(func(row): return int(row.hitDice) > 0 and int(row.hitDice) < 255 and row.availableSets.any(func(set): return int(set) == 0))
		if not active.is_empty(): _native_id = int(active[0].nativeId); break
		var next: int = int(_view.browser.catalog.offset) + _view.browser.catalog.items.size()
		if not _check(next < int(_view.browser.catalog.total), "Imported scenario has no active Normal Monster"): return
		if not _ok(await _view.browser.load_page(next)): return
	if not _ok(await _view.browser.open_record(_native_id)): return
	_before = _view.draft.document.duplicate(true)
	await _edit_and_apply()
	if _failed: return
	await _history_and_reopen()
	if _failed: return
	_bridge.stop()
	_route.queue_free()
	await process_frame
	print("PROVIDENCE_MONSTER_IMPORTED_AUTHORING_OK ", _root.get_file(), " selected-set shared-description normal-bestiary random-weapon signed-required-weapon atomic-undo-redo save-reopen")
	quit(0)


func _edit_and_apply() -> void:
	var armor := mini(120, int(_before.monster.armor) + 1)
	_field("armor").get_node("Value").text = str(armor)
	_field("armor").get_node("Value").text_changed.emit(str(armor))
	_view.form.get_node("%Description").text = "Native Monster authoring check."
	_view.form.get_node("%Description").text_changed.emit()
	_view.form.get_node("%HideFromBestiary").set_pressed_no_signal(not _before.normalNotOnMenu)
	_view.form.get_node("%HideFromBestiary").toggled.emit(not _before.normalNotOnMenu)
	await _choose("weapon", "-3", -3)
	if _failed: return
	await _choose("requiredWeapon", "-128", -128)
	if _failed: return
	if not _ok(await _route.commit_selected()): return
	var saved := _bridge.request("monster.open", {"setId": 0, "nativeId": _native_id})
	if not _ok(saved): return
	_check(saved.result.monster.armor == armor and saved.result.monster.weapon == -3 and saved.result.monster.requiredWeapon == -128, "The imported form lost a signed picker value")
	_check(saved.result.description.text == "Native Monster authoring check." and saved.result.normalNotOnMenu != _before.normalNotOnMenu, "Apply lost shared description or Normal bestiary ownership")
	_check(int(saved.result.revision) == int(_before.revision) + 1, "The visible form did not commit atomically")


func _choose(field: String, search: String, value: int) -> void:
	_route._references.open_picker(field)
	await _idle()
	var picker = _view.get_node("ReferencePicker")
	picker.get_node("%Search").text = search
	picker.get_node("%Search").text_changed.emit(search)
	picker.get_node("SearchDelay").stop()
	picker._search(0, false)
	await _idle()
	if not _check(picker.get_node("%Choices").item_count > 0, "Signed picker search returned no choices"): return
	picker.get_node("%Choices").select(0)
	picker.get_node("%Choices").item_selected.emit(0)
	if not _check(picker.selected.value == value and not picker.get_node("%UseSelection").disabled, "Signed search selected a different canonical identity"): return
	picker.get_node("%UseSelection").pressed.emit()


func _history_and_reopen() -> void:
	var revision: int = _bridge.request("session.describe").result.revision
	if not _ok(_bridge.request("history.undo", {"expectedRevision": revision})): return
	var undone := _bridge.request("monster.open", {"setId": 0, "nativeId": _native_id})
	_check(undone.result.monster == _before.monster and undone.result.description == _before.description and undone.result.normalNotOnMenu == _before.normalNotOnMenu, "Undo did not restore every owner of the imported form")
	if not _ok(_bridge.request("history.redo", {"expectedRevision": revision + 1})): return
	if not _ok(_bridge.request("project.save")): return
	_bridge.stop()
	if not _ok(_bridge.start_project(_root.path_join("project"))): return
	var reopened := _bridge.request("monster.open", {"setId": 0, "nativeId": _native_id})
	_check(reopened.result.monster.requiredWeapon == -128 and reopened.result.monster.weapon == -3 and reopened.result.description.text == "Native Monster authoring check.", "Save/reopen lost imported authoring")


func _idle() -> void:
	var stable := 0
	while stable < 3:
		await process_frame
		stable = stable + 1 if not _operations.busy and not _bridge.operation_busy() else 0


func _field(path: String):
	for node in _view.form.find_children("*", "", true, false):
		if node.has_method("bind_record") and node.field_path == path: return node
	return null


func _ok(response: Dictionary) -> bool:
	return _check(response.get("ok", false), str(response.get("error", "Command rejected")))


func _check(value: bool, message: String) -> bool:
	if value: return true
	_failed = true
	push_error(message)
	if _bridge != null: _bridge.stop()
	quit(1)
	return false
