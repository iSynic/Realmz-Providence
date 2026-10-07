extends SceneTree


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 2 or not DirAccess.dir_exists_absolute(args[1]):
		quit(2)
		return
	OS.set_environment("PROVIDENCE_PROJECT_PATH", "")
	var shell = load("res://src/editor_shell.tscn").instantiate()
	root.add_child(shell)
	await shell._project_session.open_project(args[0])
	if not shell._bridge.is_project_backed():
		quit(1)
		return
	await shell._navigation.activate_domain("assets")
	var panel = shell._assets.library_workbench.get_node("%Gallery")
	for frame in 35:
		await process_frame
	var sheet := Image.create(3520, 2160, false, Image.FORMAT_RGBA8)
	sheet.fill(Color("202020"))
	for size in [Vector2i(1600, 900), Vector2i(1920, 1080)]:
		root.size = size
		root.content_scale_size = size
		for kind in ["picture", "text-resource"]:
			var selected := -1
			for index in panel._rows.size():
				if panel._rows[index].kind == kind:
					selected = index
					break
			if selected < 0:
				quit(1)
				return
			await panel._select(selected)
			for frame in 6:
				await process_frame
			await RenderingServer.frame_post_draw
			var capture := root.get_texture().get_image()
			sheet.blit_rect(capture, Rect2i(Vector2i.ZERO, size), Vector2i(0 if size.x == 1600 else 1600, 0 if kind == "picture" else 1080))
	var error := sheet.save_png(args[1].path_join("contact-sheet.png"))
	await panel.reload(null)
	await process_frame
	shell.queue_free()
	await process_frame
	print("PROVIDENCE_ASSETS_CAPTURE_OK" if error == OK else "PROVIDENCE_ASSETS_CAPTURE_FAILED")
	quit(0 if error == OK else 1)
