extends "res://tools/validate_map_paint_smart_input.gd"


class StampBridge extends "res://src/native_bridge.gd":
	var reject := false
	var lose := false
	var writes := 0
	var fail_after_receipt := ""
	var failed_read := ""
	var read_failures := 0
	func _request(method: String, params: Dictionary) -> Dictionary:
		if method == failed_read:
			failed_read = ""; read_failures += 1
			return {"ok": false, "error": "Controlled stamp refresh failure"}
		if method == "map-stamp.apply" and reject:
			reject = false; return {"ok": false, "error": "Controlled stamp rejection"}
		var response: Dictionary = super._request(method, params)
		if method == "world.operation.status" and response.get("result", {}).get("outcome") == "committed" and not fail_after_receipt.is_empty():
			failed_read = fail_after_receipt; fail_after_receipt = ""
		if method == "map-stamp.apply" and response.get("ok", false):
			writes += 1
			if lose: lose = false; return {"ok": false, "outcomeUnknown": true, "error": "Controlled stamp reply loss"}
		return response


func _run() -> void:
	var args:=OS.get_cmdline_user_args()
	if args.is_empty() or not args[0].get_file().begins_with("providence-ui-paint-"): quit(1); return
	if args.size()>1: _capture_root=args[1]
	var prior:=OS.get_environment("PROVIDENCE_PROJECT_PATH"); OS.set_environment("PROVIDENCE_PROJECT_PATH","")
	root.gui_embed_subwindows=true; root.size=Vector2i(1600,900)
	var shell:Control=load("res://src/editor_shell.tscn").instantiate(); shell.set_script(CheckedShell); root.add_child(shell)
	await _frames(3); shell._bridge.stop(); shell._bridge=StampBridge.new(args[0].path_join("stamp-settings.cfg"))
	var path:String=args[0].path_join("stamp-project")
	var created:Dictionary=shell._bridge.create_project("stamp-input",path)
	if _check(created.get("ok",false),"Stamp project creation failed"):
		await shell._activate_session(created)
		if await _setup(shell):
			await _dungeon_setup(shell)
			for viewport in [Vector2i(1920,1080),Vector2i(1600,900)]:
				root.size=viewport; await _frames(4)
				await _land(shell,viewport); await _dungeon(shell,viewport)
			await _saved_cells(shell,path)
	shell.free(); await _frames(2); OS.set_environment("PROVIDENCE_PROJECT_PATH",prior)
	if not _failed: print("PROVIDENCE_MAP_PAINT_STAMP_INPUT_OK real-pointer real-artwork hover release repeated escape invalid artwork-replaced metadata-retained no-popup atomic-history rejected-retry-discard uncertain-no-replay active-context save-reopen land-dungeon both-sizes")
	quit(1 if _failed else 0)


func _land(shell,viewport:Vector2i) -> void:
	_check(_mutate(shell,"map.update-cell",{"identity":"land:1","x":4,"y":3,"tile":-3112}),"Land artwork replacement seed failed")
	await shell._maps.document.load_map("land:1"); await shell._navigation.select_route("maps.land"); await _settle(shell)
	var resources=shell._maps.paint_resources
	resources.open("stamp"); await _settle(shell)
	await resources._open_entry("preset:tree-pair-151-152"); await _capture("stamp-search",viewport)
	resources._window._use(); await _settle(shell)
	var canvas:Control=shell._workbenches.land.get_node("%LandMapCanvas")
	var author=shell._maps.land_authoring
	var start:=Vector2i(20,20) if viewport.x==1920 else Vector2i(25,25)
	var before:=_tiles(shell); var revision:int=shell._session_view.revision
	_mouse(canvas,start,false); await _settle(shell)
	_check(not author._review.visible and not author._overlay.painted.is_empty() and _tiles(shell)==before,"Land stamp hover failed its visible pure preview")
	_check_stamp_context(shell, false)
	await _capture("land-stamp-preview",viewport)
	await _stroke(shell,start,start)
	_check(shell._session_view.revision==revision+1 and not author._review.visible and author._overlay.active,"Land release did not place once and retain the stamp")
	var after:=_tiles(shell)
	_check(after[start.y*90+start.x]!=before[start.y*90+start.x],"Land stamp disappeared after its preview was cleared")
	await shell._undo(); await _settle(shell); _check(_tiles(shell)==before,"Land stamp Undo failed")
	await shell._redo(); await _settle(shell); _check(_tiles(shell)==after,"Land stamp Redo failed")
	await _escape_stroke(shell,start+Vector2i(5,0)); _check(_tiles(shell)==after,"Escape placed a Land stamp")
	await _stroke(shell,start+Vector2i(4,0),start+Vector2i(4,0))
	_check(shell._session_view.revision==revision+4,"Repeated Land placement lost selection or created extra history")
	var kept:=_tiles(shell); revision=shell._session_view.revision
	await _stroke(shell,Vector2i(4,3),Vector2i(4,3))
	_check(_tiles(shell)!=kept and shell._session_view.revision==revision+1 and not author._review.visible,"Land stamp did not overwrite selected artwork directly")
	await _capture("land-stamp-overwrite",viewport)
	await _stamp_faults(shell, canvas, false, start + Vector2i(7, 0), viewport)
	kept = _tiles(shell)
	canvas.reveal_cell(89,89); await _frames(4)
	_mouse(canvas,Vector2i(89,89),false); await _settle(shell)
	_check(not author._overlay.protected.is_empty() and _tiles(shell)==kept,"Out-of-bounds stamp did not remain an invalid preview")
	await _capture("land-stamp-outside",viewport)


func _dungeon_setup(shell) -> void:
	_check(_mutate(shell,"map.create",{"levelType":"dungeon"}),"Dungeon stamp map creation failed")
	_check(_mutate(shell,"dungeon-cell.apply-features",{"identity":"dungeon:0","edit":{"cells":[{"x":8,"y":8}],"changes":[{"primitive":"wall","enabled":true},{"primitive":"column","enabled":true}]}}),"Dungeon stamp seed failed")
	_check(_mutate(shell,"action-point.create",{"mapIdentity":"dungeon:0","x":12,"y":12}),"Dungeon protected AP seed failed")
	_check(_mutate(shell,"action-point.create",{"mapIdentity":"dungeon:0","x":13,"y":12}),"Compact Dungeon AP seed failed")
	await shell._reload_map_catalog(); await shell._maps.document.load_map("dungeon:0"); await shell._navigation.select_route("maps.dungeon")
	var selected:Dictionary=shell._bridge.request("dungeon-cell.selection",{"identity":"dungeon:0","cells":[{"x":8,"y":8}]})
	shell._workbenches.dungeon.set_selection_projection(selected.result)
	var resources=shell._maps.paint_resources
	resources.open("stamp"); await _settle(shell); await resources._capture()
	resources._window.get_node("%ResourceName").text="Courtyard column"
	await resources.commit_selected(); await _settle(shell); resources._window.close()


func _dungeon(shell,viewport:Vector2i) -> void:
	await shell._maps.document.load_map("dungeon:0"); await shell._navigation.select_route("maps.dungeon"); await _settle(shell)
	var resources=shell._maps.paint_resources
	resources.open("stamp"); await _settle(shell); await resources._query("Courtyard column","stamp",0)
	var entries:ItemList=resources._window.get_node("%Entries")
	await resources._open_entry(str(entries.get_item_metadata(0))); resources._window._use(); await _settle(shell)
	var canvas:Control=shell._workbenches.dungeon.get_node("%DungeonMapCanvas")
	var stamps=shell._maps.dungeon_stamps
	var start:=Vector2i(20,20) if viewport.x==1920 else Vector2i(25,25)
	canvas.restore_navigation_state({"zoom":2,"pan":[0,0],"cell":[start.x,start.y],"showActionPoints":true})
	canvas.reveal_cell(start.x,start.y); await _frames(3)
	var before:=_map_tiles(shell,"dungeon:0"); var revision:int=shell._session_view.revision
	_mouse(canvas,start,false); await _settle(shell)
	_check(not stamps._review.visible and not stamps._overlay.preview.is_empty() and _map_tiles(shell,"dungeon:0")==before,"Dungeon stamp hover failed its pure preview")
	_check_stamp_context(shell, true)
	await _capture("dungeon-stamp-preview",viewport)
	await _release_stamp(shell,canvas,start)
	var after:=_map_tiles(shell,"dungeon:0")
	_check(after!=before and shell._session_view.revision==revision+1 and stamps._overlay.active and not stamps._review.visible,"Dungeon release did not persist or retain its tool")
	await shell._undo(); await _settle(shell); _check(_map_tiles(shell,"dungeon:0")==before,"Dungeon stamp Undo failed")
	await shell._redo(); await _settle(shell); _check(_map_tiles(shell,"dungeon:0")==after,"Dungeon stamp Redo failed")
	await _release_stamp(shell,canvas,start+Vector2i(2,0))
	_check(shell._session_view.revision==revision+4,"Repeated Dungeon stamp did not create exactly one history entry")
	await _stamp_faults(shell, canvas, true, start + Vector2i(7, 0), viewport)
	await _dungeon_marked(shell,canvas,viewport)


func _mouse(canvas:Control,cell:Vector2i,down:bool) -> void:
	var event:=InputEventMouseMotion.new()
	event.position=canvas.get_global_transform()*canvas.cell_rect(cell).get_center(); event.global_position=event.position
	event.button_mask=MOUSE_BUTTON_MASK_LEFT if down else 0
	root.push_input(event,true)


func _release_stamp(shell,canvas:Control,cell:Vector2i) -> void:
	var event:=InputEventMouseButton.new(); event.button_index=MOUSE_BUTTON_LEFT
	event.position=canvas.get_global_transform()*canvas.cell_rect(cell).get_center(); event.global_position=event.position
	event.pressed=true; root.push_input(event,true); await process_frame
	event=event.duplicate(); event.pressed=false; root.push_input(event,true); await _settle(shell)


func _map_tiles(shell,identity:String) -> Array:
	return shell._bridge.request("map.open",{"identity":identity}).result.map.tiles


func _saved_cells(shell,path:String) -> void:
	var expected:Dictionary={"land:1":_map_tiles(shell,"land:1"),"dungeon:0":_map_tiles(shell,"dungeon:0")}
	await shell._project_session.save()
	var reopened:Dictionary=shell._bridge.start_project(path)
	if not _check(reopened.get("ok",false),"Stamp project did not reopen"): return
	await shell._activate_session(reopened)
	for identity in expected:
		await shell._maps.document.load_map(identity); await _settle(shell)
		_check(_map_tiles(shell,identity)==expected[identity],"Stamp cells disappeared after Save/reopen: "+identity)
	_check(shell._bridge.read_failures == 8 and shell.reported_errors.size() == 28 and shell.reported_errors.all(func(error): return error in ["Controlled stamp rejection", "Controlled stamp reply loss"] or error.contains("Controlled stamp refresh failure")),"Stamp input reported unexpected errors: "+str(shell.reported_errors))


func _settle(shell) -> void:
	var stable:=0; var deadline:=Time.get_ticks_msec()+20000
	while Time.get_ticks_msec()<deadline:
		await process_frame
		var author=shell._maps.land_authoring; var dungeon=shell._maps.dungeon_stamps
		var idle:bool=not shell._operations.busy and not shell._bridge.operation_busy() and not author._reading and not author._placing_stamp and not dungeon._reading and not dungeon._placing
		stable=stable+1 if idle else 0
		if stable>=8: return
	_check(false,"Stamp input did not settle")


func _dungeon_marked(shell,canvas:Control,viewport:Vector2i) -> void:
	var cell := Vector2i(12 if viewport.x==1920 else 13,12)
	var index := cell.y*90+cell.x
	canvas.reveal_cell(cell.x,cell.y); await _frames(3)
	var before:=_map_tiles(shell,"dungeon:0")
	var revision: int = shell._session_view.revision
	_mouse(canvas,cell,false); await _settle(shell)
	await _release_stamp(shell,canvas,cell)
	var after:=_map_tiles(shell,"dungeon:0")
	_check(after!=before and shell._session_view.revision==revision+1,"Marked Dungeon destination was not overwritten")
	_check(int(after[index]) & 0x9060 == int(before[index]) & 0x9060,"Dungeon stamp changed AP or Note ownership")
	await _capture("dungeon-stamp-metadata",viewport)
	await shell._undo(); await _settle(shell); _check(_map_tiles(shell,"dungeon:0")==before,"Marked Dungeon Undo did not restore exact cells")
	await shell._redo(); await _settle(shell); _check(_map_tiles(shell,"dungeon:0")==after,"Marked Dungeon Redo did not restore exact cells")


func _check_stamp_context(shell, is_dungeon: bool) -> void:
	var view = shell._maps.chrome.stamps.dungeon if is_dungeon else shell._maps.chrome.stamps.land
	_check(shell._map_context_sidebar.get_node("%StampTool").button_pressed and not shell._map_context_sidebar.get_node("%SelectTool").button_pressed, "Armed stamp did not own the visible active-tool indicator")
	_check(view.is_visible_in_tree() and not view.get_node("%StampName").text.is_empty() and not view.get_node("%PlacementStatus").text.is_empty(), "Stamp context or placement feedback was hidden")


func _stamp_faults(shell, canvas: Control, is_dungeon: bool, cell: Vector2i, viewport: Vector2i) -> void:
	var identity := "dungeon:0" if is_dungeon else "land:1"
	var name := "dungeon" if is_dungeon else "land"
	var controller = shell._maps.dungeon_stamps if is_dungeon else shell._maps.land_authoring
	var view = shell._maps.chrome.stamps.dungeon if is_dungeon else shell._maps.chrome.stamps.land
	var before := _map_tiles(shell, identity); var revision: int = shell._session_view.revision
	canvas.reveal_cell(cell.x, cell.y); await _frames(3)
	shell._bridge.reject = true
	await _release_stamp(shell, canvas, cell)
	_check(controller.has_unapplied_changes() and _map_tiles(shell, identity) == before and shell._session_view.revision == revision, "Rejected stamp lost its draft or mutated the map")
	_check(view.get_node("%RetryPlacement").is_visible_in_tree() and not view.get_node("%RetryPlacement").disabled and view.get_node("%DiscardPlacement").is_visible_in_tree(), "Rejected stamp hid its recovery controls")
	await _capture(name + "-stamp-failed-write", viewport)
	_click(view.get_node("%RetryPlacement")); await _settle(shell)
	_check(not controller.has_unapplied_changes() and shell._session_view.revision == revision + 1 and _map_tiles(shell, identity) != before, "Explicit stamp Retry did not commit exactly once")
	cell += Vector2i(3, 0); before = _map_tiles(shell, identity); revision = shell._session_view.revision
	shell._bridge.reject = true; await _release_stamp(shell, canvas, cell)
	_click(view.get_node("%DiscardPlacement")); await _settle(shell)
	_check(not controller.has_unapplied_changes() and _map_tiles(shell, identity) == before and shell._session_view.revision == revision, "Stamp Discard changed saved cells or retained its failed draft")
	var writes: int = shell._bridge.writes
	shell._bridge.lose = true; await _release_stamp(shell, canvas, cell)
	_check(controller.has_unapplied_changes() and view.get_node("%CheckPlacement").is_visible_in_tree() and not view.get_node("%DiscardPlacement").visible, "Unknown stamp did not retain and lock its placement")
	await _capture(name + "-stamp-recovery", viewport)
	controller.discard_draft(); _check(controller.has_unapplied_changes(), "Unknown stamp allowed discard")
	_click(view.get_node("%CheckPlacement")); await _settle(shell)
	_check(not controller.has_unapplied_changes() and shell._bridge.writes == writes + 1 and _map_tiles(shell, identity) != before, "Stamp recovery replayed a write or failed to refresh saved cells")
	_check_stamp_context(shell, is_dungeon)
	await _capture(name + "-stamp-confirmed", viewport)
	for method in ["session.describe", "map.open"]:
		cell += Vector2i(3, 0)
		await _refresh_fault(shell, canvas, is_dungeon, cell, viewport, method)


func _refresh_fault(shell, canvas: Control, is_dungeon: bool, cell: Vector2i, viewport: Vector2i, method: String) -> void:
	var controller = shell._maps.dungeon_stamps if is_dungeon else shell._maps.land_authoring
	var view = shell._maps.chrome.stamps.dungeon if is_dungeon else shell._maps.chrome.stamps.land
	var name := "dungeon" if is_dungeon else "land"
	var writes: int = shell._bridge.writes; var failures: int = shell._bridge.read_failures
	shell._bridge.lose = true; await _release_stamp(shell, canvas, cell)
	var operation_id: String = controller._pending.params.operationId
	shell._bridge.fail_after_receipt = method
	_click(view.get_node("%CheckPlacement")); await _settle(shell)
	_check(shell._bridge.read_failures == failures + 1 and controller._pending.get("confirmedCommitted", false) and controller._pending.get("params", {}).get("operationId") == operation_id, "Failed refresh lost the confirmed receipt: " + name + " " + method)
	_check(view.get_node("%CheckPlacement").is_visible_in_tree() and not view.get_node("%RetryPlacement").visible and not view.get_node("%DiscardPlacement").visible and view.get_node("%PlacementStatus").text.contains("Placement saved"), "Failed refresh exposed retry/discard or lost confirmed status")
	await _capture(name + "-stamp-refresh-" + method.replace(".", "-"), viewport)
	controller.discard_draft(); await controller.commit_selected(); await _settle(shell)
	_check(controller.has_unapplied_changes() and shell._bridge.writes == writes + 1, "Confirmed but unrefreshed placement allowed discard or replay")
	_click(view.get_node("%CheckPlacement")); await _settle(shell)
	_check(not controller.has_unapplied_changes() and shell._bridge.writes == writes + 1 and view.get_node("%PlacementStatus").text.contains("Original placement confirmed"), "Second recovery lost committed status or repeated its mutation")
	await _capture(name + "-stamp-refreshed-" + method.replace(".", "-"), viewport)
