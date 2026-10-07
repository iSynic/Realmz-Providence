extends SceneTree

var shell
var output := ""
var captures: Array = []


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 2 or not FileAccess.file_exists(args[0].path_join("assets-corpus-disposable.marker")): return _fail("Expected disposable project and declared output root.")
	output = args[1]
	OS.set_environment("PROVIDENCE_PROJECT_PATH", "")
	root.gui_embed_subwindows = true
	root.size = Vector2i(1600, 900); root.content_scale_size = root.size
	shell = load("res://src/editor_shell.tscn").instantiate()
	shell._bridge = ProvidenceNativeBridge.new(args[0].path_join("encounter-capture-settings.cfg"))
	root.add_child(shell)
	await process_frame
	await shell._project_session.open_project(args[0]); await settle()
	if not shell._bridge.is_project_backed(): return _fail("Fixture failed to open.")
	await shell._navigation.select_route("encounters.rogue"); await settle()
	var rogue: ProvidenceRogueEncounterEditor = shell._workbenches.rogue_encounter
	await shell._workbenches.encounter_commands[0].open_record("rogue-encounter:1")
	await pair("rogue-main", "Unmodified City of Bywater Rogue 1; exact caller Complex 3")
	if OS.get_environment("PROVIDENCE_CAPTURE_MAIN_ONLY") != "1": await _rogue_states(rogue)
	await shell._navigation.select_route("encounters.timed"); await settle()
	var timed: ProvidenceTimedEncounterEditor = shell._workbenches.timed_encounter
	await shell._workbenches.encounter_commands[1].open_record("timed-encounter:1")
	await pair("timed-main", "Unmodified City of Bywater Timed 1")
	if OS.get_environment("PROVIDENCE_CAPTURE_MAIN_ONLY") != "1": await _timed_states(timed)
	var file := FileAccess.open(output.path_join("capture.json"), FileAccess.WRITE)
	file.store_string(JSON.stringify({"kind": "rogue-timed-native", "captures": captures, "retention": "Full frames temporary through review; one contact sheet retained"}, "\t")); file.close()
	shell._bridge.stop(); shell.free()
	print("PROVIDENCE_ROGUE_TIMED_CAPTURE_OK ", captures.size())
	quit()


func _rogue_states(view: ProvidenceRogueEncounterEditor) -> void:
	view.change_array("modifiers", 2, 11)
	view.updating = true; view.call("_present_form"); view.updating = false
	await pair("rogue-draft", "Local modifier edit; Apply and Revert; preview unavailable while draft exists")
	view.discard_draft()
	await _review_states(view, shell._workbenches.encounter_commands[0])
	view.call("_open_copy"); await settle()
	await pair("rogue-copy", "Read-only source; three scoped sections; Cancel changes nothing")
	view.get_node("CopyDialog").hide()
	view.call("_choose_reference", view.get_node("%ActionRows").get_child(1).get_node("Reference0")); await settle()
	await pair("rogue-picker", "Real Detect Trap success-string catalog; content snippets, explicit blank rows, selected full text and exact destination; searchable and paged")
	view.call("_new_string"); view.get_node("%StringText").text = "The hidden mechanism clicks softly."
	await pair("rogue-new-string", "Create and Use creates a scenario string separately from encounter Apply and Save")
	view.get_node("StringDialog").hide()
	view.get_node("%LowDamage").value = 12; view.get_node("%HighDamage").value = 4
	await shell._workbenches.encounter_commands[0].commit(view.draft.duplicate(true)); await settle()
	await pair("rogue-failure", "Real core rejection; draft retained; no canonical mutation")
	view.get_node("FailureDialog").hide(); view.discard_draft()
	await shell._workbenches.encounter_commands[0].open_record("rogue-encounter:0")
	await pair("rogue-multiple-callers", "Real Rogue 0 has multiple source callers; navigation and preview require an explicit selection")
	for summary: Dictionary in view.summaries:
		var callers: Dictionary = shell._bridge.request("encounter.rogue-callers", {"identity": summary.identity})
		if int(callers.result.total) == 0:
			await shell._workbenches.encounter_commands[0].open_record(str(summary.identity))
			await pair("rogue-no-caller", "Real source row with no calling Complex Encounter; no guessed caller")
			break
	view.clear_selection(); view.session_available = true; view.refresh_state()
	await pair("rogue-empty", "No selection in an open project; New available; record controls disabled")


func _timed_states(view: ProvidenceTimedEncounterEditor) -> void:
	await shell._workbenches.encounter_commands[1].open_record("timed-encounter:0")
	await pair("timed-position", "Native dormant Timed 0 with exact Land 0 and independent Any axes")
	await view.call("_pick_cell"); await settle()
	await pair("timed-cell", "Real map projection and artwork; cell selection changes only the local coordinates")
	view.get_node("CellDialog").hide()
	view.call("_open_copy"); await settle()
	await pair("timed-copy", "Real Timed source catalog; explicit schedule, prerequisites and position scopes")
	view.get_node("CopyDialog").hide()
	view.change("percent", 35); view.updating = true; view.call("_present_form"); view.updating = false
	await pair("timed-draft", "Local chance edit; native schedule and prerequisites retained")
	view.get_node("%Chance").value = 101
	await shell._workbenches.encounter_commands[1].commit(view.draft.duplicate(true)); await settle()
	await pair("timed-failure", "Real core rejection of chance over 100%; local draft retained")
	view.get_node("FailureDialog").hide(); view.discard_draft()
	await _timed_conflict(view)
	view.clear_selection(); view.session_available = true; view.refresh_state()
	await pair("timed-empty", "No selection; New available; no direct Timed preview")


func _timed_conflict(view: ProvidenceTimedEncounterEditor) -> void:
	var controller: ProvidenceEncounterAuthoringController = shell._workbenches.encounter_commands[1]
	view.change("percent", 35); view.updating = true; view._present_form(); view.updating = false
	var other := view.draft.duplicate(true); other.percent = 55
	var applied: Dictionary = shell._bridge.request("encounter.apply-timed-draft", {"expectedRevision": shell._session_view.revision, "draft": other})
	if not applied.get("ok", false): _fail(str(applied.get("error"))); return
	await controller.commit(view.draft.duplicate(true)); await settle()
	await pair("timed-conflict", "Real confirmed revision rejection; 35% draft retained; no replay or unknown-outcome claim")
	await controller.reconcile(); await settle()
	await pair("timed-current-comparison", "Real checkpoint has 55%; retained draft has 35%; explicit review before Apply")
	view.finish_comparison(false); await settle()
	var undone: Dictionary = shell._bridge.request("history.undo", {"expectedRevision": shell._session_view.revision})
	if not undone.get("ok", false): _fail(str(undone.get("error"))); return
	shell._session_view.apply(undone.result); await controller.open_record("timed-encounter:0")


func pair(state: String, description: String) -> void:
	for viewport in [Vector2i(1600, 900), Vector2i(1920, 1080)]:
		root.size = viewport; root.content_scale_size = viewport
		await settle()
		for modal in shell.find_children("*", "Window", true, false):
			if modal.visible: modal.popup_centered()
		for _frame in range(8): await process_frame
		await RenderingServer.frame_post_draw
		var image := root.get_texture().get_image()
		var filename := "%s-%dx%d.png" % [state, viewport.x, viewport.y]
		if image.save_png(output.path_join(filename)) != OK: _fail("Could not save " + filename); return
		captures.append({"state": state, "description": description, "viewport": [viewport.x, viewport.y], "frame": filename, "revision": shell._session_view.revision})
		print("ENCOUNTER_CAPTURE ", filename)


func settle() -> void:
	var deadline := Time.get_ticks_msec() + 90000
	var idle := 0
	while idle < 4:
		if Time.get_ticks_msec() > deadline: _fail("Capture timed out."); return
		await process_frame
		idle = 0 if shell._operations.busy else idle + 1


func _fail(message: String) -> void:
	push_error(message)
	if shell != null: shell._bridge.stop()
	quit(1)


func _review_states(view: ProvidenceRogueEncounterEditor, controller: ProvidenceEncounterAuthoringController) -> void:
	view.get_node("%ActionRows").get_child(1).get_node("Reference2/Behavior").button_pressed = true
	await pair("rogue-signed", "Local signed sound behavior: wait for completion; exact target retained")
	await view.discard_draft(); await settle()
	view.change_array("modifiers", 0, int(view.baseline.modifiers[0]) + 1)
	await shell._navigation.open_script_target("complex-encounter", 3, "complex-encounter:3", {"encounterResult": 1})
	await pair("rogue-navigation-guard", "Real dirty navigation guard: Apply, Discard or Keep Editing before exact caller Result 2")
	shell._draft_navigation._dialog.hide(); shell._draft_navigation.cancel()
	await view.discard_draft(); await settle()
	view.change_array("modifiers", 0, int(view.baseline.modifiers[0]) + 1)
	var intent := {"kind": "rogue", "identity": view.selected_identity(), "draft": view.draft.duplicate(true), "creating": false}
	var other := view.draft.duplicate(true); other.modifiers[0] += 1
	var applied: Dictionary = shell._bridge.request("encounter.apply-rogue-draft", {"expectedRevision": shell._session_view.revision, "draft": other})
	if not applied.get("ok", false): _fail(str(applied.get("error"))); return
	controller._uncertain_intent = intent
	shell._bridge._requires_reopen = true; shell._operations.requires_reopen = true
	view.show_failure({"ok": false, "outcomeUnknown": true, "error": "The acknowledgement was lost after a real canonical mutation."})
	await pair("rogue-unknown", "Controlled lost acknowledgement after real durable mutation; both transport locks set; retry blocked")
	await controller.reconcile(); await settle()
	await pair("rogue-current-comparison", "Real current checkpoint differs from retained draft; explicit comparison precedes intentional Apply")
	view.finish_comparison(false); await settle()
	var undone: Dictionary = shell._bridge.request("history.undo", {"expectedRevision": shell._session_view.revision})
	if not undone.get("ok", false): _fail(str(undone.get("error"))); return
	shell._session_view.apply(undone.result); await settle()
	await controller.open_record("rogue-encounter:1")
