extends SceneTree


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	assert(args.size() in [3, 4])
	create_timer(120).timeout.connect(func(): push_error("StuffIt publication timed out"); quit(1))
	var bridge := ProvidenceNativeBridge.new(args[0].path_join("stuffit-settings.cfg"))
	assert(bridge.start_project(args[0]).get("ok", false))
	var described := bridge.request("session.describe")
	assert(described.get("ok", false))
	var context := {"connected": true, "projectId": "StuffIt check", "revision": described.result.revision}
	var operation := ProvidenceEditorOperation.new()
	root.add_child(operation)
	var view: ProvidencePublishWorkbench = load("res://src/publish_workbench.tscn").instantiate()
	root.add_child(view)
	var controller := ProvidencePublishWorkbenchController.new()
	controller.initialize(view, operation, func(): return context, func(): return bridge)
	controller.attach_session()
	view.target_selector.select(2)
	view.target_selector.item_selected.emit(2)
	await settle(operation)
	assert(view.checked_revision() == context.revision and view._plan_ready, view.diagnostics.text)
	assert(view.files.item_count > 0 and view.files.item_count <= view.PAGE_SIZE)
	assert(view.diagnostics.text.contains("StuffIt Expander"))
	if args.size() == 4: await capture(view, args[3])
	view.stuffit_archive_picker.canceled.emit()
	assert(not FileAccess.file_exists(args[1]) and view._plan_ready)
	view.stuffit_archive_picker.file_selected.emit(args[1])
	await settle(operation)
	assert(FileAccess.file_exists(args[1]) and view.diagnostics.text.contains("Published Legacy Realmz archive successfully"), view.diagnostics.text)
	var digest := FileAccess.get_sha256(args[1])
	await controller.recheck()
	var duplicate := await controller.publish_to("stuffit", args[1])
	assert(not duplicate.get("ok", false) and not duplicate.get("outcomeUnknown", false))
	assert(FileAccess.get_sha256(args[1]) == digest)
	assert(view.repair_issue.visible and view.repair_issue.text == "Choose Another Location…")
	var file := FileAccess.open(args[2], FileAccess.WRITE)
	assert(file != null)
	file.store_string(JSON.stringify({"status": "passed", "archiveSha256": digest,
		"checkedRevision": context.revision, "dialogCancel": "no output", "noOverwrite": true}, "\t"))
	file.close()
	controller.teardown()
	bridge.stop()
	view.free()
	operation.free()
	print("PROVIDENCE_STUFFIT_PUBLICATION_OK native-controller saved-project cancellation no-overwrite")
	quit()


func settle(operation: ProvidenceEditorOperation) -> void:
	var idle := 0
	var deadline := Time.get_ticks_msec() + 100000
	while idle < 8:
		assert(Time.get_ticks_msec() < deadline)
		await process_frame
		idle = 0 if operation.busy else idle + 1


func capture(view: Control, output: String) -> void:
	view.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for viewport in [Vector2i(1920, 1080), Vector2i(1600, 900)]:
		DisplayServer.window_set_size(viewport)
		root.content_scale_size = viewport
		root.size = viewport
		for frame in 8: await process_frame
		await RenderingServer.frame_post_draw
		assert(view.get_global_rect().encloses(view.export_button.get_global_rect()))
		assert(root.get_texture().get_image().save_png(output.path_join("stuffit-%dx%d.png" % [viewport.x, viewport.y])) == OK)
