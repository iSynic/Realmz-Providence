extends SceneTree

class FaultBridge extends "res://src/native_bridge.gd":
	var lose_next_reply := false
	func _request(method: String, params: Dictionary) -> Dictionary:
		var response: Dictionary = super._request(method, params)
		if method == "battle.draft.apply" and lose_next_reply:
			lose_next_reply = false
			return {"ok": false, "outcomeUnknown": true, "error": "Controlled lost acknowledgement after durable Battle Apply"}
		return response

var _shell
var _view: ProvidenceBattleEditor
var _output := ""
var _project := ""
var _width := 0
var _frames: Array = []
var _metrics: Array = []
var _failed := false


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if not _check(args.size() == 3, "Expected source, bounded output root and viewport width"): return
	_output = args[1]; _width = int(args[2])
	if not _check(_width in [1920, 1600], "Uncertified viewport"): return
	_project = _output.path_join("project-%d" % _width)
	DirAccess.make_dir_recursive_absolute(_output)
	var bridge := ProvidenceNativeBridge.new(_output.path_join("settings-%d.cfg" % _width))
	if not _ok(bridge.start_project(args[0])): return
	var copied := bridge.request("project.save-as", {"path": _project}); bridge.stop()
	if not _ok(copied): return
	root.size = Vector2i(_width, 1080 if _width == 1920 else 900)
	root.content_scale_size = root.size; root.gui_embed_subwindows = true
	_shell = load("res://src/editor_shell.tscn").instantiate(); root.add_child(_shell)
	await process_frame
	await _open_project(_project)
	await _ordinary_states()
	if not _failed: await _failure_states()
	if not _failed: await _preview_state()
	if not _failed: await _empty_state()
	if _failed: return
	var file := FileAccess.open(_output.path_join("capture-%d.json" % _width), FileAccess.WRITE)
	file.store_string(JSON.stringify({"route": "combat.battles", "theme": "dark", "density": "balanced",
		"viewport": [root.size.x, root.size.y], "frames": _frames, "metrics": _metrics,
		"adapter": _shell._bridge.request("build.identity").get("result", {}),
		"windowCapture": "Embedded native Window nodes, bounded to the certified viewport.",
		"retention": "Retain one paired native capture set and these disposable projects for the gate."}, "\t")); file.close()
	_shell._close_project(); _shell.queue_free(); await process_frame
	print("PROVIDENCE_BATTLE_GATE_CAPTURE_OK width=%d frames=%d" % [_width, _frames.size()])
	quit(0)


func _open_project(project: String) -> void:
	await _shell._project_session.open_project(project)
	if not _check(_shell._session_view.connected, "Capture project did not open"): return
	await _shell._navigation.select_route("combat.battles")
	_view = _shell._workbenches.battle
	if project == _project: _ok(await _view.controller.open_record(2))


func _ordinary_states() -> void:
	_select_occupant()
	await _capture("populated")
	await _gallery_states()
	await _palette("royal")
	var palette: Control = _view.get_node("%MonsterPalette")
	if not _check(palette.item_count > 0, "Source-realistic Royal palette is empty"): return
	palette.select(0); palette.item_selected.emit(0)
	_view.get_node("%ForceFriends").set_pressed_no_signal(true)
	_view.draft.edit("distance", int(_view.draft.record.distance) + 1)
	_view.get_node("%BattleCanvas")._hover = 35
	await _capture("filtered-paint")
	_view.get_node("%EraseTool").pressed.emit()
	await _capture("move-erase")
	_view.discard_draft()
	await _palette("no-monster-can-match-this-query")
	await _capture("no-results")
	await _palette("")
	_view.draft.edit_cell(35, 32767)
	_view.get_node("%BattleCanvas").selected_slot = 35
	await _view.controller.palette()
	await _capture("missing-reference")
	_view.discard_draft()
	var grid: Array = _view.draft.record.grid.duplicate()
	for slot in 101: grid[slot] = 95
	_view.draft.edit("grid", grid)
	await _capture("invalid")
	_view.discard_draft()
	_view.reference_requested.emit("messageBefore"); await _idle()
	await _capture("string-picker"); _view.picker.cancel()
	_view.draft.edit("battleMacro", 17)
	_view.reference_requested.emit("battleMacro"); await _idle()
	await _capture("macro-picker"); _view.picker.cancel()
	_view.draft.edit("distance", int(_view.draft.record.distance) + 1)
	_view.get_node("%NewBattle").pressed.emit(); await _idle()
	await _capture("dirty-navigation")
	_view.get_node("%DraftGuard").hide(); _view.discard_draft()
	await _view.controller.review("clear")
	await _capture("record-impact"); _view.get_node("%Impact").hide()
	_view.get_node("%UsedBy").pressed.emit(); await _idle()
	await _capture("used-by"); _view.get_node("BattleUses").cancel()
	_view.set_loading(true, "Loading Battle 2…")
	await _capture("loading", "Controlled pause in the real loading presentation; reads are exercised in the journeys.")
	_view.set_loading(false)


func _gallery_states() -> void:
	var palette: Control = _view.get_node("%MonsterPalette")
	var tile: Control = palette.get_node("%Tiles").get_child(0)
	var motion := InputEventMouseMotion.new()
	motion.position = tile.get_global_rect().get_center(); motion.global_position = motion.position
	root.push_input(motion, true)
	await create_timer(0.8).timeout
	await _capture("palette-hover", "Native hover tooltip from the exact adapter-backed thumbnail; no brush or draft selection.")
	motion = motion.duplicate(); motion.position = _view.get_node("%GridHeading").global_position; motion.global_position = motion.position
	root.push_input(motion, true)
	palette.grab_focus(); palette.select(0); palette.item_selected.emit(0)
	var key := InputEventKey.new(); key.keycode = KEY_DOWN; key.pressed = true
	root.push_input(key, true); await process_frame
	if not _check(not _view.has_unapplied_changes(), "Gallery keyboard browsing changed the draft"): return
	await _capture("palette-keyboard", "Actual row-based keyboard navigation selects a brush and persistent facts without editing the Battle.")


func _failure_states() -> void:
	var changed: Dictionary = _shell._bridge.request("message.update", {"expectedRevision": _shell._session_view.revision,
		"identity": "message:148", "text": "Concurrent edit in the disposable native gate fixture"})
	if not _ok(changed): return
	_view.draft.edit("distance", int(_view.draft.record.distance) + 1)
	var rejected: Dictionary = await _view.commit_selected()
	if not _check(not rejected.get("ok", false) and _view.has_unapplied_changes(), "Stale write lost its draft"): return
	await _capture("failed-stale")
	_view.get_node("%Failure").hide()
	_shell._session_view.apply(changed.result)
	if not _ok(await _view.controller.reload(null, 2)): return
	_shell._bridge.stop()
	var bridge := FaultBridge.new(_output.path_join("fault-settings-%d.cfg" % _width))
	var connected := bridge.start_project(_project)
	if not _ok(connected): return
	_shell._bridge = bridge
	await _shell._activate_session(connected)
	await _shell._navigation.select_route("combat.battles")
	_view = _shell._workbenches.battle
	if not _ok(await _view.controller.open_record(2)): return
	_select_occupant()
	_view.draft.edit("distance", int(_view.draft.record.distance) + 1)
	bridge.lose_next_reply = true
	var unknown: Dictionary = await _view.commit_selected()
	if not _check(unknown.get("outcomeUnknown", false), "Lost acknowledgement was not retained"): return
	await _capture("unknown")
	_view.get_node("%CloseFailure").pressed.emit()
	await _capture("unknown-footer")
	if not _check(not _shell._status.text.begins_with("Reopen the project"), "Background reads replaced the local recovery instruction"): return
	_view.get_node("%Recovery").pressed.emit(); await _idle()
	if not _check(not _shell._operations.requires_reopen, "Original receipt was not reconciled"): return
	_view.get_node("%Failure").hide()


func _preview_state() -> void:
	ProjectSettings.set_setting("providence/rebuilt_preview_headless", true)
	var ready: Array[Dictionary] = []
	var failures: Array[Dictionary] = []
	var preview: ProvidenceRebuiltPreviewController = _shell._rebuilt_preview_controller
	preview.preview_ready.connect(func(result): ready.append(result))
	preview.preview_failed.connect(func(error): failures.append(error))
	_view.get_node("%Preview").pressed.emit()
	var deadline := Time.get_ticks_msec() + 120000
	while ready.is_empty() and failures.is_empty() and Time.get_ticks_msec() < deadline: await process_frame
	if not _check(ready.size() == 1 and failures.is_empty(), "Native capture preview did not reach combat: " + str(failures)): return
	if not _check(ready[0].get("pendingInteractionKind") == "combat_action", "Preview did not reach Battle interaction"): return
	await _capture("preview", "Actual separate Rebuilt process ready at combat_action.")
	preview.cancel_preview("Native gate ready-state captured.")


func _empty_state() -> void:
	_shell._close_project()
	var project := _output.path_join("empty-project-%d" % _width)
	var bridge := ProvidenceNativeBridge.new(_output.path_join("empty-settings-%d.cfg" % _width))
	var created := bridge.create_project("battle-native-empty-%d" % _width, project); bridge.stop()
	if not _ok(created): return
	await _open_project(project)
	await _capture("empty")


func _palette(query: String) -> void:
	_view.get_node("%PaletteSearch").text = query
	_view.get_node("%PaletteDelay").stop()
	var start := Time.get_ticks_usec()
	await _view.controller.palette()
	_metrics.append({"operation": "palette-filter", "query": query, "elapsedMs": (Time.get_ticks_usec() - start) / 1000.0,
		"workflow": _shell._operations.last_metrics.duplicate(true)})


func _select_occupant() -> void:
	var grid: Array = _view.draft.record.grid
	for slot in grid.size():
		if int(grid[slot]) != 0:
			_view.get_node("%BattleCanvas").selected_slot = slot
			_view.get_node("%BattleCanvas").cell_selected.emit(slot)
			return


func _capture(state: String, evidence := "Real adapter-backed document and local native controls.") -> void:
	await _idle()
	for frame in 4: await process_frame
	await RenderingServer.frame_post_draw
	var path := _output.path_join("battle-%s-%d.png" % [state, _width])
	if not _check(root.get_texture().get_image().save_png(path) == OK, "Could not save " + path): return
	_frames.append({"state": state, "path": path, "evidence": evidence, "nativeId": _view.current_selection(),
		"revision": _view.draft.revision, "draft": _view.has_unapplied_changes(),
		"canvasRect": _view.get_node("%BattleCanvas").get_global_rect(),
		"inspectorVisible": _shell.get_node("%InspectorHost").visible})


func _idle() -> void:
	var stable := 0
	while stable < 3:
		await process_frame
		stable = stable + 1 if not _shell._operations.busy and not _shell._bridge.operation_busy() else 0


func _ok(response: Dictionary) -> bool:
	return _check(response.get("ok", false), str(response.get("error", "Command rejected")))


func _check(condition: bool, message: String) -> bool:
	if condition: return true
	_failed = true
	push_error("PROVIDENCE_BATTLE_GATE_CAPTURE_FAILED: " + message)
	if _shell != null: _shell.queue_free()
	quit(1)
	return false
