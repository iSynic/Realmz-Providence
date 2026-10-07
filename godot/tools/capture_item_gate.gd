extends SceneTree

class FaultBridge extends "res://src/native_bridge.gd":
	var lose_next_apply := false
	var reject_next_prepare := false
	var delay_next_list := false
	func _request(method: String, params: Dictionary) -> Dictionary:
		if method == "item.list" and delay_next_list: delay_next_list = false; OS.delay_msec(400)
		if method == "item.draft.prepare" and reject_next_prepare:
			reject_next_prepare = false
			return {"ok": false, "error": "Controlled write rejection. Your item draft is kept; correct the problem or explicitly retry Apply."}
		var response: Dictionary = super._request(method, params)
		if method == "item.draft.apply" and lose_next_apply:
			lose_next_apply = false
			return {"ok": false, "outcomeUnknown": true, "error": "Controlled lost acknowledgement after durable Item Apply. Check the original result; your draft is kept."}
		return response

var _shell
var _view: ProvidenceItemEditor
var _output := ""
var _width := 0
var _frames: Array = []
var _failed := false
var _probe := false


func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if not _check(args.size() in [3, 4], "Expected source, bounded output root and viewport"): return
	_output = args[1]; _width = int(args[2]); _probe = args.size() == 4
	if not _check(_width in [1920, 1600], "Uncertified viewport"): return
	DirAccess.make_dir_recursive_absolute(_output)
	var project := _output.path_join("project-%d" % _width)
	var source := ProvidenceNativeBridge.new(_output.path_join("source-settings.cfg"))
	if not _ok(source.start_project(args[0])): return
	var copied := source.request("project.save-as", {"path": project}); source.stop()
	if not _ok(copied): return
	root.size = Vector2i(_width, 1080 if _width == 1920 else 900); root.content_scale_size = root.size; root.gui_embed_subwindows = true
	_shell = load("res://src/editor_shell.tscn").instantiate()
	_shell._bridge = FaultBridge.new(_output.path_join("settings-%d.cfg" % _width))
	root.add_child(_shell); await process_frame
	await _shell._project_session.open_project(project)
	if not _check(_shell._session_view.connected, "Capture project did not open"): return
	await _shell._navigation.select_route("economy.items")
	_view = _shell._item_editor
	if not _ok(await _shell._item_commands.open_item("classic.item.800")): return
	_view.get_node("%ScenarioSource").pressed.emit(); await _idle()
	await _take("identity")
	if not _probe: await _ordinary_states()
	if not _probe and not _failed: await _failure_states()
	if not _probe and not _failed: await _fresh_states()
	if _failed: return
	var receipt := {"route": "economy.items", "theme": "dark", "density": "balanced", "viewport": [root.size.x, root.size.y], "frames": _frames,
		"adapter": _shell._bridge.request("build.identity").get("result", {}), "sourceProject": args[0],
		"retention": "Bounded native candidate captures and one disposable project per viewport; no donor mutations."}
	var file := FileAccess.open(_output.path_join("capture-%d.json" % _width), FileAccess.WRITE); file.store_string(JSON.stringify(receipt, "\t")); file.close()
	_shell._close_project(); _shell.queue_free(); await process_frame
	print("PROVIDENCE_ITEM_GATE_CAPTURE_OK viewport=%d frames=%d" % [_width, _frames.size()]); quit(0)


func _ordinary_states() -> void:
	for pair in [["Equipment", "equipment"], ["Restrictions", "restrictions"], ["Special", "special"]]:
		_view.form.show_section(pair[0]); await _take(pair[1])
	_view.form.show_section("Identity")
	_view.get_node("%StockSource").pressed.emit(); await _idle()
	_view.get_node("%Weapons").pressed.emit(); await _idle()
	if not _ok(await _shell._item_commands.open_item("classic.item.1")): return
	await _take("stock")
	_view.get_node("%ScenarioSource").pressed.emit(); await _idle()
	_view.get_node("%AllItems").pressed.emit(); await _idle()
	if not _ok(await _shell._item_commands.open_item("classic.item.800")): return
	await _search("800"); await _take("filtered")
	await _search("no-item-can-match-this"); await _take("no-results")
	await _search("")
	_view.form.control_for("iconId").value = 32760; await _take("missing")
	_view.discard_draft(); await _idle()
	var names: LineEdit = _view.form.control_for("name"); names.text = "Unsupported 😀"; names.text_changed.emit(names.text)
	await _idle(); await _shell._item_commands.validate_draft(); await _take("invalid")
	_view.discard_draft(); await _idle()
	_shell._item_commands._references.open_picker("iconId"); await _take("picker")
	_shell._item_commands._references._picker.cancel()
	await _shell._item_commands._records.review_record("clear"); await _take("clear")
	_shell._item_commands._records._review.cancel()
	_view.form.show_section("Restrictions")
	_view.form.find_child("ChooseSpecificRace", true, false).grab_focus()
	var races: Dictionary = await _shell._operations.run_workflow(_shell._bridge, "Read linked race", func(operation): return await operation.request("race-rule.list", {"limit": 1}))
	if not _check(races.get("ok", false) and not races.result.items.is_empty(), "Source race target unavailable"): return
	var race: Dictionary = races.result.items[0]
	await _shell._navigation.open_script_target("race", int(race.classicId), str(race.identity), {})
	await _shell._navigation.navigate_back(); await _take("return")
	_view.form.show_section("Identity")
	_view.get_node("%AllSources").pressed.emit(); await _idle()
	_view._change_page(992); await _take("full-range")


func _failure_states() -> void:
	_shell._bridge.delay_next_list = true
	_shell._item_commands.load_catalog(_view.catalog_query()); await _take("loading", false)
	await _idle()
	_view.form.control_for("cost").value += 1
	_shell._bridge.reject_next_prepare = true
	await _view.commit_selected(); await _take("failure")
	_shell._bridge.lose_next_apply = true
	await _view.commit_selected(); await _take("uncertain")
	await _shell._item_commands.check_original_result()
	if not _check(not _view.has_unapplied_changes(), "Recovery must confirm the original mutation"): return


func _fresh_states() -> void:
	_view.get_node("%ScenarioSource").pressed.emit(); await _idle()
	await _shell._project_session.create_project("items-empty-capture", _output.path_join("fresh-%d" % _width))
	await _shell._navigation.select_route("economy.items"); await _take("empty")
	await _shell._item_commands._records.review_record("new"); await _take("allocation")
	_shell._item_commands._records._review.cancel()


func _search(value: String) -> void:
	var search: LineEdit = _view.get_node("%ItemSearch"); search.text = value; search.text_changed.emit(value)
	await create_timer(0.3).timeout; await _idle()


func _take(state: String, wait_for_idle := true) -> void:
	if wait_for_idle: await _idle()
	for frame in 4: await process_frame
	await RenderingServer.frame_post_draw
	var image := root.get_texture().get_image()
	if not _check(image.get_size() == root.size, "Capture dimensions differ from certified viewport"): return
	var path := _output.path_join("item-%s-%d.png" % [state, _width])
	if not _check(image.save_png(path) == OK, "Could not save native capture"): return
	_frames.append({"state": state, "path": path, "identity": _view.selected_definition().get("id"), "revision": _view.draft.revision,
		"dirty": _view.has_unapplied_changes(), "busy": _shell._operations.busy,
		"inventoryRect": _view.get_node("Body/Inventory").get_global_rect(), "formRect": _view.form.get_global_rect(), "heroRect": _view.get_node("Body/Center/RecordHeader").get_global_rect(),
		"inspectorVisible": _shell.get_node("%InspectorHost").visible,
		"evidence": "Real stored adapter and native controls. Missing/invalid/failed/uncertain states use declared focused faults."})


func _idle() -> void:
	var stable := 0
	for frame in 900:
		await process_frame
		stable = stable + 1 if not _shell._operations.busy and not _shell._bridge.operation_busy() else 0
		if stable >= 4: return
	_check(false, "Native operation did not finish")


func _ok(response: Dictionary) -> bool:
	return _check(bool(response.get("ok", false)), str(response.get("error", "Command rejected")))


func _check(value: bool, message: String) -> bool:
	if value: return true
	_failed = true; push_error("PROVIDENCE_ITEM_GATE_CAPTURE_FAILED: " + message); quit(1); return false
