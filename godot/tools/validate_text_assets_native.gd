extends SceneTree

class CheckedShell extends "res://src/editor_shell.gd":
	var save_failures := 0
	func _show_error(message: String) -> void:
		_status.text = message
		if message.contains("Controlled destination-full failure"):
			save_failures += 1
		else:
			push_error(message)

class TestBridge extends "res://src/native_bridge.gd":
	var fail_save := false
	func configured_application_library_root(_explicit_root: String = "") -> String: return ""
	func configured_reference_catalog_root(_explicit_root: String = "") -> String: return ""
	func configured_monster_library_root(_explicit_root: String = "") -> String: return ""
	func configured_personal_library_root() -> String: return _settings_path.get_base_dir().path_join("personal-library")
	func _request(method: String, params: Dictionary = {}) -> Dictionary:
		if method == "project.save" and fail_save:
			return {"ok": false, "error": "Controlled destination-full failure"}
		return super._request(method, params)

var _shell
var _failed := false


func _initialize() -> void:
	call_deferred("_run")


func _wait_preview(panel: Control, expected: String) -> void:
	var deadline := Time.get_ticks_msec() + 20000
	while Time.get_ticks_msec() < deadline:
		if not _shell._operations.busy and panel.get_node("%TextPreview").text == expected: return
		await process_frame


func _check(condition: bool, message: String) -> bool:
	if not condition:
		_failed = true
		push_error("PROVIDENCE_TEXT_ASSETS_NATIVE_FAILED " + message)
		if _shell != null: _shell._bridge.stop()
		quit(1)
	return condition


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if not _check(args.size() == 1 and args[0].simplify_path().get_base_dir().get_file().begins_with("providence-ui-") and args[0].get_file() == "text-project" and not DirAccess.dir_exists_absolute(args[0]), "Expected a new disposable providence-ui-*/text-project path."):
		return
	root.gui_embed_subwindows = true
	root.size = Vector2i(1600,900)
	OS.set_environment("PROVIDENCE_PROJECT_PATH", "")
	_shell = load("res://src/editor_shell.tscn").instantiate()
	_shell.set_script(CheckedShell)
	root.add_child(_shell)
	await process_frame
	_shell._bridge.stop()
	_shell._bridge = TestBridge.new(args[0].get_base_dir().path_join("settings.cfg"))
	var created: Dictionary = _shell._bridge.create_project("text-workflow", args[0])
	if not _check(created.get("ok", false), "Disposable project could not be created: " + str(created.get("error", ""))): return
	var revision := int(created.get("result", {}).get("revision", 0))
	var style := PackedByteArray([0,1,0,0,0,0,0,14,0,11,0,3,0,0,0,12,0,0,0,0,0,0])
	for resource in [["TEXT", -202, "text-resource", "The river runs east.\n".repeat(80)], ["styl", -202, "text-style-resource", style], ["TEXT", -201, "text-resource", "Untouched neighboring text"], ["styl", -203, "text-style-resource", "Existing unpaired formatting bytes"]]:
		var identity := "%s:%d" % [resource[0], resource[1]]
		var path := args[0].get_base_dir().path_join("fixture-%s-%d.txt" % [resource[0], resource[1]])
		var file := FileAccess.open(path, FileAccess.WRITE)
		if not _check(file != null, "Could not create synthetic fixture text."): return
		if resource[3] is PackedByteArray: file.store_buffer(resource[3])
		else: file.store_string(resource[3])
		file.close()
		var imported: Dictionary = _shell._bridge.request("asset.import", {"expectedRevision": revision, "path": path, "asset": {"identity": identity, "label": "%s %d" % [resource[0], resource[1]], "kind": resource[2], "mimeType": "text/plain", "classicResource": {"resourceType": resource[0], "resourceId": resource[1]}, "source": "controlled text workflow fixture"}})
		if not _check(imported.get("ok", false), "Synthetic asset import failed: " + str(imported.get("error", ""))): return
		revision = int(imported.result.revision)
	await _shell._activate_session(_shell._bridge.request("session.describe"))
	await _exercise_assets(args[0])
	_shell._bridge.stop()
	_shell.queue_free()
	await process_frame
	if not _failed: print("PROVIDENCE_TEXT_ASSETS_NATIVE_OK edit-apply-import-create-undo-redo-save-failure-retry-reopen style-neighbors-unchanged")
	quit(1 if _failed else 0)


func _exercise_assets(project_path: String) -> void:
	await _shell._navigation.activate_domain("assets")
	var workbench = _shell._assets.library_workbench
	var panel = workbench.get_node("%Gallery")
	for _frame in range(35): await process_frame
	var selected := -1
	for index in panel._rows.size():
		if panel._rows[index].kind == "text-resource" and int(panel._rows[index].get("classicResource", {}).get("resourceId", 0)) == -202:
			selected = index
			break
	if not _check(selected >= 0, "Fixture contains no text resource."): return
	await panel._select(selected)
	var identity: String = panel._rows[selected].identity
	var descriptors := {}
	for row in panel._rows:
		var opened: Dictionary = _shell._bridge.request("project-asset.open", {"identity": row.identity})
		descriptors[row.identity] = opened.get("result", {}).get("asset", {})
	var original: String = panel.get_node("%TextPreview").text
	panel.get_node("%EditResource").pressed.emit()
	while _shell._operations.busy: await process_frame
	var dialog = panel.get_node("%TextDialog")
	if not _check(dialog.visible and dialog.editor.text == original, "Dialog lost original text."): return
	var edited := original + "\nNative text workflow check."
	dialog.editor.text = edited
	dialog.editor.text_changed.emit()
	await dialog.get_node("%StyleWorkbench")._inspect()
	dialog._draft_changed()
	await dialog.apply_text()
	await _wait_preview(panel, edited)
	if not _check(not dialog.visible and panel.get_node("%TextPreview").text == edited and panel._rows[panel._selected].identity == identity, "Apply did not retain selection and edited preview."): return
	if not _check(workbench.get_node("%SaveAssetNotice").text.begins_with("Unsaved changes"), "Apply did not expose unsaved state."): return
	await _shell._undo()
	await _wait_preview(panel, original)
	if not _check(panel.get_node("%TextPreview").text == original, "Undo lost the original text."): return
	await _shell._redo()
	await _wait_preview(panel, edited)
	if not _check(panel.get_node("%TextPreview").text == edited, "Redo lost the edited text."): return
	_shell._bridge.fail_save = true
	await _shell._project_session.save()
	if not _check(workbench.get_node("%SaveAssetProject").text == "Retry Save" and workbench.get_node("%SaveAssetAs").visible and panel.get_node("%TextPreview").text == edited, "Save failure lost changes or recovery controls."): return
	_shell._bridge.fail_save = false
	await _shell._project_session.save()
	if not _check(_shell.save_failures == 1, "Save failure was not reported exactly once."): return
	if not _check(not workbench.get_node("%SaveAssetActions").visible, "Successful Save left an unsaved indication."): return
	for other: String in descriptors:
		if other == identity: continue
		var opened: Dictionary = _shell._bridge.request("project-asset.open", {"identity": other})
		if not _check(opened.get("result", {}).get("asset", {}) == descriptors[other], "Apply changed a style or neighboring asset."): return
	if not await _create_text(workbench, panel, project_path): return
	if not _check(_shell.save_failures == 2, "New-text Save failure was not reported exactly once."): return
	_shell._bridge.stop()
	var reopened: Dictionary = _shell._bridge.start_project(project_path)
	if not _check(reopened.get("ok", false), "Saved project failed to reopen."): return
	var text: Dictionary = _shell._bridge.request("text-resource.open", {"identity": identity})
	if not _check(text.get("result", {}).get("text", "") == edited, "Reopen lost edited text."): return
	var new_text: Dictionary = _shell._bridge.request("text-resource.open", {"identity": "text:-203"})
	if not _check(new_text.get("result", {}).get("text", "") == "The old bridge rises from the mist.\n".repeat(1000), "Reopen lost new text."): return
	var style: Dictionary = _shell._bridge.request("project-asset.open", {"identity": "styl:-203"})
	if not _check(style.get("result", {}).get("asset", {}) == descriptors["styl:-203"], "Creation changed existing formatting bytes."): return


func _create_text(workbench: Control, panel: Control, project_path: String) -> bool:
	workbench.get_node("%NewText").pressed.emit()
	while _shell._operations.busy: await process_frame
	var dialog = workbench.get_node("%NewTextDialog")
	if not _check(dialog.visible and _shell._active_text_dialog() == dialog, "New Text failed to open in the draft guard."): return false
	dialog.get_node("%Number").text = "-202"
	dialog.draft_changed()
	await dialog.validate_now()
	if not _check(dialog.get_node("%Create").disabled and dialog.get_node("%Availability").text.contains("already used"), "Existing TEXT number did not block creation."): return false
	dialog.get_node("%Number").text = "-203"
	dialog.get_node("%TextName").text = "Arrival at the old bridge"
	var path := project_path.get_base_dir().path_join("new-text-utf8.txt")
	var file := FileAccess.open(path, FileAccess.WRITE)
	file.store_string("\ufeff" + "The old bridge rises from the mist.\r\n".repeat(1000))
	file.close()
	await dialog.load_file(path)
	await dialog.get_node("%StyleWorkbench")._inspect()
	if not _check(dialog.get_node("%PreserveStyle").visible and dialog.get_node("%Create").disabled and dialog.editor.text.length() > 16000, "Full imported draft or existing formatting guard is missing."): return false
	if not _check(_shell._draft_apply.has_draft(), "Shell did not guard the new-text draft."): return false
	dialog.get_node("%PreserveStyle").button_pressed = true
	await dialog.create_text()
	await _wait_preview(panel, "The old bridge rises from the mist.\n".repeat(1000))
	if not _check(not dialog.visible and panel._rows[panel._selected].identity == "text:-203" and panel.get_node("%TextPreview").text == "The old bridge rises from the mist.\n".repeat(1000), "Create lost the new selection or complete preview."): return false
	if not _check(workbench.get_node("%SaveAssetNotice").text.begins_with("Unsaved changes"), "Create did not expose Unsaved changes."): return false
	await _shell._undo()
	var absent: Dictionary = _shell._bridge.request("text-resource.open", {"identity": "text:-203"})
	if not _check(not absent.get("ok", false), "Undo did not remove newly created text."): return false
	await _shell._redo()
	for _frame in range(10): await process_frame
	var restored: Dictionary = _shell._bridge.request("text-resource.open", {"identity": "text:-203"})
	if not _check(restored.get("ok", false), "Redo did not restore newly created text."): return false
	_shell._bridge.fail_save = true
	await _shell._project_session.save()
	if not _check(workbench.get_node("%SaveAssetProject").text == "Retry Save", "New-text Save failure has no Retry Save action."): return false
	_shell._bridge.fail_save = false
	await _shell._project_session.save()
	return _check(not workbench.get_node("%SaveAssetActions").visible, "New text did not Save successfully.")
