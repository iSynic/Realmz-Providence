extends "res://tools/validate_map_paint_behavior.gd"

class CreationBridge extends BehaviorBridge:
	var creation_writes := 0
	var lose_creation := false
	var reject_creation := false
	var lose_review := false
	func _request(method: String, params: Dictionary) -> Dictionary:
		if method in ["map.create","map.duplicate"] and reject_creation:
			reject_creation = false; return {"ok":false,"error":"Controlled map creation rejection"}
		var response: Dictionary = super._request(method,params)
		if method == "map.creation-review" and lose_review:
			lose_review = false; return {"ok":false,"outcomeUnknown":true,"error":"Controlled allocation preview reply loss"}
		if method in ["map.create","map.duplicate"] and response.get("ok",false):
			creation_writes += 1
			if lose_creation: lose_creation = false; return {"ok":false,"outcomeUnknown":true,"error":"Controlled creation reply loss"}
		return response


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 1 or not args[0].get_file().begins_with("providence-ui-paint-"): push_error("A disposable creation root is required"); quit(1); return
	var prior := OS.get_environment("PROVIDENCE_PROJECT_PATH"); OS.set_environment("PROVIDENCE_PROJECT_PATH","")
	root.size = Vector2i(1600,900); root.gui_embed_subwindows = true
	var shell: Control = load("res://src/editor_shell.tscn").instantiate(); shell.set_script(CheckedShell); root.add_child(shell)
	await _frames(3); shell._bridge.stop(); shell._bridge = CreationBridge.new(args[0].path_join("creation-settings.cfg"))
	var project: String = args[0].path_join("creation-project")
	var created: Dictionary = shell._bridge.create_project("creation-review",project)
	if _check(created.get("ok",false),"Creation project could not open"):
		await shell._activate_session(created)
		if await _setup(shell):
			await _creation_review(shell); await _creation_recovery(shell)
			await _layout_discovery(shell); await _creation_persistence(shell,project)
	shell.free(); await _frames(2); OS.set_environment("PROVIDENCE_PROJECT_PATH",prior)
	if not _failed: print("PROVIDENCE_MAP_PAINT_CREATION_OK pure-allocation cancel-focus explicit-copy-impact one-history failed-draft original-result no-replay read-only-recovery stale layout-artwork search-empty current-selection neighbors linked-return save-reopen teardown")
	quit(1 if _failed else 0)


func _creation_review(shell) -> void:
	var controller = shell._maps.lifecycle; var window = controller.view
	var revision: int = shell._session_view.revision; var before := _tiles(shell)
	await controller.review_duplicate_map("land:1")
	_check(window.visible and window.get_node("%CreationImpact").text.contains("8100 cells copied") and shell._session_view.revision == revision,"Duplicate review wrote early or omitted its copy impact")
	window.cancel(); await _frames(2)
	_check(not controller.has_unapplied_changes() and _tiles(shell) == before and controller._sidebar.get_node("%DuplicateMap").has_focus(),"Duplicate Cancel wrote or lost focus")
	await controller.review_duplicate_map("land:1"); var response: Dictionary = await controller.apply_review(); await _settle(shell)
	_check(response.get("ok",false) and shell._maps.document.identity == "land:2" and shell._session_view.revision == revision + 1,"Duplicate did not create one reviewed allocation")
	var opened: Dictionary = shell._bridge.request("map.open",{"identity":"land:2"})
	_check(opened.result.actionPoints.is_empty() and opened.result.map.runtime.randomRectangles.is_empty(),"Duplicate copied Action Points or encounter regions")
	_check((int(opened.result.map.tiles[273]) & 0x6000) == 0x6000,"Duplicate erased unrelated note/path metadata")
	await shell._undo(); _check(shell._maps.document.maps.size() == 2,"Creation Undo did not restore allocation")
	await shell._redo(); _check(shell._maps.document.maps.size() == 3,"Creation Redo lost allocation")
	await controller.review_create_map("land"); await shell._maps.document.load_map("land:0"); await _settle(shell)
	_check(not window.visible and not controller.has_unapplied_changes(),"Navigation retained stale map allocation acceptance")


func _creation_recovery(shell) -> void:
	var controller = shell._maps.lifecycle; var window = controller.view
	await controller.review_create_map("land"); shell._bridge.reject_creation = true
	var rejected: Dictionary = await controller.apply_review()
	_check(not rejected.get("ok",false) and controller.has_unapplied_changes() and window.visible,"Creation rejection lost its allocation draft")
	await controller.review_again(); var writes: int = shell._bridge.creation_writes; shell._bridge.lose_creation = true
	var lost: Dictionary = await controller.apply_review()
	_check(lost.get("outcomeUnknown",false) and window.get_node("%RecoverMapCreation").visible and window.get_node("%ApplyMapCreation").disabled,"Unknown creation was not locked for original-result recovery")
	await controller.check_original(); await _settle(shell)
	_check(not window.visible and shell._maps.document.identity == "land:3" and shell._bridge.creation_writes == writes + 1,"Creation recovery resubmitted or lost its created map")
	shell._bridge.lose_review = true; await controller.review_create_map("dungeon")
	_check(window.visible and window.get_node("%RecoverMapCreation").visible,"Uncertain allocation read hid its recovery path")
	writes = shell._bridge.creation_writes; await controller.check_original(); await _settle(shell)
	_check(window.visible and not window.get_node("%RecoverMapCreation").visible and shell._bridge.creation_writes == writes,"Allocation read recovery created a map")
	window.cancel()
	_check(shell._session_view.connected and not shell._operations.requires_reopen,"Recovered map creation left the session disconnected")


func _layout_discovery(shell) -> void:
	await shell._navigation.select_route("maps.layout"); await _settle(shell)
	var view = shell._workbenches.land_layout; var commands = shell._workbenches.layout_commands
	var palette: ItemList = view.get_node("%LandMapPalette")
	_check(palette.item_count == 4 and palette.get_item_icon(0) != null,"Layout palette did not show source-resolved map artwork: " + str({"count":palette.item_count,"reason":palette.get_item_tooltip(0) if palette.item_count > 0 else "empty","revision":view.catalog_revision,"current":shell._session_view.revision,"errors":shell.reported_errors}))
	view.get_node("%LayoutSearch").text = "no-match"; view.get_node("%LayoutSearch").text_changed.emit("no-match")
	_check(palette.item_count == 0 and view.get_node("%LayoutNoResults").visible,"Layout empty search retained stale rows")
	view.get_node("%LayoutSearch").text = "Land 01"; view.get_node("%LayoutSearch").text_changed.emit("Land 01"); await _settle(shell)
	_check(palette.item_count == 1 and str(palette.get_item_metadata(0)) == "land:1","Layout name/number search lost exact map identity: " + str({"count":palette.item_count,"query":view.get_node("%LayoutSearch").text,"rows":view._maps}))
	await commands.set_cell(1,1,"land:1"); await commands.apply_review()
	await commands.set_cell(1,2,"land:2"); await commands.apply_review(); view._show_selected(1,1)
	_check(not view.get_node("%EastNeighbor").disabled and view.get_node("%EastNeighbor").get_meta("identity") == "land:2" and view.get_node("%EastNeighbor").icon != null,"Layout neighbors did not follow the authored table")
	view.get_node("%LayoutSearch").grab_focus(); var state: Dictionary = view.read_navigation_state()
	view.get_node("%OpenLinkedLand").pressed.emit(); await _settle(shell)
	await shell._navigation.navigate_back(); await _settle(shell)
	_check(view.read_navigation_state().query == state.query and view.read_navigation_state().row == 1 and view.read_navigation_state().column == 1,"Linked layout return lost the original selection/filter")


func _creation_persistence(shell, path: String) -> void:
	await shell._project_session.save(); var response: Dictionary = shell._bridge.start_project(path)
	_check(response.get("ok",false),"Map creation project did not reopen")
	await shell._activate_session(response); await _settle(shell)
	_check(shell._maps.document.maps.size() == 4,"Map allocations were lost on Save/reopen")
