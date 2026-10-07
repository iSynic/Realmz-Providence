extends SceneTree

const Fixture = preload("res://tools/validate_issues_state.gd").FixtureBridge
var _shell
var _view
var _fixture
var _sheet: Image
var _caption: Label
var _caption_back: ColorRect
var _captures: Array = []
var _output := ""


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	assert(args.size() == 2 and args[0].get_file().begins_with("providence-issues-capture-") and DirAccess.dir_exists_absolute(args[1]))
	_output = args[1]
	OS.set_environment("PROVIDENCE_PROJECT_PATH", "")
	root.gui_embed_subwindows = true
	root.size = Vector2i(1600, 900)
	root.content_scale_size = root.size
	_shell = load("res://src/editor_shell.tscn").instantiate()
	root.add_child(_shell)
	await _settle()
	_shell._bridge.stop()
	_shell._bridge = load("res://src/native_bridge.gd").new(args[0].path_join("settings.cfg"))
	var started: Dictionary = _shell._bridge.start_demo()
	assert(started.get("ok", false))
	await _shell._activate_session(started)
	_shell._issues.request_show()
	_view = _shell._issues.workbench
	_fixture = Fixture.new()
	_seed_visuals()
	_shell._session_view.project_id = "Example scenario"
	_shell._command_bar.get_node("ProvidenceBrand/ProjectName").text = "Example scenario"
	_shell._issues.apply_layout()
	_view.attach(_fixture, 18)
	_shell._issues._enter_layout()
	_shell._issues._update_status()
	_sheet = Image.create(3600, 4180, false, Image.FORMAT_RGBA8)
	_sheet.fill(Color("202020"))
	_caption_back = ColorRect.new()
	_caption_back.color = Color("202020")
	_caption_back.size = Vector2(1920, 36)
	root.add_child(_caption_back)
	_caption = Label.new()
	_caption.add_theme_font_size_override("font_size", 20)
	_caption.add_theme_color_override("font_color", Color.WHITE)
	_caption_back.add_child(_caption)
	_caption_back.hide()
	await _capture("Find a problem · dark / balanced", Vector2i(20, 20))
	root.size = Vector2i(1920, 1080)
	root.content_scale_size = root.size
	await _capture("More room for browsing · 1920 × 1080", Vector2i(1660, 20))
	root.size = Vector2i(1600, 900)
	root.content_scale_size = root.size
	_fixture.rows[500] = {"code": "extra-code.opcode-92.secondary.missing", "entity": "extra-action-point:158", "field": "actions[4].extraCode", "message": "Random-area settings are incomplete.", "severity": "error"}
	_view.state.set_filters("random-area", "error")
	_view.state.open_category("action-settings")
	_shell._issues.set_appearance("light", "balanced")
	await _capture("Search and filter · light / balanced", Vector2i(20, 1180))
	_shell._issues.set_appearance("high-contrast", "compact")
	_view._headings[2].grab_focus()
	await _capture("Search and filter · high contrast / compact", Vector2i(1660, 1180))
	_shell._issues.set_appearance("dark", "balanced")
	_seed_visuals()
	_view.state.clear_filters()
	_fixture.rows.remove_at(0)
	_fixture.revision = 19
	_view.state.refresh(19)
	_shell._session_view.revision = 19
	_shell._issues._saved_revision = 18
	_shell._issues._update_status()
	await _capture("After a repair · refreshed findings", Vector2i(20, 2160))
	await _states()
	await _native_guards()
	_shell._bridge.stop()
	_shell.free()
	assert(_sheet.save_png(_output.path_join("contact-sheet.png")) == OK)
	var manifest := FileAccess.open(_output.path_join("capture.json"), FileAccess.WRITE)
	manifest.store_string(JSON.stringify({"route": "linter.issues", "stage": "godot", "renderer": "native Godot 4.7.1", "captures": _captures}, "\t"))
	manifest.close()
	print("PROVIDENCE_ISSUES_CAPTURE_OK viewports=2 controlled-visuals native-draft-guards")
	quit(0)


func _seed_visuals() -> void:
	_fixture.rows = Fixture.new().rows
	for index in _fixture.rows.size():
		_fixture.rows[index].entity = "extra-action-point:%d" % (1000 + index)
	var examples := [
		["extra-action-point:158", "actions[4].target", "message", 930],
		["extra-action-point:121", "actions[0].target", "monster", 441],
		["battle:12", "monsters[0]", "monster", 400],
		["shop:4", "items[0]", "item", 912],
		["extra-action-point:203", "actions[1].target", "message", 944],
		["battle:18", "monsters[0]", "monster", 450],
		["shop:9", "items[0]", "item", 927],
		["extra-action-point:220", "actions[6].target", "message", 980],
		["extra-action-point:225", "actions[2].target", "message", 992],
		["shop:11", "items[0]", "item", 938],
		["battle:22", "monsters[0]", "monster", 462],
	]
	for index in examples.size():
		var row: Array = examples[index]
		_fixture.rows[index] = {"code": "reference.%s.missing" % row[2], "entity": row[0], "field": row[1], "message": "%s %d is missing." % [str(row[2]).capitalize(), row[3]], "severity": "error"}


func _states() -> void:
	var summary_and_finding := Rect2i(372, 112, 918, 230)
	_view.state.set_filters("no such problem", "")
	await _capture("No matching problems", Vector2i(1660, 2160), summary_and_finding)
	_fixture.fail = true
	_view.state.refresh()
	await _capture("Check failed · Retry available", Vector2i(2640, 2470), Rect2i(372, 112, 918, 230))
	_fixture.fail = false
	_fixture.rows.clear()
	_view.state.clear_filters()
	await _capture("No problems found", Vector2i(1660, 2470), summary_and_finding)
	_fixture.rows = [{"code": "reference.message.missing", "entity": null, "field": null, "message": "A required scenario message is missing.", "severity": "error"}]
	_view.state.refresh()
	await _capture("No available source", Vector2i(2640, 2160), Rect2i(1304, 222, 280, 310))
	_view.attach(null)
	await _capture("No scenario open", Vector2i(1660, 2780), summary_and_finding)
	_view.state.status = "checking"
	_view.state.changed.emit()
	await _capture("Checking the scenario", Vector2i(2640, 2780), summary_and_finding)


func _native_guards() -> void:
	var restarted: Dictionary = _shell._bridge.start_demo()
	assert(restarted.get("ok", false))
	await _shell._activate_session(restarted)
	await _shell._navigation.select_tab(2)
	await _settle()
	_shell._documents.view("encounters.simple")._responses[0].text = "A".repeat(80)
	_shell._issues.request_show()
	await _settle()
	var guard: Window = _shell._issues.guard
	await _capture("Unapplied changes · Cancel keeps the draft", Vector2i(20, 3140), Rect2i(guard.position - Vector2i(4, 36), guard.size + Vector2i(8, 40)), "actual-native-draft")
	guard.get_ok_button().pressed.emit()
	await _settle()
	await _capture("Could not apply · draft and destination retained", Vector2i(20, 3480), Rect2i(guard.position - Vector2i(4, 36), guard.size + Vector2i(8, 40)), "actual-native-draft")
	guard.get_cancel_button().pressed.emit()
	_shell._draft_apply.discard()
	_shell._issues.request_show()
	_view.state.set_filters("action-point:land:0:17", "error")
	_view.get_node("%OpenFinding").pressed.emit()
	await _capture("Open the owning action · native source navigation", Vector2i(1660, 3140), Rect2i(0, 0, 1600, 900), "actual-native-source")


func _capture(label: String, position: Vector2i, crop := Rect2i(), evidence := "controlled-visual-state") -> void:
	await _settle()
	await RenderingServer.frame_post_draw
	if crop.size == Vector2i.ZERO:
		crop = Rect2i(Vector2i.ZERO, root.size)
	_sheet.blit_rect(root.get_texture().get_image(), crop, position + Vector2i(0, 40))
	_caption.text = label
	_caption_back.show()
	await _settle()
	await RenderingServer.frame_post_draw
	_sheet.blit_rect(root.get_texture().get_image(), Rect2i(0, 0, crop.size.x, 36), position)
	_caption_back.hide()
	_captures.append({"label": label, "sheetX": position.x, "sheetY": position.y + 40, "width": crop.size.x, "height": crop.size.y, "viewport": [root.size.x, root.size.y], "crop": [crop.position.x, crop.position.y], "evidence": evidence, "theme": _view.theme.mode, "density": _view.theme.density})


func _settle() -> void:
	for _frame in 6:
		await process_frame
