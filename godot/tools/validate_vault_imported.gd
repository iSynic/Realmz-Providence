extends SceneTree

var _shell
var _authored_name := ""
var _assigned_icon := 0


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() < 1 or args.size() > 2:
		_fail("Expected disposable imported-project copy and optional reference catalog")
		return
	var catalog_root := args[1] if args.size() == 2 else ""
	_shell = load("res://src/editor_shell.tscn").instantiate()
	_shell._bridge = load("res://src/native_bridge.gd").new(args[0].path_join("test-settings.cfg"))
	root.add_child(_shell)
	await process_frame
	var opened: Dictionary = _shell._bridge.start_project(args[0], "", catalog_root)
	if not bool(opened.get("ok", false)):
		_fail(str(opened.get("error")))
		return
	await _shell._activate_session(opened)
	if not await _exercise_item_draft_navigation():
		return
	var before: Dictionary = _shell._bridge.request("item.list", {"scope": "scenario", "query": "800", "limit": 1})
	if not bool(before.get("ok", false)) or before["result"]["items"].size() != 1:
		_fail("Imported scenario item 800 is required: " + str(before))
		return
	var previous_icon := int(before["result"]["items"][0]["iconId"])
	_assigned_icon = 9001 if previous_icon == 9000 else 9000
	await _shell._navigation.select_tab(32)
	var vault = _shell._workbenches.vault
	vault.get_node("%VaultSearch").text = str(_assigned_icon)
	vault.get_node("%VaultSearch").text_changed.emit(str(_assigned_icon))
	for frame in 60:
		await process_frame
		if vault._textures.has(0):
			break
	vault.get_node("%ArtworkGallery").item_selected.emit(0)
	if vault.get_node("%UseInItem").disabled:
		_fail("Real Vault preview is unavailable")
		return
	vault.get_node("%UseInItem").pressed.emit()
	var picker = vault.get_node("%ItemArtworkPicker")
	picker.get_node("%DestinationSearch").text = "Workflow test"
	picker.get_node("%DestinationSearch").text_changed.emit("Workflow test")
	if picker.get_node("%DestinationItems").item_count != 1:
		_fail("Authored item name must return one real destination")
		return
	picker.get_node("%DestinationItems").item_selected.emit(0)
	if picker.get_node("%ApplyArtwork").disabled:
		_fail("Imported item's picture comparison did not enable Apply")
		return
	picker.get_node("%ApplyArtwork").pressed.emit()
	if _shell._document_tabs.current_tab != 4:
		_fail("Apply did not return to Items: " + picker.get_node("%PickerStatus").text)
		return
	if not _item_matches(_assigned_icon):
		return
	await _shell._project_session.save()
	if _shell._item_editor.get_node("%SaveNotice").text != "Saved" or _shell._item_editor.get_node("%SaveActions").visible:
		_fail("Saving applied artwork failed")
		return
	for operation in ["history.undo", "history.redo"]:
		var response: Dictionary = _shell._bridge.request(operation, {"expectedRevision": _shell._session_view.revision})
		if not bool(response.get("ok", false)):
			_fail(str(response.get("error")))
			return
		_shell._session_view.apply(response["result"])
		if not _shell._item_editor.get_node("%SaveActions").visible or not _shell._item_editor.get_node("%SaveNotice").text.begins_with("Unsaved"):
			_fail("History change must replace the Saved indicator with Unsaved")
			return
		await _shell._reload_scenario_items()
		_shell._item_editor.open_item("classic.item.800")
		if not _item_matches(previous_icon if operation == "history.undo" else _assigned_icon):
			return
	if not bool(_shell._bridge.request("project.save").get("ok", false)):
		_fail("Saving after Redo failed")
		return
	opened = _shell._bridge.start_project(args[0], "", catalog_root)
	if not bool(opened.get("ok", false)):
		_fail("Saved project could not reopen")
		return
	await _shell._activate_session(opened)
	await _shell._navigation.select_tab(4)
	_shell._item_editor.open_item("classic.item.800")
	if not _item_matches(_assigned_icon):
		return
	if _shell._item_editor.get_node("%ItemIdentifiedName").text != _authored_name:
		_fail("The authored destination name must survive save and reopen")
		return
	_shell._bridge.stop()
	_shell.queue_free()
	await process_frame
	print("PROVIDENCE_VAULT_IMPORTED_OK item=800 picture=%d previous=%d named-search draft-cancel-apply-discard apply-save-undo-redo-reopen" % [_assigned_icon, previous_icon])
	quit(0)


func _exercise_item_draft_navigation() -> bool:
	await _shell._navigation.select_tab(4)
	_shell._item_editor.open_item("classic.item.800")
	var names: LineEdit = _shell._item_editor.get_node("%ItemIdentifiedName")
	var baseline := names.text
	var authored := "Workflow test A" if baseline != "Workflow test A" else "Workflow test B"
	_authored_name = authored
	var revision: int = _shell._session_view.revision
	names.text = authored
	for route: Button in _shell._domain_navigation.buttons():
		if int(route.get_meta("document_tab", -1)) == 32:
			route.button_pressed = true
			route.pressed.emit()
			break
	if not _shell._unapplied_dialog.visible or _shell._document_tabs.current_tab != 4:
		_fail("Leaving a real item draft must request resolution before opening Vault")
		return false
	await process_frame
	for route: Button in _shell._domain_navigation.buttons():
		if route.button_pressed != (int(route.get_meta("document_tab", -1)) == 4):
			_fail("Pending navigation must retain the Items sidebar highlight")
			return false
	if not _shell._unapplied_dialog.dialog_text.contains("Item 800") or not _shell._unapplied_dialog.dialog_text.contains("Vault of Arcana") or not _shell._unapplied_dialog.dialog_text.contains("use Save"):
		_fail("Draft decision must identify the item, continuation and save distinction")
		return false
	if _shell._unapplied_dialog.gui_get_focus_owner() != _shell._unapplied_dialog.get_cancel_button():
		_fail("Draft decision must initially focus Keep Editing")
		return false
	_shell._unapplied_dialog.get_cancel_button().grab_focus()
	var activate := InputEventAction.new()
	activate.action = &"ui_accept"
	activate.pressed = true
	_shell._unapplied_dialog.push_input(activate)
	activate = InputEventAction.new()
	activate.action = &"ui_accept"
	activate.pressed = false
	_shell._unapplied_dialog.push_input(activate)
	await process_frame
	if _shell._unapplied_dialog.visible or names.text != authored or _shell._session_view.revision != revision or _shell._document_tabs.current_tab != 4:
		_fail("Cancel must preserve the draft, revision and Items destination")
		return false
	await _shell._navigation.select_tab(32)
	await process_frame
	_shell._unapplied_dialog.notification(Node.NOTIFICATION_WM_CLOSE_REQUEST)
	await process_frame
	if _shell._unapplied_dialog.visible or names.text != authored or _shell._session_view.revision != revision or _shell._document_tabs.current_tab != 4:
		_fail("Closing the draft dialog must preserve edits without applying or navigating")
		return false
	await _shell._navigation.select_tab(32)
	_shell._unapplied_dialog.confirmed.emit()
	_shell._unapplied_dialog.hide()
	if _shell._document_tabs.current_tab != 32 or _shell._session_view.revision != revision + 1:
		_fail("Apply must commit the draft exactly once and resume Vault navigation")
		return false
	await _shell._navigation.select_tab(4)
	_shell._item_editor.open_item("classic.item.800")
	if names.text != authored:
		_fail("Returning to Items must show the authored name")
		return false
	revision = _shell._session_view.revision
	names.text = "Discard this workflow draft"
	await _shell._navigation.select_tab(32)
	_shell._unapplied_dialog.custom_action.emit(&"discard")
	if _shell._document_tabs.current_tab != 32 or _shell._unapplied_dialog.visible:
		_fail("Discard must close resolution and resume Vault navigation")
		return false
	await _shell._navigation.select_tab(4)
	_shell._item_editor.open_item("classic.item.800")
	if names.text != authored or _shell._session_view.revision != revision:
		_fail("Discard must retain the committed name without changing revision")
		return false
	return true


func _item_matches(icon_id: int) -> bool:
	var item: Dictionary = _shell._item_editor.selected_definition()
	if int(item.get("classicId", -1)) != 800 or int(item.get("iconId", -1)) != icon_id:
		_fail("Selected item identity or picture differs after operation")
		return false
	if icon_id == _assigned_icon and _shell._item_editor.get_node("%ItemPicture").texture == null:
		_fail("Assigned artwork is absent from the visible item preview")
		return false
	return true


func _fail(message: String) -> void:
	push_error("PROVIDENCE_VAULT_IMPORTED_FAILED: " + message)
	if _shell != null:
		_shell._bridge.stop()
	quit(1)
