extends "res://tools/validate_map_paint_behavior.gd"

class SmartBridge extends BehaviorBridge:
	var smart_writes := 0
	var reject_smart := false
	var lose_smart := false
	var lose_preview := false
	var lose_selection := false
	func _request(method: String, params: Dictionary) -> Dictionary:
		if method == "smart-terrain.apply" and reject_smart:
			reject_smart = false; return {"ok":false,"error":"Controlled Smart terrain rejection"}
		var response: Dictionary = super._request(method,params)
		if method == "map.selection-preview" and lose_selection:
			lose_selection = false; return {"ok":false,"outcomeUnknown":true,"error":"Controlled Smart selection reply loss"}
		if method == "smart-terrain.preview" and lose_preview:
			lose_preview = false; return {"ok":false,"outcomeUnknown":true,"error":"Controlled Smart preview reply loss"}
		if method == "smart-terrain.apply" and response.get("ok",false):
			smart_writes += 1
			if lose_smart: lose_smart = false; return {"ok":false,"outcomeUnknown":true,"error":"Controlled Smart reply loss"}
		return response


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 1 or not args[0].get_file().begins_with("providence-ui-paint-"): push_error("A disposable smart terrain root is required"); quit(1); return
	var prior := OS.get_environment("PROVIDENCE_PROJECT_PATH"); OS.set_environment("PROVIDENCE_PROJECT_PATH","")
	root.size = Vector2i(1600,900); root.gui_embed_subwindows = true
	var shell: Control = load("res://src/editor_shell.tscn").instantiate(); shell.set_script(CheckedShell); root.add_child(shell)
	await _frames(3); shell._bridge.stop(); shell._bridge = SmartBridge.new(args[0].path_join("smart-settings.cfg"))
	var project: String = args[0].path_join("smart-project")
	var created: Dictionary = shell._bridge.create_project("smart-terrain",project)
	if _check(created.get("ok",false),"Smart terrain project creation failed"):
		await shell._activate_session(created)
		if await _setup(shell):
			await _mask_gestures(shell); await _smart_apply(shell)
			await _smart_recovery(shell); await _selection_recovery(shell); await _smart_unavailable(shell)
			await _smart_persistence(shell,project)
	shell.free(); await _frames(2); OS.set_environment("PROVIDENCE_PROJECT_PATH",prior)
	if not _failed: print("PROVIDENCE_MAP_PAINT_SMART_OK reviewed-topology mouse-keyboard-mask pure-preview morphology unresolved artwork-replaced cancel-retained one-history failed-draft original-result no-replay read-only-recovery stale unavailable save-reopen teardown")
	quit(1 if _failed else 0)


func _mask_gestures(shell) -> void:
	var controller = shell._maps.smart_terrain; var window = controller.view
	await controller.open(); await _settle(shell)
	for viewport in [Vector2i(1920,1080),Vector2i(1600,900)]:
		root.size = viewport; await _frames(2); var button: Control = window.get_node("%ApplySmart")
		_check(window.get_global_rect().encloses(button.get_global_rect()),"Smart footer overflowed its inline inspector")
	window.get_node("%MaskShape").select(2)
	window.get_node("%MaskShape").item_selected.emit(2)
	window.get_node("%MaskCombine").select(0); window.get_node("%MaskCombine").item_selected.emit(0)
	var before := _tiles(shell); var revision: int = shell._session_view.revision
	await _frames(2)
	var overlay: Control = shell._maps.land_authoring._overlay; var canvas: ProvidenceMapCanvas = overlay.get_parent()
	var event := InputEventMouseButton.new(); event.button_index = MOUSE_BUTTON_LEFT; event.pressed = true
	event.position = canvas.cell_rect(Vector2i(3,3)).get_center(); overlay._gui_input(event)
	var move := InputEventMouseMotion.new(); move.position = canvas.cell_rect(Vector2i(6,5)).get_center(); overlay._gui_input(move)
	event.pressed = false; event.position = move.position; overlay._gui_input(event); await _settle(shell)
	_check(window.visible and window.mask.size() == 12 and _tiles(shell) == before and shell._session_view.revision == revision,"Pointer mask wrote early or missed cells")
	var previous: Array = window.mask.duplicate(true)
	await _frames(2)
	var key := InputEventKey.new(); key.pressed = true; key.keycode = KEY_ENTER; overlay._gui_input(key)
	key.keycode = KEY_RIGHT; overlay._gui_input(key); key.keycode = KEY_ESCAPE; overlay._gui_input(key); await _settle(shell)
	_check(window.visible and window.mask == previous,"Escape changed the accepted Smart mask")
	await _frames(2)
	key.keycode = KEY_ENTER; overlay._gui_input(key); key.keycode = KEY_RIGHT; overlay._gui_input(key)
	key.keycode = KEY_ENTER; overlay._gui_input(key); await _settle(shell)
	_check(window.visible and window.mask.size() == 2,"Keyboard mask acceptance did not mirror pointer controls")
	window.cancel(); await _frames(2)
	_check(_tiles(shell) == before and shell._maps.chrome.land_inspector.visible and shell._maps.chrome._sidebar.get_node("%SmartTool").has_focus(),"Smart Cancel wrote terrain or lost origin focus")
	await controller.open(); await _settle(shell)
	_check(window.mask.size() == 2,"Smart Cancel did not retain its map-local mask")
	controller.discard_draft()
	shell._maps.land_authoring.options.match = "connected-behavior"
	await controller.open(); await _settle(shell)
	window.get_node("%MaskShape").select(4)
	window.get_node("%MaskShape").item_selected.emit(4); await _frames(2)
	_check(shell._maps.land_authoring.options.match == "connected-exact", "Connected Smart mask inherited prior Paint matching")
	controller.discard_draft()
	_check(shell._maps.land_authoring.options.match == "connected-behavior", "Smart mask did not restore Paint matching")


func _smart_apply(shell) -> void:
	var controller = shell._maps.smart_terrain; var window = controller.view
	await controller.open(); await _settle(shell)
	window.get_node("%TerrainFamily").select(0)
	window.accept_mask([{"x":3,"y":3},{"x":4,"y":3},{"x":5,"y":3},{"x":6,"y":3}])
	var before := _tiles(shell); var revision: int = shell._session_view.revision
	await controller.review()
	_check(window.review_is_current() and window.review_plan().protectedCells.is_empty() and _tiles(shell) == before,"Smart preview excluded selected artwork or wrote before Apply")
	await controller.reshape("grow"); _check(window.mask.size() > 4 and shell._session_view.revision == revision,"Grow wrote terrain or failed to expand the mask")
	await controller.reshape("shrink"); await controller.review()
	var response: Dictionary = await controller.commit_selected(); await _settle(shell)
	_check(response.get("ok",false) and shell._session_view.revision == revision + 1,"Smart Apply was not one acknowledged command")
	var painted := _tiles(shell)
	_check(painted[274] != -3112 and painted[273] != before[273],"Smart Apply retained selected Special artwork or decorative tiles")
	_check(int(painted[276])/1000 == int(before[276])/1000,"Smart Apply changed ordinary marker metadata")
	await shell._undo(); _check(_tiles(shell) == before,"Smart Undo did not restore exact cells")
	await shell._redo(); _check(_tiles(shell) == painted,"Smart Redo did not restore exact cells")
	await controller.open(); await _settle(shell)
	window.get_node("%TerrainFamily").select(2); window.accept_mask([{"x":40,"y":40}]); await controller.review()
	_check(not window.get_node("%ApplySmart").disabled and window.counts.text.contains("1 transition warnings"),"Approximate edge needs a warning and enabled Apply")
	var warning_plan: Dictionary = window.review_plan()
	var warned: Dictionary = await controller.commit_selected(); await _settle(shell)
	_check(warned.get("ok",false) and _tiles(shell)[40*90+40]==int(warning_plan.paintedCells[0].tile),"Warning Apply did not commit the previewed tile")
	await shell._undo(); _check(_tiles(shell)==painted,"Warning Apply Undo changed unrelated cells")
	await controller.open(); await _settle(shell)
	await controller.reshape("clear"); _check(window.mask.is_empty() and window.get_node("%ApplySmart").disabled,"Clear mask left stale acceptance")
	controller.discard_draft()


func _smart_recovery(shell) -> void:
	var controller = shell._maps.smart_terrain; var window = controller.view
	await controller.open(); await _settle(shell); window.get_node("%TerrainFamily").select(0)
	window.accept_mask([{"x":30,"y":30},{"x":31,"y":30},{"x":32,"y":30}]); await controller.review()
	var draft: Dictionary = window.draft(); shell._bridge.reject_smart = true
	var rejected: Dictionary = await controller.commit_selected()
	_check(not rejected.get("ok",false) and window.draft() == draft and window.visible,"Rejected Smart write lost its complete draft")
	shell._bridge.lose_smart = true; var writes: int = shell._bridge.smart_writes
	var lost: Dictionary = await controller.commit_selected()
	_check(lost.get("outcomeUnknown",false) and window.get_node("%RecoverSmart").visible and window.get_node("%ApplySmart").disabled,"Uncertain Smart write did not lock acceptance")
	await controller.check_original(); await _settle(shell)
	_check(not window.visible and shell._bridge.smart_writes == writes + 1,"Smart recovery replayed the mutation or lost its original result")
	await controller.open(); await _settle(shell)
	_check(window.mask.is_empty() and shell._maps.land_authoring.selected.is_empty(),"Confirmed committed recovery retained the old mask")
	window.accept_mask([{"x":50,"y":50},{"x":51,"y":50}]); shell._bridge.lose_preview = true
	await controller.review(); _check(window.get_node("%RecoverSmart").visible,"Lost read preview had no recovery path")
	writes = shell._bridge.smart_writes; await controller.check_original(); await _settle(shell)
	_check(window.visible and not window.get_node("%RecoverSmart").visible and shell._bridge.smart_writes == writes,"Read-only Smart recovery wrote or lost the mask")
	await shell._maps.document.load_map("land:0"); await _settle(shell)
	var stale: Dictionary = await controller.commit_selected()
	_check(not window.visible and not stale.get("ok",false),"Stale Smart destination remained authorable")


func _smart_unavailable(shell) -> void:
	var response: Dictionary = shell._bridge.request("map.open",{"identity":"land:0"})
	var runtime: Dictionary = response.result.map.runtime.duplicate(true); runtime.landlook = 4; runtime.tilesetId = "classic.landlook.4"
	_mutate(shell,"map-runtime.set",{"identity":"land:0","metadata":_integer_fields(runtime)})
	await shell._maps.document.load_map("land:0"); await _settle(shell)
	var controller = shell._maps.smart_terrain; await controller.open(); await _settle(shell)
	_check(not controller.view.context.available and controller.view.get_node("%ApplySmart").disabled and not str(controller.view.context.get("unavailableReason", "")).is_empty(),"Unsupported Landlook claimed Smart availability")
	controller.discard_draft()


func _selection_recovery(shell) -> void:
	await shell._maps.document.load_map("land:1"); await _settle(shell)
	var controller = shell._maps.smart_terrain; await controller.open(); await _settle(shell)
	var author = shell._maps.land_authoring; var before := _tiles(shell)
	var mask: Array = controller.view.mask.duplicate(true)
	shell._bridge.lose_selection = true
	author._overlay.gesture_started.emit(Vector2i(60,60))
	author._overlay.gesture_finished.emit(Vector2i(60,60),Vector2i(63,63),[Vector2i(60,60),Vector2i(63,63)])
	await _settle(shell)
	_check(controller.view.get_node("%RecoverSmart").visible and controller.view.get_node("%ApplySmart").disabled and author._overlay._locked,"Lost selection read did not lock the Smart recovery surface")
	_check(controller.view.mask==mask,"Lost selection read changed the accepted mask")
	await controller.check_original(); await _settle(shell)
	_check(author._overlay.active and not author._overlay._locked and not controller.view.get_node("%RecoverSmart").visible,"Selection recovery did not restore continuous drawing")
	_check(_tiles(shell)==before,"Selection read recovery changed terrain")
	controller.discard_draft()


func _smart_persistence(shell, path: String) -> void:
	await shell._maps.document.load_map("land:1"); await _settle(shell); var before := _tiles(shell)
	await shell._project_session.save(); var reopened: Dictionary = shell._bridge.start_project(path)
	_check(reopened.get("ok",false),"Smart terrain project did not reopen")
	await shell._activate_session(reopened); await shell._maps.document.load_map("land:1"); await _settle(shell)
	_check(_tiles(shell) == before,"Smart terrain cells were lost on Save/reopen")
