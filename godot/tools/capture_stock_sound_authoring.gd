extends SceneTree

const AP_ID := "action-point:land:0:78"
const XAP_ID := "extra-action-point:436"
const SLOT := 6
const STOCK_SOUND_IDENTITY := "classic-application:family-jewels:snd:147"


func _initialize() -> void: call_deferred("_run")


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 1:
		_fail("A single isolated project path is required.")
		return
	var output_path := OS.get_environment("PROVIDENCE_CAPTURE_PATH")
	var surface := OS.get_environment("PROVIDENCE_CAPTURE_SURFACE")
	if output_path.is_empty() or surface not in ["stock-sound-ap", "stock-sound-xap"]:
		_fail("A capture path and stock-sound AP/XAP surface are required.")
		return
	root.content_scale_size = DisplayServer.window_get_size()
	var shell := load("res://src/editor_shell.tscn").instantiate() as Control
	root.add_child(shell)
	await process_frame
	await shell._project_session.open_project(args[0])
	var ordinary := surface == "stock-sound-ap"
	var route := "scripts.action-points" if ordinary else "scripts.macros"
	await shell._navigation.select_route(route)
	var opened := false
	if ordinary:
		opened = await shell._scripts.open_action_point(AP_ID)
	else:
		opened = await shell._scripts.open_extra_action_point(XAP_ID)
	if not opened:
		_fail("The requested Half Truth script could not be opened.", shell)
		return
	var view := shell._documents.view(route) as Control
	var workbench := view.get_node("%SemanticActionSteps") as ProvidenceActionStepWorkbench
	workbench.focus_slot(SLOT)
	await _settle(shell, workbench)
	if not workbench._field_controls.has("targetNativeId"):
		_fail("The stock sound field was not rendered.", shell)
		return
	var field := workbench._field_controls.targetNativeId.field as Dictionary
	var preview := field.get("preview", {}) as Dictionary
	if str(preview.get("identity", "")) != STOCK_SOUND_IDENTITY or str(preview.get("status", "")) != "application-resource":
		_fail("The source-qualified stock sound was not rendered.", shell)
		return
	var image := root.get_viewport().get_texture().get_image()
	if image == null or image.save_png(output_path) != OK:
		_fail("The native stock-sound capture could not be saved.", shell)
		return
	print("PROVIDENCE_STOCK_SOUND_CAPTURE_OK %s %s" % [surface, output_path])
	shell._bridge.stop()
	shell.queue_free()
	await process_frame
	quit(0)


func _settle(shell: Control, workbench: ProvidenceActionStepWorkbench) -> void:
	var deadline := Time.get_ticks_msec() + 60000
	var idle := 0
	while idle < 4:
		if Time.get_ticks_msec() >= deadline:
			return
		await process_frame
		var pending: bool = shell._scripts._form_description_drain_running or not shell._scripts._pending_form_descriptions.is_empty()
		idle = 0 if shell._operations.busy or pending or workbench._form_description.is_empty() else idle + 1


func _fail(message: String, shell: Control = null) -> void:
	push_error(message)
	if shell != null:
		shell._bridge.stop()
		shell.queue_free()
	quit(2)
