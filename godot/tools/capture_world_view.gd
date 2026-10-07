extends SceneTree

var _shell: Control
var _output := ""
var _captures: Array=[]
var _fixture := preload("res://tools/world_view_capture_fixture.gd").new()
var _quick := false
var _baseline_revision := 0


func _initialize() -> void: call_deferred("_run")


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	assert(args.size()>=2 and FileAccess.file_exists(args[0].path_join("assets-corpus-disposable.marker")))
	_output=args[1]; _quick=args.size()>2 and args[2]=="quick"
	DirAccess.make_dir_recursive_absolute(_output)
	root.gui_embed_subwindows=true
	_shell=load("res://src/editor_shell.tscn").instantiate(); root.add_child(_shell); await process_frame
	_shell._bridge.stop(); _shell._bridge=ProvidenceNativeBridge.new(args[0].get_base_dir().path_join("settings.cfg"))
	var opened: Dictionary = _shell._bridge.start_project(args[0]); assert(opened.get("ok",false),str(opened))
	await _shell._activate_session(opened)
	_fixture.initialize(_shell,_settle); await _fixture.seed()
	for viewport in [Vector2i(1920,1080),Vector2i(1600,900)]:
		root.size=viewport; root.content_scale_size=viewport
		await _land_states(viewport)
		await _layout_states(viewport)
	if not _quick:
		root.size=Vector2i(3440,1392); root.content_scale_size=root.size
		await _shell._navigation.select_route("maps.layout"); await _settle()
		_shell._workbenches.land_layout.get_node("%LayoutGrid").fit_layout()
		await _save("layout-ultrawide","maps.layout",root.size)
	FileAccess.open(_output.path_join("captures.json"),FileAccess.WRITE).store_string(JSON.stringify({"captures":_captures,"buildIdentity":_shell._bridge.request("build.identity").result,"fixture":"Disposable full Bywater import, explicit rectangle/Player Map/layout commands; missing/loading/artwork failure are controlled bounded read projections"},"\t"))
	_shell.free(); await process_frame
	print("PROVIDENCE_WORLD_VIEW_CAPTURES_OK "+str(_captures.size())); quit()


func _land_states(viewport: Vector2i) -> void:
	await _shell._navigation.open_map("land:0"); await _settle()
	var land: Control = _shell._workbenches.land
	land.fit_canvas()
	var menu: Control = land.get_node("%MapViewFilters")
	_baseline_revision=_shell._session_view.revision
	menu.state.set_all(true); menu.open_menu(); await _save("overlays-all","maps.land",viewport)
	if not _quick:
		menu.state.set_flag("randomRectangles",false); menu.state.set_entry("randomRectangles","land:0:rect:3",true)
		menu.state.set_flag("playerMaps",false); menu.state.set_entry("playerMaps","player-map:0",true)
		await _save("overlays-subset","maps.land",viewport)
		menu.state.set_all(false); await _save("overlays-none","maps.land",viewport)
	menu.close_menu()
	if _quick: return
	for native_id in [0,1]: await _player_map_mode(native_id,-1)
	await _shell._maps.document.refresh_history(); await _settle()
	menu.state.set_all(true); menu.open_menu(); _baseline_revision=_shell._session_view.revision
	await _save("overlays-unavailable","maps.land",viewport); menu.close_menu()
	for native_id in [0,1]: await _player_map_mode(native_id,1)
	for slot in 20:
		if slot in [0,3,19]: continue
		var row: Dictionary = _fixture.regions[2].duplicate(true); row.identity="land:0:rect:%d" % slot
		await _fixture.mutate("random-region.apply",{"mapIdentity":"land:0","region":row})
	await _shell._maps.document.refresh_history(); await _settle()
	menu.state.set_all(true); menu.open_menu(); _baseline_revision=_shell._session_view.revision
	await _save("overlays-large","maps.land",viewport); menu.close_menu()
	for slot in 20:
		if slot not in [0,3,19]: await _fixture.mutate("random-region.clear",{"mapIdentity":"land:0","slot":slot})


func _player_map_mode(native_id: int, mode: int) -> void:
	var value: Dictionary = _shell._bridge.request("player-map.open",{"identity":"player-map:%d" % native_id}).result.playerMap
	value.show=mode
	await _fixture.mutate("player-map.update",{"playerMap":_fixture._integers(value)})


func _layout_states(viewport: Vector2i) -> void:
	await _shell._navigation.select_route("maps.layout"); await _settle()
	var view: Control = _shell._workbenches.land_layout
	view.get_node("%LayoutGridToggle").button_pressed=true
	view._show_selected(2,3)
	_baseline_revision=_shell._session_view.revision
	view.get_node("%LayoutGrid").fit_layout(); await _save("layout-all","maps.layout",viewport)
	view.get_node("%LayoutGrid").fit_assigned()
	view.get_node("%LayoutGrid").zoom_by(100.0/maxf(1,view.get_node("%LayoutGrid").zoom_percent()))
	view.get_node("%LayoutGrid").grab_focus()
	var pointer := InputEventMouseMotion.new()
	pointer.position=view.get_node("%LayoutGrid").global_position+view.get_node("%LayoutGrid").cell_rect(Vector2i(3,2)).get_center()
	root.push_input(pointer); await create_timer(.8).timeout
	await _save("layout-zoom","maps.layout",viewport)
	pointer.position=Vector2.ZERO; root.push_input(pointer); await process_frame
	if _quick: return
	view.get_node("%LayoutGridToggle").button_pressed=false
	await _save("layout-grid-off","maps.layout",viewport)
	view.get_node("%LayoutGridToggle").button_pressed=true
	await _shell._workbenches.layout_commands._thumbnails.pause()
	var actual: Dictionary = _shell._bridge.request("land-layout.open",{}).result
	var cache: Dictionary = view._thumbnails.duplicate()
	var missing := actual.duplicate(true); missing.layout.cells[2*16+4]=99
	view.set_projection(missing); view._thumbnails=cache.duplicate(); view._thumbnails.erase("land:3")
	view._render_grid(); view._render_palette(); view._show_selected(2,3); view.get_node("%LayoutGrid").fit_layout()
	await _save("layout-problems","maps.layout",viewport)
	view.set_projection(actual); view._thumbnails=cache.duplicate()
	view.present_thumbnail("land:3",{"available":false,"revision":view.catalog_revision,"reason":"Artwork unavailable. Open the map to inspect or repair it."})
	view._show_selected(2,3); await _save("layout-failure","maps.layout",viewport)
	var edge := actual.duplicate(true); edge.layout.cells[2*16+3]=0; edge.layout.cells[0]=-1
	view.set_projection(edge); view._thumbnails=cache.duplicate(); view._render_grid(); view._show_selected(0,0)
	await _save("layout-edge","maps.layout",viewport)
	view.set_projection({"revision":actual.revision,"layout":null,"landMaps":actual.landMaps})
	view._thumbnails=cache.duplicate(); view._render_palette(); view._show_selected(2,3)
	await _save("layout-empty","maps.layout",viewport)
	view.set_projection(actual); view._thumbnails=cache; view._render_grid(); view._show_selected(2,3)
	_shell._workbenches.layout_commands._thumbnails.resume()


func _settle() -> void:
	for frame in 1200:
		await process_frame
		if not _shell._operations.busy:
			for after in 4: await process_frame
			if not _shell._operations.busy: return
	assert(false,"World view capture did not settle")


func _save(state: String, route: String, viewport: Vector2i) -> void:
	await _settle(); await RenderingServer.frame_post_draw
	assert(_shell._session_view.revision==_baseline_revision,"View changes advanced the authored revision")
	var name := "%s-%dx%d.png" % [state,viewport.x,viewport.y]
	var pixels:=root.get_texture().get_image()
	if state in ["layout-zoom","layout-grid-off"]: _verify_grid_pixels(pixels,state=="layout-zoom")
	assert(pixels.get_size()==viewport and pixels.save_png(_output.path_join(name))==OK)
	var receipt := {"state":state,"route":route,"viewport":[viewport.x,viewport.y],"file":name,"revisionUnchanged":true}
	if route=="maps.land":
		var menu: Control = _shell._workbenches.land.get_node("%MapViewFilters")
		receipt.view=menu.state.read_navigation_state()
		receipt.popupSize=[menu.get_node("%MapOverlayPopup").size.x,menu.get_node("%MapOverlayPopup").size.y]
	else:
		var canvas: Control = _shell._workbenches.land_layout.get_node("%LayoutGrid")
		receipt.view=canvas.read_navigation_state(); receipt.selected=[canvas.selected.x,canvas.selected.y]
	_captures.append(receipt)


func _verify_grid_pixels(pixels: Image, enabled: bool) -> void:
	var canvas: Control = _shell._workbenches.land_layout.get_node("%LayoutGrid")
	var point: Vector2 = canvas.global_position+canvas.cell_rect(Vector2i(4,1)).position+Vector2(0,40)
	var matches := false
	for offset in [-1,0,1]:
		var sample := pixels.get_pixel(int(point.x)+offset,int(point.y))
		if sample.is_equal_approx(ProvidenceLandLayoutCanvas.GRID_COLOR): matches=true
	assert(matches==enabled,"Occupied map borders must follow exact cell boundaries and disappear with Grid off.")
