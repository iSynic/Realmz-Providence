extends SceneTree

var _operations: ProvidenceEditorOperation
var _session := preload("res://src/project_session_controller.gd").new()
var _context := {"revision": 0, "projectId": "library-configuration", "connected": false}
var _failed := false
var _frames := 0


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var arguments := OS.get_cmdline_user_args()
	if arguments.size() != 1:
		push_error("Expected a disposable fixture root")
		quit(1)
		return
	var fixture_root := arguments[0]
	var settings_path := fixture_root.path_join("settings.cfg")
	var project_path := fixture_root.path_join("project")
	var library_path := fixture_root.path_join("application-library")
	_operations = preload("res://src/editor_operation.gd").new()
	root.add_child(_operations)
	process_frame.connect(func(): _frames += 1)
	_session.bridge = ProvidenceNativeBridge.new(settings_path)
	_session.initialize(_operations, _activate, func(): return _context)
	_session.failed.connect(func(message): _check(false, message))
	await _session.create_project("library-configuration", project_path)
	if not _check(_context.connected, "Could not open disposable project"):
		_finish()
		return
	var snapshot_path := project_path.path_join("project.providence.json")
	var snapshot := FileAccess.get_file_as_bytes(snapshot_path)
	if await _import_library(library_path):
		await _configure_and_inspect(library_path, settings_path)
		await _invalid_library_keeps_connection(fixture_root.path_join("missing-library"), settings_path)
		await _blocked_publishing(library_path)
	_check(snapshot == FileAccess.get_file_as_bytes(snapshot_path), "Application configuration changed authored project truth")
	if not _failed: await _item_picture_native(fixture_root)
	if not _failed: await _monster_picture_native(fixture_root)
	_finish()


func _import_library(path: String) -> bool:
	if not _check(_operations.begin(_session.bridge, "Build disposable library"), "Library import could not reserve transport"): return false
	var response := await _operations.request("application-media.import-classic-library", {
		"sourceDirectory": ProjectSettings.globalize_path("res://bundled/realmz-reference"), "libraryRoot": path})
	_operations.finish(response)
	return _check(response.get("ok", false) and response.get("result", {}).get("appearanceComplete", false),
		"Bundled application-library fixture is incomplete: " + str(response.get("error", "")))


func _configure_and_inspect(path: String, settings_path: String) -> void:
	var original := _session.bridge
	var frames_before := _frames
	var response: Dictionary = await _session.configure_application_library(path)
	_check(response.get("ok", false), "Native library configuration failed: " + str(response.get("error", "")))
	_check(_frames > frames_before + 1, "Library validation/reconnect stopped frame processing")
	_check(_session.bridge != original and not original.connection_alive(), "Confirmed replacement did not retire the original connection")
	_check(_session.bridge.current_application_library_root() == path.simplify_path(), "Replacement opened with the wrong library")
	var settings := ConfigFile.new()
	_check(settings.load(settings_path) == OK, "Library preference was not saved")
	_check(settings.get_value("reference_libraries", "realmz_classic_application", "") == path.simplify_path(), "Saved library preference changed")
	if not _check(_operations.begin(_session.bridge, "Inspect configured library"), "Configured connection did not release its operation"): return
	var described := await _operations.request("application-media.describe")
	_operations.finish(described)
	_check(described.get("ok", false) and described.get("result", {}).get("configured", false), "Replacement adapter did not attach the library")
	_check(int(described.get("result", {}).get("assets", 0)) > 0, "Configured library returned no assets")


func _invalid_library_keeps_connection(path: String, settings_path: String) -> void:
	var original := _session.bridge
	var settings := FileAccess.get_file_as_bytes(settings_path)
	var response: Dictionary = await _session.configure_application_library(path)
	_check(not response.get("ok", false), "Missing native library was accepted")
	_check(_session.bridge == original and original.connection_alive(), "Invalid library displaced the live project")
	_check(settings == FileAccess.get_file_as_bytes(settings_path), "Invalid library overwrote saved preferences")
	_check(not _operations.busy and not _operations.requires_reopen, "Validation rejection locked the untouched project")


func _blocked_publishing(library_path: String) -> void:
	var dialog := ProvidencePublishTargetsDialog.new()
	root.add_child(dialog)
	var publishing := preload("res://src/publish_targets_controller.gd").new()
	publishing.initialize(dialog, _operations, _session, func(): return _context)
	await publishing.show_targets()
	await publishing.inspect_readiness(library_path)
	_check(dialog.status_text().contains("Publishing remains blocked"), "Fresh project was incorrectly certified for publication: " + dialog.status_text())
	_check(not dialog.is_ready_to_publish() and not dialog.is_busy(), "Blocked readiness left Publish enabled or busy")
	_check(not _operations.busy, "Native readiness retained the operation lease")
	dialog.free()


func _activate(response: Dictionary) -> Dictionary:
	_context.revision = int(response.get("result", {}).get("revision", 0))
	_context.connected = true
	return {"ok": true}


func _item_picture_native(fixture_root: String) -> void:
	# Data NI has 200 fixed 100-byte records; the signed CICN is at byte offset 4.
	var data := PackedByteArray()
	data.resize(200 * 100)
	var record_index := 101
	var icon_id := 6195
	data[record_index * 100 + 4] = (icon_id >> 8) & 255
	data[record_index * 100 + 5] = icon_id & 255
	var path := fixture_root.path_join("Data NI")
	var file := FileAccess.open(path, FileAccess.WRITE)
	if not _check(file != null, "Could not write the controlled item source"): return
	file.store_buffer(data)
	file.close()
	if not _check(_operations.begin(_session.bridge, "Import item fixture"), "Item import could not reserve the operation"): return
	var response := await _operations.request("item-rules.import-scenario", {"path": path, "expectedRevision": _context.revision})
	_operations.finish(response)
	if not _check(response.get("ok", false), "Controlled item import failed: " + str(response.get("error", ""))): return
	_context.revision = int(response.result.revision)
	var view: ProvidenceItemEditor = load("res://src/item_editor.tscn").instantiate()
	root.add_child(view)
	var controller := preload("res://src/item_workbench_controller.gd").new()
	controller.initialize(view, _operations, func(): return _context, func(result): return result.get("ok", false))
	controller.attach_session(_session.bridge)
	response = await controller.reload()
	_check(response.get("ok", false), "Item artwork refresh failed: " + str(response.get("error", "")))
	response = await controller.open_item("classic.item.901")
	_check(response.get("ok", false), "Controlled item could not be opened: " + str(response.get("error", "")))
	_check(int(view.selected_definition().get("classicId", 0)) == 901, "Native item fixture selected a different record")
	await _wait_item_picture(view)
	var picture: Texture2D = view.get_node("%ItemPicture").texture
	_check(picture != null and picture.get_width() == 32, "Native item refresh did not display its exact application picture after asynchronous completion")
	controller.dispose()
	view.free()


func _wait_item_picture(view: Control) -> void:
	var deadline := Time.get_ticks_msec() + 20000
	while view.get_node("%ItemPicture").texture == null and Time.get_ticks_msec() < deadline:
		await process_frame
	while _operations.busy and Time.get_ticks_msec() < deadline: await process_frame


func _check(condition: bool, message: String) -> bool:
	if not condition:
		_failed = true
		push_error("PROVIDENCE_LIBRARY_CONFIGURATION_NATIVE_FAILED " + message)
	return condition


func _monster_picture_native(fixture_root: String) -> void:
	# Data MD uses 210-byte records; the signed portrait icon is at byte offset 98.
	var data := PackedByteArray()
	data.resize(210)
	data[98] = 1
	data[99] = 136 # Icon 392, an exact bundled application appearance pair.
	var file := FileAccess.open(fixture_root.path_join("Data MD"), FileAccess.WRITE)
	if not _check(file != null, "Could not write the controlled monster source"): return
	file.store_buffer(data)
	file.close()
	if not _check(_operations.begin(_session.bridge, "Import monster fixture"), "Monster import could not reserve transport"): return
	var imported := await _operations.request("project.import-classic-monsters", {"directory": fixture_root, "expectedRevision": _context.revision})
	_operations.finish(imported)
	if not _check(imported.get("ok", false), "Controlled monster import failed: " + str(imported.get("error", ""))): return
	_context.revision = int(imported.result.revision)
	var view: Control = load("res://src/monster_workbench.tscn").instantiate()
	root.add_child(view)
	view.hide()
	view.configure_operations(_operations)
	await view.attach(_session.bridge)
	var opened: Dictionary = await view.browser.open_record(0)
	_check(opened.get("ok", false), "Native monster detail failed: " + str(opened.get("error", "")))
	var picture: Texture2D = view.form.get_node("%Portrait").texture
	_check(picture != null and picture.get_size() == Vector2(64, 32), "Native monster portrait mismatch: %s; size=%s" % [view.form.get_node("%AppearanceStatus").tooltip_text, "none" if picture == null else str(picture.get_size())])
	_check(view.browser.revision == _context.revision and not _operations.busy, "Monster read did not finish at the imported project revision")
	view.free()


func _finish() -> void:
	_session.bridge.stop()
	_operations.free()
	if not _failed: print("PROVIDENCE_LIBRARY_CONFIGURATION_NATIVE_OK worker-validation candidate-replacement saved-preference rejected-library-kept-truth blocked-publishing item-picture-after-async monster-picture-before-release")
	quit(1 if _failed else 0)
