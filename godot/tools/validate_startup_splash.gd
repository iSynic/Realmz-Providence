extends SceneTree

var _events: Array[String] = []


func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	OS.set_environment("PROVIDENCE_PROJECT_PATH", "")
	var scene = load("res://src/startup_splash.tscn")
	var splash = scene.instantiate()
	splash.editor_scene_path = "res://tools/startup_splash_fixture.tscn"
	splash.splash_displayed.connect(func(): _events.append("displayed"))
	splash.scene_load_started.connect(func(): _events.append("loading"))
	splash.editor_presented.connect(func(): _events.append("editor"))
	root.add_child(splash)
	current_scene = splash
	assert(_events.is_empty(), "Loading must wait until the splash has drawn")
	var delayed = await _wait_for_child("DelayedEditor")
	assert(_events == ["displayed", "loading"])
	assert(splash.is_visible_in_tree() and not delayed.visible)
	for viewport in [Vector2i(1920, 1080), Vector2i(1600, 900)]:
		root.size = viewport
		await process_frame
		await process_frame
		await _check_artwork(splash, viewport)
	assert(not delayed.startup_presentable and current_scene == splash)
	delayed.allow_completion = true
	await _wait_for_transition(splash)
	assert(current_scene == delayed and delayed.visible)
	assert(_events == ["displayed", "loading", "editor"])
	delayed.queue_free()
	await process_frame
	var started := Time.get_ticks_msec()
	var real_splash = scene.instantiate()
	root.add_child(real_splash)
	current_scene = real_splash
	await _wait_for_transition(real_splash)
	var editor = current_scene
	assert(editor.startup_presentable and editor.visible)
	assert(editor._session_view.connected == OS.get_cmdline_user_args().has("--demo"))
	print("PROVIDENCE_STARTUP_SPLASH_OK display-before-load wait-for-initialization exact-artwork two-viewports demo=%s startup-ms=%s" % [OS.get_cmdline_user_args().has("--demo"), Time.get_ticks_msec() - started])
	editor.queue_free()
	await process_frame
	quit()


func _wait_for_child(node_name: String) -> Control:
	var deadline := Time.get_ticks_msec() + 30000
	while not root.has_node(NodePath(node_name)) and Time.get_ticks_msec() < deadline:
		await process_frame
	assert(root.has_node(NodePath(node_name)), "Startup did not instantiate the editor")
	return root.get_node(NodePath(node_name)) as Control


func _wait_for_transition(splash: Control) -> void:
	var deadline := Time.get_ticks_msec() + 45000
	while is_instance_valid(splash) and Time.get_ticks_msec() < deadline:
		await process_frame
	assert(not is_instance_valid(splash), "Splash remained after the editor initialized")


func _check_artwork(splash: Control, viewport: Vector2i) -> void:
	var artwork: TextureRect = splash.get_node("Artwork")
	assert(artwork.size == Vector2(viewport))
	assert(artwork.texture.get_size() == Vector2(1280, 720))
	assert(artwork.stretch_mode == TextureRect.STRETCH_KEEP_ASPECT_CENTERED)
	assert(artwork.texture_filter == CanvasItem.TEXTURE_FILTER_NEAREST)
	if DisplayServer.get_name() == "headless": return
	await RenderingServer.frame_post_draw
	var rendered := root.get_texture().get_image()
	var source := artwork.texture.get_image()
	assert(rendered.get_pixelv(viewport / 2).is_equal_approx(source.get_pixel(640, 360)), "Splash must display the supplied artwork")
	var args := OS.get_cmdline_user_args()
	var capture := args.find("--splash-capture")
	if capture >= 0:
		assert(rendered.save_png(args[capture + 1].path_join("splash-%sx%s.png" % [viewport.x, viewport.y])) == OK)
