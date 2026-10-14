extends "res://tools/validate_map_paint_smart_input.gd"

var _combinations := 0


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.is_empty() or not args[0].get_file().begins_with("providence-ui-paint-"):
		push_error("A disposable brush combination root is required"); quit(1); return
	if args.size() > 1: _capture_root = args[1]
	OS.set_environment("PROVIDENCE_PROJECT_PATH", "")
	root.gui_embed_subwindows = true; root.size = Vector2i(1600,900)
	var shell: Control = load("res://src/editor_shell.tscn").instantiate()
	shell.set_script(CheckedShell); root.add_child(shell); await shell.startup_completed
	shell._bridge.stop()
	shell._bridge = preload("res://src/native_bridge.gd").new(args[0].path_join("settings.cfg"))
	var project: String = args[0].path_join("combinations")
	var created: Dictionary = shell._bridge.create_project("brush-combinations", project)
	if _check(created.get("ok",false), "Brush combination project creation failed"):
		await shell._activate_session(created)
		if await _setup(shell):
			await _prepare_ground(shell)
			for viewport in [Vector2i(1600,900),Vector2i(1920,1080)]:
				root.size = viewport; await _frames(4)
				await _shape_combinations(shell)
				await _family_tolerances(shell, viewport)
				await _reproduced_failures(shell, viewport)
			await _persist(shell, project)
	shell.free(); await _frames(2)
	if not _failed: print("PROVIDENCE_MAP_PAINT_SMART_COMBINATIONS_OK combinations=%d both-viewports actual-pointer-input shapes fill combine families tolerances preview apply undo redo save-reopen" % _combinations)
	quit(1 if _failed else 0)


func _prepare_ground(shell) -> void:
	var cells: Array = []
	for y in 90:
		for x in 90: cells.append({"x":x,"y":y,"tile":60 if x>=70 and x<76 and y>=70 and y<76 else 156})
	_mutate(shell, "map.paint-cells", {"identity":"land:1","cells":cells})
	await shell._maps.document.load_map("land:1"); await _settle(shell)


func _shape_combinations(shell) -> void:
	var smart = shell._maps.smart_terrain; var view = smart.view
	await smart.open(); await _settle(shell)
	shell._workbenches.land.fit_canvas(); await _frames(3)
	var before := _tiles(shell); var revision: int = shell._session_view.revision
	for shape in 5:
		for filled in [false,true]:
			for combine in 3:
				_click(view.get_node("%ClearMask")); await _settle(shell)
				_choose(view.get_node("%MaskShape"),2); _choose(view.get_node("%MaskCombine"),0)
				view.get_node("%FilledMask").button_pressed = true; await _settle(shell)
				await _stroke(shell,Vector2i(20,20),Vector2i(28,28))
				var seed: Array = view.mask.duplicate(true)
				view.get_node("%FilledMask").button_pressed = filled; await _settle(shell)
				_choose(view.get_node("%MaskShape"),shape); _choose(view.get_node("%MaskCombine"),combine)
				var start := Vector2i(72,72) if shape==4 else Vector2i(24,24)
				var end := start if shape==4 else Vector2i(32,32)
				await _stroke(shell,start,end)
				_check(not view.mask.is_empty(),"Shape combination unexpectedly erased the whole draft")
				if combine==1: _check(seed.all(func(cell): return view.mask.has(cell)),"Add lost existing selected cells")
				if combine==2: _check(view.mask.all(func(cell): return seed.has(cell)),"Subtract added cells")
				_check(view.review_is_current(),"Shape combination did not resolve automatically")
				_check(_tiles(shell)==before and shell._session_view.revision==revision,"Shape controls wrote before Apply")
				_combinations += 1
	_click(view.get_node("%ClearMask")); await _settle(shell)
	_click(view.get_node("%CancelSmart")); await _settle(shell)


func _family_tolerances(shell, viewport: Vector2i) -> void:
	var smart = shell._maps.smart_terrain; var view = smart.view
	for family in 3:
		await smart.open(); await _settle(shell)
		shell._workbenches.land.fit_canvas(); await _frames(3)
		_choose(view.get_node("%TerrainFamily"),family)
		_choose(view.get_node("%MaskShape"),2); _choose(view.get_node("%MaskCombine"),1)
		view.get_node("%FilledMask").button_pressed = true; await _settle(shell)
		await _stroke(shell,Vector2i(20,20),Vector2i(31,31))
		await _stroke(shell,Vector2i(32,25),Vector2i(57,26))
		var original: Array = view.mask.duplicate(true)
		var before := _tiles(shell); var revision: int = shell._session_view.revision
		for tolerance in 4:
			_choose(view.get_node("%Tolerance"),tolerance); await _settle(shell)
			_check(view.mask==original and view.review_is_current(),"Tolerance replaced the drawn mask or left a stale preview")
			var effective: Array = view.review_plan().effectiveMask
			for cell in original:
				_check(effective.any(func(other): return abs(cell.x-other.x)+abs(cell.y-other.y)<=tolerance),"Smoothing shortened a stroke past its selected tolerance")
			_combinations += 1
		if family==0: await _capture("bounded-arm",viewport)
		_click(view.get_node("%ApplySmart")); await _settle(shell)
		var after := _tiles(shell)
		_check(not smart.is_open() and after!=before and shell._session_view.revision==revision+1,"Apply did not commit exactly one change")
		await shell._undo(); await _settle(shell); _check(_tiles(shell)==before,"Undo changed unrelated terrain")
		await shell._redo(); await _settle(shell); _check(_tiles(shell)==after,"Redo differs from the applied preview")
		await shell._undo(); await _settle(shell)


func _reproduced_failures(shell, viewport: Vector2i) -> void:
	var smart = shell._maps.smart_terrain; var view = smart.view
	var canvas: Control = shell._workbenches.land.get_node("%LandMapCanvas")
	for family in 3:
		await smart.open(); await _settle(shell)
		shell._workbenches.land.fit_canvas(); await _frames(3)
		var bounds := canvas.get_global_rect()
		_choose(view.get_node("%TerrainFamily"),family)
		_choose(view.get_node("%MaskCombine"),0)
		view.get_node("%FilledMask").button_pressed = false
		for shape in [1,2,3]:
			_choose(view.get_node("%MaskShape"),shape)
			await _stroke(shell,Vector2i(20,20),Vector2i(33,28))
			for tolerance in 4:
				_choose(view.get_node("%Tolerance"),tolerance); await _settle(shell)
				_check(canvas.get_global_rect()==bounds,"Smart option change shifted the canvas")
				if family==0 or tolerance>0:
					_check(view.review_plan().unresolvedCells.is_empty(),"Smart shape retained broken terrain joins")
				_check("total tile changes" in view.counts.text and not "unchanged" in view.counts.text,"Preview count scope is ambiguous")
				_combinations += 1
		canvas.restore_navigation_state({"zoom":4.5,"pan":[0,0],"cell":[26,24],"showActionPoints":false})
		canvas.reveal_cell(26,24); await _frames(4)
		await _capture("repaired-"+str(family),viewport)
		var effective: Array = view.review_plan().effectiveMask.map(func(cell): return {"x":int(cell.x),"y":int(cell.y)})
		var seed: Dictionary = effective[0]
		var before := _tiles(shell)
		_click(view.get_node("%ApplySmart")); await _settle(shell)
		await smart.open(); await _settle(shell)
		_choose(view.get_node("%MaskShape"),4)
		await _stroke(shell,Vector2i(seed.x,seed.y),Vector2i(seed.x,seed.y))
		_check(view.mask==effective,"Connected selection differs from applied terrain: family=%d selected=%d expected=%d" % [family,view.mask.size(),effective.size()])
		_check(view.review_plan().paintedCells.is_empty(),"Unchanged connected terrain unexpectedly changed")
		_click(view.get_node("%ClearMask")); await _settle(shell)
		_click(view.get_node("%CancelSmart")); await _settle(shell)
		await shell._undo(); await _settle(shell)
		_check(_tiles(shell)==before,"Regression exercise undo lost original terrain")
