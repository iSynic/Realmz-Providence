extends RefCounted

static func run(shell: Control, project_path: String, scenario_directory: String) -> void:
	shell.get_tree().root.size = Vector2i(1600, 900)
	shell.get_tree().root.content_scale_size = Vector2i(1600, 900)
	shell._bridge.stop()
	shell._bridge = preload("res://src/native_bridge.gd").new(project_path.get_base_dir().path_join("settings.cfg"))
	var created = shell._bridge.create_project("classic-scenario-import-smoke", project_path)
	if not bool(created.get("ok", false)):
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, str(created.get("error", "Classic scenario import project creation failed")))
		return
	await shell._activate_session(created)
	if shell._session_view.revision != 0 or not shell._bridge.is_project_backed():
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "Classic scenario import did not start from persistent revision 0 truth")
		return
	var preflight := await _inspect_source(shell, scenario_directory)
	if preflight.is_empty(): return
	var counts := await _import_and_describe(shell)
	if counts.is_empty(): return
	var map_identity := await _check_project_explorer(shell)
	if map_identity.is_empty() or not await _check_map_routes(shell, map_identity): return
	if not _save_and_reopen(shell, project_path, counts): return
	var preflight_counts: Dictionary = preflight.get("counts", {})
	print("PROVIDENCE_CLASSIC_SCENARIO_IMPORT_SMOKE_OK revision=1 scenario=%s maps=%d messages=%d items=%d sources=%d atlas=%s" % [
		str(preflight.get("scenarioName", "")), int(counts.get("maps", 0)), int(counts.get("messages", 0)),
		shell._scenario_items.size(), int(preflight_counts.get("presentRequiredScenarioFiles", 0)) + int(preflight_counts.get("presentOptionalScenarioFiles", 0)),
		str(shell._workbenches.land.render_atlas_identity())])
	shell.get_tree().quit(0)


static func _inspect_source(shell: Control, scenario_directory: String) -> Dictionary:
	var application_data_directory = shell._bridge.bundled_classic_application_data_root()
	if application_data_directory.is_empty():
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "Providence's bundled Realmz reference data was not discoverable")
		return {}
	shell._scenario_import_dialog.set_source_directories(scenario_directory, application_data_directory)
	shell._scenario_import_dialog.request_classic_inspection()
	await _wait_for_operations(shell)
	var preflight: Dictionary = shell._scenario_import_dialog.classic_preflight()
	if not bool(preflight.get("readyForDecode", false)):
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "visible Classic scenario preflight did not reach the decode boundary")
		return {}
	if not bool(preflight.get("deepValidationRequired", false)):
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "Classic scenario source-set inspection incorrectly claimed deep validation")
		return {}

	return preflight


static func _import_and_describe(shell: Control) -> Dictionary:
	var started := Time.get_ticks_usec()
	shell._scenario_import_dialog.submit_import()
	await _wait_for_operations(shell)
	if shell._session_view.revision != 1:
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "visible Classic scenario import did not commit one revision")
		return {}
	var described = shell._bridge.request("session.describe")
	if not bool(described.get("ok", false)):
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, str(described.get("error", "imported Classic scenario session description failed")))
		return {}
	var imported_session := described.get("result", {}) as Dictionary
	var counts := imported_session.get("counts", {}) as Dictionary
	if int(counts.get("maps", 0)) <= 0 or int(counts.get("messages", 0)) <= 0 or shell._scenario_items.is_empty():
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "Classic scenario import did not expose its canonical content counts")
		return {}
	var item_page: Dictionary = shell._bridge.request("item.list", {"scope": "scenario", "offset": 0, "limit": 1})
	if not item_page.get("ok", false) or int(item_page.get("result", {}).get("total", 0)) != 200:
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "Imported scenario items were absent from the paged catalog")
		return {}
	if shell._maps.document.maps.is_empty():
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "Classic scenario import did not expose a map document")
		return {}
	print("PROVIDENCE_CLASSIC_IMPORT_VISIBLE_MS %.3f adapter=%s" % [
		float(Time.get_ticks_usec() - started) / 1000.0, shell._bridge._adapter_path()])
	return counts


static func _check_project_explorer(shell: Control) -> String:
	var map_identity = str((shell._maps.document.maps[0] as Dictionary).get("identity", ""))
	var explorer_root: TreeItem = shell._domain_navigation.project_tree.get_root()
	var explorer_project := explorer_root.get_first_child() if explorer_root != null else null
	var explorer_world := explorer_project.get_first_child() if explorer_project != null else null
	var explorer_map := explorer_world.get_first_child() if explorer_world != null else null
	if explorer_map == null:
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "Imported maps were absent from the Project Explorer")
		return ""
	explorer_map.select(0)
	shell._domain_navigation.activate_explorer_selection()
	await _wait_for_operations(shell)
	if shell._maps.document.identity != map_identity:
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "Project Explorer did not open its imported map identity")
		return ""
	return map_identity


static func _check_map_routes(shell: Control, map_identity: String) -> bool:
	var opened_map = shell._bridge.request("map.open", {"identity": map_identity})
	if not bool(opened_map.get("ok", false)):
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, str(opened_map.get("error", "Imported map projection did not open")))
		return false
	var opened_tiles := ((opened_map.get("result", {}) as Dictionary).get("map", {}) as Dictionary).get("tiles", []) as Array
	if opened_tiles.size() != 90 * 90:
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "Imported map projection did not expose 8,100 cells")
		return false
	await shell._maps.document.load_map(map_identity)
	if str(shell._workbenches.land.render_atlas_identity()).is_empty():
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "Imported map canvas did not accept the bundled Realmz render atlas")
		return false
	await shell.get_tree().process_frame
	if int(shell._workbenches.land.canvas_height()) < 600:
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "Imported map canvas was compressed by its scene host (height=%d)" % int(shell._workbenches.land.canvas_height()))
		return false
	await shell._navigation.activate_domain("maps", false)
	var land_route = shell._domain_navigation.action_button("first-land-map")
	var dungeon_route = shell._domain_navigation.action_button("first-dungeon-map")
	if land_route == null or dungeon_route == null or not land_route.button_pressed or dungeon_route.button_pressed:
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "Land map document and World route selection disagreed")
		return false
	var dungeon_identity := ""
	for value in shell._maps.document.maps:
		var imported_map := value as Dictionary
		if str(imported_map.get("levelType", "land")) == "dungeon":
			dungeon_identity = str(imported_map.get("identity", ""))
			break
	if not dungeon_identity.is_empty():
		await shell._navigation.open_first_map("dungeon")
		if shell._maps.document.identity != dungeon_identity or not shell._maps.document.is_dungeon:
			preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "Dungeon Editor route did not open the first imported dungeon map")
			return false
		if land_route.button_pressed or not dungeon_route.button_pressed or not shell._command_title.text.contains("DUNGEON EDITOR"):
			preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "Dungeon map document, command header, and World route selection disagreed")
			return false
		await shell._navigation.open_map(map_identity)

	return true


static func _save_and_reopen(shell: Control, project_path: String, counts: Dictionary) -> bool:
	var saved = shell._bridge.request("project.save")
	if not bool(saved.get("ok", false)):
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, str(saved.get("error", "Classic scenario project save failed")))
		return false
	var reopened = shell._bridge.start_project(project_path)
	if not bool(reopened.get("ok", false)):
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, str(reopened.get("error", "Classic scenario project reopen failed")))
		return false
	var session := reopened.get("result", {}) as Dictionary
	var reopened_counts := session.get("counts", {}) as Dictionary
	if int(session.get("revision", -1)) != 1 or bool(session.get("canUndo", false)):
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "Classic scenario import revision and non-undoable baseline did not survive reopen")
		return false
	if int(reopened_counts.get("maps", -1)) != int(counts.get("maps", -2)) or int(reopened_counts.get("messages", -1)) != int(counts.get("messages", -2)):
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "Classic scenario canonical counts changed after reopen")
		return false

	return true


static func _wait_for_operations(shell: Control) -> void:
	var idle_frames := 0
	while idle_frames < 3:
		await shell.get_tree().process_frame
		idle_frames = 0 if shell._operations.busy else idle_frames + 1
