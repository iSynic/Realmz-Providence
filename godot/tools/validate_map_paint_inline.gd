extends "res://tools/validate_map_paint_special.gd"

class PlacementBridge extends SpecialBridge:
	var ap_writes := 0
	var drop_ap := false
	var reject_ap := false
	var reject_refresh := false
	var reject_catalog := false
	func _request(method: String, params: Dictionary) -> Dictionary:
		if method == "map.catalog" and reject_catalog:
			reject_catalog = false; return {"ok":false,"error":"Controlled post-creation refresh rejection"}
		if method == "action-point.create" and reject_ap:
			reject_ap = false; return {"ok":false,"error":"Controlled AP write rejection"}
		var response: Dictionary = super._request(method,params)
		if method == "action-point.create" and response.get("ok",false):
			ap_writes += 1
			if reject_refresh: reject_refresh = false; reject_catalog = true
			if drop_ap: drop_ap = false; return {"ok":false,"outcomeUnknown":true,"error":"Controlled AP acknowledgement loss"}
		return response


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 1 or not args[0].get_file().begins_with("providence-ui-paint-"): quit(1); return
	var prior := OS.get_environment("PROVIDENCE_PROJECT_PATH"); OS.set_environment("PROVIDENCE_PROJECT_PATH","")
	root.size = Vector2i(1600,900); root.gui_embed_subwindows = true
	var shell: Control = load("res://src/editor_shell.tscn").instantiate(); shell.set_script(CheckedShell); root.add_child(shell)
	await _frames(3); shell._bridge.stop(); shell._bridge = PlacementBridge.new(args[0].path_join("inline-settings.cfg"))
	var path := args[0].path_join("inline-project")
	var created: Dictionary = shell._bridge.create_project("inline-paint",path)
	if _check(created.get("ok",false),"Inline project creation failed"):
		await shell._activate_session(created)
		if await _setup(shell):
			await _import_special(shell,args[0])
			await _inline_palette(shell)
			await _ap_placement(shell,"land:1")
			_check(_mutate(shell,"map.create",{"levelType":"dungeon"}),"Dungeon creation failed")
			await shell._maps.document.refresh_history()
			await _ap_placement(shell,"dungeon:0")
			await _reopen(shell,path)
			await _full_capacity(shell)
	shell.free(); await _frames(3); OS.set_environment("PROVIDENCE_PROJECT_PATH",prior)
	if not _failed: print("PROVIDENCE_MAP_PAINT_INLINE_OK inline-scenario-stock filters exact-preview repeated-strokes escape unavailable read-recovery AP-tool-land-dungeon destination-review cancel stale reject receipt-no-replay atomic-history save-reopen")
	quit(1 if _failed else 0)


func _inline_palette(shell) -> void:
	var helper = shell._maps.special_placement.palette; var dock = shell._maps.paint.workspace.tiles_dock
	var view: Control = helper.view; var canvas: Control = shell._workbenches.land.get_node("%LandMapCanvas")
	await helper.open(); await _settle(shell)
	_check(view.visible and not shell._maps.special_placement._picker.visible,"Routine Special selection opened a modal")
	await _select_art(shell,-91)
	_check(view.get_node("%Preview").texture != null and shell._maps.paint.workspace.can_paint(),"Exact scenario preview did not enable the brush")
	var revision: int = shell._session_view.revision
	canvas.reveal_cell(12,12); await _frames(2)
	await _input_click(canvas,Vector2i(12,12)); await _settle(shell)
	_check(_tiles(shell)[1092]==-91 and shell._session_view.revision==revision+1,"Special artwork release did not persist one stroke")
	_check(canvas.cell_artwork(Vector2i(12,12)).overlay != null,"Painted artwork remained only in the brush preview")
	shell._maps.paint.workspace.set_special_brush({}, null)
	_check(canvas.cell_artwork(Vector2i(12,12)).overlay != null,"Changing the brush erased committed Special artwork")
	await _select_art(shell,-91)
	await _input_click(canvas,Vector2i(13,12)); await _settle(shell)
	_check(_tiles(shell)[1093]==-91 and int(view.selected.get("value",0))==-91,"Second stroke lost the Special brush")
	await shell._undo(); await _settle(shell)
	_check(_tiles(shell)[1093]!=-91 and _tiles(shell)[1092]==-91,"Special stroke Undo did not restore exactly one placement")
	await shell._redo(); await _settle(shell)
	await _drag_special(shell,canvas)
	await _select_art(shell,-91)
	await _input_press(canvas,Vector2i(14,12),true)
	var key := InputEventKey.new(); key.pressed=true; key.keycode=KEY_ESCAPE; root.push_input(key,true)
	await _input_press(canvas,Vector2i(14,12),false); await _settle(shell)
	_check(_tiles(shell)[1094]!=-91,"Escape committed a canceled Special stroke")
	view.get_node("%Ownership").select(2); view.refresh(); await _settle(shell)
	_check(view.get_node("%Choices").item_count==0 and not shell._maps.paint.workspace.can_paint(),"Stock filter retained the scenario brush")
	view.get_node("%Search").text="-90"; view.refresh(); await _settle(shell); await _select_art(shell,-90)
	_check(view.selected.get("ownership","")=="stock" and view.get_node("%Preview").texture!=null,"Stock artwork did not preview inline")
	view.get_node("%Ownership").select(0); view.get_node("%Search").text="-91"; view.refresh(); await _settle(shell)
	shell._bridge.drop_preview=true; await _select_art(shell,-91)
	_check(helper._pending_read and not shell._maps.paint.workspace.can_paint(),"Uncertain exact artwork read allowed painting")
	await helper.check_connection(); await _settle(shell); await _select_art(shell,-91)
	_check(not helper._pending_read and shell._maps.paint.workspace.can_paint(),"Read recovery did not restore Special painting")
	await _unavailable_palette(shell)
	dock.ui.terrain_palette.pressed.emit(); await _frames(2)
	_check(not view.visible and dock.ui.atlas_scroll.visible,"Terrain palette did not restore normal browsing")


func _select_art(shell, value: int) -> void:
	var view: Control = shell._maps.special_placement.palette.view
	view.get_node("%Search").text=str(value); view.refresh(); await _settle(shell)
	for index in view._rows.size():
		if int(view._rows[index].value)==value:
			view.get_node("%Choices").select(index); view.get_node("%Choices").item_selected.emit(index)
			await _settle(shell); return
	_check(false,"Inline artwork %d was absent" % value)


func _drag_special(shell, canvas: Control) -> void:
	await _select_art(shell,-91)
	var revision: int=shell._session_view.revision; var before: Array=_tiles(shell).duplicate()
	canvas.reveal_cell(15,12); await _frames(2)
	await _input_press(canvas,Vector2i(15,12),true)
	var motion:=InputEventMouseMotion.new(); motion.button_mask=MOUSE_BUTTON_MASK_LEFT
	var local: Vector2=canvas._origin(canvas._cell_size())+(Vector2(16,12)+Vector2(0.5,0.5))*canvas._cell_size()
	motion.position=canvas.get_global_transform_with_canvas()*local; root.push_input(motion,true); await _frames(2)
	_check(_tiles(shell)==before and shell._session_view.revision==revision,"Special drag wrote before release")
	await _input_press(canvas,Vector2i(16,12),false); await _settle(shell)
	_check(_tiles(shell)[1095]==-91 and _tiles(shell)[1096]==-91 and shell._session_view.revision==revision+1,"Special drag failed to commit both cells atomically")
	await shell._undo(); await _settle(shell)
	_check(_tiles(shell)==before,"One Undo did not restore the complete Special drag")


func _ap_placement(shell, map_identity: String) -> void:
	await shell._maps.document.load_map(map_identity)
	await shell._navigation.select_route("maps.dungeon" if map_identity.begins_with("dungeon") else "maps.land")
	await _settle(shell)
	var editor: Control = shell._workbenches.dungeon if map_identity.begins_with("dungeon") else shell._workbenches.land
	var canvas: Control = editor.get_node("%DungeonMapCanvas" if map_identity.begins_with("dungeon") else "%LandMapCanvas")
	var placement = shell._maps.ap_placement
	var revision: int = shell._session_view.revision
	shell._map_context_sidebar.get_node("%ActionPointsTool").pressed.emit(); await _settle(shell)
	_check(editor.visible and canvas._interaction_mode=="action-point" and not placement.view.visible,"AP tool navigated before a destination click")
	_check(shell._map_context_sidebar.get_node("%ActionPointsTool").button_pressed,"AP placement did not indicate the active tool")
	canvas.reveal_cell(17,23); await _frames(2); await _input_click(canvas,Vector2i(17,23)); await _settle(shell)
	_check(placement.view.visible and not placement._reviewed.is_empty() and shell._session_view.revision==revision,"Cell placement did not provide a read-only allocation review")
	placement.view.cancel(); await _frames(2)
	_check(shell._session_view.revision==revision and not placement.has_unapplied_changes(),"AP Cancel changed the map")
	await _input_click(canvas,Vector2i(17,23)); await _settle(shell)
	_check(_mutate(shell,"map.create",{"levelType":"land"}),"Competing edit failed")
	await placement.commit_selected(); await _settle(shell)
	_check(placement.has_unapplied_changes() and placement._pending.is_empty(),"Stale placement created an AP")
	await placement.review_again(); await _settle(shell)
	shell._bridge.reject_ap=true; await placement.commit_selected(); await _settle(shell)
	_check(placement.has_unapplied_changes() and not placement.view.get_node("%CancelPlacement").disabled,"Failed AP write lost recoverable draft")
	await placement.review_again(); await _settle(shell)
	var identity: String = placement._reviewed.identity; var writes: int = shell._bridge.ap_writes
	shell._bridge.drop_ap=true; await placement.commit_selected(); await _settle(shell)
	_check(not placement._pending.is_empty() and placement.view.get_node("%RecoverPlacement").visible,"Unknown AP result did not expose receipt recovery")
	await placement.check_original(); await _settle(shell)
	_check(shell._bridge.ap_writes==writes+1 and not placement.has_unapplied_changes(),"AP recovery replayed creation or kept a confirmed draft")
	var opened: Dictionary = shell._bridge.request("action-point.open",{"identity":identity})
	_check(opened.get("ok",false) and int(opened.result.actionPoint.coordinate.x)==17 and int(opened.result.actionPoint.coordinate.y)==23,"Created AP lost exact clicked destination")
	_check_ap_inventory(shell,map_identity)
	await shell._undo(); await _settle(shell)
	var undone: Dictionary = shell._bridge.request("map.open",{"identity":map_identity})
	_check(not undone.result.actionPoints.any(func(row): return row.identity==identity),"AP creation Undo retained its marker")
	await shell._redo(); await _settle(shell)
	await shell._maps.document.load_map(map_identity); await shell._navigation.select_route("maps.dungeon" if map_identity.begins_with("dungeon") else "maps.land")
	await shell._maps.chrome.request_tool("action-point"); await _settle(shell)
	canvas.reveal_cell(17,23); await _frames(2); await _input_click(canvas,Vector2i(17,23)); await _settle(shell)
	_check(not placement.view.visible and shell._bridge.ap_writes==writes+1,"Clicking an existing AP tried to allocate again")
	_check_ap_inventory(shell,map_identity)
	await _confirmed_refresh_failure(shell,map_identity,canvas)


func _confirmed_refresh_failure(shell, map_identity: String, canvas: Control) -> void:
	await shell._maps.document.load_map(map_identity)
	await shell._navigation.select_route("maps.dungeon" if map_identity.begins_with("dungeon") else "maps.land")
	await shell._maps.chrome.request_tool("action-point"); await _settle(shell)
	canvas.reveal_cell(18,23); await _frames(2); await _input_click(canvas,Vector2i(18,23)); await _settle(shell)
	var placement = shell._maps.ap_placement; var writes: int = shell._bridge.ap_writes
	var identity: String = placement._reviewed.identity
	shell._bridge.reject_refresh=true; await placement.commit_selected(); await _settle(shell)
	_check(placement.has_unapplied_changes() and not placement._pending.is_empty() and placement.view.get_node("%CreateActionPoint").disabled,"Committed AP with failed refresh did not retain recovery")
	await placement.check_original(); await _settle(shell)
	_check(not placement.has_unapplied_changes() and shell._bridge.ap_writes==writes+1,"Committed AP refresh recovery replayed creation")
	var opened: Dictionary = shell._bridge.request("action-point.open",{"identity":identity})
	_check(opened.get("ok",false) and int(opened.result.actionPoint.coordinate.x)==18,"Refresh recovery opened a guessed AP")
	_check_ap_inventory(shell,map_identity)


func _check_ap_inventory(shell, map_identity: String) -> void:
	var view: Control=shell._documents.view("scripts.action-points")
	_check(view.current_map_identity()==map_identity and view._summaries.all(func(row): return str(row.identity).begins_with("action-point:"+map_identity+":")),"AP header and current-map inventory disagree")


func _unavailable_palette(shell) -> void:
	var view: Control=shell._maps.special_placement.palette.view; var choice: Dictionary=view.selected.duplicate(true)
	var revision: int=shell._session_view.revision
	view.selected={"value":-32700}; view.get_node("%ShowUnavailable").button_pressed=true
	await _select_art(shell,-32700)
	_check(not view.selected.available and not shell._maps.paint.workspace.can_paint() and view.get_node("%Preview").texture==null,"Unavailable native signed ID enabled painting")
	choice.available=false; choice.reason="Controlled unavailable source with a known repair identity."
	view.receive({"ok":true,"result":{"page":{"items":[choice],"offset":0,"total":1},"specialThumbnails":[]}},view.generation)
	view.get_node("%Choices").select(0); view.get_node("%Choices").item_selected.emit(0); await _frames(2)
	_check(not shell._maps.paint.workspace.can_paint() and not view.get_node("%OpenReference").disabled,"Known unavailable source lost its repair link or enabled painting")
	_check(shell._session_view.revision==revision,"Unavailable browsing changed source records")


func _reopen(shell, path: String) -> void:
	await shell._project_session.save()
	var reopened: Dictionary = shell._bridge.start_project(path); _check(reopened.get("ok",false),"Inline project reopen failed")
	await shell._activate_session(reopened)
	for map_identity in ["land:1","dungeon:0"]:
		var opened: Dictionary = shell._bridge.request("map.open",{"identity":map_identity})
		_check(opened.get("ok",false) and opened.result.actionPoints.any(func(row): return int(row.coordinate.x)==17 and int(row.coordinate.y)==23),"Save/reopen lost AP placement on " + map_identity)
	_check(_tiles(shell)[1092]==-91 and _tiles(shell)[1093]==-91,"Save/reopen lost repeated Special paint strokes")


func _input_click(canvas: Control, cell: Vector2i) -> void:
	await _input_press(canvas,cell,true); await _input_press(canvas,cell,false)


func _input_press(canvas: Control, cell: Vector2i, pressed: bool) -> void:
	var event := InputEventMouseButton.new(); event.button_index=MOUSE_BUTTON_LEFT; event.pressed=pressed
	var local: Vector2 = canvas._origin(canvas._cell_size()) + (Vector2(cell)+Vector2(0.5,0.5))*canvas._cell_size()
	event.position=canvas.get_global_transform_with_canvas()*local
	root.push_input(event,true); await _frames(2)


func _full_capacity(shell) -> void:
	_check(_mutate(shell,"map.create",{"levelType":"land"}),"Full-capacity fixture map failed")
	await shell._maps.document.reload_catalog()
	var maps: Array = shell._maps.document.maps.filter(func(row): return row.levelType=="land")
	var map_identity: String = maps.back().identity
	for index in 100:
		if not _mutate(shell,"action-point.create",{"mapIdentity":map_identity,"x":index%20+1,"y":index/20+1}): return
	await shell._maps.document.load_map(map_identity); await shell._navigation.select_route("maps.land")
	await shell._maps.chrome.request_tool("action-point"); await _settle(shell)
	var canvas: Control = shell._workbenches.land.get_node("%LandMapCanvas")
	canvas.reveal_cell(30,30); await _frames(2)
	var revision: int = shell._session_view.revision
	await _input_click(canvas,Vector2i(30,30)); await _settle(shell)
	var placement = shell._maps.ap_placement
	_check(placement.view.visible and placement.view.get_node("%CreateActionPoint").disabled and placement.view.get_node("%PlacementStatus").text.contains("100"),"Full capacity did not explain disabled AP creation")
	placement.view.cancel(); await _frames(2)
	_check(shell._session_view.revision==revision,"Full-capacity review changed source records")
