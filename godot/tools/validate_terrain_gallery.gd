extends "res://tools/validate_map_paint_smart_input.gd"


func _run() -> void:
	var args:=OS.get_cmdline_user_args()
	if args.size()!=3 or not args[0].get_file().begins_with("providence-ui-paint-"): quit(1); return
	_capture_root=args[2]
	var fixture:Dictionary=JSON.parse_string(FileAccess.get_file_as_string(args[1]))
	root.gui_embed_subwindows=true; root.size=Vector2i(1600,900)
	var shell:Control=load("res://src/editor_shell.tscn").instantiate(); shell.set_script(CheckedShell); root.add_child(shell)
	await _frames(3); shell._bridge.stop(); shell._bridge=preload("res://src/native_bridge.gd").new(args[0].path_join("settings.cfg"))
	var opened:Dictionary=shell._bridge.start_project(fixture.project)
	if _check(opened.get("ok",false),"Terrain gallery project failed to open"):
		await shell._activate_session(opened); await shell._maps.document.load_map(fixture.identity)
		await shell._navigation.select_route("maps.land"); await _settle(shell)
		for example:Dictionary in fixture.cases:
			await _example(shell,fixture.identity,example)
		_check(shell.reported_errors.is_empty(),"Terrain gallery errors: "+str(shell.reported_errors))
	shell.free(); await _frames(2)
	if not _failed: print("PROVIDENCE_TERRAIN_GALLERY_OK custom-atlas generated-water native-controls original-outline deltas both-sizes cases=",fixture.cases.size())
	quit(1 if _failed else 0)


func _example(shell,identity:String,example:Dictionary) -> void:
	var cells:Array=[]
	for index in example.tiles.size(): cells.append({"x":index%90,"y":index/90,"tile":int(example.tiles[index])})
	if not _check(_mutate(shell,"map.paint-cells",{"identity":identity,"cells":cells}),"Gallery seed failed"): return
	await shell._maps.document.refresh_history(); await _settle(shell)
	var smart=shell._maps.smart_terrain; var view=smart.view
	await smart.open(); await _settle(shell)
	view.get_node("%TerrainFamily").select(0)
	view.get_node("%Tolerance").select(["literal","gentle","balanced","strong"].find(example.tolerance))
	var mask:Array=example.mask.map(func(cell): return {"x":int(cell.x),"y":int(cell.y)})
	view.accept_mask(mask); shell._maps.land_authoring.begin_mask(mask,view.shape_options(),true)
	await smart.review(); await _settle(shell)
	var plan:Dictionary=view.review_plan()
	_check(plan.get("canApply",false),"Unexpected gallery resolution: "+example.name)
	for viewport in [Vector2i(1920,1080),Vector2i(1600,900)]:
		root.size=viewport; await _frames(4)
		var canvas:Control=shell._workbenches.land.get_node("%LandMapCanvas")
		var center:=Vector2.ZERO
		for cell:Dictionary in mask: center+=Vector2(cell.x,cell.y)
		center/=mask.size()
		canvas.restore_navigation_state({"zoom":4.5,"pan":[0,0],"cell":[int(center.x),int(center.y)],"showActionPoints":false})
		canvas.reveal_cell(int(center.x),int(center.y)); await _frames(4)
		var apply:Control=view.get_node("%ApplySmart")
		_check(apply.get_global_rect().end.y<viewport.y-20,"Smart Apply extends outside the certified viewport")
		await _capture(example.name,viewport)
	print("PROVIDENCE_TERRAIN_GALLERY_CASE ",JSON.stringify({"name":example.name,"changed":plan.paintedCells.size(),"added":plan.addedCells.size(),"removed":plan.removedCells.size(),"unresolved":plan.unresolvedCells.size()}))
	smart.discard_draft(); await _settle(shell)
