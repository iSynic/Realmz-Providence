extends SceneTree

var checks: Array[String] = []

func _initialize() -> void: call_deferred("_run")

func _run() -> void:
	var args := OS.get_cmdline_user_args()
	assert(args.size() in [3, 4])
	create_timer(180).timeout.connect(func(): push_error("Native publication did not finish"); quit(1))
	var bridge := ProvidenceNativeBridge.new(args[0].path_join("publication-settings.cfg"))
	assert(bridge.start_project(args[0]).get("ok", false))
	var described: Dictionary = bridge.request("session.describe")
	assert(described.get("ok", false), str(described))
	var context := {"connected":true, "projectId":"native-publication", "revision":described.result.revision}
	var operation := ProvidenceEditorOperation.new()
	root.add_child(operation)
	var view: ProvidencePublishWorkbench = load("res://src/publish_workbench.tscn").instantiate()
	root.add_child(view)
	var controller := ProvidencePublishWorkbenchController.new()
	controller.initialize(view, operation, func(): return context, func(): return bridge)
	controller.attach_session()
	view.target_selector.select(1); view.target_selector.item_selected.emit(1)
	await settle(operation)
	print("PUBLICATION_CHECKED ",view.readiness_status.text," · ",view.files.item_count," files")
	if view.checked_revision() != context.revision or view.files.item_count == 0:
		var inspection := await controller.recheck()
		push_error("Native publication preflight failed: " + JSON.stringify(inspection))
		controller.teardown(); bridge.stop(); view.free(); operation.free(); quit(1); return
	if args.size() == 4: await capture(view, args[3], "checked")
	var response := await controller.publish_to("rebuilt", args[1])
	assert(response.get("ok", false) and response.result.get("finalization") is Dictionary, str(response))
	assert(FileAccess.file_exists(args[1]))
	checks.append("Normal Publish controller uses paired stock-library context and creates a finalized package")
	await controller.recheck()
	var duplicate := await controller.publish_to("rebuilt", args[1])
	assert(not duplicate.get("ok", false) and not duplicate.get("outcomeUnknown", false))
	checks.append("Existing destination is preserved without a mutation retry")
	var prior := OS.get_environment("PROVIDENCE_REBUILT_PACKAGE_CONTEXT")
	OS.set_environment("PROVIDENCE_REBUILT_PACKAGE_CONTEXT", args[0].path_join("missing-context.json"))
	var rejected := await controller.recheck()
	assert(not rejected.get("ok", false) and rejected.error.contains("Rebuilt application support"))
	assert(not view._plan_ready)
	assert(not view.readiness_revision.text.contains("Waiting") and view.blocker_groups.autowrap_mode == TextServer.AUTOWRAP_WORD_SMART)
	if args.size() == 4: await capture(view, args[3], "missing-support")
	OS.set_environment("PROVIDENCE_REBUILT_PACKAGE_CONTEXT",prior)
	checks.append("Explicit missing support fails visibly and disables publication; canonical state is unchanged")
	var file := FileAccess.open(args[2],FileAccess.WRITE)
	file.store_string(JSON.stringify({"status":"passed","checks":checks,"publication":response.result},"\t")); file.close()
	controller.teardown(); bridge.stop(); view.free(); operation.free()
	print("PROVIDENCE_COMPLETION_PUBLICATION_OK finalized no-overwrite invalid-support=visible")
	quit()

func capture(view: Control, output: String, state: String) -> void:
	view.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for viewport in [Vector2i(1920,1080), Vector2i(1600,900)]:
		DisplayServer.window_set_size(viewport)
		root.content_scale_size = viewport; root.size = viewport
		for frame in 8: await process_frame
		await RenderingServer.frame_post_draw
		assert(view.blocker_groups.get_content_width() <= view.blocker_groups.size.x + 2, "Readiness warnings must wrap inside the panel")
		assert(root.get_texture().get_image().save_png(output.path_join("publication-%s-%dx%d.png" % [state,viewport.x,viewport.y])) == OK)

func settle(operation: ProvidenceEditorOperation) -> void:
	var idle := 0
	var deadline := Time.get_ticks_msec() + 120000
	while idle < 8:
		assert(Time.get_ticks_msec() < deadline)
		await process_frame
		idle = 0 if operation.busy else idle + 1
