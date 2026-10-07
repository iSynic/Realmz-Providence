extends SceneTree

var _shell
var _passed := false
var _capture_root := ""


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() not in [1, 2] or not FileAccess.file_exists(args[0].path_join("assets-corpus-disposable.marker")):
		quit(2)
		return
	if args.size() == 2:
		if not DirAccess.dir_exists_absolute(args[1]):
			quit(2)
			return
		_capture_root = args[1]
	OS.set_environment("PROVIDENCE_PROJECT_PATH", "")
	_shell = load("res://src/editor_shell.tscn").instantiate()
	_shell._bridge = preload("res://tools/validate_assets_corpus.gd").CorpusBridge.new(args[0].path_join("test-settings.cfg"))
	root.add_child(_shell)
	await process_frame
	await _verify(args[0])
	_shell._bridge.stop()
	quit(0 if _passed else 1)


func _verify(path: String) -> void:
	await _shell._project_session.open_project(path)
	assert(_shell._bridge.is_project_backed() and _shell._bridge.current_project_path() == path)
	await _shell._assets.open_library("scenario")
	var workbench = _shell._assets.library_workbench
	var tab: int = workbench.get_index()
	await _shell._navigation.select_tab(tab)
	var panel = workbench.get_node("%Gallery")
	await panel.set_icons_only(true)
	assert(not panel._rows.is_empty())
	var original_rows: Array = panel._rows.duplicate(true)
	assert(not original_rows[0].removable)
	await panel._select(0)
	assert(panel.get_node("%RemoveScenario").disabled)
	assert(panel.get_node("%RemoveScenario").tooltip_text.contains("paired monster"))
	var selected := -1
	for index in original_rows.size():
		if original_rows[index].removable:
			selected = index
			break
	assert(selected >= 0)
	var identity: String = original_rows[selected].identity
	assert(await _repair_item_use(panel, tab, selected))
	var original_revision: int = _shell._session_view.revision
	await panel._select(selected)
	assert(not panel.get_node("%RemoveScenario").disabled)
	assert(await _verify_removal(panel, tab, selected, identity, original_rows, original_revision))
	print("PROVIDENCE_ASSETS_REMOVAL_OK unified-button pair-guard exact-confirmation cancel-no-change remove-refresh undo-redo-refresh restored no-save")
	_passed = true


func _verify_removal(panel, tab: int, selected: int, identity: String, original_rows: Array, original_revision: int) -> bool:
	await _shell._navigation.select_tab(4)
	await _shell._navigation.select_tab(tab)
	assert(panel._selected == selected and panel._rows[selected].identity == identity)
	assert(not panel.get_node("%RemoveScenario").disabled)
	panel.get_node("%RemoveScenario").pressed.emit()
	await _settle_operations()
	var confirmation := _confirmation()
	assert(confirmation != null and _shell._documents.view("assets.icons")._selected_identity == identity)
	assert(confirmation.dialog_text.contains("No current uses found. Checked again when removing."))
	assert(confirmation.get_cancel_button().has_focus())
	assert(_shell._document_tabs.current_tab == tab)
	confirmation.canceled.emit()
	await _settle_operations()
	assert(_shell._session_view.revision == original_revision and panel._rows == original_rows)
	await _shell._navigation.select_tab(tab)
	panel.get_node("%RemoveScenario").pressed.emit()
	await _settle_operations()
	confirmation = _confirmation()
	assert(confirmation != null)
	confirmation.confirmed.emit()
	await _settle_operations()
	assert(_shell._session_view.revision == original_revision + 1)
	assert(panel._rows.size() == original_rows.size() - 1)
	assert(not panel._rows.any(func(row): return row.identity == identity))
	assert(panel.get_node("%RemoveScenario").disabled and panel._selected == -1)
	await _shell._undo()
	await process_frame
	assert(_shell._session_view.revision == original_revision + 2)
	assert(panel._rows == original_rows)
	await _shell._redo()
	await process_frame
	assert(_shell._session_view.revision == original_revision + 3)
	assert(not panel._rows.any(func(row): return row.identity == identity))
	await _shell._undo()
	await process_frame
	assert(panel._rows == original_rows)
	return true


func _repair_item_use(panel, tab: int, selected: int) -> bool:
	var identity: String = panel._rows[selected].identity
	var picture_number: int = panel._rows[selected].classicResource.resourceId
	await _shell._navigation.select_tab(4)
	var editor = _shell._item_editor
	await _select_repair_item(panel, picture_number)
	var original: Dictionary = editor.selected_definition()
	assert(not original.is_empty() and int(original.get("iconId", 0)) != picture_number)
	var revision: int = _shell._session_view.revision
	editor.get_node("%IconId").value = picture_number
	editor.get_node("%CommitItemEdit").pressed.emit()
	await _settle_operations()
	assert(_shell._session_view.revision == revision + 1 and not editor.has_unapplied_changes())
	await _shell._navigation.select_tab(tab)
	await panel._select(selected)
	await panel.recheck_selection()
	assert(panel._rows[selected].identity == identity)
	assert(panel.get_node("%RemoveScenario").disabled)
	panel.get_node("%FindScenarioUses").pressed.emit()
	await _settle_operations()
	var menu = panel.get_node("%ItemUsesMenu")
	assert(menu._rows.size() == 1 and menu._rows[0].source == original.id)
	assert(not menu.is_item_disabled(0))
	assert(await _capture_state("used", panel))
	menu.hide()
	menu.id_pressed.emit(0)
	await _settle_operations()
	assert(_shell._document_tabs.current_tab == 4)
	assert(editor.selected_definition().id == original.id)
	assert(editor.get_node("%IconId").get_line_edit().has_focus())
	assert(editor.get_node("%BackToAssets").visible)
	assert(await _capture_state("repair"))
	await _restore_using_chooser(editor, original)
	editor.get_node("%BackToAssets").pressed.emit()
	await _settle_operations()
	assert(_shell._document_tabs.current_tab == tab and panel._selected == selected)
	assert(panel._rows[selected].identity == identity and not panel.get_node("%RemoveScenario").disabled)
	await _repair_after_undo(panel, tab, selected, original)
	print("PROVIDENCE_ASSETS_ITEM_REPAIR_OK exact-use-navigation chooser-apply return-recheck undo-reblocks draft-guard removal-unblocked no-save")
	return true


func _select_repair_item(panel, picture_number: int) -> void:
	# The round trip deliberately restores scenario-owned artwork through the
	# chooser. Fresh imports may initially select an item using stock artwork.
	for item: Dictionary in _shell._item_editor.catalog_items():
		var icon := int(item.get("iconId", 0))
		if icon == picture_number: continue
		if panel._rows.any(func(row): return int(row.classicResource.resourceId) == icon):
			_shell._item_editor.open_item(str(item.id))
			await _settle_operations()
			return
	assert(false, "The fixture needs an item using different scenario-owned artwork.")


func _restore_using_chooser(editor, original: Dictionary) -> void:
	assert(not editor.has_unapplied_changes(), "Opening the applied item introduced a draft.")
	editor.get_node("%ChooseArtwork").pressed.emit()
	await _settle_operations()
	var chooser = _shell._assets.chooser
	assert(chooser != null, "Chooser unavailable: draft=%s dialog=%s status=%s" % [editor.has_unapplied_changes(), _shell._unapplied_dialog.visible, _shell._status.text])
	await chooser.show_scope("scenario")
	var gallery = chooser.get_node("%Gallery")
	await _settle_operations()
	var replacement := -1
	for index in gallery._rows.size():
		var key: Dictionary = gallery._rows[index].get("classicResource", {})
		if key.get("resourceType", "") == "cicn" and int(key.get("resourceId", 0)) == int(original.get("iconId", 0)):
			replacement = index
			break
	assert(replacement >= 0)
	await gallery._select(replacement)
	var apply: Button = gallery.get_node("%ItemTarget/Apply")
	assert(apply.is_visible_in_tree() and not apply.disabled)
	assert(await _capture_state("chooser"))
	apply.pressed.emit()
	await _settle_operations()
	assert(_shell._document_tabs.current_tab == 4 and editor.selected_definition() == original)
	assert(editor.get_node("%BackToAssets").visible)


func _repair_after_undo(panel, tab: int, selected: int, original: Dictionary) -> void:
	var identity: String = panel._rows[selected].identity
	var editor = _shell._item_editor
	var menu = panel.get_node("%ItemUsesMenu")
	await _shell._undo()
	assert(panel.get_node("%RemoveScenario").disabled)
	panel.get_node("%FindScenarioUses").pressed.emit()
	await _settle_operations()
	assert(menu._rows.size() == 1 and menu._rows[0].source == original.id)
	menu.hide()
	menu.id_pressed.emit(0)
	await _settle_operations()
	assert(_shell._document_tabs.current_tab == 4)
	var revision: int = _shell._session_view.revision - 1
	editor.get_node("%IconId").value = int(original.get("iconId", 0))
	editor.get_node("%BackToAssets").pressed.emit()
	await _settle_operations()
	assert(_shell._unapplied_dialog.visible and _shell._document_tabs.current_tab == 4)
	assert(_shell._session_view.revision == revision + 1 and editor.has_unapplied_changes())
	_shell._unapplied_dialog.confirmed.emit()
	_shell._unapplied_dialog.hide()
	await _settle_operations()
	assert(_shell._session_view.revision == revision + 2 and editor.selected_definition() == original)
	assert(_shell._document_tabs.current_tab == tab)
	assert(panel._rows[selected].identity == identity and panel._selected == selected)
	assert(not panel.get_node("%RemoveScenario").disabled)
	panel.get_node("%FindScenarioUses").pressed.emit()
	await _settle_operations()
	assert(menu._rows.is_empty() and menu.get_item_text(0) == "No known uses")
	menu.reset()
	assert(await _capture_state("rechecked"))


func _settle_operations() -> void:
	var idle_frames := 0
	while idle_frames < 2:
		await process_frame
		idle_frames = 0 if _shell._operations.busy else idle_frames + 1


func _capture_state(state: String, uses_panel = null) -> bool:
	if _capture_root.is_empty():
		return true
	for size in [Vector2i(1600, 900), Vector2i(1920, 1080)]:
		if uses_panel != null:
			uses_panel.get_node("%ItemUsesMenu").reset()
		root.size = size
		root.content_scale_size = size
		for frame in 12:
			await process_frame
		for frame in 8:
			await process_frame
		if uses_panel != null:
			uses_panel.get_node("%FindScenarioUses").pressed.emit()
			await _settle_operations()
			assert(uses_panel.get_node("%ItemUsesMenu").visible)
		await RenderingServer.frame_post_draw
		var capture := root.get_texture().get_image()
		assert(capture.get_size() == size)
		assert(capture.save_png(_capture_root.path_join("%s-%dx%d.png" % [state, size.x, size.y])) == OK)
	return true


func _confirmation() -> ConfirmationDialog:
	for child in _shell._documents.view("assets.icons").get_children():
		if child is ConfirmationDialog and child.visible and child.title == "Remove Scenario Icon?":
			return child
	return null
