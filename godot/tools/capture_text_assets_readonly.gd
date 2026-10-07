extends SceneTree


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 2 or not DirAccess.dir_exists_absolute(args[1]):
		quit(2)
		return
	var snapshot := args[0].path_join("project.providence.json")
	var original_hash := FileAccess.get_sha256(snapshot)
	if original_hash.is_empty():
		quit(2)
		return
	root.gui_embed_subwindows = true
	OS.set_environment("PROVIDENCE_PROJECT_PATH", "")
	var shell = load("res://src/editor_shell.tscn").instantiate()
	root.add_child(shell)
	await shell._project_session.open_project(args[0])
	if not shell._bridge.is_project_backed():
		quit(1)
		return
	await shell._navigation.activate_domain("assets")
	var panel = shell._assets.library_workbench.get_node("%Gallery")
	for frame in 35: await process_frame
	var sheet := Image.create(3520, 5460, false, Image.FORMAT_RGBA8)
	sheet.fill(Color("202020"))
	for viewport_size in [Vector2i(1600, 900), Vector2i(1920, 1080)]:
		root.size = viewport_size
		root.content_scale_size = viewport_size
		for state in 3:
			var kind := "text-style-resource" if state == 1 else "text-resource"
			var selected := -1
			for index in panel._rows.size():
				if panel._rows[index].kind == kind:
					selected = index
					break
			if selected < 0:
				shell._bridge.stop()
				quit(1)
				return
			await panel._select(selected)
			if state == 2:
				panel.get_node("%EditResource").pressed.emit()
				if not panel.get_node("%TextDialog").visible:
					quit(1)
					return
			for frame in 6: await process_frame
			await RenderingServer.frame_post_draw
			var capture := root.get_texture().get_image()
			sheet.blit_rect(capture, Rect2i(Vector2i.ZERO, viewport_size), Vector2i(0 if viewport_size.x == 1600 else 1600, state * 1080))
			if state == 2: panel.get_node("%TextDialog").request_cancel()
	shell._bridge.stop()
	shell.queue_free()
	await process_frame
	root.size = Vector2i(1600, 900)
	root.content_scale_size = Vector2i(1600, 900)
	# Controlled states use no project bridge and never write authored data.
	var dialog = load("res://src/text_resource_dialog.tscn").instantiate()
	root.add_child(dialog)
	var bridge = load("res://tools/validate_text_resource_dialog.gd").TextBridge.new()
	for state in 6:
		dialog.hide()
		dialog.apply_theme("light" if state == 0 else "high-contrast", "balanced" if state == 0 else "compact")
		dialog.open_text(bridge, "text:-202")
		var draft: TextEdit = dialog.get_node("%Draft")
		draft.text = "The road leads north through the forest.\n".repeat(26) + "Follow the 🧭 toward the old tower.\n" + "The river winds through the valley.\n".repeat(35)
		dialog._draft_changed()
		if state < 2:
			bridge.failure = "character at character index %d is not representable in Classic MacRoman text" % draft.text.find("🧭")
			dialog.apply_text()
			dialog._select_error()
		elif state < 4:
			bridge.failure = ""
			bridge.revision += 1
			dialog.apply_text()
			dialog.review_current()
			if state == 3: dialog.accept_current()
		else:
			bridge.failure = "Not enough free disk space to store this text."
			dialog.apply_text()
			if state == 5: dialog.request_cancel()
		for frame in 6: await process_frame
		await RenderingServer.frame_post_draw
		var capture := root.get_texture().get_image()
		sheet.blit_rect(capture, Rect2i(dialog.position - Vector2i(8, 30), Vector2i(750, 700)), Vector2i((state % 4) * 880, 3240 + int(state / 4) * 740))
		dialog.get_node("%Discard").hide()
	dialog.hide()
	dialog.queue_free()
	await process_frame
	var workbench = load("res://src/unified_assets_editor.tscn").instantiate()
	root.add_child(workbench)
	workbench.size = Vector2(1600, 900)
	var media = load("res://tools/validate_text_assets.gd").MediaBridge.new()
	workbench._bridge = media
	await workbench.show_scope("scenario")
	panel = workbench.get_node("%Gallery")
	for state in 4:
		if state < 2:
			media.pairing = "missing" if state == 0 else "ambiguous"
			await panel._select(0)
		else:
			await panel._select(1)
			if state == 2:
				panel.get_node("%EditResource").pressed.emit()
				var editor = panel.get_node("%TextDialog")
				editor.get_node("%Draft").text = "The edited river crossing leads east.\n" + "The river runs east.\n".repeat(1000)
				editor._draft_changed()
				editor.apply_text()
			for frame in 6: await process_frame
			assert(panel.get_node("%TextPreview").text.begins_with("The edited river crossing"))
			workbench.show_save_state("Unsaved changes" if state == 2 else "Not saved. Keep this project open and retry Save, or use Save As.", true, state == 3)
		for frame in 6: await process_frame
		await RenderingServer.frame_post_draw
		var capture := root.get_texture().get_image()
		if state < 2:
			var inspector: Control = panel.get_node("InspectorInset")
			sheet.blit_rect(capture, Rect2i(inspector.global_position, Vector2i(inspector.size.x, mini(700, int(inspector.size.y)))), Vector2i(state * 880, 4720))
		else:
			var header: Control = workbench._header_parts[0]
			sheet.blit_rect(capture, Rect2i(header.global_position, Vector2i(880, 220)), Vector2i(state * 880, 4720))
			var inspector: Control = panel.get_node("InspectorInset")
			sheet.blit_rect(capture, Rect2i(inspector.global_position, Vector2i(inspector.size.x, mini(460, int(inspector.size.y)))), Vector2i(state * 880, 4960))
	workbench.queue_free()
	await process_frame
	var saved := sheet.save_png(args[1].path_join("contact-sheet.png")) == OK
	var unchanged := FileAccess.get_sha256(snapshot) == original_hash
	print("PROVIDENCE_TEXT_ASSETS_CAPTURE_OK unchanged=" + str(unchanged) if saved and unchanged else "PROVIDENCE_TEXT_ASSETS_CAPTURE_FAILED")
	quit(0 if saved and unchanged else 1)
