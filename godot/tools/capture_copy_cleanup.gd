extends SceneTree

const ROUTES := ["maps.land", "player-maps.map-records", "scripts.action-points", "scripts.macros",
	"scripts.global-macros", "scripts.quests", "text.messages", "encounters.simple", "encounters.complex",
	"encounters.rogue", "encounters.timed", "scenario.startup", "scenario.restrictions", "scenario.contact",
	"scenario.registration", "rules.spells", "rules.races", "rules.castes", "combat.battles",
	"economy.treasure", "economy.items", "economy.shops", "assets.project-assets", "linter.issues"]
var shell
var output: String
var frames: String
var captures: Array = []
var sheet: Image


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	assert(args.size() == 3 and FileAccess.file_exists(args[0].path_join("assets-corpus-disposable.marker")))
	output = args[1]; frames = args[2]
	OS.set_environment("PROVIDENCE_PROJECT_PATH", "")
	root.gui_embed_subwindows = true
	shell = load("res://src/editor_shell.tscn").instantiate()
	shell._bridge = preload("res://tools/validate_assets_corpus.gd").CorpusBridge.new(args[0].path_join("copy-settings.cfg"))
	root.add_child(shell); await process_frame
	await shell._project_session.open_project(args[0]); await settle()
	sheet = Image.create(1600, int(ceil(float((ROUTES.size() + 2) * 2) / 4.0)) * 225, false, Image.FORMAT_RGB8)
	sheet.fill(Color("202020"))
	for route: String in ROUTES:
		if route == "assets.project-assets": await shell._assets.open_library("scenario")
		else: await shell._navigation.select_route(route)
		await settle()
		assert(route == "assets.project-assets" or shell._navigation.current_route() == route)
		await pair(route)
	await shell._publishing.show_targets(); await settle(); await pair("publish-dialog")
	shell._publish_targets_dialog.hide()
	shell._new_project_dialog.popup_new(); await pair("new-project-dialog")
	shell._new_project_dialog.hide()
	assert(sheet.save_png(output.path_join("contact-sheet.png")) == OK)
	var file := FileAccess.open(output.path_join("captures.json"), FileAccess.WRITE)
	file.store_string(JSON.stringify({"captures": captures, "scope": "Copy-only cleanup; real City of Bywater import; dark/balanced; no authored mutation"}, "\t"))
	file.close(); shell._bridge.stop(); shell.free()
	print("PROVIDENCE_COPY_CAPTURE_OK captures=", captures.size()); quit()


func pair(route: String) -> void:
	for viewport in [Vector2i(1920, 1080), Vector2i(1600, 900)]:
		root.size = viewport; root.content_scale_size = viewport
		for frame in 8: await process_frame
		await RenderingServer.frame_post_draw
		var image := root.get_texture().get_image()
		var name := "%s-%dx%d.png" % [route, viewport.x, viewport.y]
		assert(image.save_png(frames.path_join(name)) == OK)
		var location := Vector2i((captures.size() % 4) * 400, (captures.size() / 4) * 225)
		image.convert(Image.FORMAT_RGB8)
		image.resize(400, 225, Image.INTERPOLATE_LANCZOS)
		sheet.blit_rect(image, Rect2i(0, 0, 400, 225), location)
		captures.append({"route": route, "viewport": [viewport.x, viewport.y], "frame": name, "revision": shell._session_view.revision})
		print("COPY_CAPTURE ", name)


func settle() -> void:
	var idle := 0
	var deadline := Time.get_ticks_msec() + 120000
	while idle < 3:
		assert(Time.get_ticks_msec() < deadline)
		await process_frame
		idle = 0 if shell._operations.busy or shell._issues.workbench.state.has_pending_refresh() else idle + 1
