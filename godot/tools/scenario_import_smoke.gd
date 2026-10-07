extends RefCounted

const Fixture = preload("res://tools/native_workflow_fixtures.gd")
const Routes = preload("res://src/route_catalog.gd")

static func _run_scenario_import_smoke(shell: Control, project_path: String, data_path: String) -> void:
	var created = shell._bridge.create_project("scenario-import-smoke", project_path)
	if not bool(created.get("ok", false)):
		Fixture._smoke_fail(shell, str(created.get("error", "scenario import project creation failed")))
		return
	await shell._activate_session(created)
	if shell._session_view.revision != 0 or not shell._bridge.is_project_backed():
		Fixture._smoke_fail(shell, "scenario import did not start from persistent revision 0 truth")
		return
	if not await shell._scenario_import.import_items(data_path, ""):
		return
	var listed: Dictionary = shell._bridge.request("item.list", {"scope": "scenario", "limit": 8})
	var page: Dictionary = listed.get("result", {})
	if shell._session_view.revision != 1 or not listed.get("ok", false) or int(page.get("total", 0)) != 200 or (page.get("items", []) as Array).size() != 8:
		Fixture._smoke_fail(shell, "scenario item import did not produce one revision and 200 rows")
		return
	var first: Dictionary = page.items[0]
	if str(first.get("identity", "")) != "classic.item.800" or int(first.get("classicId", -1)) != 800:
		Fixture._smoke_fail(shell, "scenario item import lost stable or Classic identity")
		return

	var saved = shell._bridge.request("project.save")
	if not bool(saved.get("ok", false)):
		Fixture._smoke_fail(shell, str(saved.get("error", "scenario item project save failed")))
		return
	var reopened = shell._bridge.start_project(project_path)
	if not bool(reopened.get("ok", false)):
		Fixture._smoke_fail(shell, str(reopened.get("error", "scenario item project reopen failed")))
		return
	var session := reopened.get("result", {}) as Dictionary
	if int(session.get("revision", -1)) != 1 or not bool(session.get("canUndo", false)):
		Fixture._smoke_fail(shell, "scenario item import did not preserve revision or undo through reopen")
		return

	var output_directory := project_path.path_join("smoke-output")
	if DirAccess.make_dir_recursive_absolute(output_directory) != OK:
		Fixture._smoke_fail(shell, "scenario item smoke output directory could not be created")
		return
	var output_path := output_directory.path_join("Data NI")
	var compiled = shell._bridge.request("project.compile-data-ni", {"path": output_path})
	if not bool(compiled.get("ok", false)):
		Fixture._smoke_fail(shell, str(compiled.get("error", "scenario item recompile failed")))
		return
	if FileAccess.get_file_as_bytes(data_path) != FileAccess.get_file_as_bytes(output_path):
		Fixture._smoke_fail(shell, "scenario item no-edit recompile differed from imported Data NI")
		return

	print("PROVIDENCE_SCENARIO_IMPORT_SMOKE_OK revision=1 items=200")
	shell.get_tree().quit(0)

static func _run_publish_smoke(shell: Control,
	project_path: String,
	application_library_root: String,
	classic_output: String,
	rebuilt_output: String
) -> void:
	if DirAccess.dir_exists_absolute(classic_output) or FileAccess.file_exists(classic_output):
		Fixture._smoke_fail(shell, "publish smoke Classic destination already exists")
		return
	if DirAccess.dir_exists_absolute(rebuilt_output) or FileAccess.file_exists(rebuilt_output):
		Fixture._smoke_fail(shell, "publish smoke Rebuilt destination already exists")
		return
	var opened = shell._bridge.start_project(project_path, application_library_root)
	if not bool(opened.get("ok", false)):
		Fixture._smoke_fail(shell, str(opened.get("error", "publish smoke project open failed")))
		return
	await shell._activate_session(opened)
	shell._navigation.select_tab(Routes.tab_for_route("export.export-plan"))
	await _wait_for_operations(shell)
	var view: ProvidencePublishWorkbench = shell._document_tabs.get_current_tab_control()
	var controller_index: int = shell._workbenches.publish.find(view)
	if controller_index < 0:
		Fixture._smoke_fail(shell, "Publish route did not resolve its workbench controller")
		return
	var controller: ProvidencePublishWorkbenchController = shell._workbenches.publish_commands[controller_index]
	var checked := await controller.reload()
	if not checked.get("ok", false) or view.checked_revision() != shell._session_view.revision or view.export_button.disabled:
		Fixture._smoke_fail(shell, "Publish workbench did not accept Classic readiness: %s" % str(checked.get("error", view.readiness_status.text)))
		return
	var classic := await controller.publish_to("classic", classic_output)
	if not classic.get("ok", false):
		Fixture._smoke_fail(shell, str(classic.get("error", "Publish workbench Classic export failed")))
		return
	view.target_selector.select(1)
	view.target_selector.item_selected.emit(1)
	await _wait_for_operations(shell)
	if view.target() != "rebuilt" or view.checked_revision() != shell._session_view.revision or view.export_button.disabled:
		Fixture._smoke_fail(shell, "Publish workbench did not accept Rebuilt readiness: %s" % view.readiness_status.text)
		return
	var rebuilt := await controller.publish_to("rebuilt", rebuilt_output)
	if not rebuilt.get("ok", false):
		Fixture._smoke_fail(shell, str(rebuilt.get("error", "Publish workbench Rebuilt export failed")))
		return
	var outputs := _published_outputs(shell, classic_output, rebuilt_output)
	if outputs.is_empty(): return
	print("PROVIDENCE_DUAL_PUBLISH_SMOKE_OK revision=%d classicFiles=%d rebuiltBytes=%d" % [
		shell._session_view.revision,
		outputs.classicFiles,
		outputs.rebuiltBytes,
	])
	shell.get_tree().quit()


static func _published_outputs(shell: Control, classic_output: String, rebuilt_output: String) -> Dictionary:
	if not DirAccess.dir_exists_absolute(classic_output):
		Fixture._smoke_fail(shell, "Publish workbench did not create the Classic target directory")
		return {}
	if not FileAccess.file_exists(classic_output.path_join("Scenario.rsrc")):
		Fixture._smoke_fail(shell, "published Classic target omitted Scenario.rsrc")
		return {}
	if not FileAccess.file_exists(rebuilt_output):
		Fixture._smoke_fail(shell, "Publish workbench did not create the Rebuilt package")
		return {}
	var result := {"classicFiles": DirAccess.get_files_at(classic_output).size(),
		"rebuiltBytes": FileAccess.get_file_as_bytes(rebuilt_output).size()}
	if result.classicFiles <= 0 or result.rebuiltBytes <= 0:
		Fixture._smoke_fail(shell, "published target artifacts were empty")
		return {}
	return result

static func _run_classic_scenario_import_smoke(shell: Control, project_path: String, scenario_directory: String) -> void:
	await preload("res://tools/classic_scenario_import_smoke.gd").run(shell, project_path, scenario_directory)

static func _wait_for_operations(shell: Control) -> void:
	await shell.get_tree().process_frame
	while shell._operations.busy: await shell.get_tree().process_frame


static func _run_classic_land_import_smoke(shell: Control, project_path: String, source_directory: String) -> void:
	var created = shell._bridge.create_project("classic-land-import-smoke", project_path)
	if not bool(created.get("ok", false)):
		Fixture._smoke_fail(shell, str(created.get("error", "Classic land import project creation failed")))
		return
	await shell._activate_session(created)
	if not (await shell._scenario_import.import_land(source_directory)) or shell._session_view.revision != 1:
		Fixture._smoke_fail(shell, "Classic land import did not produce exactly one revision")
		return
	var opened = shell._bridge.request("map.open", {"identity": "land:0"})
	if not bool(opened.get("ok", false)):
		Fixture._smoke_fail(shell, str(opened.get("error", "imported land map did not open")))
		return
	var action_point = Fixture._find_action_point(shell, opened.result as Dictionary, 17)
	if action_point.is_empty() or Fixture._action_target(shell, action_point, 0) != 999:
		Fixture._smoke_fail(shell, "imported Action Point 17 did not preserve its missing Message 999 target")
		return
	var repaired = shell._bridge.request("action-reference.retarget", {
		"expectedRevision": shell._session_view.revision,
		"source": "action-point:land:0:17",
		"slot": 0,
		"targetNativeId": 47,
	})
	if not shell._accept(repaired):
		return
	shell._session_view.apply(repaired.result as Dictionary)
	if shell._session_view.revision != 2:
		Fixture._smoke_fail(shell, "reference repair did not advance the imported project to revision 2")
		return
	var diagnostics = shell._bridge.request("validation.run")
	if not bool(diagnostics.get("ok", false)):
		Fixture._smoke_fail(shell, str(diagnostics.get("error", "validation failed after reference repair")))
		return
	for item in diagnostics.result as Array:
		var code := str((item as Dictionary).get("code", ""))
		if str((item as Dictionary).get("entity", "")) == "action-point:land:0:17" and code.begins_with("reference.") and code.ends_with(".missing"):
			Fixture._smoke_fail(shell, "reference repair left a dangling target diagnostic: " + JSON.stringify(item))
			return

	var compiled := _compile_land_repair(shell, project_path, source_directory)
	if compiled.is_empty(): return
	if not await _reopen_land_repair(shell, project_path, str(compiled.output)): return
	if not _verify_land_recompile(shell, project_path, str(compiled.output), str(compiled.manifest)): return
	print("PROVIDENCE_CLASSIC_LAND_IMPORT_SMOKE_OK revision=3 maps=1 actionPoints=100")
	shell.get_tree().quit(0)


static func _compile_land_repair(shell: Control, project_path: String, source_directory: String) -> Dictionary:
	var first_output := project_path.path_join("classic-output-1")
	var first_compile = shell._bridge.request("project.compile-classic-slice", {"directory": first_output})
	if not bool(first_compile.get("ok", false)):
		Fixture._smoke_fail(shell, str(first_compile.get("error", "first Classic compile failed")))
		return {}
	var source_dd := FileAccess.get_file_as_bytes(source_directory.path_join("Data DD"))
	var compiled_dd := FileAccess.get_file_as_bytes(first_output.path_join("Data DD"))
	var changed_bytes: Array[int] = []
	for index in range(min(source_dd.size(), compiled_dd.size())):
		if source_dd[index] != compiled_dd[index]:
			changed_bytes.append(index)
	if source_dd.size() != compiled_dd.size() or changed_bytes != [704, 705]:
		Fixture._smoke_fail(shell, "reference repair changed bytes outside the declared Data DD target field")
		return {}
	for native_path in ["Data LD", "Data SD2", "Data ED"]:
		if FileAccess.get_file_as_bytes(source_directory.path_join(native_path)) != FileAccess.get_file_as_bytes(first_output.path_join(native_path)):
			Fixture._smoke_fail(shell, "no-edit compile changed %s" % native_path)
			return {}
	return {"output": first_output, "manifest": str((first_compile.result as Dictionary).get("manifestSha256", ""))}


static func _reopen_land_repair(shell: Control, project_path: String, first_output: String) -> bool:
	var saved = shell._bridge.request("project.save")
	if not bool(saved.get("ok", false)):
		Fixture._smoke_fail(shell, str(saved.get("error", "imported project save failed")))
		return false
	var reopened = shell._bridge.start_project(project_path)
	if not bool(reopened.get("ok", false)):
		Fixture._smoke_fail(shell, str(reopened.get("error", "imported project reopen failed")))
		return false
	shell._apply_session(reopened.result as Dictionary)
	await shell._strings.reload()
	if shell._session_view.revision != 2 or not bool((reopened.result as Dictionary).get("canUndo", false)):
		Fixture._smoke_fail(shell, "import and repair history did not survive reopen")
		return false
	if not (await shell._scenario_import.import_land(first_output)) or shell._session_view.revision != 3:
		Fixture._smoke_fail(shell, "compiled Classic files did not reimport as one revision")
		return false
	var reimported = shell._bridge.request("map.open", {"identity": "land:0"})
	if not bool(reimported.get("ok", false)):
		Fixture._smoke_fail(shell, str(reimported.get("error", "reimported land map did not open")))
		return false
	var reimported_ap = Fixture._find_action_point(shell, reimported.result as Dictionary, 17)
	if reimported_ap.is_empty() or Fixture._action_target(shell, reimported_ap, 0) != 47:
		Fixture._smoke_fail(shell, "reimported Action Point lost the repaired Message 47 target")
		return false
	return true


static func _verify_land_recompile(shell: Control, project_path: String, first_output: String, first_manifest: String) -> bool:
	var second_output := project_path.path_join("classic-output-2")
	var second_compile = shell._bridge.request("project.compile-classic-slice", {"directory": second_output})
	if not bool(second_compile.get("ok", false)):
		Fixture._smoke_fail(shell, str(second_compile.get("error", "second Classic compile failed")))
		return false
	if first_manifest != str((second_compile.result as Dictionary).get("manifestSha256", "")):
		Fixture._smoke_fail(shell, "reimported Classic manifest hash was not deterministic")
		return false
	for native_path in ["Data DD", "Data ED", "Data LD", "Data SD2"]:
		if FileAccess.get_file_as_bytes(first_output.path_join(native_path)) != FileAccess.get_file_as_bytes(second_output.path_join(native_path)):
			Fixture._smoke_fail(shell, "reimported compile changed %s" % native_path)
			return false
	return true
