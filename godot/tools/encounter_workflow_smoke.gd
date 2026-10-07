extends RefCounted

const Fixture = preload("res://tools/native_workflow_fixtures.gd")

static func _run_simple_encounter_smoke(shell: Control, project_path: String, source_directory: String) -> void:
	var created = shell._bridge.create_project("simple-encounter-smoke", project_path)
	if not bool(created.get("ok", false)):
		Fixture._smoke_fail(shell, str(created.get("error", "Simple Encounter project creation failed")))
		return
	await shell._activate_session(created)
	if not (await shell._scenario_import.import_land(source_directory)) or shell._session_view.revision != 1:
		Fixture._smoke_fail(shell, "Simple Encounter source import did not produce revision 1")
		return
	var listed = shell._bridge.request("encounter.list-simple", {"offset": 0, "limit": 1})
	if not bool(listed.get("ok", false)) or int((listed.result as Dictionary).get("total", 0)) != 1:
		Fixture._smoke_fail(shell, str(listed.get("error", "bounded encounter list did not contain one record")))
		return
	var opened = shell._bridge.request("encounter.open-simple", {"identity": "simple-encounter:0"})
	if not bool(opened.get("ok", false)):
		Fixture._smoke_fail(shell, str(opened.get("error", "Simple Encounter document did not open")))
		return
	var document := opened.result as Dictionary
	shell._documents.view("encounters.simple").set_document(document)
	var encounter := (document.get("encounter", {}) as Dictionary).duplicate(true)
	if int(encounter.get("promptMessageNativeId", -1)) != 999 or Fixture._encounter_action_target(shell, encounter, 0) != 999:
		Fixture._smoke_fail(shell, "controlled Simple Encounter did not preserve both missing Message 999 targets")
		return
	if not _edit_encounter(shell, encounter) or not _verify_encounter_history(shell): return
	var compiled := _compile_encounter_bytes(shell, project_path, source_directory)
	if compiled.is_empty(): return
	if not await _reopen_encounter(shell, project_path, str(compiled.output)): return
	if not _verify_encounter_recompile(shell, project_path, str(compiled.output), str(compiled.manifest)): return
	print("PROVIDENCE_SIMPLE_ENCOUNTER_SMOKE_OK revision=7 encounters=1")
	shell.get_tree().quit(0)


static func _edit_encounter(shell: Control, encounter: Dictionary) -> bool:
	var texts := (encounter.get("texts", []) as Array).duplicate()
	texts[0] = "Pay the toll"
	encounter["texts"] = texts
	var results := (encounter.get("choiceResults", []) as Array).duplicate()
	results[0] = 2
	encounter["choiceResults"] = results
	var update = shell._bridge.request("encounter.update-simple", {
		"expectedRevision": shell._session_view.revision,
		"encounter": encounter,
	})
	if not bool(update.get("ok", false)):
		Fixture._smoke_fail(shell, str(update.get("error", "Simple Encounter form edit failed")))
		return false
	shell._session_view.apply(update.result as Dictionary)
	var prompt_repair = shell._bridge.request("encounter.prompt.retarget", {
		"expectedRevision": shell._session_view.revision,
		"source": "simple-encounter:0",
		"targetNativeId": 47,
	})
	if not bool(prompt_repair.get("ok", false)):
		Fixture._smoke_fail(shell, str(prompt_repair.get("error", "Simple Encounter prompt repair failed")))
		return false
	shell._session_view.apply(prompt_repair.result as Dictionary)
	var action_repair = shell._bridge.request("action-reference.retarget", {
		"expectedRevision": shell._session_view.revision,
		"source": "simple-encounter:0",
		"slot": 0,
		"targetNativeId": 47,
	})
	if not bool(action_repair.get("ok", false)):
		Fixture._smoke_fail(shell, str(action_repair.get("error", "Simple Encounter action repair failed")))
		return false
	shell._session_view.apply(action_repair.result as Dictionary)
	if shell._session_view.revision != 4:
		Fixture._smoke_fail(shell, "Simple Encounter edit and two repairs did not produce revision 4")
		return false
	var diagnostics = shell._bridge.request("validation.run")
	if not bool(diagnostics.get("ok", false)):
		Fixture._smoke_fail(shell, str(diagnostics.get("error", "Simple Encounter validation failed")))
		return false
	for value in diagnostics.result as Array:
		var diagnostic := value as Dictionary
		if str(diagnostic.get("entity", "")) == "simple-encounter:0" and str(diagnostic.get("code", "")).ends_with(".missing"):
			Fixture._smoke_fail(shell, "Simple Encounter repairs left a dangling target")
			return false
	return true


static func _verify_encounter_history(shell: Control) -> bool:
	var undo = shell._bridge.request("history.undo", {"expectedRevision": shell._session_view.revision})
	if not bool(undo.get("ok", false)):
		Fixture._smoke_fail(shell, str(undo.get("error", "Simple Encounter undo failed")))
		return false
	shell._session_view.apply(undo.result as Dictionary)
	var undone = shell._bridge.request("encounter.open-simple", {"identity": "simple-encounter:0"})
	if not bool(undone.get("ok", false)) or Fixture._encounter_action_target(shell, (undone.result as Dictionary).get("encounter", {}) as Dictionary, 0) != 999:
		Fixture._smoke_fail(shell, "Simple Encounter undo did not restore the missing action target")
		return false
	var redo = shell._bridge.request("history.redo", {"expectedRevision": shell._session_view.revision})
	if not bool(redo.get("ok", false)):
		Fixture._smoke_fail(shell, str(redo.get("error", "Simple Encounter redo failed")))
		return false
	shell._session_view.apply(redo.result as Dictionary)
	var redone = shell._bridge.request("encounter.open-simple", {"identity": "simple-encounter:0"})
	if not bool(redone.get("ok", false)) or Fixture._encounter_action_target(shell, (redone.result as Dictionary).get("encounter", {}) as Dictionary, 0) != 47:
		Fixture._smoke_fail(shell, "Simple Encounter redo did not restore the repaired action target")
		return false
	return true


static func _compile_encounter_bytes(shell: Control, project_path: String, source_directory: String) -> Dictionary:
	var first_output := project_path.path_join("encounter-output-1")
	var first_compile = shell._bridge.request("project.compile-classic-slice", {"directory": first_output})
	if not bool(first_compile.get("ok", false)):
		Fixture._smoke_fail(shell, str(first_compile.get("error", "Simple Encounter compile failed")))
		return {}
	var source_ed := FileAccess.get_file_as_bytes(source_directory.path_join("Data ED"))
	var compiled_ed := FileAccess.get_file_as_bytes(first_output.path_join("Data ED"))
	var changed_offsets: Array[int] = []
	for index in range(min(source_ed.size(), compiled_ed.size())):
		if source_ed[index] != compiled_ed[index]:
			changed_offsets.append(index)
	if source_ed.size() != compiled_ed.size():
		Fixture._smoke_fail(shell, "Simple Encounter compile changed Data ED geometry")
		return {}
	for index in changed_offsets:
		if index == 103 or index >= 426:
			Fixture._smoke_fail(shell, "Simple Encounter compile changed an unowned Data ED byte")
			return {}
	for required_offset in [32, 33, 96, 104, 105, 106]:
		if not changed_offsets.has(required_offset):
			Fixture._smoke_fail(shell, "Simple Encounter compile did not change expected owned byte %d" % required_offset)
			return {}
	for native_path in ["Data DD", "Data LD", "Data SD2"]:
		if FileAccess.get_file_as_bytes(source_directory.path_join(native_path)) != FileAccess.get_file_as_bytes(first_output.path_join(native_path)):
			Fixture._smoke_fail(shell, "Simple Encounter workflow changed unrelated %s bytes" % native_path)
			return {}
	return {"output": first_output, "manifest": str((first_compile.result as Dictionary).get("manifestSha256", ""))}


static func _reopen_encounter(shell: Control, project_path: String, first_output: String) -> bool:
	var saved = shell._bridge.request("project.save")
	if not bool(saved.get("ok", false)):
		Fixture._smoke_fail(shell, str(saved.get("error", "Simple Encounter save failed")))
		return false
	var reopened = shell._bridge.start_project(project_path)
	if not bool(reopened.get("ok", false)):
		Fixture._smoke_fail(shell, str(reopened.get("error", "Simple Encounter reopen failed")))
		return false
	shell._apply_session(reopened.result as Dictionary)
	await shell._strings.reload()
	if shell._session_view.revision != 6 or not bool((reopened.result as Dictionary).get("canUndo", false)):
		Fixture._smoke_fail(shell, "Simple Encounter history did not survive save and reopen")
		return false
	if not (await shell._scenario_import.import_land(first_output)) or shell._session_view.revision != 7:
		Fixture._smoke_fail(shell, "compiled Simple Encounter slice did not reimport as revision 7")
		return false
	var reimported = shell._bridge.request("encounter.open-simple", {"identity": "simple-encounter:0"})
	if not bool(reimported.get("ok", false)):
		Fixture._smoke_fail(shell, str(reimported.get("error", "reimported Simple Encounter did not open")))
		return false
	var reimported_encounter := (reimported.result as Dictionary).get("encounter", {}) as Dictionary
	if str((reimported_encounter.get("texts", []) as Array)[0]) != "Pay the toll" or int(reimported_encounter.get("promptMessageNativeId", -1)) != 47 or Fixture._encounter_action_target(shell, reimported_encounter, 0) != 47:
		Fixture._smoke_fail(shell, "reimported Simple Encounter lost canonical edited semantics")
		return false
	return true


static func _verify_encounter_recompile(shell: Control, project_path: String, first_output: String, first_manifest: String) -> bool:
	var second_output := project_path.path_join("encounter-output-2")
	var second_compile = shell._bridge.request("project.compile-classic-slice", {"directory": second_output})
	if not bool(second_compile.get("ok", false)):
		Fixture._smoke_fail(shell, str(second_compile.get("error", "second Simple Encounter compile failed")))
		return false
	if first_manifest != str((second_compile.result as Dictionary).get("manifestSha256", "")):
		Fixture._smoke_fail(shell, "Simple Encounter reimport changed deterministic manifest hash")
		return false
	for native_path in ["Data DD", "Data ED", "Data LD", "Data SD2"]:
		if FileAccess.get_file_as_bytes(first_output.path_join(native_path)) != FileAccess.get_file_as_bytes(second_output.path_join(native_path)):
			Fixture._smoke_fail(shell, "Simple Encounter reimport changed %s" % native_path)
			return false
	return true


static func _run_extra_action_point_smoke(shell: Control, project_path: String, source_directory: String) -> void:
	var created = shell._bridge.create_project("extra-action-point-smoke", project_path)
	if not bool(created.get("ok", false)):
		Fixture._smoke_fail(shell, str(created.get("error", "Extra Action Point project creation failed")))
		return
	await shell._activate_session(created)
	if not (await shell._scenario_import.import_land(source_directory)) or shell._session_view.revision != 1:
		Fixture._smoke_fail(shell, "Extra Action Point source import did not produce revision 1")
		return
	var listed = shell._bridge.request("extra-action-point.list", {"offset": 0, "limit": 2})
	if not bool(listed.get("ok", false)) or int((listed.result as Dictionary).get("total", 0)) != 2:
		Fixture._smoke_fail(shell, str(listed.get("error", "bounded Extra Action Point list did not contain two records")))
		return
	var opened = shell._bridge.request("extra-action-point.open", {"identity": "extra-action-point:0"})
	if not bool(opened.get("ok", false)):
		Fixture._smoke_fail(shell, str(opened.get("error", "Extra Action Point document did not open")))
		return
	var document := opened.result as Dictionary
	shell._documents.view("scripts.macros").set_document(document)
	var row := (document.get("extraActionPoint", {}) as Dictionary).duplicate(true)
	if Fixture._encounter_action_target(shell, row, 0) != 999 or Fixture._encounter_action_target(shell, row, 1) != 1 or Fixture._encounter_action_target(shell, row, 2) != 7:
		Fixture._smoke_fail(shell, "controlled Data ED3 row did not preserve message, Extra AP, and opcode 92 targets")
		return
	var attachments := document.get("extraCodeAttachments", []) as Array
	if attachments.size() != 1 or int(((attachments[0] as Dictionary).get("secondary", {}) as Dictionary).get("nativeId", -1)) != 8:
		Fixture._smoke_fail(shell, "opcode 92 did not attach the required consecutive Data EDCD row")
		return
	if not _edit_extra_ap(shell, row) or not _verify_extra_ap_history(shell): return
	var compiled := _compile_extra_ap_bytes(shell, project_path, source_directory)
	if compiled.is_empty(): return
	if not await _reopen_extra_ap(shell, project_path, str(compiled.output)): return
	if not _verify_extra_ap_recompile(shell, project_path, str(compiled.output), str(compiled.manifest)): return
	print("PROVIDENCE_EXTRA_ACTION_POINT_SMOKE_OK revision=7 extraActionPoints=2")
	shell.get_tree().quit(0)


static func _edit_extra_ap(shell: Control, row: Dictionary) -> bool:
	row["chancePercent"] = 85
	var updated = shell._bridge.request("extra-action-point.update", {
		"expectedRevision": shell._session_view.revision,
		"extraActionPoint": row,
	})
	if not bool(updated.get("ok", false)):
		Fixture._smoke_fail(shell, str(updated.get("error", "Extra Action Point form edit failed")))
		return false
	shell._session_view.apply(updated.result as Dictionary)
	var repaired = shell._bridge.request("action-reference.retarget", {
		"expectedRevision": shell._session_view.revision,
		"source": "extra-action-point:0",
		"slot": 0,
		"targetNativeId": 47,
	})
	if not bool(repaired.get("ok", false)):
		Fixture._smoke_fail(shell, str(repaired.get("error", "Extra Action Point message repair failed")))
		return false
	shell._session_view.apply(repaired.result as Dictionary)
	var extra_code_edit = shell._bridge.request("extra-code.upsert", {
		"expectedRevision": shell._session_view.revision,
		"row": {"nativeId": 7, "values": [-300, 2, 3, 4, 5]},
	})
	if not bool(extra_code_edit.get("ok", false)):
		Fixture._smoke_fail(shell, str(extra_code_edit.get("error", "opcode 92 EDCD edit failed")))
		return false
	shell._session_view.apply(extra_code_edit.result as Dictionary)
	if shell._session_view.revision != 4:
		Fixture._smoke_fail(shell, "Extra Action Point edit, repair, and EDCD edit did not produce revision 4")
		return false
	return true


static func _verify_extra_ap_history(shell: Control) -> bool:
	var undo = shell._bridge.request("history.undo", {"expectedRevision": shell._session_view.revision})
	if not bool(undo.get("ok", false)):
		Fixture._smoke_fail(shell, str(undo.get("error", "Extra Action Point undo failed")))
		return false
	shell._session_view.apply(undo.result as Dictionary)
	var redo = shell._bridge.request("history.redo", {"expectedRevision": shell._session_view.revision})
	if not bool(redo.get("ok", false)):
		Fixture._smoke_fail(shell, str(redo.get("error", "Extra Action Point redo failed")))
		return false
	shell._session_view.apply(redo.result as Dictionary)
	if shell._session_view.revision != 6:
		Fixture._smoke_fail(shell, "Extra Action Point undo and redo did not advance to revision 6")
		return false
	var diagnostics = shell._bridge.request("validation.run")
	if not bool(diagnostics.get("ok", false)):
		Fixture._smoke_fail(shell, str(diagnostics.get("error", "Extra Action Point validation failed")))
		return false
	for value in diagnostics.result as Array:
		var diagnostic := value as Dictionary
		if str(diagnostic.get("entity", "")) == "extra-action-point:0":
			Fixture._smoke_fail(shell, "Extra Action Point repair left diagnostic %s" % str(diagnostic.get("code", "unknown")))
			return false
	return true


static func _compile_extra_ap_bytes(shell: Control, project_path: String, source_directory: String) -> Dictionary:
	var first_output := project_path.path_join("extra-ap-output-1")
	var first_compile = shell._bridge.request("project.compile-classic-slice", {"directory": first_output})
	if not bool(first_compile.get("ok", false)):
		Fixture._smoke_fail(shell, str(first_compile.get("error", "Extra Action Point compile failed")))
		return {}
	var source_ed3 := FileAccess.get_file_as_bytes(source_directory.path_join("Data ED3"))
	var compiled_ed3 := FileAccess.get_file_as_bytes(first_output.path_join("Data ED3"))
	var changed_ed3: Array[int] = []
	for index in range(min(source_ed3.size(), compiled_ed3.size())):
		if source_ed3[index] != compiled_ed3[index]:
			changed_ed3.append(index)
	if source_ed3.size() != compiled_ed3.size() or changed_ed3 != [7, 24, 25]:
		Fixture._smoke_fail(shell, "Extra Action Point workflow changed bytes outside the declared Data ED3 fields")
		return {}
	var source_edcd := FileAccess.get_file_as_bytes(source_directory.path_join("Data EDCD"))
	var compiled_edcd := FileAccess.get_file_as_bytes(first_output.path_join("Data EDCD"))
	var changed_edcd: Array[int] = []
	for index in range(min(source_edcd.size(), compiled_edcd.size())):
		if source_edcd[index] != compiled_edcd[index]:
			changed_edcd.append(index)
	if source_edcd.size() != compiled_edcd.size() or changed_edcd != [70, 71]:
		Fixture._smoke_fail(shell, "opcode 92 edit changed bytes outside Data EDCD row 7 value 0")
		return {}
	for native_path in ["Data DD", "Data ED", "Data LD", "Data SD2"]:
		if FileAccess.get_file_as_bytes(source_directory.path_join(native_path)) != FileAccess.get_file_as_bytes(first_output.path_join(native_path)):
			Fixture._smoke_fail(shell, "Extra Action Point workflow changed unrelated %s bytes" % native_path)
			return {}
	return {"output": first_output, "manifest": str((first_compile.result as Dictionary).get("manifestSha256", ""))}


static func _reopen_extra_ap(shell: Control, project_path: String, first_output: String) -> bool:
	var saved = shell._bridge.request("project.save")
	if not bool(saved.get("ok", false)):
		Fixture._smoke_fail(shell, str(saved.get("error", "Extra Action Point save failed")))
		return false
	var reopened = shell._bridge.start_project(project_path)
	if not bool(reopened.get("ok", false)):
		Fixture._smoke_fail(shell, str(reopened.get("error", "Extra Action Point reopen failed")))
		return false
	shell._apply_session(reopened.result as Dictionary)
	await shell._strings.reload()
	if shell._session_view.revision != 6 or not bool((reopened.result as Dictionary).get("canUndo", false)):
		Fixture._smoke_fail(shell, "Extra Action Point history did not survive save and reopen")
		return false
	if not (await shell._scenario_import.import_land(first_output)) or shell._session_view.revision != 7:
		Fixture._smoke_fail(shell, "compiled Extra Action Point slice did not reimport as revision 7")
		return false
	var reimported = shell._bridge.request("extra-action-point.open", {"identity": "extra-action-point:0"})
	if not bool(reimported.get("ok", false)):
		Fixture._smoke_fail(shell, str(reimported.get("error", "reimported Extra Action Point did not open")))
		return false
	var reimported_document := reimported.result as Dictionary
	var reimported_row := reimported_document.get("extraActionPoint", {}) as Dictionary
	var reimported_attachments := reimported_document.get("extraCodeAttachments", []) as Array
	if int(reimported_row.get("chancePercent", -1)) != 85 or Fixture._encounter_action_target(shell, reimported_row, 0) != 47:
		Fixture._smoke_fail(shell, "reimported Extra Action Point lost edited canonical semantics")
		return false
	var primary := ((reimported_attachments[0] as Dictionary).get("primary", {}) as Dictionary).get("values", []) as Array
	if primary.is_empty() or int(primary[0]) != -300:
		Fixture._smoke_fail(shell, "reimported opcode 92 attachment lost the edited Data EDCD value")
		return false
	return true


static func _verify_extra_ap_recompile(shell: Control, project_path: String, first_output: String, first_manifest: String) -> bool:
	var second_output := project_path.path_join("extra-ap-output-2")
	var second_compile = shell._bridge.request("project.compile-classic-slice", {"directory": second_output})
	if not bool(second_compile.get("ok", false)):
		Fixture._smoke_fail(shell, str(second_compile.get("error", "second Extra Action Point compile failed")))
		return false
	if first_manifest != str((second_compile.result as Dictionary).get("manifestSha256", "")):
		Fixture._smoke_fail(shell, "Extra Action Point reimport changed deterministic manifest hash")
		return false
	for native_path in ["Data DD", "Data ED", "Data ED3", "Data EDCD", "Data LD", "Data SD2"]:
		if FileAccess.get_file_as_bytes(first_output.path_join(native_path)) != FileAccess.get_file_as_bytes(second_output.path_join(native_path)):
			Fixture._smoke_fail(shell, "Extra Action Point reimport changed %s" % native_path)
			return false
	return true
