extends SceneTree

var _shell: Control
var _output := ""
var _captures: Array = []


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 2 or not args[0].contains("terrain-generation"):
		push_error("A caller-owned terrain-generation fixture and output directory are required"); quit(1); return
	_output = args[1]; DirAccess.make_dir_recursive_absolute(_output)
	OS.set_environment("PROVIDENCE_PROJECT_PATH", "")
	root.gui_embed_subwindows = true
	root.size = Vector2i(1920,1080); root.content_scale_size = root.size
	_shell = load("res://src/editor_shell.tscn").instantiate(); root.add_child(_shell)
	await _shell.startup_completed
	_shell._bridge.stop(); _shell._bridge = ProvidenceNativeBridge.new(args[0].path_join("capture-settings.cfg"))
	var opened: Dictionary = _shell._bridge.start_project(args[0].path_join("scenario"))
	assert(opened.get("ok",false), str(opened.get("error", "")))
	await _shell._activate_session(opened)
	await _shell._maps.document.load_map("land:0"); await _shell._navigation.select_tab(1)
	await _shell._undo()
	await _prepare()
	for viewport in [Vector2i(1920,1080), Vector2i(1600,900)]:
		root.size = viewport; root.content_scale_size = viewport
		await _frames(6)
		var canvas: ProvidenceMapCanvas = _shell._workbenches.land.get_node("%LandMapCanvas")
		canvas.zoom_working(); canvas.reveal_cell(25,25)
		await _save("ready", viewport)
	var generator = _shell._maps.terrain_generation
	generator.discard_draft(false)
	var created: Dictionary = await _shell._operations.run_workflow(_shell._bridge, "Prepare scripted endpoint", func(op):
		return await op.request("action-point.create", {"mapIdentity":"land:0", "x":10,"y":10,"expectedRevision":_shell._session_view.revision}))
	assert(created.ok); _shell._session_view.apply(created.result)
	await _shell._maps.document.load_map("land:0")
	await _prepare(false)
	await generator.check_routes()
	for viewport in [Vector2i(1920,1080), Vector2i(1600,900)]:
		root.size = viewport; root.content_scale_size = viewport
		await _frames(6)
		_shell._workbenches.land.get_node("%LandMapCanvas").reveal_cell(25,25)
		await _save("unknown-route", viewport)
	FileAccess.open(_output.path_join("captures.json"), FileAccess.WRITE).store_string(JSON.stringify({"captures":_captures,"build":_shell._bridge.request("build.identity").result},"\t"))
	_shell.free(); await _frames(2)
	print("PROVIDENCE_TERRAIN_GENERATION_CAPTURES_OK four-native-viewports")
	quit()


func _prepare(generate := true) -> void:
	var controller = _shell._maps.terrain_generation
	await controller.open()
	var view: Control = controller.view
	view.get_node("%GenerationTarget").select(0)
	view.get_node("%GenerationFamily").select(1)
	view.get_node("%GenerationDensity").select(2)
	view.get_node("%GenerationSeed").value = 47
	var mask: Array = []
	for y in range(12,36):
		for x in range(12,36): mask.append({"x":x,"y":y})
	view.accept_selection(mask); view.locks = [{"x":20,"y":20}]
	view.connections = [{"from":{"x":10,"y":10},"to":{"x":37,"y":37}}]
	view.invalidate()
	if generate:
		var generated: Dictionary = await controller.generate()
		assert(generated.ok and view.can_apply(), str(generated))


func _save(state: String, viewport: Vector2i) -> void:
	await _frames(6); await RenderingServer.frame_post_draw
	var file := "%s-%dx%d.png" % [state,viewport.x,viewport.y]
	var image := root.get_texture().get_image()
	assert(image.get_size() == viewport and image.save_png(_output.path_join(file)) == OK)
	var view: Control = _shell._maps.terrain_generation.view
	var overlay: Control = _shell._workbenches.land.get_node("%LandAreaOverlay")
	var texture: Texture2D = _shell._workbenches.land.get_node("%LandMapCanvas").terrain_texture(123)
	_captures.append({"file":file,"state":state,"viewport":[viewport.x,viewport.y],
		"selectedCells":view.mask.size(),"route":view.selected_route(),"canApply":view.can_apply(),
		"overlayTiles":overlay.painted.size(),"firstOverlayCell":overlay.painted[0] if not overlay.painted.is_empty() else {},
		"terrainTextureAvailable":texture != null,"generationOverlay":overlay._generation_preview,
		"footerVisible":view.get_global_rect().encloses(view.get_node("%ApplyGeneration").get_global_rect())})


func _frames(count: int) -> void:
	for _frame in count: await process_frame
