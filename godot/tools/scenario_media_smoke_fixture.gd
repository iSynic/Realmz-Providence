extends RefCounted


static func open_project(shell: Control, identity: String, path: String) -> bool:
	var bridge: ProvidenceNativeBridge = shell.get("_bridge")
	# These media fixtures exclude unrelated stock mechanics and their macro callers.
	var created := preload("res://src/native_project_creation.gd").create(OS.get_environment("PROVIDENCE_CLI_PATH"), identity, path, "")
	if not created.get("ok", false):
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, str(created.get("error", "Scenario media project creation failed")))
		return false
	var opened := bridge.start_project(path)
	if not opened.get("ok", false):
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, str(opened.get("error", "Scenario media fixture could not open")))
		return false
	await shell._activate_session(opened)
	return true


static func compile_save_reopen(shell: Control, project_path: String, prefix: String, label: String, revision: int) -> Dictionary:
	var bridge: ProvidenceNativeBridge = shell.get("_bridge")
	var directory := project_path.path_join(prefix + "-output-1")
	var compiled := bridge.request("project.compile-classic-slice", {"directory": directory})
	if not compiled.get("ok", false):
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, str(compiled.get("error", label + " compile failed")))
		return {"ok": false}
	var resource_path := directory.path_join("Scenario.rsrc")
	if not FileAccess.file_exists(resource_path) or FileAccess.get_file_as_bytes(resource_path).is_empty():
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, label + " compile did not emit Scenario.rsrc")
		return {"ok": false}
	var saved := bridge.request("project.save")
	if not saved.get("ok", false):
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, str(saved.get("error", label + " save failed")))
		return {"ok": false}
	var reopened := bridge.start_project(project_path)
	if not reopened.get("ok", false):
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, str(reopened.get("error", label + " project reopen failed")))
		return {"ok": false}
	await shell._activate_session(reopened)
	if int(shell._session_view.revision) != revision or not reopened.result.get("canUndo", false):
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, label + " revision and history did not survive reopen")
		return {"ok": false}
	return {"ok": true, "directory": directory, "resourcePath": resource_path,
		"manifestSha256": str(compiled.result.get("manifestSha256", ""))}


static func verify_repeat_compile(shell: Control, project_path: String, prefix: String, label: String, checkpoint: Dictionary) -> bool:
	var bridge: ProvidenceNativeBridge = shell.get("_bridge")
	var directory := project_path.path_join(prefix + "-output-2")
	var compiled := bridge.request("project.compile-classic-slice", {"directory": directory})
	if not compiled.get("ok", false):
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, str(compiled.get("error", "Second " + label + " compile failed")))
		return false
	if checkpoint.manifestSha256 != str(compiled.result.get("manifestSha256", "")):
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, label + " repeated compilation changed the manifest hash")
		return false
	if FileAccess.get_file_as_bytes(checkpoint.resourcePath) != FileAccess.get_file_as_bytes(directory.path_join("Scenario.rsrc")):
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, label + " repeated compilation changed Scenario.rsrc bytes")
		return false
	return true
