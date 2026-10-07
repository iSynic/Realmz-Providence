extends "res://tools/validate_map_paint_workspace.gd"

var _capture_root := ""


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.is_empty() or not args[0].get_file().begins_with("providence-ui-paint-"):
		push_error("A disposable Smart terrain input root is required"); quit(1); return
	if args.size() > 1: _capture_root = args[1]
	var prior := OS.get_environment("PROVIDENCE_PROJECT_PATH")
	OS.set_environment("PROVIDENCE_PROJECT_PATH", "")
	root.gui_embed_subwindows = true; root.size = Vector2i(1600,900)
	var shell: Control = load("res://src/editor_shell.tscn").instantiate()
	shell.set_script(CheckedShell); root.add_child(shell); await _frames(3)
	shell._bridge.stop()
	# The author journey uses the unmodified adapter and its real resolved artwork.
	shell._bridge = preload("res://src/native_bridge.gd").new(args[0].path_join("settings.cfg"))
	var project: String = args[0].path_join("smart-input-project")
	var created: Dictionary = shell._bridge.create_project("smart-input", project)
	if _check(created.get("ok",false), "Smart input project creation failed"):
		await shell._activate_session(created)
		if await _setup(shell):
			await _settle(shell)
			for viewport in [Vector2i(1920,1080),Vector2i(1600,900)]:
				root.size = viewport; await _frames(4)
				await _continuous_input(shell, viewport)
				await _filled_freehand(shell, viewport)
				await _water_shapes(shell, viewport)
				await _overlapping_taper(shell, viewport)
			await _persist(shell, project)
	shell.free(); await _frames(2); OS.set_environment("PROVIDENCE_PROJECT_PATH", prior)
	if not _failed: print("PROVIDENCE_MAP_PAINT_SMART_INPUT_OK real-adapter real-artwork viewport-input automatic-drawing repeated-strokes fresh-after-apply retained-stroke-history toolbar-draft-history unresolved-undo filled-freehand multi-stroke-closure retained-holes modest-ring narrow-channel additive subtract replace family-auto-preview disabled-reasons button-apply atomic undo-redo cancel save-reopen both-sizes")
	quit(1 if _failed else 0)


func _continuous_input(shell, viewport: Vector2i) -> void:
	var smart = shell._maps.smart_terrain; var view = smart.view
	var author = shell._maps.land_authoring
	author.clear_selection()
	_click(shell._map_context_sidebar.get_node("%SmartTool")); await _settle(shell)
	_check(smart.is_open() and author._overlay.active, "Choosing Smart mode did not enable map drawing")
	_check(view.get_node_or_null("%DrawMask") == null, "Smart mode still requires a separate drawing button")
	_choose(view.get_node("%MaskShape"),2); _choose(view.get_node("%MaskCombine"),1)
	view.accept_mask([]); author.begin_mask([],view.shape_options(),true)
	var before := _tiles(shell); var revision: int = shell._session_view.revision
	await _stroke(shell,Vector2i(20,20),Vector2i(23,23))
	_check(view.mask.size()==16 and author._overlay.active, "First stroke ended Smart drawing or lost its mask")
	await _stroke(shell,Vector2i(24,20),Vector2i(27,23))
	_check(view.mask.size()==32 and view.review_is_current(), "Second stroke did not add to the reviewed mask")
	await _stroke(shell,Vector2i(20,24),Vector2i(23,27),false)
	await _stroke(shell,Vector2i(24,24),Vector2i(27,27),false)
	await _settle(shell)
	_check(view.mask.size()==64 and view.review_is_current(), "Rapid consecutive strokes lost queued mask cells")
	await _stroke(shell,Vector2i(28,20),Vector2i(31,23),false)
	await _escape_stroke(shell,Vector2i(10,10))
	_check(view.mask.size()==80 and view.review_is_current(), "Escape discarded an earlier completed stroke or kept the canceled stroke")
	_check(_tiles(shell)==before and shell._session_view.revision==revision, "Drawing mutated terrain before Apply")
	_choose(view.get_node("%MaskCombine"),2)
	await _stroke(shell,Vector2i(27,20),Vector2i(27,23))
	_check(view.mask.size()==76, "Subtract did not retain the rest of the mask")
	_choose(view.get_node("%MaskCombine"),0)
	await _stroke(shell,Vector2i(20,20),Vector2i(23,23))
	_check(view.mask.size()==16, "Replace did not replace the previous mask")
	await _draft_controls(shell)
	_choose(view.get_node("%TerrainFamily"),1 if viewport.x==1920 else 0); await _settle(shell)
	_check(view.review_is_current() and not view.get_node("%ApplySmart").disabled, "Changing terrain family left Apply disabled with a valid mask")
	await _capture("reviewed",viewport)
	_click(view.get_node("%ApplySmart")); await _settle(shell)
	_check(not smart.is_open() and shell._session_view.revision==revision+1 and _tiles(shell)!=before, "Visible Apply did not commit exactly one Smart command")
	var painted := _tiles(shell)
	await shell._undo(); await _settle(shell); _check(_tiles(shell)==before,"Smart Undo did not restore all mask cells")
	await shell._redo(); await _settle(shell); _check(_tiles(shell)==painted,"Smart Redo did not restore the applied terrain")
	await _next_draft(shell,viewport,painted)
	smart.discard_draft(); await _settle(shell)
	await shell._maps.document.load_map("land:1"); await _settle(shell)


func _next_draft(shell, viewport: Vector2i, painted: Array) -> void:
	var smart = shell._maps.smart_terrain; var view = smart.view; var author = shell._maps.land_authoring
	await smart.open(); await _settle(shell)
	_check(view.mask.is_empty() and author.selected.is_empty(),"Apply retained committed cells in the next Smart draft")
	_check(view.get_node("%UndoStroke").disabled and view.get_node("%RedoStroke").disabled,"Apply retained prior local stroke history")
	_choose(view.get_node("%MaskCombine"),1)
	await _stroke(shell,Vector2i(40,40),Vector2i(43,43))
	_check(view.mask.size()==16 and not view.mask.has({"x":20,"y":20}) and view.review_is_current(),"The next Add stroke inherited the committed mask")
	await _capture("next-draft",viewport)
	var revision: int = shell._session_view.revision
	_click(view.get_node("%ApplySmart")); await _settle(shell)
	var second := _tiles(shell)
	_check(not smart.is_open() and shell._session_view.revision==revision+1 and second!=painted,"The second Smart draft did not commit independently")
	_check(second[20*90+20]==painted[20*90+20],"Applying a new region changed the first committed region")
	await shell._undo(); await _settle(shell); _check(_tiles(shell)==painted,"Undo of the second region did not preserve the first")
	await shell._redo(); await _settle(shell); _check(_tiles(shell)==second,"Redo did not restore both independently committed regions")
	await smart.open(); await _settle(shell)
	_check(view.mask.is_empty(),"A second Apply retained its mask")
	await _stroke(shell,Vector2i(40,40),Vector2i(43,43))
	_check(view.get_node("%ApplySmart").disabled and view.status.text == "No changes; selected cells already match.", "An already matching mask did not explain disabled Apply")
	await _capture("no-change",viewport)
	await _stroke(shell,Vector2i(50,40),Vector2i(53,43))
	var kept: Array = view.mask.duplicate(true)
	_click(view.get_node("%CancelSmart")); await _settle(shell)
	_check(_tiles(shell)==second and not smart.is_open(), "Cancel wrote pending mask changes")
	await smart.open(); await _settle(shell)
	_check(view.mask==kept and author._overlay.active,"Reopening did not restore the mask and drawing mode")
	await _retained_history(shell,viewport,kept)
	await _unresolved_history(shell,viewport)


func _retained_history(shell, viewport: Vector2i, kept: Array) -> void:
	var smart = shell._maps.smart_terrain; var view = smart.view
	var revision: int = shell._session_view.revision
	_check(not view.get_node("%UndoStroke").disabled and not shell._command_bar.undo_button.disabled,"Reopened mask lost both stroke and toolbar Undo")
	_click(shell._command_bar.undo_button); await _settle(shell)
	_check(view.mask.size()==16 and shell._session_view.revision==revision,"Toolbar Undo did not undo only the draft stroke")
	_click(shell._command_bar.redo_button); await _settle(shell)
	_check(view.mask==kept and shell._session_view.revision==revision,"Toolbar Redo did not restore the draft stroke")
	_click(view.get_node("%UndoStroke")); await _settle(shell)
	_click(view.get_node("%UndoStroke")); await _settle(shell)
	_check(view.mask.is_empty() and not view.get_node("%RedoStroke").disabled,"Local Undo did not return to an empty draft with Redo")
	_click(view.get_node("%CancelSmart")); await _settle(shell)
	await smart.open(); await _settle(shell)
	_check(view.mask.is_empty() and not view.get_node("%RedoStroke").disabled,"Cancel/reopen lost empty-mask Redo or reseeded old cells")
	_click(shell._command_bar.redo_button); await _settle(shell)
	_check(view.mask.size()==16 and shell._session_view.revision==revision,"Redo after reopening empty draft changed document history")
	await _capture("retained-history",viewport)


func _unresolved_history(shell, viewport: Vector2i) -> void:
	var smart = shell._maps.smart_terrain; var view = smart.view
	var revision: int = shell._session_view.revision
	_choose(view.get_node("%TerrainFamily"),2)
	await _settle(shell)
	_choose(view.get_node("%MaskShape"),0); _choose(view.get_node("%MaskCombine"),0)
	await _stroke(shell,Vector2i(60,40),Vector2i(60,40))
	_check(view.mask.size()==1 and view.review_is_current() and view.review_plan().unresolvedCells.size()==1,"Approximate fixture needs a current, applicable warning preview")
	_check(not view.get_node("%UndoStroke").disabled and not shell._command_bar.undo_button.disabled,"Unresolved preview disabled draft Undo")
	await _capture("unresolved-history",viewport)
	_click(shell._command_bar.undo_button); await _settle(shell)
	_check(view.mask.size()==16 and shell._session_view.revision==revision,"Undo could not escape an unresolved draft without writing")
	_choose(view.get_node("%TerrainFamily"),0); await _settle(shell)


func _stroke(shell, start: Vector2i, end: Vector2i, settle := true) -> void:
	await _path_stroke(shell, [start, end], settle)


func _overlapping_taper(shell, viewport: Vector2i) -> void:
	var smart = shell._maps.smart_terrain; var view = smart.view; var author = shell._maps.land_authoring
	var offset := Vector2i(65,55 if viewport.x==1920 else 70)
	author.clear_selection(); await smart.open(); await _settle(shell)
	shell._workbenches.land.fit_canvas(); await _frames(3)
	_choose(view.get_node("%TerrainFamily"),0); _choose(view.get_node("%Tolerance"),0)
	_choose(view.get_node("%MaskShape"),2); _choose(view.get_node("%MaskCombine"),0)
	view.get_node("%FilledMask").button_pressed=true
	view.accept_mask([]); author.begin_mask([],view.shape_options(),true)
	var before := _tiles(shell); var revision: int = shell._session_view.revision
	await _path_stroke(shell,[Vector2i(0,3),Vector2i(5,7)],true,offset)
	var first: Array = view.mask.duplicate(true)
	_check(first.size()==30 and view.review_is_current(),"Initial lake stroke has no applicable preview")
	_choose(view.get_node("%MaskShape"),0); _choose(view.get_node("%MaskCombine"),1)
	var rows := [Vector2i(3,3),Vector2i(2,3),Vector2i(1,3),Vector2i(0,5),Vector2i(0,5),Vector2i(0,6),Vector2i(0,6),Vector2i(0,6),Vector2i(2,6),Vector2i(3,7),Vector2i(4,7),Vector2i(5,7)]
	var points: Array = []; var expected: Array = []
	for y in rows.size():
		points.append(Vector2i(rows[y].x,y)); points.append(Vector2i(rows[y].y,y))
		if y+1<rows.size(): points.append(Vector2i(clampi(rows[y].y,rows[y+1].x,rows[y+1].y),y))
		for x in range(rows[y].x,rows[y].y+1): expected.append({"x":offset.x+x,"y":offset.y+y})
	var started := Time.get_ticks_msec()
	await _path_stroke(shell,points,true,offset)
	_check(view.mask.size()==56 and expected.all(func(c):return view.mask.has(c)),"Overlapping Add stroke changed the intended taper")
	_check(view.review_is_current() and not view.get_node("%ApplySmart").disabled,"Overlapping tapered lake has no applicable preview: "+view.status.text)
	print("WATER_NATIVE_OVERLAP %s: %dms including input and settling" % [str(viewport),Time.get_ticks_msec()-started])
	var canvas: Control = shell._workbenches.land.get_node("%LandMapCanvas")
	canvas.restore_navigation_state({"zoom":4.5,"pan":[0,0],"cell":[offset.x+4,offset.y+6],"showActionPoints":false})
	canvas.reveal_cell(offset.x+4,offset.y+6); await _frames(4)
	await _capture("overlap-reviewed",viewport)
	await _overlap_tolerances(shell,viewport)
	_check(_tiles(shell)==before and shell._session_view.revision==revision,"Overlapping strokes wrote before Apply")
	_click(view.get_node("%UndoStroke")); await _settle(shell); _check(view.mask==first,"Undo did not remove only the added taper")
	_click(view.get_node("%RedoStroke")); await _settle(shell); _check(view.mask.size()==56 and view.review_is_current(),"Redo did not restore the applicable taper")
	_click(view.get_node("%ApplySmart")); await _settle(shell)
	_check(not smart.is_open() and shell._session_view.revision==revision+1 and _tiles(shell)!=before,"Combined lake Apply was not one atomic change")
	var painted := _tiles(shell)
	await _capture("overlap-applied",viewport)
	await shell._undo(); await _settle(shell); _check(_tiles(shell)==before,"Combined lake Undo was not exact")
	await shell._redo(); await _settle(shell); _check(_tiles(shell)==painted,"Combined lake Redo was not exact")
	await shell._maps.document.load_map("land:1"); await _settle(shell)


func _overlap_tolerances(shell, viewport: Vector2i) -> void:
	var view = shell._maps.smart_terrain.view
	var mask: Array = view.mask.duplicate(true)
	for tolerance in [1,2,3]:
		_choose(view.get_node("%Tolerance"),tolerance); await _settle(shell)
		_check(view.mask==mask and view.review_is_current() and not view.get_node("%ApplySmart").disabled,"A smoothing control lost the overlapping draft or rejected its shape")
		if tolerance==1: await _capture("overlap-gentle",viewport)
	_choose(view.get_node("%Tolerance"),0); await _settle(shell)


func _path_stroke(shell, points: Array, settle := true, offset := Vector2i.ZERO) -> void:
	points = points.map(func(cell): return cell+offset)
	var canvas: Control = shell._workbenches.land.get_node("%LandMapCanvas")
	var event := InputEventMouseButton.new(); event.button_index = MOUSE_BUTTON_LEFT
	event.pressed = true; event.position = canvas.get_global_transform()*canvas.cell_rect(points[0]).get_center()
	event.global_position = event.position; root.push_input(event,true); await process_frame
	for cell in points.slice(1):
		var move := InputEventMouseMotion.new(); move.button_mask = MOUSE_BUTTON_MASK_LEFT
		move.position = canvas.get_global_transform()*canvas.cell_rect(cell).get_center(); move.global_position = move.position
		root.push_input(move,true); await process_frame
	event.pressed=false; event.position=canvas.get_global_transform()*canvas.cell_rect(points[-1]).get_center(); event.global_position=event.position
	root.push_input(event,true)
	if settle: await _settle(shell)
	else: await process_frame


func _filled_freehand(shell, viewport: Vector2i) -> void:
	var smart = shell._maps.smart_terrain; var view = smart.view; var author = shell._maps.land_authoring
	var offset := Vector2i(0,12) if viewport.x==1600 else Vector2i.ZERO
	var center := {"x":54,"y":54+offset.y}
	author.clear_selection(); await smart.open(); await _settle(shell)
	shell._workbenches.land.fit_canvas(); await _frames(3)
	_choose(view.get_node("%TerrainFamily"),0); _choose(view.get_node("%MaskShape"),0); _choose(view.get_node("%MaskCombine"),0)
	view.get_node("%FilledMask").button_pressed = true
	view.accept_mask([]); author.begin_mask([],view.shape_options(),true)
	var before := _tiles(shell); var revision: int = shell._session_view.revision
	await _toggle_existing_outline(shell, offset, center)
	await _path_stroke(shell,[Vector2i(50,50),Vector2i(58,50),Vector2i(58,58),Vector2i(50,58),Vector2i(50,51)],true,offset)
	_check(view.mask.size()==81 and view.mask.has(center),"Filled freehand left the closed lake interior empty")
	await _capture("freehand-filled",viewport)
	await _path_stroke(shell,[Vector2i(50,50),Vector2i(58,50),Vector2i(58,58),Vector2i(50,58)],true,offset)
	_check(view.mask.size()==25,"An open freehand stroke filled an unclosed area")
	_choose(view.get_node("%MaskCombine"),1)
	await _path_stroke(shell,[Vector2i(50,58),Vector2i(50,50)],true,offset)
	_check(view.mask.size()==81,"A second Add stroke did not fill the newly closed outline: %d cells, %s" % [view.mask.size(), str(author.options)])
	_choose(view.get_node("%MaskCombine"),2)
	await _path_stroke(shell,[Vector2i(53,53),Vector2i(55,53),Vector2i(55,55),Vector2i(53,55),Vector2i(53,53)],true,offset)
	_check(view.mask.size()==72 and not view.mask.has(center),"Filled freehand subtraction did not cut out the intended hole")
	_choose(view.get_node("%MaskCombine"),1)
	await _path_stroke(shell,[Vector2i(59,53),Vector2i(59,55)],true,offset)
	_check(view.mask.size()==75 and not view.mask.has(center),"An unrelated Add stroke refilled a subtracted hole")
	await _capture("freehand-hole",viewport)
	view.get_node("%UndoStroke").pressed.emit(); await _settle(shell)
	_check(view.mask.size()==72,"Local Undo did not restore the subtracted-hole mask")
	view.get_node("%UndoStroke").pressed.emit(); await _settle(shell)
	_check(view.mask.size()==81 and view.review_is_current() and not view.get_node("%ApplySmart").disabled,"The filled lake did not produce an applicable water plan")
	_check(shell._session_view.revision==revision and _tiles(shell)==before,"Filled freehand wrote before Apply")
	_click(view.get_node("%ApplySmart")); await _settle(shell)
	_check(not smart.is_open() and shell._session_view.revision==revision+1,"Filled freehand Apply was not one atomic history entry")
	var painted := _tiles(shell)
	_check(painted[(54+offset.y)*90+54]!=before[(54+offset.y)*90+54],"Applying the freehand lake did not persist its interior tile")
	await shell._undo(); await _settle(shell); _check(_tiles(shell)==before,"Freehand lake Undo lost original terrain")
	await shell._redo(); await _settle(shell); _check(_tiles(shell)==painted,"Freehand lake Redo lost filled terrain")
	await shell._maps.document.load_map("land:1"); await _settle(shell)


func _toggle_existing_outline(shell, offset: Vector2i, center: Dictionary) -> void:
	var view = shell._maps.smart_terrain.view
	view.get_node("%FilledMask").button_pressed = false
	await _path_stroke(shell,[Vector2i(50,50),Vector2i(58,50),Vector2i(58,58),Vector2i(50,58),Vector2i(50,50)],true,offset)
	_check(view.mask.size()==32 and not view.mask.has(center),"Outline fixture unexpectedly filled its interior")
	view.get_node("%FilledMask").button_pressed = true; await _settle(shell)
	_check(view.mask.size()==81 and view.mask.has(center) and view.review_is_current(),"Enabling Filled shape did not fill the existing outline and refresh its preview: %d cells, center=%s, status=%s" % [view.mask.size(),view.mask.has(center),view.status.text])
	_click(view.get_node("%UndoStroke")); await _settle(shell)
	_check(view.mask.size()==32 and not view.mask.has(center),"Undo did not restore the outline before filling")
	_click(view.get_node("%RedoStroke")); await _settle(shell)
	_check(view.mask.size()==81 and view.mask.has(center),"Redo did not restore the explicitly filled mask")


func _water_shapes(shell, viewport: Vector2i) -> void:
	var smart = shell._maps.smart_terrain; var view = smart.view
	var author = shell._maps.land_authoring
	var offset := Vector2i(0,12) if viewport.x==1600 else Vector2i.ZERO
	for shape in ["ring", "channel"]:
		author.clear_selection(); await smart.open(); await _settle(shell)
		shell._workbenches.land.fit_canvas(); await _frames(3)
		_choose(view.get_node("%TerrainFamily"),0); _choose(view.get_node("%Tolerance"),0)
		_choose(view.get_node("%MaskCombine"),0)
		view.get_node("%FilledMask").button_pressed = shape=="channel"
		_choose(view.get_node("%MaskShape"),0 if shape=="ring" else 2)
		view.accept_mask([]); author.begin_mask([],view.shape_options(),true)
		var before := _tiles(shell); var revision: int = shell._session_view.revision
		var started := Time.get_ticks_msec()
		if shape=="ring":
			await _path_stroke(shell,[Vector2i(40,30),Vector2i(48,30),Vector2i(48,38),Vector2i(40,38),Vector2i(40,30)],true,offset)
		else:
			await _path_stroke(shell,[Vector2i(10,30),Vector2i(17,39)],true,offset)
			_choose(view.get_node("%MaskCombine"),1)
			await _path_stroke(shell,[Vector2i(24,30),Vector2i(31,39)],true,offset)
			_choose(view.get_node("%MaskShape"),1)
			await _path_stroke(shell,[Vector2i(17,35),Vector2i(24,35)],true,offset)
		_check(view.mask.size()==(32 if shape=="ring" else 166),"Water workload pointer input lost mask cells: "+shape)
		_check(view.review_is_current() and not view.get_node("%ApplySmart").disabled,"Modest water workload has no applicable plan: "+shape+" · "+view.status.text)
		print("WATER_NATIVE_PREVIEW %s %s: %dms including input and settling" % [shape,str(viewport),Time.get_ticks_msec()-started])
		await _capture("water-"+shape,viewport)
		_check(_tiles(shell)==before and shell._session_view.revision==revision,"Water workload wrote before Apply")
		_click(view.get_node("%ApplySmart")); await _settle(shell)
		_check(not smart.is_open() and shell._session_view.revision==revision+1,"Modest water Apply was not atomic: "+shape)
		var painted := _tiles(shell)
		_check(painted!=before,"Modest water Apply did not persist: "+shape)
		await shell._undo(); await _settle(shell); _check(_tiles(shell)==before,"Modest water Undo lost source terrain")
		await shell._redo(); await _settle(shell); _check(_tiles(shell)==painted,"Modest water Redo lost terrain")
		await _capture("water-"+shape+"-applied",viewport)
		await shell._maps.document.load_map("land:1"); await _settle(shell)


func _draft_controls(shell) -> void:
	var view = shell._maps.smart_terrain.view; var overlay = shell._maps.land_authoring._overlay
	var revision: int = shell._session_view.revision
	var key := InputEventKey.new(); key.keycode = KEY_Z; key.ctrl_pressed = true; key.pressed = true
	root.push_input(key,true); await _settle(shell)
	_check(view.mask.size()==76 and shell._session_view.revision==revision,"Local Undo changed document history or lost the previous stroke")
	key.keycode = KEY_Y; root.push_input(key,true); await _settle(shell)
	_check(view.mask.size()==16 and shell._session_view.revision==revision,"Local Redo did not restore the last staged stroke")
	var original: Array = view.mask.duplicate(true)
	_choose(view.get_node("%Tolerance"),3); await _settle(shell)
	_check(view.mask==original and view.review_is_current(),"Smoothing changed the original mask or left a valid draft unresolved")
	view.get_node("%ShowBefore").button_pressed = true; await _frames(2)
	_check(overlay.painted.is_empty() and not overlay.original_mask.is_empty(),"Before comparison left generated artwork visible")
	view.get_node("%ShowBefore").button_pressed = false; await _frames(2)
	_check(not overlay.painted.is_empty(),"After comparison lost generated artwork")
	_choose(view.get_node("%Tolerance"),0); await _settle(shell)


func _click(control: Control) -> void:
	var event := InputEventMouseButton.new(); event.button_index=MOUSE_BUTTON_LEFT
	event.position=control.get_global_rect().get_center(); event.global_position=event.position
	event.pressed=true; root.push_input(event,true)
	event=event.duplicate(); event.pressed=false; root.push_input(event,true)


func _escape_stroke(shell, cell: Vector2i) -> void:
	var canvas: Control = shell._workbenches.land.get_node("%LandMapCanvas")
	var mouse := InputEventMouseButton.new(); mouse.button_index=MOUSE_BUTTON_LEFT
	mouse.pressed=true; mouse.position=canvas.get_global_transform()*canvas.cell_rect(cell).get_center()
	mouse.global_position=mouse.position; root.push_input(mouse,true); await process_frame
	var key := InputEventKey.new(); key.keycode=KEY_ESCAPE; key.pressed=true
	root.push_input(key,true); await process_frame
	mouse=mouse.duplicate(); mouse.pressed=false; root.push_input(mouse,true)
	await _settle(shell)


func _choose(control: OptionButton, index: int) -> void:
	control.select(index); control.item_selected.emit(index)


func _settle(shell) -> void:
	var stable := 0; var deadline := Time.get_ticks_msec()+15000
	while Time.get_ticks_msec()<deadline:
		await process_frame
		var idle: bool = not shell._operations.busy and not shell._bridge.operation_busy() and not shell._maps.land_authoring._reading and not shell._maps.land_authoring._accepting_mask and not shell._maps.smart_terrain._busy
		stable = stable+1 if idle else 0
		if stable>=8: return
	_check(false,"Smart input workflow did not settle")


func _persist(shell, project: String) -> void:
	var before := _tiles(shell)
	await shell._project_session.save()
	var reopened: Dictionary = shell._bridge.start_project(project)
	if not _check(reopened.get("ok",false),"Smart input project did not reopen"): return
	await shell._activate_session(reopened); await shell._maps.document.load_map("land:1"); await _settle(shell)
	_check(_tiles(shell)==before,"Save/reopen lost Smart terrain changes")
	_check(shell.reported_errors.is_empty(),"Unexpected real Smart terrain errors: "+str(shell.reported_errors))


func _capture(state: String, viewport: Vector2i) -> void:
	if _capture_root.is_empty() or DisplayServer.get_name()=="headless": return
	await RenderingServer.frame_post_draw
	var path := _capture_root.path_join("smart-%s-%dx%d.png" % [state,viewport.x,viewport.y])
	_check(root.get_texture().get_image().save_png(path)==OK,"Could not save Smart input capture")
	var shell=root.get_node("ProvidenceEditor")
	var bounds:Dictionary={"viewport":str(root.get_visible_rect()),"root":str(shell.get_global_rect()),"header":str(shell._command_bar.get_global_rect()),"headerVisible":shell._command_bar.is_visible_in_tree(),"workspace":str(shell.get_node("Workspace").get_global_rect()),"primary":str(shell._primary_workspace.get_global_rect())}
	var file:=FileAccess.open(path.get_basename()+".json",FileAccess.WRITE); file.store_string(JSON.stringify(bounds)); file.close()


func _capture_both(state: String) -> void:
	if _capture_root.is_empty(): return
	var previous := root.size
	for viewport in [Vector2i(1920,1080),Vector2i(1600,900)]:
		root.size=viewport; await _frames(4); await _capture(state,viewport)
	root.size=previous; await _frames(3)
