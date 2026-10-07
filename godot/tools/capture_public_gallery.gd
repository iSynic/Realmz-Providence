extends SceneTree

const ROUTES = preload("res://src/route_catalog.gd")
var shell: Control
var destination := ""


func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	assert(args.size() == 3)
	assert(args[1].get_file().begins_with("public-gallery-"))
	destination = args[2]
	DirAccess.make_dir_recursive_absolute(destination)
	root.gui_embed_subwindows = true
	root.size = Vector2i(1920, 1080)
	root.content_scale_size = root.size
	shell = load("res://src/editor_shell.tscn").instantiate()
	shell._bridge = ProvidenceNativeBridge.new(args[1].path_join("settings.cfg"))
	root.add_child(shell)
	await process_frame
	var created: Dictionary = shell._bridge.create_project("trouble-in-the-sword-lands", args[1].path_join("project"))
	assert(created.get("ok", false), str(created))
	await shell._activate_session(created)
	var imported: Dictionary = shell._bridge.import_classic_scenario(args[0], 0, shell._bridge.bundled_classic_application_data_root())
	assert(imported.get("ok", false), str(imported))
	await shell._activate_session(shell._bridge.request("session.describe"))
	for route in ["maps.land", "maps.dungeon", "scripts.action-points", "encounters.complex",
		"combat.monsters", "combat.battles", "text.messages", "rules.spells", "economy.items", "scenario.startup"]:
		await shell._navigation.select_route(route)
		await settle()
		if route == "maps.land":
			await shell._navigation.open_first_map("land")
			shell._documents.view(route).get_node("%LandMapCanvas").zoom_working()
		if route == "maps.dungeon":
			await shell._navigation.open_first_map("dungeon")
		if route == "scripts.action-points": await shell._navigation.open_first_map("land")
		if route == "scripts.action-points": await shell._scripts.open_action_point_by_record_index(0)
		if route == "encounters.complex": await shell._scripts.open_complex_encounter_by_native_id(0)
		if route == "combat.monsters": await shell._documents.view(route).open_monster_target(0, 30)
		await capture(route.replace(".", "-"))
	await shell._assets.open_library("stock")
	await settle()
	await capture("assets")
	await shell._issues.request_show()
	await capture("validate")
	await shell._navigation.select_route("export.export-plan")
	await capture("publish")
	shell._bridge.stop()
	shell.free()
	print("PUBLIC_GALLERY_OK screenshots=13")
	quit()


func settle() -> void:
	var idle := 0
	var deadline := Time.get_ticks_msec() + 120000
	while idle < 4:
		assert(Time.get_ticks_msec() < deadline)
		await process_frame
		idle = 0 if shell._operations.busy or shell._issues.workbench.state.has_pending_refresh() else idle + 1


func capture(name: String) -> void:
	await settle()
	for frame in 8: await process_frame
	await RenderingServer.frame_post_draw
	assert(root.get_texture().get_image().save_png(destination.path_join(name + ".png")) == OK)
	print("PUBLIC_CAPTURE ", name)
