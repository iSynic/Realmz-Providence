extends RefCounted

const Fixture = preload("res://tools/native_workflow_fixtures.gd")

static func _run_global_macro_smoke(shell: Control, project_path: String, source_directory: String) -> void:
	var created = shell._bridge.create_project("global-macro-smoke", project_path)
	if not bool(created.get("ok", false)):
		Fixture._smoke_fail(shell, str(created.get("error", "Global Macro project creation failed")))
		return
	await shell._activate_session(created)
	if not (await shell._scenario_import.import_land(source_directory)) or shell._session_view.revision != 1:
		Fixture._smoke_fail(shell, "Global Macro source import did not produce revision 1")
		return
	var opened = shell._bridge.request("global-macro.open")
	if not bool(opened.get("ok", false)):
		Fixture._smoke_fail(shell, str(opened.get("error", "Global Macro document did not open")))
		return
	var document := opened.result as Dictionary
	shell._documents.view("scripts.global-macros").set_document(document)
	if (document.get("hooks", []) as Array).size() != 5:
		Fixture._smoke_fail(shell, "Global Macro document did not expose five source-backed hooks")
		return
	if _global_hook_target(shell, document, "start") != 1 or _global_hook_resolution(shell, document, "start") != "resolved":
		Fixture._smoke_fail(shell, "Global Macro start hook did not preserve resolved Extra AP 1")
		return
	if not Fixture._array_has_int(shell, document.get("preservedSlots", []) as Array, 3) or not Fixture._array_has_int(shell, document.get("preservedSlots", []) as Array, 29):
		Fixture._smoke_fail(shell, "Global Macro document did not identify preservation-only slots")
		return
	if not _assign_shop_hook(shell) or not _verify_hook_history(shell): return
	var compiled := _compile_global_bytes(shell, project_path, source_directory)
	if compiled.is_empty(): return
	if not await _reopen_hook(shell, project_path, str(compiled.output)): return
	if not _verify_recompiled_hook(shell, project_path, str(compiled.output), str(compiled.manifest)): return
	print("PROVIDENCE_GLOBAL_MACRO_SMOKE_OK revision=5 hooks=5")
	shell.get_tree().quit(0)


static func _assign_shop_hook(shell: Control) -> bool:
	var updated = shell._bridge.request("global-macro.update", {
		"expectedRevision": 1,
		"hook": "shop",
		"target": "extra-action-point:1",
	})
	if not bool(updated.get("ok", false)):
		Fixture._smoke_fail(shell, str(updated.get("error", "Global Macro shop assignment failed")))
		return false
	var projection := updated.result as Dictionary
	if int(projection.get("revision", -1)) != 2 or (projection.get("changedEntities", []) as Array).size() != 1:
		Fixture._smoke_fail(shell, "Global Macro update did not return a narrow revision 2 projection")
		return false
	var changes := projection.get("referenceChanges", []) as Array
	var shop_change: Dictionary = {}
	for value in changes:
		var change := value as Dictionary
		var byte_value: Variant = change.get("byteProvenance", null)
		if byte_value is Dictionary and int((byte_value as Dictionary).get("byteStart", -1)) == 8:
			shop_change = change
			break
	if shop_change.is_empty() or str(shop_change.get("resolution", "")) != "resolved":
		Fixture._smoke_fail(shell, "Global Macro update did not resolve its typed Extra AP reference")
		return false
	var provenance := shop_change.get("byteProvenance", {}) as Dictionary
	if str(provenance.get("nativePath", "")) != "Global" or int(provenance.get("byteStart", -1)) != 8:
		Fixture._smoke_fail(shell, "Global Macro update did not report Global bytes 8…9")
		return false
	return true


static func _verify_hook_history(shell: Control) -> bool:
	var undone = shell._bridge.request("history.undo", {"expectedRevision": 2})
	if not bool(undone.get("ok", false)) or int((undone.result as Dictionary).get("revision", -1)) != 3:
		Fixture._smoke_fail(shell, str(undone.get("error", "Global Macro undo failed")))
		return false
	var after_undo = shell._bridge.request("global-macro.open")
	if not bool(after_undo.get("ok", false)) or _global_hook_target(shell, after_undo.result as Dictionary, "shop") != 0:
		Fixture._smoke_fail(shell, "Global Macro undo did not clear the shop hook")
		return false
	var redone = shell._bridge.request("history.redo", {"expectedRevision": 3})
	if not bool(redone.get("ok", false)) or int((redone.result as Dictionary).get("revision", -1)) != 4:
		Fixture._smoke_fail(shell, str(redone.get("error", "Global Macro redo failed")))
		return false
	var diagnostics = shell._bridge.request("validation.run")
	if not bool(diagnostics.get("ok", false)):
		Fixture._smoke_fail(shell, str(diagnostics.get("error", "Global Macro validation failed")))
		return false
	for value in diagnostics.result as Array:
		var diagnostic := value as Dictionary
		if str(diagnostic.get("code", "")).begins_with("reference.scenario-program"):
			Fixture._smoke_fail(shell, "Global Macro repair left a dangling typed target")
			return false
	return true


static func _compile_global_bytes(shell: Control, project_path: String, source_directory: String) -> Dictionary:
	var first_output := project_path.path_join("first-output")
	var first_compile = shell._bridge.request("project.compile-classic-slice", {"directory": first_output})
	if not bool(first_compile.get("ok", false)):
		Fixture._smoke_fail(shell, str(first_compile.get("error", "Global Macro compile failed")))
		return {}
	var source_global := FileAccess.get_file_as_bytes(source_directory.path_join("Global"))
	var compiled_global := FileAccess.get_file_as_bytes(first_output.path_join("Global"))
	if source_global.size() != 60 or compiled_global.size() != 60:
		Fixture._smoke_fail(shell, "Global Macro compile changed the fixed 60-byte geometry")
		return {}
	for offset in range(60):
		var should_change := offset == 9
		if (source_global[offset] != compiled_global[offset]) != should_change:
			Fixture._smoke_fail(shell, "Global Macro compile changed an undeclared byte at %d" % offset)
			return {}
	if compiled_global[6] != 0 or compiled_global[7] != 58 or compiled_global[58] != 0 or compiled_global[59] != 1:
		Fixture._smoke_fail(shell, "Global Macro compile did not preserve unproven slot sentinels")
		return {}
	for native_path in ["Data DD", "Data ED", "Data ED3", "Data LD", "Data SD2"]:
		if FileAccess.get_file_as_bytes(source_directory.path_join(native_path)) != FileAccess.get_file_as_bytes(first_output.path_join(native_path)):
			Fixture._smoke_fail(shell, "Global Macro workflow changed unrelated %s bytes" % native_path)
			return {}
	return {"output": first_output, "manifest": str((first_compile.result as Dictionary).get("manifestSha256", ""))}


static func _reopen_hook(shell: Control, project_path: String, first_output: String) -> bool:
	var saved = shell._bridge.request("project.save")
	if not bool(saved.get("ok", false)):
		Fixture._smoke_fail(shell, str(saved.get("error", "Global Macro save failed")))
		return false
	var reopened = shell._bridge.start_project(project_path)
	if not bool(reopened.get("ok", false)):
		Fixture._smoke_fail(shell, str(reopened.get("error", "Global Macro reopen failed")))
		return false
	await shell._activate_session(reopened)
	if shell._session_view.revision != 4 or not bool((reopened.result as Dictionary).get("canUndo", false)):
		Fixture._smoke_fail(shell, "Global Macro revision and undo history did not survive reopen")
		return false
	if not (await shell._scenario_import.import_land(first_output)) or shell._session_view.revision != 5:
		Fixture._smoke_fail(shell, "Compiled Global Macro slice did not reimport as revision 5")
		return false
	var reimported = shell._bridge.request("global-macro.open")
	if not bool(reimported.get("ok", false)) or _global_hook_target(shell, reimported.result as Dictionary, "shop") != 1:
		Fixture._smoke_fail(shell, "Reimported Global Macro lost the edited shop hook")
		return false
	return true


static func _verify_recompiled_hook(shell: Control, project_path: String, first_output: String, first_manifest: String) -> bool:
	var second_output := project_path.path_join("second-output")
	var second_compile = shell._bridge.request("project.compile-classic-slice", {"directory": second_output})
	if not bool(second_compile.get("ok", false)):
		Fixture._smoke_fail(shell, str(second_compile.get("error", "Second Global Macro compile failed")))
		return false
	if first_manifest != str((second_compile.result as Dictionary).get("manifestSha256", "")):
		Fixture._smoke_fail(shell, "Global Macro reimport changed deterministic manifest hash")
		return false
	for native_path in ["Data DD", "Data ED", "Data ED3", "Data LD", "Data SD2", "Global"]:
		if FileAccess.get_file_as_bytes(first_output.path_join(native_path)) != FileAccess.get_file_as_bytes(second_output.path_join(native_path)):
			Fixture._smoke_fail(shell, "Global Macro reimport changed %s" % native_path)
			return false
	return true


static func _global_hook_target(shell: Control, document: Dictionary, hook: String) -> int:
	for value in document.get("hooks", []) as Array:
		var row := value as Dictionary
		if str(row.get("hook", "")) == hook:
			var target: Variant = row.get("targetNativeId", null)
			return 0 if target == null else int(target)
	return 0

static func _global_hook_resolution(shell: Control, document: Dictionary, hook: String) -> String:
	for value in document.get("hooks", []) as Array:
		var row := value as Dictionary
		if str(row.get("hook", "")) == hook:
			var reference_value: Variant = row.get("reference", null)
			if reference_value is Dictionary:
				return str((reference_value as Dictionary).get("resolution", ""))
			return ""
	return ""
