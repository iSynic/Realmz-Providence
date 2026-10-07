extends SceneTree

var shell
var project := ""
var checks: Array[String] = []
var interactions = preload("res://tools/rogue_timed_interaction_checks.gd").new()


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 1 or not FileAccess.file_exists(args[0].path_join("assets-corpus-disposable.marker")):
		return _fail("Expected a disposable full Classic import.")
	project = args[0]; interactions.host = self
	OS.set_environment("PROVIDENCE_PROJECT_PATH", "")
	root.gui_embed_subwindows = true
	root.size = Vector2i(1600, 900); root.content_scale_size = root.size
	shell = load("res://src/editor_shell.tscn").instantiate()
	shell._bridge = ProvidenceNativeBridge.new(project.path_join("encounter-check-settings.cfg"))
	root.add_child(shell)
	await process_frame
	await shell._project_session.open_project(project)
	await settle()
	if not shell._bridge.is_project_backed(): return _fail("The fixture session did not open.")
	if not await _rogue(): return
	if not await _timed(): return
	if not await interactions.roundtrip(): return
	shell._bridge.stop()
	shell.free()
	print("PROVIDENCE_ROGUE_TIMED_AUTHORING_OK ", JSON.stringify(checks))
	quit()


func _rogue() -> bool:
	await shell._navigation.select_route("encounters.rogue")
	await settle()
	var view: ProvidenceRogueEncounterEditor = shell._workbenches.rogue_encounter
	var controller: ProvidenceEncounterAuthoringController = shell._workbenches.encounter_commands[0]
	var opened := await controller.open_record("rogue-encounter:1")
	if not opened.get("ok", false): return _fail(str(opened.get("error")))
	var baseline := view.baseline.duplicate(true)
	view.change_array("modifiers", 2, int(baseline.modifiers[2]) + 1)
	view.change("lowDamage", 300); view.change("highDamage", 2)
	var revision: int = shell._session_view.revision
	await controller.commit(view.draft.duplicate(true)); await settle()
	if shell._session_view.revision != revision or not view.has_unapplied_changes(): return _fail("Invalid Apply lost its draft or mutated truth.")
	view.get_node("FailureDialog").hide()
	view.change("lowDamage", int(baseline.lowDamage)); view.change("highDamage", int(baseline.highDamage))
	await view.commit_selected(); await settle()
	if view.has_unapplied_changes() or shell._session_view.revision != revision + 1: return _fail("Atomic Rogue Apply did not acknowledge one revision.")
	var read: Dictionary = shell._bridge.request("encounter.open-rogue", {"identity": "rogue-encounter:1"})
	if int(read.result.encounter.modifiers[2]) != int(baseline.modifiers[2]) + 1: return _fail("Rogue Apply was not canonical.")
	checks.append("Rogue invalid draft retained; corrected Apply publishes one atomic revision")
	var undo: Dictionary = shell._bridge.request("history.undo", {"expectedRevision": shell._session_view.revision})
	if not undo.get("ok", false): return _fail(str(undo.get("error")))
	shell._session_view.apply(undo.result)
	var redo: Dictionary = shell._bridge.request("history.redo", {"expectedRevision": shell._session_view.revision})
	if not redo.get("ok", false): return _fail(str(redo.get("error")))
	shell._session_view.apply(redo.result)
	await settle()
	await controller.open_record("rogue-encounter:1")
	checks.append("Rogue undo and redo preserve the whole applied record")
	return await _rogue_details(view, controller)


func _rogue_details(view: ProvidenceRogueEncounterEditor, controller: ProvidenceEncounterAuthoringController) -> bool:
	if not await interactions.rogue(view, controller): return false
	if not await interactions.recovery(view, controller): return false
	var saved := view.baseline.duplicate(true)
	view.change_array("modifiers", 0, int(saved.modifiers[0]) + 1)
	var intent := {"kind": "rogue", "identity": saved.identity, "draft": view.draft.duplicate(true), "creating": false}
	var applied: Dictionary = shell._bridge.request("encounter.apply-rogue-draft", {"expectedRevision": shell._session_view.revision, "draft": intent.draft})
	if not applied.get("ok", false): return _fail(str(applied.get("error")))
	# Simulate loss of the acknowledgement only after a real durable mutation.
	controller._uncertain_intent = intent
	shell._bridge._requires_reopen = true; shell._operations.requires_reopen = true
	view.show_failure({"ok": false, "outcomeUnknown": true, "error": "The acknowledgement was lost."})
	await controller.reconcile(); await settle()
	if view.uncertain or view.has_unapplied_changes() or shell._session_view.revision != int(applied.result.change.revision): return _fail("Unknown outcome did not reconcile the current durable session.")
	checks.append("Lost acknowledgement reconciles current checkpoint without replaying the mutation")
	view.call("_open_copy"); await settle()
	var source: Dictionary = shell._bridge.request("encounter.open-rogue", {"identity": "rogue-encounter:0"})
	view.set_copy_source(source.result)
	var before := view.draft.duplicate(true)
	view.get_node("%Scope1").button_pressed = false; view.get_node("%Scope2").button_pressed = true; view.get_node("%Scope3").button_pressed = false
	view.call("_accept_copy")
	if view.draft.identity != before.identity or view.draft.modifiers != before.modifiers or view.draft.promptSounds[0] != before.promptSounds[0] or view.draft.typeFlags[9] != source.result.encounter.typeFlags[9]: return _fail("Scoped copy crossed ownership boundaries.")
	view.discard_draft()
	checks.append("Copy From is local, scoped and preserves identity, action tests and opening sound")
	view.call("_choose_reference", view.get_node("%TrapPrompt")); await settle()
	view.call("_new_string"); view.get_node("%StringText").text = "Authoring workflow string"
	var message_revision: int = shell._session_view.revision
	await controller.create_message("Authoring workflow string"); await settle()
	if not view.has_unapplied_changes() or shell._session_view.revision != message_revision + 1: return _fail("New String did not remain separate from encounter Apply.")
	view.discard_draft()
	checks.append("Create and Use commits only a scenario string and leaves its selection in the encounter draft")
	await controller.create(""); await settle()
	if int(view.baseline.nativeId) != 8: return _fail("New Rogue Encounter did not allocate the next stable ID.")
	await controller.create(str(view.baseline.identity)); await settle()
	if int(view.baseline.nativeId) != 9: return _fail("Copy Rogue Encounter did not allocate a distinct stable ID.")
	checks.append("New and Copy Rogue create stable records through real native commands")
	return true


func _timed() -> bool:
	await shell._navigation.select_route("encounters.timed"); await settle()
	var view: ProvidenceTimedEncounterEditor = shell._workbenches.timed_encounter
	var controller: ProvidenceEncounterAuthoringController = shell._workbenches.encounter_commands[1]
	await controller.open_record("timed-encounter:1")
	if not await interactions.timed(view, controller): return false
	var initial := view.baseline.duplicate(true)
	view.change("increment", int(initial.increment) + 1)
	await view.commit_selected(); await settle()
	if view.has_unapplied_changes(): return _fail("Timed Apply did not acknowledge its draft.")
	view.change("locationKind", "land"); view.change("requiredLevel", 0)
	view.change("requiredX", 0); view.change("requiredY", -1)
	await view.commit_selected(); await settle()
	if view.has_unapplied_changes(): return _fail("Independent zero-X/Any-Y gate was rejected.")
	view.change("locationKind", "any"); await view.commit_selected(); await settle()
	if int(view.baseline.requiredX) != 0 or int(view.baseline.requiredY) != -1: return _fail("Any location erased inactive coordinates.")
	checks.append("Timed Apply retains independent axes and inactive values when Any location bypasses them")
	await controller.create(""); await settle()
	if int(view.baseline.nativeId) != 3 or int(view.baseline.day) != -1: return _fail("New Timed Encounter did not create a safe dormant stable row.")
	view.change("day", 4)
	var revision: int = shell._session_view.revision
	await controller.commit(view.draft.duplicate(true)); await settle()
	if shell._session_view.revision != revision or not view.has_unapplied_changes(): return _fail("Activation silently passed a day-zero schedule terminator.")
	view.get_node("FailureDialog").hide(); view.discard_draft()
	checks.append("New Timed is dormant; activation behind a day-zero row is rejected without mutation")
	var saved: Dictionary = shell._bridge.request("project.save", {})
	if not saved.get("ok", false): return _fail(str(saved.get("error")))
	checks.append("Explicit portable Save succeeds independently of encounter Apply")
	var current: Dictionary = shell._bridge.request("session.describe", {})
	shell._bridge.stop()
	var reopened: Dictionary = shell._bridge.start_project(project)
	if not reopened.get("ok", false): return _fail(str(reopened.get("error")))
	var persisted: Dictionary = shell._bridge.request("encounter.open-timed", {"identity": "timed-encounter:3"})
	if not persisted.get("ok", false) or int(persisted.result.revision) != int(current.result.revision): return _fail("Reopen lost the applied checkpoint.")
	checks.append("Current checkpoint survives process restart without relying on last portable Save")
	return true


func settle() -> void:
	var deadline := Time.get_ticks_msec() + 90000
	var idle := 0
	while idle < 4:
		if Time.get_ticks_msec() > deadline: _fail("Native workflow timed out."); return
		await process_frame
		idle = 0 if shell._operations.busy else idle + 1


func _fail(message: String) -> bool:
	push_error(message)
	if shell != null: shell._bridge.stop()
	quit(1)
	return false
