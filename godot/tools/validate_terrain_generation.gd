extends "res://tools/validate_map_paint_workflow.gd"

class GenerationBridge extends "res://src/native_bridge.gd":
	var writes := 0
	var lose_apply := false
	var reject_apply := false
	func _request(method: String, params: Dictionary) -> Dictionary:
		if method == "terrain-generation.apply" and reject_apply:
			reject_apply = false
			return {"ok":false, "error":"Controlled generation rejection"}
		var response: Dictionary = super._request(method, params)
		if method == "terrain-generation.apply" and response.get("ok", false):
			writes += 1
			if lose_apply:
				lose_apply = false
				return {"ok":false, "outcomeUnknown":true, "error":"Controlled generated terrain reply loss"}
		return response


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 1 or not args[0].contains("terrain-generation"):
		push_error("A caller-owned terrain-generation fixture is required"); quit(1); return
	var prior := OS.get_environment("PROVIDENCE_PROJECT_PATH")
	OS.set_environment("PROVIDENCE_PROJECT_PATH", "")
	root.size = Vector2i(1600, 900); root.gui_embed_subwindows = true
	var shell: Control = load("res://src/editor_shell.tscn").instantiate()
	shell.set_script(CheckedShell); root.add_child(shell)
	await shell.startup_completed
	shell._bridge.stop(); shell._bridge = GenerationBridge.new(args[0].path_join("generation-settings.cfg"))
	var project: String = args[0].path_join("scenario")
	var opened: Dictionary = shell._bridge.start_project(project)
	if _check(opened.get("ok", false), "Native generation fixture could not open: " + str(opened.get("error", ""))):
		await shell._activate_session(opened)
		await shell._maps.document.load_map("land:0"); await shell._navigation.select_tab(1)
		await _selection_and_preview(shell)
		if not _failed: await _apply_and_recover(shell)
		if not _failed: await _cancel_and_persist(shell, project)
	shell.free(); await _frames(3)
	OS.set_environment("PROVIDENCE_PROJECT_PATH", prior)
	if not _failed: print("PROVIDENCE_TERRAIN_GENERATION_NATIVE_OK drawing locks subtraction preview before routes apply rejection original-result no-replay cancellation history reopen teardown")
	quit(1 if _failed else 0)


func _settled_generation(shell) -> void:
	var deadline := Time.get_ticks_msec() + 20000
	while shell._operations.busy or shell._maps.land_authoring.has_mask_gesture():
		if Time.get_ticks_msec() > deadline: _check(false, "Terrain workflow did not settle"); return
		await create_timer(0.02).timeout
	await _frames(3)


func _draw_rectangle(shell, first: Vector2i, last: Vector2i) -> void:
	var overlay: Control = shell._workbenches.land.get_node("%LandAreaOverlay")
	var canvas: ProvidenceMapCanvas = overlay.get_parent()
	var press := InputEventMouseButton.new(); press.button_index = MOUSE_BUTTON_LEFT; press.pressed = true
	press.position = canvas.cell_rect(first).get_center(); overlay._gui_input(press)
	var move := InputEventMouseMotion.new(); move.position = canvas.cell_rect(last).get_center()
	overlay._gui_input(move)
	var release := InputEventMouseButton.new(); release.button_index = MOUSE_BUTTON_LEFT
	release.position = move.position; overlay._gui_input(release)
	await _settled_generation(shell)


func _selection_and_preview(shell) -> void:
	var controller = shell._maps.terrain_generation
	var view: Control = controller.view
	var before := _tiles(shell, "land:0")
	await controller.open(); await _settled_generation(shell)
	_check(view.context.available, "Reviewed native artwork was unavailable")
	view.get_node("%GenerationFamily").select(1); view.get_node("%GenerationFamily").item_selected.emit(1)
	view.get_node("%GenerationSeed").value = 123
	await _draw_rectangle(shell, Vector2i(20,20), Vector2i(43,43))
	_check(view.mask.size() == 576 and _tiles(shell, "land:0") == before, "Drawing area wrote terrain or selected the wrong cells")
	view.get_node("%GenerationTarget").select(1); view.get_node("%GenerationTarget").item_selected.emit(1)
	await _draw_rectangle(shell, Vector2i(22,22), Vector2i(23,23))
	_check(view.locks.size() == 4, "Drawing Locks did not protect four cells")
	view.get_node("%GenerationCombine").select(2); view.get_node("%GenerationCombine").item_selected.emit(2)
	await _draw_rectangle(shell, Vector2i(23,23), Vector2i(23,23))
	_check(view.locks.size() == 3, "Subtract did not remove the selected lock")
	view.get_node("%AddGenerationRoute").pressed.emit()
	view.get_node("%RouteToX").value = 38; view.get_node("%AddGenerationRoute").pressed.emit()
	await controller.check_routes()
	_check(view.connections.size() == 2 and view.selected_route().get("status", "") == "connected", "Current walking routes were not inspected")
	var result: Dictionary = await controller.generate()
	_check(result.get("ok", false) and view.can_apply(), "Native generation did not produce an applicable preview: " + str(result))
	_check(_tiles(shell, "land:0") == before, "Generate changed authored terrain before Apply")
	view.get_node("%GenerationBefore").button_pressed = true
	_check(view.display_plan().get("terrainCells", []).is_empty(), "Show Before retained prospective artwork")
	view.get_node("%GenerationBefore").button_pressed = false
	await controller.check_routes()
	_check(not view.can_apply() and view.display_plan().get("terrainCells", []).is_empty(), "Checking current terrain retained a different prospective Apply result")
	await controller.generate()
	for viewport in [Vector2i(1920,1080), Vector2i(1600,900)]:
		root.size = viewport; await _frames(3)
		_check(view.get_global_rect().encloses(view.get_node("%ApplyGeneration").get_global_rect()), "Generation footer overflowed the certified viewport")
	controller.discard_draft(); await controller.open()
	_check(view.mask.size() == 576 and view.locks.size() == 3 and int(view.get_node("%GenerationSeed").value) == 123, "Cancel/reopen lost the local generation draft")
	await controller.generate()


func _apply_and_recover(shell) -> void:
	var controller = shell._maps.terrain_generation
	var view: Control = controller.view
	var before := _tiles(shell, "land:0")
	shell._bridge.reject_apply = true
	var rejected: Dictionary = await controller.commit_selected()
	_check(not rejected.get("ok", false) and _tiles(shell, "land:0") == before and view.can_apply(), "Rejected generation changed terrain or lost its reviewed draft")
	var revision: int = shell._session_view.revision
	var applied: Dictionary = await controller.commit_selected()
	_check(applied.get("ok", false) and shell._session_view.revision == revision + 1, "Generated terrain was not one native command")
	var after := _tiles(shell, "land:0")
	_check(after != before, "Applying generation did not change terrain")
	await shell._undo(); await _settled_generation(shell)
	_check(_tiles(shell, "land:0") == before, "Undo did not restore exact prior terrain")
	await shell._redo(); await _settled_generation(shell)
	_check(_tiles(shell, "land:0") == after, "Redo did not restore generated terrain")
	await controller.open()
	view.get_node("%GenerationTarget").select(0); view.get_node("%GenerationTarget").item_selected.emit(0)
	var recovery_mask: Array = []
	for y in range(50, 56):
		for x in range(50, 56): recovery_mask.append({"x":x, "y":y})
	view.accept_selection(recovery_mask)
	view.get_node("%GenerationDensity").select(2); view.get_node("%GenerationDensity").item_selected.emit(2)
	view.get_node("%GenerationSeed").value = 47
	view.connections.clear(); view.invalidate()
	await controller.generate()
	_check(view.can_apply(), "Recovery fixture did not generate changed terrain")
	shell._bridge.lose_apply = true
	var writes: int = shell._bridge.writes
	var lost: Dictionary = await controller.commit_selected()
	_check(lost.get("outcomeUnknown", false) and not view.can_apply() and view.get_node("%RecoverGeneration").visible, "Lost response did not expose original-operation recovery")
	await controller.check_original()
	_check(shell._bridge.writes == writes + 1 and not controller.has_unapplied_changes(), "Recovery replayed Apply or failed to reconcile the committed result")


func _cancel_and_persist(shell, project: String) -> void:
	var controller = shell._maps.terrain_generation
	await controller.open()
	controller.view.get_node("%GenerationTarget").select(0)
	controller.view.accept_selection([])
	for y in 90:
		for x in 90: controller.view.mask.append({"x":x,"y":y})
	controller.view.invalidate()
	var before := _tiles(shell, "land:0")
	controller.generate.call_deferred()
	await create_timer(0.02).timeout
	controller.view.get_node("%CancelGeneration").pressed.emit()
	await _settled_generation(shell)
	_check(_tiles(shell, "land:0") == before and not controller.view.can_apply(), "Cancel accepted a late generated result")
	controller.generate.call_deferred()
	await create_timer(0.02).timeout
	controller.discard_draft(false)
	await _settled_generation(shell)
	_check(not controller.is_open() and not controller.view.visible and _tiles(shell, "land:0") == before, "Discarded map context accepted a late generated preview")
	await shell._project_session.save()
	var reopened: Dictionary = shell._bridge.start_project(project)
	_check(reopened.get("ok", false), "Generated project could not reopen")
	await shell._activate_session(reopened); await shell._maps.document.load_map("land:0")
	_check(_tiles(shell, "land:0") == before, "Applied terrain did not survive native Save/reopen")
