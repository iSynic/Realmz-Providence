extends SceneTree

var _shell
var _passed := false
var _capture_root := ""
var _sound_played := false


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	root.size = Vector2i(1600, 900)
	root.gui_embed_subwindows = true
	var args := OS.get_cmdline_user_args()
	if args.size() not in [1, 2] or not FileAccess.file_exists(args[0].path_join("assets-corpus-disposable.marker")):
		quit(2)
		return
	if args.size() == 2:
		if not DirAccess.dir_exists_absolute(args[1]):
			quit(2)
			return
		_capture_root = args[1]
	_shell = load("res://src/editor_shell.tscn").instantiate()
	root.add_child(_shell)
	await process_frame
	await _verify(args[0])
	_shell._bridge.stop()
	quit(0 if _passed else 1)


func _verify(path: String) -> void:
	await _shell._project_session.open_project(path)
	assert(_shell._bridge.is_project_backed() and _shell._bridge.current_project_path() == path)
	await _shell._navigation.select_tab(4)
	var editor = _shell._item_editor
	await editor.open_item("classic.item.800")
	await _idle()
	var original: Dictionary = editor.selected_definition()
	assert(not original.is_empty())
	await _sound_preview(editor)
	await _local_picker(editor)
	await _linked_return(editor)
	for scope in ["scenario", "stock", "supplied"]:
		await _exercise_scope(scope, editor, original, path)
	_passed = true


func _sound_preview(editor: ProvidenceItemEditor) -> void:
	var original := editor.selected_definition()
	assert(int(original.soundId) == 47)
	_shell._item_commands.configure_navigation(_shell._navigation.open_script_source, _shell._navigation.open_script_target,
		func(_value: int, identity: String, status: String):
			_sound_played = await _shell._media.sounds.preview_application_and_play(identity) if status == "application-resource" else await _shell._media.sounds.preview_and_play(identity))
	var before: Dictionary = _shell._bridge.request("session.describe").result
	editor.form.find_child("PlaySound", true, false).pressed.emit()
	await _idle()
	assert(_sound_played, "The item button resolves stored sound 47 and decodes/plays actual snd 647")
	assert(editor.selected_definition() == original and not editor.has_unapplied_changes())
	assert(int(_shell._bridge.request("session.describe").result.revision) == int(before.revision))
	_shell._media.sounds._view.stop_preview()
	_shell._item_commands.configure_navigation(_shell._navigation.open_script_source, _shell._navigation.open_script_target, _shell._navigation.preview_script_sound)
	print("PROVIDENCE_ITEM_SOUND_PREVIEW_OK stored47-resource647 native-PCM-player unchanged-item-revision")


func _local_picker(editor: ProvidenceItemEditor) -> void:
	var references = _shell._item_commands._references
	var origin: Control = editor.form.control_for("cost").get_line_edit()
	origin.grab_focus()
	references.open_picker("iconId"); await _idle()
	var picker = references._picker
	assert(picker.visible and not editor.has_unapplied_changes())
	picker.cancel(); await _idle()
	assert(root.gui_get_focus_owner() == origin and not editor.has_unapplied_changes())
	references.open_picker("iconId"); await _idle()
	assert(not picker.get_node("%UseSelection").disabled)
	picker.get_node("%UseSelection").pressed.emit()
	assert(not editor.has_unapplied_changes())
	references.open_picker("iconId"); await _idle()
	var index := -1
	for row in picker._rows.size():
		if picker._rows[row].available and int(picker._rows[row].value) != int(editor.selected_definition().iconId):
			index = row; break
	assert(index >= 0)
	picker.get_node("%Choices").select(index)
	picker.get_node("%Choices").item_selected.emit(index); await _idle()
	assert(not picker.get_node("%UseSelection").disabled)
	picker.get_node("%Choices").item_activated.emit(index)
	assert(editor.has_unapplied_changes() and not picker.visible)
	editor.discard_draft(); await _idle()
	editor.form.control_for("itemType").value = 23; await _idle()
	references.open_picker("special.4"); await _idle()
	assert(int(picker.selected.value) == 0 and picker.selected.identity != "none" and not picker.get_node("%OpenReference").disabled)
	var sequence: int = editor.draft.edit_sequence
	picker.get_node("%Choices").grab_focus()
	var event := InputEventKey.new(); event.keycode = KEY_ENTER; event.pressed = true
	picker._input(event)
	assert(not picker.visible and editor.draft.edit_sequence == sequence)
	editor.discard_draft(); await _idle()
	print("PROVIDENCE_ITEM_LOCAL_PICKER_OK exact-art-preview cancel-focus current-noop doubleclick-local zero-XAP-real-identity keyboard-current-noop")


func _linked_return(editor: ProvidenceItemEditor) -> void:
	editor.form.show_section("Restrictions")
	var button: Button = editor.form.get_node("%Uses").get_child(0)
	var name := button.name
	button.grab_focus(); button.pressed.emit(); await _idle()
	var treasure = _shell._document_tabs.get_current_tab_control()
	assert(treasure.route_identity() == "economy.treasure" and int(treasure._draft_record.nativeId) == 22)
	assert(treasure.get_node("%TreasureItemSlots").get_selected_items() == PackedInt32Array([0]))
	var gold: LineEdit = treasure.get_node("%Gold")
	gold.text = str(int(gold.text) + 1); gold.text_changed.emit(gold.text)
	await _shell._navigation.navigate_back(); await _idle()
	assert(_shell._draft_navigation._dialog.visible and treasure.has_unapplied_changes())
	_shell._draft_navigation._dialog.get_cancel_button().pressed.emit(); await _idle()
	assert(_shell._document_tabs.get_current_tab_control() == treasure and treasure.has_unapplied_changes())
	await _shell._navigation.navigate_back(); await _idle()
	await _shell._draft_navigation.discard_and_continue(&"discard")
	await _idle()
	assert(_shell._document_tabs.current_tab == 4 and editor.form.current_section() == "Restrictions")
	assert(root.gui_get_focus_owner() == editor.form.get_node("%Uses").get_node(NodePath(str(name))))
	editor.form.show_section("Identity")
	print("PROVIDENCE_ITEM_LINKED_RETURN_OK real-used-by treasure-22-slot-0 dirty-cancel-discard original-item-section-focus")


func _exercise_scope(scope: String, editor: ProvidenceItemEditor, original: Dictionary, path: String) -> void:
	var revision: int = _shell._session_view.revision
	editor.get_node("%BrowseArtworkLibrary").pressed.emit()
	await _idle()
	var chooser = _shell._assets.chooser
	var panel = chooser.get_node("%Gallery")
	assert(panel.get_node("%ItemTarget").item.id == original.id)
	panel.get_node("%ItemTarget/Cancel").pressed.emit()
	assert(_shell._document_tabs.current_tab == 4 and _shell._session_view.revision == revision)
	assert(editor.selected_definition() == original)
	editor.get_node("%BrowseArtworkLibrary").pressed.emit()
	await _idle()
	if scope == "supplied":
		await chooser._supplied("vault-icon", "Vault of Arcana")
		panel = chooser.get_node("%Supplied")
	else:
		await chooser.show_scope(scope)
	for frame in 35:
		await process_frame
	var selected := await _choose_artwork(panel, scope, int(original.get("iconId", 0)))
	var picture_number: int = panel._rows[selected].resource.resourceId if scope == "supplied" else panel._rows[selected].classicResource.resourceId
	var assets_before: Dictionary = _shell._bridge.request("project-asset.list", {"limit": 25})
	assert(assets_before.get("ok", false))
	assert(await _capture_state(scope))
	var apply: Button = panel.get_node("%ItemTarget/Apply")
	assert(apply.is_visible_in_tree() and not apply.disabled)
	apply.pressed.emit()
	await _idle()
	assert(not panel.get_node("%PickerWindow" if scope == "supplied" else "%StockPickerWindow").visible)
	assert(_shell._document_tabs.current_tab == 4 and _shell._session_view.revision == revision + 1, "scope=%s tab=%d revision=%d expected=%d status=%s" % [scope, _shell._document_tabs.current_tab, _shell._session_view.revision, revision + 1, _shell._status.text])
	assert(editor.selected_definition().id == original.id)
	assert(int(editor.selected_definition().iconId) == picture_number)
	if scope == "stock":
		assert(await _capture_state("returned-item"))
	var applied_definition: Dictionary = editor.selected_definition().duplicate(true)
	await _persist_and_restore(editor, original, applied_definition, assets_before, path)
	print("PROVIDENCE_ITEM_ARTWORK_CONTEXT_OK scope=%s cancel-unchanged fixed-item direct-apply save-reopen durable-undo restored-save-reopen" % scope)


func _choose_artwork(panel: Control, scope: String, current_icon: int) -> int:
	var selected := -1
	for index in panel._rows.size():
		var key: Dictionary = panel._rows[index].get("resource", {}) if scope == "supplied" else panel._rows[index].get("classicResource", {})
		if scope != "supplied" and key.get("resourceType", "") != "cicn":
			continue
		if int(key.get("resourceId", 0)) == current_icon:
			continue
		if scope == "supplied":
			panel._select_artwork(index)
		else:
			await panel._select(index)
		if not panel.get_node("%UseInItem" if scope == "supplied" else "%UseStock").disabled:
			selected = index
			break
	assert(selected >= 0)
	if scope == "supplied":
		var target = panel.get_node("%ItemTarget")
		assert(target.get_node("Zoom").is_visible_in_tree())
		for entry in [["One", 1], ["Two", 2], ["Four", 4]]:
			target.get_node("Zoom/" + entry[0]).pressed.emit()
			assert(target._scale == entry[1])
			for name in ["Current", "Proposed"]:
				var picture: TextureRect = target.get_node("Comparison/" + name + "/Area/Picture")
				var requested := picture.texture.get_size() * int(entry[1])
				assert(picture.custom_minimum_size == requested * minf(1.0, 112.0 / maxf(requested.x, requested.y)))
	return selected


func _persist_and_restore(editor: ProvidenceItemEditor, original: Dictionary, applied_definition: Dictionary, assets_before: Dictionary, path: String) -> void:
	await _shell._project_session.save()
	assert(_shell._status.text.begins_with("Saved revision"))
	_shell._bridge.stop()
	await _shell._project_session.open_project(path)
	await _shell._navigation.select_tab(4)
	await editor.open_item(str(original.id))
	assert(editor.selected_definition() == applied_definition)
	await _shell._undo()
	assert(editor.selected_definition() == original)
	var assets_restored: Dictionary = _shell._bridge.request("project-asset.list", {"limit": 25})
	assert(assets_restored.get("ok", false) and assets_restored.result.items == assets_before.result.items)
	assert(assets_restored.result.total == assets_before.result.total)
	await _shell._project_session.save()
	assert(_shell._status.text.begins_with("Saved revision"))
	_shell._bridge.stop()
	await _shell._project_session.open_project(path)
	await _shell._navigation.select_tab(4)
	await editor.open_item(str(original.id))
	assert(editor.selected_definition() == original)
	var persisted_assets: Dictionary = _shell._bridge.request("project-asset.list", {"limit": 25})
	assert(persisted_assets.get("ok", false) and persisted_assets.result.items == assets_before.result.items)
	assert(persisted_assets.result.total == assets_before.result.total)


func _idle() -> void:
	var stable := 0
	for frame in 900:
		await process_frame
		stable = stable + 1 if not _shell._operations.busy and not _shell._bridge.operation_busy() else 0
		if stable >= 4: return
	assert(false, "Artwork workflow did not settle within its bounded wait")


func _capture_state(state: String) -> bool:
	if _capture_root.is_empty():
		return true
	for size in [Vector2i(1600, 900), Vector2i(1920, 1080)]:
		root.size = size
		root.content_scale_size = size
		for frame in 20:
			await process_frame
		if state != "returned-item":
			var chooser = _shell._assets.chooser
			var panel = chooser.get_node("%Supplied" if state == "supplied" else "%Gallery")
			var target: Control = panel.get_node("%ItemTarget")
			assert(Rect2(Vector2.ZERO, Vector2(size)).encloses(target.get_global_rect()))
			assert(target.get_node("Comparison/Current/Area").size == target.get_node("Comparison/Proposed/Area").size)
		await RenderingServer.frame_post_draw
		var capture := root.get_texture().get_image()
		assert(capture.get_size() == size)
		assert(capture.save_png(_capture_root.path_join("%s-%dx%d.png" % [state, size.x, size.y])) == OK)
	return true
