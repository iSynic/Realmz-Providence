extends "res://tools/validate_media_authoring_native.gd"

class DroppedReplyBridge extends "res://src/native_bridge.gd":
	var personal_root := ""
	var drop_method := ""
	var mutation_count := 0
	func configured_personal_library_root() -> String: return personal_root
	func configured_application_library_root(_explicit_root: String = "") -> String: return ""
	func configured_reference_catalog_root(_explicit_root: String = "") -> String: return ""
	func configured_monster_library_root(_explicit_root: String = "") -> String: return ""
	func _request(method: String, params: Dictionary) -> Dictionary:
		var dropping := method == drop_method
		if dropping: drop_method = ""
		var response: Dictionary = super._request(method, params)
		if method.ends_with(".commit") and response.get("ok", false): mutation_count += 1
		if dropping: return {"ok":false,"outcomeUnknown":true,"error":"Test transport lost acknowledgement after durable commit"}
		return response

var recovery_bridge: DroppedReplyBridge


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if not _check(args.size() == 1, "recovery fixture root"): return
	work_root = args[0]; DirAccess.make_dir_recursive_absolute(work_root); _create_sources()
	recovery_bridge = DroppedReplyBridge.new(work_root.path_join("settings.cfg"))
	recovery_bridge.personal_root = work_root.path_join("library")
	scenario_path = work_root.path_join("project")
	if not _check(recovery_bridge.create_project("media-recovery", scenario_path).get("ok", false), "create recovery scenario"): return
	root.gui_embed_subwindows = true
	workbench = load("res://src/unified_assets_editor.tscn").instantiate(); root.add_child(workbench)
	workbench.size = Vector2(1480, 800); await workbench.reload(recovery_bridge)
	panel = workbench.get_node("%Gallery"); dialog = workbench.get_node("%MediaDialog")
	await _dropped_reply(false, "scenario", 30000)
	if failed: return
	await _dropped_reply(true, "scenario", 491)
	if failed: return
	await _dropped_reply(false, "personal", 30000)
	if failed: return
	await _stale_origin()
	if failed: return
	await _history_reply()
	if failed: return
	workbench.queue_free(); await process_frame; recovery_bridge.stop()
	FileAccess.open(work_root.path_join("receipts.json"), FileAccess.WRITE).store_string(JSON.stringify(receipts, "\t"))
	print("PROVIDENCE_MEDIA_RECOVERY_NATIVE_OK dropped-acknowledgement rejected-before-commit library-domain close-browse-reconcile no-replay stale-source")
	quit()


func _dropped_reply(before: bool, scope: String, number: int) -> void:
	await workbench.show_scope(scope)
	await dialog.open_review("import", recovery_bridge, workbench._media_commands, {"scope":scope,"kind":"picture","origin":workbench.get_node("%Import")})
	var reviewed_path := sound_path if before else source_path
	if before: dialog.get_node("%Family").select(4); dialog._changed()
	dialog.get_node("%Path").text = reviewed_path; dialog.get_node("%DraftName").text = "Retained draft"
	dialog.get_node("%Number").value = number
	dialog.get_node("%OutputMode").select(1 if scope == "personal" else 0)
	dialog.get_node("%PrepareDelay").stop(); await dialog._prepare()
	if not _check(not dialog.get_node("%Accept").disabled, "recovery import reviewed"): return
	var count := recovery_bridge.mutation_count
	recovery_bridge.drop_method = "media.import.commit"
	if before: FileAccess.open(reviewed_path, FileAccess.WRITE).store_string("Unreadable source after review")
	await dialog._accept()
	if before: _create_sources()
	if not _check(workbench._media_commands.is_locked() and not dialog.get_node("%DraftName").editable, "unknown locks retained submitted draft"): return
	dialog._cancel()
	if not _check(not dialog.visible and workbench.get_node("%ReconcileMedia").visible, "Close keeps persistent Reconcile"): return
	await workbench.show_scope(scope)
	if not _check(workbench._operations.requires_reopen and workbench._media_commands.is_locked(), "read-only browsing does not unlock mutation"): return
	var rejected: Dictionary = await workbench._media_commands.perform("media.metadata.apply", {}, "project", {})
	if not _check(rejected.get("outcomeUnknown", false), "new mutation blocked until reconciliation"): return
	var reconciled: Dictionary = await workbench._media_commands.reconcile()
	if not _check(not workbench._media_commands.is_locked(), "exact receipt confirms original result (before=%s scope=%s): " % [before, scope] + str(reconciled)): return
	if not _check(recovery_bridge.mutation_count == count + (0 if before else 1), "reconciliation never replays mutation"): return
	if before:
		while workbench._operations.busy: await process_frame
		if not _check(dialog.visible and dialog.get_node("%Path").text == reviewed_path and dialog.get_node("%Number").value == number and dialog._kind() == "sound", "rejected result restores submitted family and retained review"): return
		dialog._cancel()


func _history_reply() -> void:
	await workbench.show_scope("personal")
	recovery_bridge.drop_method = "personal-library.undo"
	await workbench._library_history("undo")
	if not _check(workbench._media_commands.is_locked(), "lost history acknowledgement remains locked"): return
	var response: Dictionary = await workbench._media_commands.reconcile()
	if not _check(response.get("result", {}).get("outcome") == "committed" and not dialog.visible, "history recovery confirms receipt without form restoration"): return
	var state: Dictionary = await workbench._media_commands.prepare("personal-library.describe", {})
	recovery_bridge.drop_method = "personal-library.undo"
	await workbench._media_commands.perform("personal-library.undo", {"expectedRevision":int(state.result.revision)-1}, "personal", {})
	response = await workbench._media_commands.reconcile()
	_check(response.get("result", {}).get("outcome") == "not-committed" and not dialog.visible and not workbench._media_commands.is_locked(), "rejected history recovery retains buttons without replaying or inventing a form")


func _stale_origin() -> void:
	await workbench.show_scope("scenario")
	await panel.refresh_selection("picture:30000")
	await dialog.open_review("edit", recovery_bridge, workbench._media_commands, panel.selection_context())
	dialog.get_node("%DraftName").text = "Stale name"; dialog.get_node("%PrepareDelay").stop(); await dialog._prepare()
	recovery_bridge.stop(); recovery_bridge.start_project(scenario_path)
	await dialog._accept()
	if not _check(dialog.visible and dialog.get_node("%Impact").text.contains("session changed"), "stale destination rejects retained draft"): return
	dialog._cancel()
	_check(recovery_bridge.request("project-asset.open", {"identity":"picture:30000"}).result.asset.label != "Stale name", "stale submission leaves canonical label unchanged")
