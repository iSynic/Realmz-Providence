extends SceneTree

var _shell
var _output := ""
var _sheet: Image
var _captures: Array = []


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	assert(args.size() == 1)
	_output = args[0]
	assert(DirAccess.dir_exists_absolute(_output))
	root.gui_embed_subwindows = true
	root.size = Vector2i(1920,1080)
	root.content_scale_size = root.size
	_shell = load("res://src/editor_shell.tscn").instantiate()
	root.add_child(_shell)
	if not _shell.startup_presentable: await _shell.startup_completed
	_shell._bridge.stop()
	_shell._bridge = load("res://src/native_bridge.gd").new(_output.path_join("settings.cfg"))
	var started: Dictionary = _shell._bridge.start_demo()
	assert(started.get("ok",false))
	await _shell._activate_session(started, "maps.land")
	_sheet = Image.create(1960, 1680, false, Image.FORMAT_RGBA8)
	_sheet.fill(Color("0f1012"))
	for viewport_index in 2:
		var viewport := Vector2i(1920,1080) if viewport_index == 0 else Vector2i(1600,900)
		root.size = viewport
		root.content_scale_size = viewport
		for state_index in 3:
			await _capture(viewport_index,state_index,viewport)
	assert(_sheet.save_png(_output.path_join("native-contact-sheet.png")) == OK)
	var receipt := FileAccess.open(_output.path_join("native-capture.json"),FileAccess.WRITE)
	receipt.store_string(JSON.stringify({"route":"project-loading", "presentationFixture":true,
		"functionalEvidence":"validate_editor_operation.gd, validate_scenario_import_controller.gd and verify-import-jobs.py",
		"scenario":"The Ashen Crown presentation fixture", "countSource":"Trouble in the Sword Lands import-job receipt", "captures":_captures},"\t"))
	receipt.close()
	_shell._bridge.stop()
	_shell.free()
	print("PROVIDENCE_OPERATION_PROGRESS_CAPTURE_OK viewports=2 states=3")
	quit(0)


func _capture(column: int, row: int, viewport: Vector2i) -> void:
	var states := [["Opening project…", "Loading project records and restoring history",true],
		["Decoding media…", "271 / 271 media resources",true],
		["Saving imported scenario…", "Finishing Save · Cancellation is unavailable",false]]
	var state: Array = states[row]
	assert(_shell._operations.begin(_shell._bridge, "Open" if row == 0 else "Import"))
	_shell._operations.show_progress(state[0],state[1],func(): pass)
	if not state[2]: _shell._operations.show_progress(state[0],state[1])
	var window: Window = _shell._operations._progress
	for frame in 12: await process_frame
	assert(window.position.distance_to((viewport - window.size) / 2) <= 1, "First-show progress was not centered")
	await RenderingServer.frame_post_draw
	var image := root.get_texture().get_image()
	var context := image.duplicate() as Image
	context.resize(960,540,Image.INTERPOLATE_LANCZOS)
	_sheet.blit_rect(context,Rect2i(Vector2i.ZERO,context.get_size()),Vector2i(column*980,row*560))
	var region := Rect2i(window.position - Vector2i(8,28),window.size + Vector2i(16,36))
	_sheet.blit_rect(image,region,Vector2i(column*980+192,row*560+182))
	_captures.append({"viewport":[viewport.x,viewport.y],"phase":state[0],"count":state[1],
		"cancellable":state[2],"windowPosition":[window.position.x,window.position.y],
		"windowSize":[window.size.x,window.size.y],"countWidth":window.get_node("%Count").size.x})
	_shell._operations.finish({"ok":true},false,false)
