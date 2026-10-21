extends SceneTree

class CaptureBridge extends "res://tools/validate_action_settings_recovery.gd".FaultBridge:
	var delay_commit := false
	func _request(method: String, params: Dictionary) -> Dictionary:
		if method == "action-settings.commit-repair" and delay_commit: OS.delay_msec(3000)
		return super._request(method, params)

const Fixture = preload("res://tools/action_settings_message_fixture.gd")
var _fixture := Fixture.new()
var _bridge
var _dialog
var _output := ""
var _sheet: Image
var _frames: Array = []


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	assert(args.size() == 2 and args[0].get_file().begins_with("providence-ui-repair-"))
	_output = args[1]
	root.gui_embed_subwindows = true
	root.size = Vector2i(1600, 900)
	var background := ColorRect.new()
	background.color = Color("0b141b")
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.add_child(background)
	_bridge = CaptureBridge.new(args[0].path_join("settings.cfg"))
	assert(_fixture.create_messages(_bridge, args[0].path_join("project"), 3, 8), _fixture.error)
	_dialog = preload("res://src/action_settings_repair_dialog.gd").new()
	_dialog.hide()
	root.add_child(_dialog)
	_sheet = Image.create(1600, 1125, false, Image.FORMAT_RGB8)
	_sheet.fill(Color("202020"))
	await _opening_states()
	await _scope_states()
	await _recovery_states()
	await _unusual_states()
	await _subwindows()
	assert(_frames.size() == 17, "The capture denominator is incomplete")
	assert(_sheet.save_png(_output.path_join("contact-sheet.png")) == OK)
	var manifest := FileAccess.open(_output.path_join("capture.json"), FileAccess.WRITE)
	manifest.store_string(JSON.stringify({"kind":"random-message-native-review","revision":1,"frames":_frames,"ownerAccepted":false,"fixture":"Prepared synthetic native adapter project. Transport faults are explicit. The ambiguous frame alone uses a controlled visual projection backed by core identity-ambiguity fixtures; it is not a native import or runtime claim."}, "  "))
	manifest.close()
	_dialog.free()
	_bridge.stop()
	await process_frame
	print("PROVIDENCE_MESSAGE_CAPTURE_OK frames=%d themes=3 densities=2 viewports=2" % _frames.size())
	quit()


func _opening_states() -> void:
	_retarget(158, 19, 20)
	await _open()
	await _range("2", "4")
	await _capture("ready-1600", "jAz42")
	await _capture("ready-1920", "FT8x0", Vector2i(1920, 1080))
	await _open()
	await _capture("missing", "TyBrv", Vector2i(1600, 900), "light")
	await _range("2", "9")
	await _dialog.message_workflow.page(4)
	await _capture("unresolved", "M0FxG5", Vector2i(1600, 900), "high-contrast", "compact")
	await _range("1.5", "4")
	await _capture("invalid", "ER5ho", Vector2i(1600, 900), "high-contrast", "compact")


func _scope_states() -> void:
	_retarget(158, 19, 10)
	await _open()
	await _range("2", "4")
	await _capture("shared", "vEMXI")
	_retarget(160, 20, 10)
	await _open()
	await _range("2", "4")
	await _capture("incompatible", "JQvvB")
	_retarget(160, 19, 10)
	await _open()
	await _range("2", "4")
	await _dialog.change_field("scope", "confirmed-actions")
	await _capture("shared-selected", "RGCzu")


func _recovery_states() -> void:
	_retarget(158, 19, 20)
	await _open()
	await _range("2", "4")
	assert(_fixture.mutate("message.create", {"nativeId":11,"text":"Revision bump"}))
	await _dialog.apply_repair()
	await _capture("stale", "i3qwFF")
	await _open()
	await _range("2", "4")
	_bridge.fault = "lost-before"
	_dialog.apply_repair()
	await _settle()
	await _capture("unknown", "sS33G", Vector2i(1920, 1080), "high-contrast", "compact")
	await _open()
	await _range("2", "4")
	_bridge.delay_commit = true
	_dialog.apply_repair()
	assert(_dialog._busy)
	await _capture("busy", "Of2Jy")
	await _settle()
	_bridge.delay_commit = false


func _unusual_states() -> void:
	await _open()
	await _range("-1", "1")
	await _capture("signed", "W2cCIC", Vector2i(1920, 1080), "light", "compact")
	await _range("4", "2")
	await _capture("reversed", "S6tg7l", Vector2i(1600, 900), "dark", "compact")
	for id in [32767, 32768]: assert(_fixture.mutate("message.create", {"nativeId":id,"text":"Wrapped result %d" % id}))
	await _open()
	await _range("32767", "-32768")
	await _capture("wrapped", "cvKsy", Vector2i(1600, 900), "light", "compact")
	await _range("2", "9")
	await _dialog.message_workflow.page(4)
	var view: Dictionary = _dialog.view.duplicate(true)
	view.range.firstUnresolved = {"value":7,"nativeId":7,"identity":null,"textPreview":"","status":"ambiguous","waitsForClick":true}
	view.range.unresolvedMessages = 1
	view.errors = [{"field":"messageRange","message":"Cannot resolve 1 message targets in this range. Check Message 7 first."}]
	view.range.errors = view.errors.duplicate(true)
	view.canApply = false
	for entry: Dictionary in view.range.entries:
		if int(entry.value) == 7: entry.status = "ambiguous"; entry.identity = null
		if int(entry.value) == 9: entry.status = "ready"; entry.identity = "message:9"; entry.textPreview = "Authored message 9"
	_dialog.view = view
	_dialog._render()
	await _capture("ambiguous", "Z6yP21", Vector2i(1600, 900), "light", "balanced", true)


func _subwindows() -> void:
	await _open()
	await _range("-2", "4")
	_dialog.message_workflow.open_choices("firstMessage")
	var picker: Window = _dialog.message_workflow.picker
	var body: Control = picker.get_node("Panel/Inset/Body")
	body.get_node("Search").text = "Authored"
	body.get_node("Search").text_changed.emit("Authored")
	for frame in 600:
		if body.get_node("Results").item_count == 4 and not picker._loading and not picker._requested: break
		await process_frame
	body.get_node("Results").select(2)
	body.get_node("Results").item_selected.emit(2)
	await _capture("picker", "XSHSA")
	picker.hide()
	await _range("2", "4")
	root.size = Vector2i(1920, 1080)
	root.content_scale_size = root.size
	_dialog.popup_centered(Vector2i(1040, 700))
	await process_frame
	await _dialog.message_workflow.read_message("message:3")
	await _capture("read", "UbKg7", Vector2i(1920, 1080))
	_dialog.message_workflow.peek.hide()


func _retarget(id: int, opcode: int, target: int) -> void:
	_fixture.revision = int(_bridge.request("session.describe").result.revision)
	var record: Dictionary = _bridge.request("extra-action-point.open", {"identity":"extra-action-point:%d" % id}).result.extraActionPoint
	record.actions = [{"slot":4,"rawOpcode":opcode,"targetNativeId":target}]
	assert(_fixture.mutate("extra-action-point.update", {"extraActionPoint":record}), _fixture.error)


func _open() -> void:
	if _dialog._needs_reconnect: await _dialog.check_status()
	_dialog.message_workflow.cancel()
	_dialog.hide()
	_fixture.revision = int(_bridge.request("session.describe").result.revision)
	var opened: Dictionary = await _dialog.open_repair(_bridge, _fixture.revision, "extra-action-point:158", 4)
	if not opened.get("ok", false):
		push_error("Capture could not reopen: " + JSON.stringify(opened))
		quit(1)


func _range(first: String, last: String) -> void:
	await _dialog.change_field("firstMessage", first)
	await _dialog.change_field("lastMessage", last)


func _settle() -> void:
	for frame in 600:
		if not _dialog._busy and not _dialog.operations.busy: return
		await process_frame
	assert(false, "Capture operation did not settle")


func _capture(name: String, pencil: String, viewport := Vector2i(1600,900), mode := "dark", density := "balanced", visual_only := false) -> void:
	root.size = viewport
	root.content_scale_size = viewport
	_dialog.apply_theme(mode, density)
	_dialog.popup_centered(Vector2i(1040,700))
	for frame in 4: await process_frame
	await RenderingServer.frame_post_draw
	if name == "busy": assert(_dialog._busy, "The busy capture missed the controlled operation")
	if name in ["stale", "unknown"]:
		assert(_dialog.ui.recovery_body.text.contains("First message 2 · Last message 4"), "Recovery lost the retained draft summary")
		assert(_dialog.ui.recovery_scroll.size.y > 50 and _dialog.ui.recovery_buttons.position.y < 260, "Recovery summary or its adjacent actions collapsed")
	var captured := root.get_texture().get_image()
	var path := _output.path_join(name + ".png")
	assert(captured.save_png(path) == OK)
	var geometry := {}
	for key in ["notice","body","firstMessage","lastMessage","summary_heading","only","shared","recovery","recovery_body","recovery_buttons","apply","cancel"]:
		var rect: Rect2 = _dialog.ui[key].get_global_rect()
		geometry[key] = [rect.position.x,rect.position.y,rect.size.x,rect.size.y]
	_frames.append({"state":name,"pencilFrame":pencil,"path":path,"sha256":FileAccess.get_sha256(path),"viewport":[viewport.x,viewport.y],"mode":mode,"density":density,"visualOnlyProjection":visual_only,"geometry":geometry})
	captured.resize(400,225,Image.INTERPOLATE_LANCZOS)
	captured.convert(Image.FORMAT_RGB8)
	var index := _frames.size() - 1
	_sheet.blit_rect(captured,Rect2i(0,0,400,225),Vector2i((index%4)*400,(index/4)*225))
