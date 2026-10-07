extends SceneTree

const ROUTES = preload("res://src/route_catalog.gd")
var _shell
var _output := ""


func _initialize() -> void: call_deferred("_run")


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	assert(args.size() == 2 and DirAccess.dir_exists_absolute(args[0]) and DirAccess.dir_exists_absolute(args[1]))
	_output = args[1]
	OS.set_environment("PROVIDENCE_PROJECT_PATH", "")
	root.gui_embed_subwindows = true
	_shell = load("res://src/editor_shell.tscn").instantiate()
	root.add_child(_shell)
	await process_frame
	await _shell._project_session.open_project(args[0])
	assert(_shell._bridge.is_project_backed())
	await _shell._navigation.select_tab(ROUTES.tab_for_route("scripts.quests"))
	assert((await _shell._workbenches.open_quest(31)).ok)
	await _pair("quest-31")
	await _shell._navigation.select_tab(ROUTES.tab_for_route("text.messages"))
	assert((await _shell._strings.open_option_label(20)).ok)
	await _pair("option-label-20")
	_shell._bridge.stop()
	_shell.free()
	print("PROVIDENCE_QUEST_OPTION_CAPTURE_OK frames=4 source=city-of-bywater")
	quit()


func _pair(name: String) -> void:
	for viewport in [Vector2i(1600, 900), Vector2i(1920, 1080)]:
		root.size = viewport
		root.content_scale_size = viewport
		await _settle()
		for frame in 8: await process_frame
		await RenderingServer.frame_post_draw
		var capture := root.get_texture().get_image()
		assert(capture.get_size() == viewport)
		assert(capture.save_png(_output.path_join("%s-%dx%d.png" % [name, viewport.x, viewport.y])) == OK)


func _settle() -> void:
	var idle := 0
	var deadline := Time.get_ticks_msec() + 120000
	while idle < 2:
		assert(Time.get_ticks_msec() < deadline)
		await process_frame
		idle = 0 if _shell._operations.busy else idle + 1
