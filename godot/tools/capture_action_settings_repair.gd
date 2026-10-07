extends SceneTree

const Fixture = preload("res://tools/action_settings_repair_fixture.gd")

class CaptureBridge extends "res://tools/validate_action_settings_recovery.gd".FaultBridge:
	var fail_checks := false
	func _request(method: String, params: Dictionary) -> Dictionary:
		if method in ["validation.begin", "validation.poll", "validation.list"] and fail_checks: return {"ok": false, "error": "Controlled checker interruption"}
		if method == "action-settings.commit-repair": OS.delay_msec(750)
		return super._request(method, params)

var _shell
var _fixture := Fixture.new()
var _sheet: Image
var _caption := Label.new()
var _frames: Array = []
var _failed := false


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	var prior_clipboard := DisplayServer.clipboard_get()
	assert(args.size() == 2 and args[0].get_file().begins_with("providence-ui-repair-") and DirAccess.dir_exists_absolute(args[1]))
	await _prepare_scenario(args[0])
	_initialize_sheet()
	var dialog = _shell._issues.repair
	await _capture_creation(dialog)
	await _capture_shared_modes(dialog)
	await _capture_recovery(dialog)
	await _capture_failure_states(dialog)
	await _capture_capacity(dialog, args[0])
	assert(_sheet.save_png(args[1].path_join("contact-sheet.png")) == OK)
	var manifest := FileAccess.open(args[1].path_join("capture.json"), FileAccess.WRITE)
	manifest.store_string(JSON.stringify({"revision": 2, "kind": "action-settings-native-review", "frames": _frames, "ownerApproved": false, "fixture": "Synthetic scenario; authored records and an imported 32769-row capacity case; actual native draft and mutations; explicit lost-reply/checker fault injection; default map label differs from the Pencil example."}, "  "))
	manifest.close()
	DisplayServer.clipboard_set(prior_clipboard)
	_shell.queue_free()
	await process_frame
	print("PROVIDENCE_ACTION_SETTINGS_CAPTURE_OK frames=22 themes=3 viewports=2 core-owned=true")
	quit(0)


func _prepare_scenario(temporary_root: String) -> void:
	root.gui_embed_subwindows = true
	_viewport(Vector2i(1600, 900))
	OS.set_environment("PROVIDENCE_PROJECT_PATH", "")
	_shell = load("res://src/editor_shell.tscn").instantiate()
	root.add_child(_shell)
	await process_frame
	_shell._bridge.stop()
	_shell._bridge = CaptureBridge.new(temporary_root.path_join("settings.cfg"))
	assert(_fixture.create(_shell._bridge, temporary_root.path_join("project")))
	_seed_action(170, 1, 30000)
	await _shell._activate_session(_shell._bridge.request("session.describe"))
	_shell._issues.request_show()
	await _settle()
	_shell._issues.workbench.state.open_category("action-settings")
	_shell._issues.workbench.state.set_filters("extra-action-point:158", "error")
	await _settle()
	_shell._issues.workbench.get_node("%OpenFinding").pressed.emit()
	await _settle()
	assert(_shell._issues.repair.visible)


func _initialize_sheet() -> void:
	_sheet = Image.create(3520, 6620, false, Image.FORMAT_RGBA8)
	_sheet.fill(Color("202020"))
	root.add_child(_caption)
	_caption.add_theme_font_size_override("font_size", 14)
	_caption.add_theme_color_override("font_color", Color.WHITE)
	var style := StyleBoxFlat.new()
	style.bg_color = Color("202020")
	_caption.add_theme_stylebox_override("normal", style)
	_caption.custom_minimum_size = Vector2(1920, 26)
	_caption.hide()


func _capture_creation(dialog) -> void:
	await _capture("MISSING BOUNDS · 1600x900 · dark / balanced", Vector2i(0, 0), true)
	await _complete()
	_viewport(Vector2i(1920, 1080))
	dialog.popup_centered(Vector2i(1040, 700))
	await _capture("READY TO CREATE · 1920x1080 · dark / balanced", Vector2i(1600, 0), true)
	dialog.apply_repair()
	await _operation()
	await _settle()
	_viewport(Vector2i(1600, 900))
	await _capture("RETURNED TO ISSUES · repaired finding removed · other problem retained · Unsaved", Vector2i(0, 5500), true)
	await _shell._undo()
	await _settle()


func _capture_shared_modes(dialog) -> void:
	_fixture.revision = _shell._session_view.revision
	_seed_action(159, 92, 10)
	_seed_action(160, 92, 10)
	_shell._session_view.apply(_shell._bridge.request("session.describe").result)
	await _settle()
	await _open()
	await _complete()
	await dialog.change_field("scope", "shared-actions")
	_shell._issues.set_appearance("light", "balanced")
	await _modal("SHARED CREATION · all 3 actions · light / balanced", 0)
	_shell._issues.set_appearance("high-contrast", "compact")
	await dialog.change_field("bound0", "9a")
	dialog.ui.bound0.grab_focus()
	await _modal("INVALID DRAFT · typed 9a retained · high contrast / compact", 1)
	_fixture.revision = _shell._session_view.revision
	_seed_action(161, 92, 99)
	await _open("extra-action-point:161")
	_shell._issues.set_appearance("dark", "balanced")
	await _modal("ALL SETTINGS MISSING · no choices or zero values invented", 2)
	await _open()
	await _complete()
	await dialog.change_field("shapeMode", "-1")
	await _modal("KEEP SHAPE · chance changes · inactive values kept", 3)
	await dialog.change_field("shapeMode", "1")
	await dialog.change_field("bound0", "-3")
	await dialog.change_field("bound1", "5")
	await _modal("MOVE AREA · shared values reinterpreted · explicit warning", 4)
	await dialog.change_field("shapeMode", "2")
	for entry in [["bound0", "-2"], ["bound1", "2"], ["bound2", "-1"], ["bound3", "1"]]: await dialog.change_field(entry[0], entry[1])
	await _modal("ADJUST EACH EDGE · signed offsets", 5)


func _capture_recovery(dialog) -> void:
	await _open()
	await _complete()
	assert(_fixture.mutate("extra-code.upsert", {"row": {"nativeId": 10, "values": [1, 3, 0, 300, 0]}}))
	await dialog.apply_repair()
	await dialog.compare_current()
	await _modal("STALE COMPARISON · current +3.00 / draft +2.50 · review is non-mutating", 6)
	dialog.back_to_editing()
	await _modal("BACK TO EDITING · retained draft · Apply blocked until explicit review", 15)
	await dialog.compare_current()
	await dialog.review_draft()
	_shell._bridge.fault = "lost-before"
	dialog.apply_repair()
	await _operation()
	dialog.copy_draft()
	await _modal("UNCERTAIN OUTCOME · Copy Draft preserves unknown status · no automatic retry", 7)
	await dialog.check_status()
	dialog.copy_draft()
	await _modal("CONFIRMED NOT APPLIED · Copy Draft preserves proof · review before retry", 8)
	await dialog.compare_current()
	await dialog.review_draft()
	_shell._bridge.fault = "lost-after"
	dialog.apply_repair()
	await _operation()
	await dialog.check_status()
	dialog.copy_draft()
	await _modal("CONFIRMED MATCH · Copy Draft preserves outcome · return without reapplying", 9)
	dialog.finish_confirmed()
	await _settle()


func _capture_failure_states(dialog) -> void:
	_fixture.revision = _shell._session_view.revision
	await _open()
	await dialog.change_field("chanceAdjustment", "4.00")
	dialog.request_cancel()
	await _modal("DISCARD GUARD · Keep Editing focused", 10)
	dialog._discard.get_cancel_button().pressed.emit()
	for frame in 3: await process_frame
	assert(not dialog._discard.visible)
	dialog.open_picker("area")
	while dialog.picker._requested or dialog.picker._loading: await process_frame
	await _modal("AREA PICKER · exact stable target · no automatic selection", 11)
	dialog.picker.hide()
	_seed_action(162, 92, 10)
	await _open("extra-action-point:162")
	var record: Dictionary = _shell._bridge.request("extra-action-point.open", {"identity": "extra-action-point:162"}).result.extraActionPoint
	record.actions = []
	assert(_fixture.mutate("extra-action-point.update", {"extraActionPoint": record}))
	await dialog.change_field("chanceAdjustment", "1.00")
	await _modal("SOURCE GONE · copy draft · no substitute action", 12)
	_seed_action(163, 15, 99)
	await _open("extra-action-point:163")
	await _modal("UNSUPPORTED FORM · honest interim hold · other 69 opcodes not completed", 13)
	await _open()
	await dialog.change_field("chanceAdjustment", "4.00")
	_shell._bridge.fail_checks = true
	dialog.apply_repair()
	await _modal("APPLYING · controlled response delay · duplicate Apply and Cancel disabled", 14)
	await _operation()
	await _settle()
	_viewport(Vector2i(1920, 1080))
	await _capture("APPLIED / CHECK FAILED · Retry Check only · repair remains Unsaved", Vector2i(1600, 5500), true)
	_shell._bridge.fail_checks = false
	_seed_action(164, 2, int(dialog.view.draft.originalAction.targetNativeId) + 1)
	await _open()
	assert(not dialog.view.shareAllowed and dialog.view.isolated)
	await _modal("CONFLICT ISOLATION · companion-only different action · shared overwrite disabled", 17)


func _capture_capacity(dialog, temporary_root: String) -> void:
	dialog.hide()
	_shell._bridge.stop()
	_shell._bridge = CaptureBridge.new(temporary_root.path_join("capacity-settings.cfg"))
	_fixture = Fixture.new()
	assert(_fixture.create_exhausted(_shell._bridge, temporary_root.path_join("capacity")), _fixture.error)
	await _shell._activate_session(_shell._bridge.request("session.describe"))
	_shell._issues.request_show()
	await _settle()
	await _open()
	await dialog.change_field("chanceAdjustment", "3.50")
	assert(dialog.view.allocationUnavailable and dialog.ui.copy.visible)
	await _modal("CAPACITY EXHAUSTED · existing unused rows kept · Copy Draft and guarded return", 16)

func _open(source := "extra-action-point:158") -> void:
	var dialog = _shell._issues.repair
	dialog.hide()
	_fixture.revision = int(_shell._bridge.request("session.describe").result.revision)
	assert((await dialog.open_repair(_shell._bridge, _fixture.revision, source, 4)).get("ok", false))


func _complete() -> void:
	for entry in [["bound0", "9"], ["bound1", "18"], ["bound2", "13"], ["bound3", "24"]]: await _shell._issues.repair.change_field(entry[0], entry[1])
	assert(_shell._issues.repair.view.canApply)


func _seed_action(id: int, opcode: int, target: int) -> void:
	_fixture.revision = int(_shell._bridge.request("session.describe").result.revision)
	var response: Dictionary = _shell._bridge.request("extra-action-point.open", {"identity": "extra-action-point:%d" % id})
	if not response.get("ok", false):
		assert(_fixture.mutate("extra-action-point.create", {"nativeId": id}), _fixture.error)
		response = _shell._bridge.request("extra-action-point.open", {"identity": "extra-action-point:%d" % id})
	var record: Dictionary = response.result.extraActionPoint
	record.actions = [{"slot": 4, "rawOpcode": opcode, "targetNativeId": target}]
	assert(_fixture.mutate("extra-action-point.update", {"extraActionPoint": record}))


func _viewport(viewport_size: Vector2i) -> void:
	root.size = viewport_size
	root.content_scale_size = viewport_size


func _operation() -> void:
	for frame in 600:
		if not _shell._issues.repair._busy: return
		await process_frame
	assert(false, "Repair operation did not finish")


func _settle() -> void:
	for frame in 6: await process_frame
	for frame in 600:
		if not _shell._issues.workbench.state.has_pending_refresh() and not _shell._operations.busy: return
		await process_frame
	assert(false, "Issues did not settle")


func _modal(label: String, index: int) -> void:
	await _capture(label, Vector2i((index % 3) * 1160, 1110 + (index / 3) * 730))


func _capture(label: String, at: Vector2i, whole := false) -> void:
	_caption.hide()
	for frame in 5: await process_frame
	await RenderingServer.frame_post_draw
	var captured := root.get_texture().get_image()
	var dialog = _shell._issues.repair
	var bounds := Rect2i(Vector2i.ZERO, root.size) if whole else Rect2i(dialog.position, dialog.size)
	assert(Rect2i(Vector2i.ZERO, captured.get_size()).encloses(bounds), "Capture left the viewport")
	_sheet.blit_rect(captured, bounds, at + Vector2i(0, 26))
	_caption.text = label
	_caption.show()
	for frame in 2: await process_frame
	await RenderingServer.frame_post_draw
	_sheet.blit_rect(root.get_texture().get_image(), Rect2i(0, 0, bounds.size.x, 26), at)
	_caption.hide()
	_frames.append({"label": label, "x": at.x, "y": at.y, "width": bounds.size.x, "height": bounds.size.y + 26})
	if _frames.size() == 1:
		var metrics := {}
		for key in ["heading", "source", "notice", "body", "mapKind", "map", "area", "chanceAdjustment", "shapeMode", "bound0", "bound1", "bound2", "bound3", "summary_heading", "apply", "cancel"]:
			var rect: Rect2 = dialog.ui[key].get_global_rect()
			metrics[key] = [rect.position.x, rect.position.y, rect.size.x, rect.size.y]
		print("PROVIDENCE_REPAIR_GEOMETRY ", JSON.stringify(metrics))
