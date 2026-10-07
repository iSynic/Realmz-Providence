extends SceneTree

var _shell
var _view: ProvidenceSpellEditor
var _output := ""
var _width := 1600
var _captures: Array[Dictionary] = []


func _initialize() -> void: _run.call_deferred()


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 2: quit(1); return
	_output = args[0]; _width = int(args[1])
	DirAccess.make_dir_recursive_absolute(_output)
	root.size = Vector2i(_width, 900 if _width == 1600 else 1080)
	root.content_scale_size = root.size; root.gui_embed_subwindows = true
	var project := _output.path_join("project-%d" % _width)
	var bridge := ProvidenceNativeBridge.new(_output.path_join("settings.cfg"))
	var created := bridge.create_project("spell-native-review", project)
	if not created.get("ok", false): push_error(str(created)); quit(1); return
	var review := bridge.request("spell.allocation.review", {"expectedRevision": 0})
	var draft: Dictionary = review.result.allocation.draft
	draft.definition.merge({"name": "Moon Gate", "description": "Travel between linked gates.", "rangeMin": 3, "cost": 12,
		"fixedTargetCount": 1, "durationMin": 1, "durationMax": 1, "targetType": 8, "size": 1, "inCombat": true, "inCamp": true, "canRotate": 1,
		"soundStart": 1, "soundEnd": 2, "lookStart": 1, "lookEnd": 5, "queueIcon": 10}, true)
	var applied := bridge.request("spell.draft.apply", {"expectedRevision": 0, "draft": draft, "operationId": "a".repeat(64)})
	if not applied.get("ok", false): push_error(str(applied)); bridge.stop(); quit(1); return
	bridge.stop()
	_shell = load("res://src/editor_shell.tscn").instantiate(); root.add_child(_shell); await process_frame
	await _shell._project_session.open_project(project)
	await _shell._navigation.select_route("rules.spells")
	_view = _shell._documents.view("rules.spells")
	await _shell._workbenches.spell_commands.open_spell("classic.spell.5101")
	await _idle()
	await preload("res://tools/spell_gate_states.gd").new().run(_shell, _capture, _idle)
	var file := FileAccess.open(_output.path_join("capture-%d.json" % _width), FileAccess.WRITE)
	file.store_string(JSON.stringify({"viewport": [_width,root.size.y], "captures": _captures, "minimum": _view.get_combined_minimum_size(), "adapter": _shell._bridge.request("build.identity").get("result",{})}, "\t")); file.close()
	_shell._close_project(); _shell.queue_free(); await process_frame
	print("SPELL_NATIVE_CAPTURE_OK"); quit()


func _capture(state: String, evidence: String) -> void:
	var query := _view.catalog_query()
	if _view.get_node("%SpellClassFilter").selected != int(query.class) or _view.get_node("%SpellLevelFilter").selected != int(query.level):
		push_error("Displayed spell filters differ from the captured query"); quit(1); return
	if state == "missing" and (_view.get_node("%SubmissionNotice").text.contains("MacRoman") or _view.get_node("%NameFeedback").text != "9 / 255 MacRoman bytes"):
		push_error("Discarded draft validation leaked into missing-reference state"); quit(1); return
	if state == "loading" and (not _view.selected_definition().is_empty() or _view.get_node("%UsedByCount").text.contains("· 0")):
		push_error("Initial loading retained stale record details or use count"); quit(1); return
	if state == "loading" and (not _shell._operations.busy or not _shell._command_bar.get_node("Save").disabled):
		push_error("Initial loading capture lacks the global operation guard"); quit(1); return
	if state == "uncertain" and (not _shell._operations.requires_reopen or not _shell._command_bar.get_node("Save").disabled):
		push_error("Uncertain capture lacks the global recovery lock"); quit(1); return
	await process_frame; await process_frame
	await RenderingServer.frame_post_draw
	if state.begins_with("regression-"):
		var color: Color = _view.get_theme_stylebox("panel", "ItemPanel").bg_color
		var point := Vector2i(_view.get_global_rect().position + Vector2(275, 1))
		var pixel := root.get_texture().get_image().get_pixelv(point)
		if absf(pixel.r - color.r) + absf(pixel.g - color.g) + absf(pixel.b - color.b) > 0.06:
			push_error("Spells label background did not follow its selected theme"); quit(1); return
	var path := _output.path_join("spell-%s-%d.png" % [state, _width])
	root.get_texture().get_image().save_png(path)
	_captures.append({"state": state, "path": path, "evidence": evidence, "viewport": [_width, root.size.y]})


func _idle() -> void:
	var stable := 0
	for frame in 900:
		await process_frame
		var validation_pending: bool = not _shell._workbenches.spell_commands._validation_timer.is_stopped()
		stable = stable + 1 if not _shell._operations.busy and not _shell._bridge.operation_busy() and not validation_pending else 0
		if stable >= 12: return
	push_error("Spell capture did not finish within its bounded wait"); quit(1)
