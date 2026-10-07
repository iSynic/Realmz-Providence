extends SceneTree

const ROUTES = preload("res://src/route_catalog.gd")
var _shell
var _output := ""
var _frames_root := ""
var _captures: Array = []
var _sheet: Image


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	assert(args.size() == 3)
	assert(FileAccess.file_exists(args[0].path_join("assets-corpus-disposable.marker")))
	assert(DirAccess.dir_exists_absolute(args[1]) and DirAccess.dir_exists_absolute(args[2]))
	_output = args[1]
	_frames_root = args[2]
	OS.set_environment("PROVIDENCE_PROJECT_PATH", "")
	root.gui_embed_subwindows = true
	_shell = load("res://src/editor_shell.tscn").instantiate()
	_shell._bridge = preload("res://tools/validate_assets_corpus.gd").CorpusBridge.new(args[0].path_join("test-settings.cfg"))
	root.add_child(_shell)
	await process_frame
	await _shell._project_session.open_project(args[0])
	assert(_shell._bridge.is_project_backed() and _shell._bridge.current_project_path() == args[0])
	_sheet = Image.create(1600, 4500, false, Image.FORMAT_RGB8)
	_sheet.fill(Color("202020"))
	await _land()
	await _assets()
	await _issues()
	await _media()
	await _shell._publishing.show_targets()
	await _pair("publish", "Initial readiness; no output created")
	_shell._publish_targets_dialog.hide()
	assert(_captures.size() == 18)
	assert(_sheet.save_png(_output.path_join("contact-sheet.png")) == OK)
	var manifest := FileAccess.open(_output.path_join("capture.json"), FileAccess.WRITE)
	assert(manifest != null)
	manifest.store_string(JSON.stringify({"kind": "maintenance-native-review", "captures": _captures,
		"scope": "Fresh full City of Bywater import; production-owned workbenches; dark/balanced only; no authored mutation",
		"retention": "One contact sheet and manifest retained; full frames temporary through critic review"}, "\t"))
	manifest.close()
	_shell._bridge.stop()
	_shell.free()
	print("PROVIDENCE_MAINTENANCE_CAPTURE_OK routes=9 viewports=2")
	quit()


func _land() -> void:
	await _shell._navigation.select_tab(ROUTES.tab_for_route("maps.land"))
	_shell._maps.set_tool_mode("paint")
	assert(_shell._maps.paint.workspace.tiles_dock.select_tile(90))
	await _pair("maps.land", "Land 0; actual atlas tile 90; no Paint feature expansion")


func _assets() -> void:
	for scope in ["scenario", "stock"]:
		await _shell._assets.open_library(scope)
		var panel = _shell._assets.library_workbench.get_node("%Gallery")
		await _settle()
		assert(not panel._rows.is_empty())
		await panel._select(0)
		await _pair("assets." + scope, "Actual first sorted page; differs from illustrative Pencil records")


func _issues() -> void:
	await _shell._issues.request_show()
	await _settle()
	await _pair("linter.issues", "Native findings for full import; no synthetic findings")


func _media() -> void:
	for route in ["assets.pictures", "assets.sounds", "assets.icons", "assets.special-land"]:
		await _shell._navigation.select_tab(ROUTES.tab_for_route(route))
		await _pair(route, "Existing route; scene migration does not approve prior presentation")


func _pair(route: String, state: String) -> void:
	for viewport in [Vector2i(1600, 900), Vector2i(1920, 1080)]:
		root.size = viewport
		root.content_scale_size = viewport
		await _settle()
		for frame in 8: await process_frame
		await RenderingServer.frame_post_draw
		var capture := root.get_texture().get_image()
		assert(capture.get_size() == viewport)
		var filename := "%s-%dx%d.png" % [route, viewport.x, viewport.y]
		assert(capture.save_png(_frames_root.path_join(filename)) == OK)
		var index := _captures.size()
		var location := Vector2i((index % 2) * 800, (index / 2) * 500)
		capture.convert(Image.FORMAT_RGB8)
		capture.resize(800, 450, Image.INTERPOLATE_LANCZOS)
		_sheet.blit_rect(capture, Rect2i(0, 0, 800, 450), location)
		_captures.append({"route": route, "state": state, "viewport": [viewport.x, viewport.y],
			"fullFrame": _frames_root.path_join(filename), "sheetRect": [location.x, location.y, 800, 450],
			"revision": _shell._session_view.revision, "status": _shell._status.text,
			"document": _shell._document_tabs.get_current_tab_control().name})
		print("MAINTENANCE_CAPTURE ", filename)


func _settle() -> void:
	var idle_frames := 0
	var deadline := Time.get_ticks_msec() + 120000
	while idle_frames < 2:
		assert(Time.get_ticks_msec() < deadline, "Native capture failed to settle")
		await process_frame
		idle_frames = 0 if _shell._operations.busy or _shell._issues.workbench.state.has_pending_refresh() else idle_frames + 1
