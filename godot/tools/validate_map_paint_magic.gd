extends "res://tools/validate_map_paint_smart_input.gd"

class MagicBridge extends "res://src/native_bridge.gd":
	var reject_write := false
	var lose_reply := false
	var writes := 0
	func _request(method: String, params: Dictionary) -> Dictionary:
		if method=="magic-brush.apply" and reject_write:
			reject_write=false; return {"ok":false,"error":"Controlled Magic rejection"}
		var response: Dictionary=super._request(method,params)
		if method=="magic-brush.apply" and response.get("ok",false):
			writes+=1
			if lose_reply: lose_reply=false; return {"ok":false,"outcomeUnknown":true,"error":"Controlled Magic reply loss"}
		return response


func _run() -> void:
	var args:=OS.get_cmdline_user_args()
	if args.is_empty() or not args[0].get_file().begins_with("providence-ui-paint-"): quit(1); return
	if args.size()>1: _capture_root=args[1]
	var prior:=OS.get_environment("PROVIDENCE_PROJECT_PATH"); OS.set_environment("PROVIDENCE_PROJECT_PATH","")
	root.gui_embed_subwindows=true; root.size=Vector2i(1600,900)
	var shell: Control=load("res://src/editor_shell.tscn").instantiate(); shell.set_script(CheckedShell); root.add_child(shell)
	await _frames(3); shell._bridge.stop(); shell._bridge=MagicBridge.new(args[0].path_join("magic-settings.cfg"))
	var project:String=args[0].path_join("magic-project")
	var created:Dictionary=shell._bridge.create_project("magic-input",project)
	if _check(created.get("ok",false),"Magic project creation failed"):
		await shell._activate_session(created)
		if await _setup(shell):
			for viewport in [Vector2i(1920,1080),Vector2i(1600,900)]:
				root.size=viewport; await _frames(4); await _journey(shell,viewport); await _line_journey(shell)
			await _recovery(shell); await _persist(shell,project)
	shell.free(); await _frames(2); OS.set_environment("PROVIDENCE_PROJECT_PATH",prior)
	if not _failed: print("PROVIDENCE_MAP_PAINT_MAGIC_OK real-input real-artwork sampled-draft repeated-strokes exact-tiles local-history cancel atomic-history rejected uncertain-no-retry stale save-reopen both-sizes")
	quit(1 if _failed else 0)


func _seed(shell) -> void:
	var cells:Array=[]
	var before:=_tiles(shell)
	for y in range(18,42):
		for x in range(18,45):
			if int(before[y*90+x])!=156: cells.append({"x":x,"y":y,"tile":156})
	if not cells.is_empty():
		_check(_mutate(shell,"map.paint-terrain",{"identity":"land:1","paint":{"tilesetId":"classic.landlook.0","cells":cells}}),"Magic ground seed failed")
	for sample in [[20,20,60],[35,20,151],[35,22,155]]:
		_check(_mutate(shell,"map.update-cell",{"identity":"land:1","x":sample[0],"y":sample[1],"tile":sample[2]}),"Magic sample seed failed")
	await shell._maps.document.refresh_history(); await _settle(shell)


func _journey(shell,viewport: Vector2i) -> void:
	await _seed(shell)
	var magic=shell._maps.magic_brush; var view=magic.view
	_click(shell._map_context_sidebar.get_node("%MagicTool")); await _settle(shell)
	_check(magic.is_open() and magic._overlay.active,"Magic did not begin drawing immediately")
	var before:=_tiles(shell); var revision:int=shell._session_view.revision
	await _stroke(shell,Vector2i(20,20),Vector2i(26,20))
	_check(magic._strokes.size()==1 and magic._plan.get("canApply",false),"First Magic stroke did not resolve")
	await _capture("magic-family",viewport)
	await _stroke(shell,Vector2i(23,20),Vector2i(23,25))
	_check(magic._strokes.size()==2 and magic._plan.get("canApply",false),"Sampling the visible water draft did not continue its family")
	await _stroke(shell,Vector2i(35,20),Vector2i(39,20),false)
	await _stroke(shell,Vector2i(35,22),Vector2i(37,20),false); await _settle(shell)
	_check(magic._strokes.size()==4 and magic._plan.get("canApply",false),"Rapid exact-tile strokes did not accumulate")
	_check(_tiles(shell)==before and shell._session_view.revision==revision,"Magic wrote before Apply")
	var exact:Array=magic._plan.get("terrainCells",[]).filter(func(cell): return int(cell.x)==37 and int(cell.y)==20)
	_check(exact.size()==1 and int(exact[0].tile)==155,"Later Magic exact stroke did not win its overlap")
	await _escape_stroke(shell,Vector2i(35,20)); _check(magic._strokes.size()==4,"Escape discarded completed Magic strokes")
	_click(view.get_node("%UndoStroke")); await _settle(shell); _check(magic._strokes.size()==3,"Magic local Undo changed the wrong history")
	_click(view.get_node("%RedoStroke")); await _settle(shell); _check(magic._strokes.size()==4,"Magic local Redo lost a stroke")
	view.get_node("%ShowBefore").button_pressed=true; await _frames(2); _check(magic._overlay.painted.is_empty(),"Magic Before retained painted tiles")
	view.get_node("%ShowBefore").button_pressed=false
	var apply:Control=view.get_node("%Apply")
	_check(apply.get_global_rect().end.y<=viewport.y and apply.get_global_rect().position.x<500,"Magic Apply is clipped or outside the tools sidebar")
	await _capture("magic-draft",viewport)
	_click(apply); await _settle(shell)
	_check(not magic.is_open() and shell._session_view.revision==revision+1,"Magic Apply did not commit one history entry")
	var after:=_tiles(shell)
	await shell._undo(); await _settle(shell); _check(_tiles(shell)==before,"Magic document Undo lost original tiles")
	await shell._redo(); await _settle(shell); _check(_tiles(shell)==after,"Magic document Redo lost draft output")
	await magic.open(); await _stroke(shell,Vector2i(35,20),Vector2i(35,24)); _click(view.get_node("%Cancel")); await _settle(shell)
	_check(not magic.is_open() and _tiles(shell)==after,"Magic Cancel failed to discard staged strokes")


func _recovery(shell) -> void:
	var magic=shell._maps.magic_brush
	await magic.open(); await _stroke(shell,Vector2i(35,20),Vector2i(35,26))
	var before:=_tiles(shell); shell._bridge.reject_write=true
	await magic.commit_selected(); _check(magic.has_unapplied_changes() and _tiles(shell)==before,"Rejected Magic write lost its draft")
	await _capture_both("magic-failed-write")
	shell._bridge.lose_reply=true; var writes:int=shell._bridge.writes
	await magic.commit_selected(); _check(not magic._pending.is_empty(),"Uncertain Magic lost recovery identity")
	await _capture_both("magic-recovery")
	await magic.check_original(); await _settle(shell)
	_check(magic._pending.is_empty() and not magic.is_open() and shell._bridge.writes==writes+1,"Magic recovery replayed its mutation")
	await _capture_both("magic-recovery-confirmed")
	await magic.open(); await _stroke(shell,Vector2i(35,20),Vector2i(36,26))
	_check(_mutate(shell,"map.update-cell",{"identity":"land:1","x":45,"y":45,"tile":155}),"Stale Magic seed failed")
	var response:Dictionary=await magic.commit_selected()
	_check(not response.get("ok",false) and magic.has_unapplied_changes(),"Stale Magic destination committed")
	await _capture_both("magic-stale-context")
	magic.discard_draft()


func _line_journey(shell) -> void:
	var magic = shell._maps.magic_brush
	for sample in [132,94]:
		await _seed(shell)
		_check(_mutate(shell,"map.update-cell",{"identity":"land:1","x":20,"y":30,"tile":sample}),"Line sample seed failed")
		await shell._maps.document.refresh_history(); await _settle(shell); await magic.open()
		var before := _tiles(shell)
		await _held_turn(shell)
		var corner := 142 if sample==132 else 104
		_check(magic._stroke.active and magic._visible_tiles.get(Vector2i(24,30))==corner,"Held Magic stroke did not turn its live corner")
		_check(_tiles(shell)==before and magic.view.get_node("%Apply").disabled,"Held line wrote early or enabled Apply")
		var canvas: Control = shell._workbenches.land.get_node("%LandMapCanvas")
		var release := InputEventMouseButton.new(); release.button_index=MOUSE_BUTTON_LEFT; release.pressed=false
		release.position=canvas.get_global_transform()*canvas.cell_rect(Vector2i(24,34)).get_center(); release.global_position=release.position
		root.push_input(release,true); await _settle(shell)
		_check(magic._strokes.size()==1 and magic._plan.get("canApply",false),"Line release lost its reviewed draft")
		_click(magic.view.get_node("%UndoStroke")); await _settle(shell)
		_check(magic._strokes.is_empty() and _tiles(shell)==before,"Line draft undo changed the document")
		_click(magic.view.get_node("%RedoStroke")); await _settle(shell)
		await magic.commit_selected(); await _settle(shell)
		var after := _tiles(shell)
		_check(after[30*90+24]==corner,"Applied line differs from held corner preview")
		await shell._undo(); await _settle(shell); _check(_tiles(shell)==before,"Line document Undo was not exact")
		await shell._redo(); await _settle(shell); _check(_tiles(shell)==after,"Line document Redo was not exact")
		await magic.open(); await _path_stroke(shell,[Vector2i(24,34),Vector2i(28,38)])
		_check(magic._strokes[0].cells.size()==9,"Fast diagonal line left disconnected cells")
		magic.discard_draft(); _check(_tiles(shell)==after,"Cancel committed the diagonal line")


func _held_turn(shell) -> void:
	var canvas: Control = shell._workbenches.land.get_node("%LandMapCanvas")
	var press := InputEventMouseButton.new(); press.button_index=MOUSE_BUTTON_LEFT; press.pressed=true
	press.position=canvas.get_global_transform()*canvas.cell_rect(Vector2i(20,30)).get_center(); press.global_position=press.position
	root.push_input(press,true); await process_frame
	for cell in [Vector2i(24,30),Vector2i(24,34)]:
		var move := InputEventMouseMotion.new(); move.button_mask=MOUSE_BUTTON_MASK_LEFT
		move.position=canvas.get_global_transform()*canvas.cell_rect(cell).get_center(); move.global_position=move.position
		root.push_input(move,true); await process_frame
	await _settle(shell)


func _settle(shell) -> void:
	var stable:=0; var deadline:=Time.get_ticks_msec()+20000
	while Time.get_ticks_msec()<deadline:
		await process_frame
		var idle:bool=not shell._operations.busy and not shell._bridge.operation_busy() and not shell._maps.magic_brush._reading and not shell._maps.magic_brush._submitting
		stable=stable+1 if idle else 0
		if stable>=8: return
	_check(false,"Magic did not settle")
