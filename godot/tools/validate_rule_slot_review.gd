extends SceneTree

var bridge: ProvidenceNativeBridge
var operations: ProvidenceEditorOperation
var revision := 0
var failed := false
var measurements: Dictionary = {}

func _initialize() -> void: run.call_deferred()

func run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 3: quit(1); return
	root.size = Vector2i(int(args[2]), 900 if int(args[2]) == 1600 else 1080)
	root.content_scale_size = root.size; root.gui_embed_subwindows = true
	var project := args[0].path_join("project")
	bridge = ProvidenceNativeBridge.new(args[0].path_join("settings.cfg"))
	operations = ProvidenceEditorOperation.new(); root.add_child(operations)
	if not ok(bridge.create_project("rule-slot-native", project)): finish(args[1]); return
	if not ok(bridge.request("project.import-classic-scenario", {"directory": OS.get_environment("PROVIDENCE_PROFILE_CLASSIC_SOURCE"),
		"expectedRevision": 0, "applicationDataDirectory": OS.get_environment("PROVIDENCE_CLASSIC_APPLICATION_DATA_ROOT")})):
		finish(args[1]); return
	revision = int(bridge.request("session.describe").result.revision)
	var original: Dictionary = bridge.request("project.inspect-classic-no-edit").result
	for kind in ["race", "caste"]: await review_rule(kind)
	await idle()
	check(bridge.request("project.inspect-classic-no-edit").result == original, "Copy reviews retain every original source byte")
	await copy_spell(project)
	finish(args[1])

func review_rule(kind: String) -> void:
	var view = load("res://src/" + kind + "_editor.tscn").instantiate()
	root.add_child(view); view.size = Vector2(root.size)
	var controller = preload("res://src/rule_workbench_controller.gd").new()
	controller.initialize(view, operations, func(): return {"revision": revision}, func(): return bridge, func(result): return result.get("ok", false))
	controller.attach_session(bridge)
	if not ok(await controller.reload()): controller.dispose(); view.queue_free(); return
	await idle()
	ok(await controller.open_rule("classic." + kind + ".1"))
	await idle()
	var samples: Array[float] = []
	for sample in 3:
		var before := revision
		var start := Time.get_ticks_usec()
		view.get_node("%DuplicateRule").pressed.emit()
		if not await wait_visible(controller._records._review, kind):
			print("RULE_REVIEW_FAILURE ", kind, " ", view.get_node("%SubmissionNotice").text); break
		await RenderingServer.frame_post_draw
		var elapsed := (Time.get_ticks_usec() - start) / 1000.0
		samples.append(elapsed)
		check(elapsed < 500, "Copy " + kind + " dialog appears within the 500ms regression bound")
		await idle()
		check(int(bridge.request("session.describe").result.revision) == before, "Review is read-only")
		controller._records._review.cancel()
		await process_frame
	measurements[kind] = {"clickToRenderedDialogMs": samples}
	controller.dispose(); view.queue_free(); await process_frame

func copy_spell(project: String) -> void:
	var view = load("res://src/spell_editor.tscn").instantiate()
	root.add_child(view); view.size = Vector2(root.size)
	var controller = preload("res://src/spell_workbench_controller.gd").new()
	controller.initialize(view, operations, func(): return {"revision": revision}, func(): return bridge, func(result): return result.get("ok", false))
	controller.projection_applied.connect(func(change): revision = int(change.revision))
	controller.attach_session(bridge)
	if not ok(await controller.reload()): controller.dispose(); view.queue_free(); return
	await idle()
	ok(await controller.open_spell("classic.spell.1101"))
	await idle()
	view.get_node("%CopyToCustomSpell").pressed.emit()
	if await wait_visible(controller._records._review, "spell"):
		await idle()
		check(int(controller._records._review._review.allocation.availableSlots) == 105, "Trouble offers all 105 untouched Custom slots")
		controller._records._review.get_node("%UseDraft").pressed.emit()
		check(int(view.draft.definition.classicId) == 5101, "Stock copy stages the reviewed Custom identity")
		view.form.control_for("name").text = "Beta copy test"
		view.form.control_for("name").text_changed.emit("Beta copy test")
		check(ok(await view.commit_selected()), "Copied spell applies")
		await idle()
		var saved: Dictionary = bridge.request("spell.open-authoring", {"identity": "classic.spell.5101"}).result
		check(saved.definition.name == "Beta copy test", "Copy persists in canonical state")
		check(ok(bridge.request("history.undo", {"expectedRevision": revision})), "Copy undoes atomically")
		revision = int(bridge.request("session.describe").result.revision)
		check(int(bridge.request("spell.allocation.review", {"expectedRevision": revision}).result.allocation.availableSlots) == 105, "Undo restores vacancy")
		check(ok(bridge.request("history.redo", {"expectedRevision": revision})), "Copy redoes atomically")
		revision = int(bridge.request("session.describe").result.revision)
		check(ok(bridge.request("project.save", {"expectedRevision": revision})), "Copy saves")
		controller.dispose(); bridge.stop()
		check(ok(bridge.start_project(project)), "Saved project reopens")
		check(bridge.request("spell.open-authoring", {"identity": "classic.spell.5101"}).result.definition.name == "Beta copy test", "Copy survives reopen")
	else:
		print("SPELL_REVIEW_FAILURE ", view.get_node("%SubmissionNotice").text)
		controller.dispose()
	view.queue_free(); await process_frame

func wait_visible(window: Window, kind: String) -> bool:
	var deadline := Time.get_ticks_msec() + 5000
	while not window.visible and Time.get_ticks_msec() < deadline: await process_frame
	return check(window.visible, kind + " reviewed destination dialog opens")

func idle() -> void:
	var quiet_until := Time.get_ticks_msec() + 150
	while Time.get_ticks_msec() < quiet_until:
		await process_frame
		if operations.busy or bridge.operation_busy(): quiet_until = Time.get_ticks_msec() + 150

func ok(response: Dictionary) -> bool: return check(response.get("ok", false), str(response.get("error", "Native command failed")))
func check(condition: bool, message: String) -> bool:
	if not condition: failed = true; push_error(message)
	return condition

func finish(path: String) -> void:
	FileAccess.open(path, FileAccess.WRITE).store_string(JSON.stringify({"status": "failed" if failed else "passed",
		"viewport": [root.size.x, root.size.y], "measurements": measurements,
		"buildIdentity": bridge.request("build.identity").get("result", {}),
		"scope": "Actual Trouble import, native Copy buttons through rendered dialogs; spell Apply/history/Save/reopen. Not whole-editor certification."}, "\t"))
	bridge.stop(); operations.queue_free(); await process_frame
	print("PROVIDENCE_RULE_SLOT_REVIEW_", "FAILED" if failed else "OK")
	quit(1 if failed else 0)

