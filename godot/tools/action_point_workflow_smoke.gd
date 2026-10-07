extends RefCounted

const Fixture = preload("res://tools/native_workflow_fixtures.gd")

static func _run_action_point_smoke(shell: Control, project_path: String, source_directory: String) -> void:
	var created = shell._bridge.create_project("action-point-smoke", project_path)
	if not bool(created.get("ok", false)):
		Fixture._smoke_fail(shell, str(created.get("error", "Action Point project creation failed")))
		return
	await shell._activate_session(created)
	if not (await shell._scenario_import.import_land(source_directory)) or shell._session_view.revision != 1:
		Fixture._smoke_fail(shell, "Action Point source import did not produce revision 1")
		return
	var row := _open_imported_record(shell)
	if row.is_empty(): return
	if not _edit_and_repair(shell, row): return
	if not _verify_history(shell) or not _verify_targets(shell): return
	var compiled := _compile_exact_bytes(shell, project_path, source_directory)
	if compiled.is_empty(): return
	if not await _reopen_and_reimport(shell, project_path, str(compiled.output)): return
	if not _verify_repeat_compile(shell, project_path, str(compiled.output), str(compiled.manifest)): return
	print("PROVIDENCE_ACTION_POINT_SMOKE_OK revision=6 actionPoints=100")
	shell.get_tree().quit(0)

static func _open_imported_record(shell: Control) -> Dictionary:
	var listed = shell._bridge.request("action-point.list", {
		"mapIdentity": "land:0",
		"offset": 0,
		"limit": 100,
	})
	if not bool(listed.get("ok", false)):
		Fixture._smoke_fail(shell, str(listed.get("error", "bounded Action Point list failed")))
		return {}
	var list_result := listed.result as Dictionary
	if int(list_result.get("total", 0)) != 100 or (list_result.get("items", []) as Array).size() != 100:
		Fixture._smoke_fail(shell, "bounded Action Point list did not preserve the fixed 100-row map denominator")
		return {}
	var opened = shell._bridge.request("action-point.open", {"identity": "action-point:land:0:17"})
	if not bool(opened.get("ok", false)):
		Fixture._smoke_fail(shell, str(opened.get("error", "Action Point document did not open")))
		return {}
	var document := opened.result as Dictionary
	shell._documents.view("scripts.action-points").set_document(document)
	var row := (document.get("actionPoint", {}) as Dictionary).duplicate(true)
	if int(row.get("recordIndex", -1)) != 17 or Fixture._action_target(shell, row, 0) != 999:
		Fixture._smoke_fail(shell, "controlled Action Point did not preserve its native identity and missing Message target")
		return {}
	var typed_reference_found := false
	for reference_value in document.get("references", []) as Array:
		var reference := reference_value as Dictionary
		if str(reference.get("field", "")) == "actions[0].target" and str(reference.get("resolution", "")) == "missing":
			typed_reference_found = true
	if not typed_reference_found:
		Fixture._smoke_fail(shell, "Action Point document did not expose the missing target as a typed reference")
		return {}
	return row


static func _edit_and_repair(shell: Control, row: Dictionary) -> bool:
	row["chancePercent"] = 75
	row["postActionX"] = 19
	var updated = shell._bridge.request("action-point.update", {
		"expectedRevision": shell._session_view.revision,
		"actionPoint": row,
	})
	if not bool(updated.get("ok", false)):
		Fixture._smoke_fail(shell, str(updated.get("error", "Action Point header edit failed")))
		return false
	shell._session_view.apply(updated.result as Dictionary)
	var repaired = shell._bridge.request("action-reference.retarget", {
		"expectedRevision": shell._session_view.revision,
		"source": "action-point:land:0:17",
		"slot": 0,
		"targetNativeId": 47,
	})
	if not bool(repaired.get("ok", false)):
		Fixture._smoke_fail(shell, str(repaired.get("error", "Action Point target repair failed")))
		return false
	shell._session_view.apply(repaired.result as Dictionary)
	if shell._session_view.revision != 3:
		Fixture._smoke_fail(shell, "Action Point edit and repair did not produce revision 3")
		return false
	return true


static func _verify_history(shell: Control) -> bool:
	var undo = shell._bridge.request("history.undo", {"expectedRevision": shell._session_view.revision})
	if not bool(undo.get("ok", false)):
		Fixture._smoke_fail(shell, str(undo.get("error", "Action Point undo failed")))
		return false
	shell._session_view.apply(undo.result as Dictionary)
	var undone = shell._bridge.request("action-point.open", {"identity": "action-point:land:0:17"})
	if not bool(undone.get("ok", false)) or Fixture._action_target(shell, (undone.result as Dictionary).get("actionPoint", {}) as Dictionary, 0) != 999:
		Fixture._smoke_fail(shell, "Action Point undo did not restore the missing Message target")
		return false
	var redo = shell._bridge.request("history.redo", {"expectedRevision": shell._session_view.revision})
	if not bool(redo.get("ok", false)):
		Fixture._smoke_fail(shell, str(redo.get("error", "Action Point redo failed")))
		return false
	shell._session_view.apply(redo.result as Dictionary)
	if shell._session_view.revision != 5:
		Fixture._smoke_fail(shell, "Action Point undo/redo did not advance to revision 5")
		return false
	return true


static func _verify_targets(shell: Control) -> bool:
	var diagnostics = shell._bridge.request("validation.run")
	if not bool(diagnostics.get("ok", false)):
		Fixture._smoke_fail(shell, str(diagnostics.get("error", "Action Point validation failed")))
		return false
	for diagnostic_value in diagnostics.result as Array:
		var diagnostic := diagnostic_value as Dictionary
		if str(diagnostic.get("entity", "")) == "action-point:land:0:17" and str(diagnostic.get("code", "")).ends_with(".missing"):
			Fixture._smoke_fail(shell, "Action Point repair left a dangling typed target")
			return false

	var rebuilt = shell._bridge.request("project.inspect-rebuilt-trigger-programs")
	if not bool(rebuilt.get("ok", false)):
		Fixture._smoke_fail(shell, str(rebuilt.get("error", "Rebuilt trigger projection failed")))
		return false
	var rebuilt_program_found := false
	for program_value in (rebuilt.result as Dictionary).get("programs", []) as Array:
		var program := program_value as Dictionary
		if str(program.get("ownerId", "")) == "Data DD:0:17" and str(program.get("id", "")) == "trigger:Data DD:0:17":
			var instructions := program.get("instructions", []) as Array
			if not instructions.is_empty() and int((instructions[0] as Dictionary).get("id", -1)) == 47:
				rebuilt_program_found = true
	if not rebuilt_program_found:
		Fixture._smoke_fail(shell, "Rebuilt trigger projection lost the repaired Action Point semantics")
		return false
	return true


static func _compile_exact_bytes(shell: Control, project_path: String, source_directory: String) -> Dictionary:
	var first_output := project_path.path_join("action-point-output-1")
	var first_compile = shell._bridge.request("project.compile-classic-slice", {"directory": first_output})
	if not bool(first_compile.get("ok", false)):
		Fixture._smoke_fail(shell, str(first_compile.get("error", "first Action Point compile failed")))
		return {}
	var source_dd := FileAccess.get_file_as_bytes(source_directory.path_join("Data DD"))
	var compiled_dd := FileAccess.get_file_as_bytes(first_output.path_join("Data DD"))
	var changed_bytes: Array[int] = []
	for index in range(min(source_dd.size(), compiled_dd.size())):
		if source_dd[index] != compiled_dd[index]:
			changed_bytes.append(index)
	if source_dd.size() != compiled_dd.size() or changed_bytes != [685, 687, 704, 705]:
		Fixture._smoke_fail(shell, "Action Point edits changed bytes outside declared Data DD ownership")
		return {}
	var source_ld := FileAccess.get_file_as_bytes(source_directory.path_join("Data LD"))
	var compiled_ld := FileAccess.get_file_as_bytes(first_output.path_join("Data LD"))
	var changed_map_bytes: Array[int] = []
	for index in range(min(source_ld.size(), compiled_ld.size())):
		if source_ld[index] != compiled_ld[index]:
			changed_map_bytes.append(index)
	if source_ld.size() != compiled_ld.size() or changed_map_bytes != [3286, 3287]:
		Fixture._smoke_fail(shell, "Action Point marker repair changed bytes outside its declared Data LD word")
		return {}
	for native_path in ["Data SD2", "Data ED"]:
		if FileAccess.get_file_as_bytes(source_directory.path_join(native_path)) != FileAccess.get_file_as_bytes(first_output.path_join(native_path)):
			Fixture._smoke_fail(shell, "Action Point compile changed unrelated %s bytes" % native_path)
			return {}
	return {"output": first_output, "manifest": str((first_compile.result as Dictionary).get("manifestSha256", ""))}


static func _reopen_and_reimport(shell: Control, project_path: String, first_output: String) -> bool:
	var saved = shell._bridge.request("project.save")
	if not bool(saved.get("ok", false)):
		Fixture._smoke_fail(shell, str(saved.get("error", "Action Point project save failed")))
		return false
	var reopened = shell._bridge.start_project(project_path)
	if not bool(reopened.get("ok", false)):
		Fixture._smoke_fail(shell, str(reopened.get("error", "Action Point project reopen failed")))
		return false
	shell._apply_session(reopened.result as Dictionary)
	await shell._strings.reload()
	if shell._session_view.revision != 5 or not bool((reopened.result as Dictionary).get("canUndo", false)):
		Fixture._smoke_fail(shell, "Action Point revision and undo history did not survive reopen")
		return false
	if not (await shell._scenario_import.import_land(first_output)) or shell._session_view.revision != 6:
		Fixture._smoke_fail(shell, "compiled Action Point files did not reimport as one revision")
		return false
	var reimported = shell._bridge.request("action-point.open", {"identity": "action-point:land:0:17"})
	if not bool(reimported.get("ok", false)):
		Fixture._smoke_fail(shell, str(reimported.get("error", "reimported Action Point did not open")))
		return false
	var reimported_row := (reimported.result as Dictionary).get("actionPoint", {}) as Dictionary
	if int(reimported_row.get("chancePercent", -1)) != 75 or int(reimported_row.get("postActionX", -1)) != 19 or Fixture._action_target(shell, reimported_row, 0) != 47:
		Fixture._smoke_fail(shell, "reimported Action Point lost canonical edited semantics")
		return false
	return true


static func _verify_repeat_compile(shell: Control, project_path: String, first_output: String, first_manifest: String) -> bool:
	var second_output := project_path.path_join("action-point-output-2")
	var second_compile = shell._bridge.request("project.compile-classic-slice", {"directory": second_output})
	if not bool(second_compile.get("ok", false)):
		Fixture._smoke_fail(shell, str(second_compile.get("error", "second Action Point compile failed")))
		return false
	if first_manifest != str((second_compile.result as Dictionary).get("manifestSha256", "")):
		Fixture._smoke_fail(shell, "reimported Action Point manifest hash was not deterministic")
		return false
	for native_path in ["Data DD", "Data ED", "Data LD", "Data SD2"]:
		if FileAccess.get_file_as_bytes(first_output.path_join(native_path)) != FileAccess.get_file_as_bytes(second_output.path_join(native_path)):
			Fixture._smoke_fail(shell, "reimported Action Point compile changed %s" % native_path)
			return false
	return true
