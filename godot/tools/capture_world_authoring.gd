extends SceneTree

var _shell: Control
var _output := ""
var _captures: Array = []
var _timings: Array = []
var _original_runtime: Dictionary = {}


func _initialize() -> void: call_deferred("_run")


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size()!=2 or not FileAccess.file_exists(args[0].path_join("assets-corpus-disposable.marker")): push_error("A marked disposable World project is required."); quit(2); return
	_output=args[1]; DirAccess.make_dir_recursive_absolute(_output)
	root.gui_embed_subwindows=true
	_shell=load("res://src/editor_shell.tscn").instantiate(); root.add_child(_shell); await process_frame
	_shell._bridge.stop(); _shell._bridge=ProvidenceNativeBridge.new(args[0].get_base_dir().path_join("world-capture-settings.cfg"))
	var opened: Dictionary=_shell._bridge.start_project(args[0])
	if not opened.get("ok",false): push_error(str(opened)); quit(1); return
	await _shell._activate_session(opened)
	_original_runtime=_shell._bridge.request("map.open",{"identity":"land:0"}).result.map.runtime.duplicate(true)
	if not _shell._maps.document.maps.any(func(map): return map.levelType=="dungeon"):
		var created: Dictionary=await _shell._operations.run_workflow(_shell._bridge,"Prepare capture Dungeon",func(operation):
			return await operation.request("map.create",{"levelType":"dungeon","expectedRevision":_shell._session_view.revision}))
		assert(created.ok); _shell._session_view.apply(created.result); await _shell._reload_map_catalog()
	await _seed_layout()
	for viewport_size in [Vector2i(1920,1080),Vector2i(1600,900)]:
		root.size=viewport_size; root.content_scale_size=viewport_size
		var restored: Dictionary=_shell._bridge.request("map-runtime.set",{"identity":"land:0","expectedRevision":_shell._session_view.revision,"metadata":_integer_fields(_original_runtime)})
		assert(restored.ok)
		_shell._session_view.apply(restored.result)
		await _primary_states(viewport_size)
		var additional := preload("res://tools/world_authoring_capture_states.gd").new()
		additional.initialize(_shell,_save,_settle)
		await additional.land_states(viewport_size)
		await additional.dungeon_layout_states(viewport_size)
		await additional.special_states(viewport_size)
	var empty: Dictionary=_shell._bridge.create_project("world-empty",args[0].get_base_dir().path_join("empty-project"))
	assert(empty.ok)
	await _shell._activate_session(empty)
	for viewport_size in [Vector2i(1920,1080),Vector2i(1600,900)]:
		root.size=viewport_size; root.content_scale_size=viewport_size
		await _settle()
		await _shell._navigation.select_route("maps.land")
		await _save("empty","maps.land",viewport_size)
		await _settle()
		await _shell._navigation.select_route("maps.layout")
		await _save("layout-empty","maps.layout",viewport_size)
	FileAccess.open(_output.path_join("captures.json"),FileAccess.WRITE).store_string(JSON.stringify({"captures":_captures,"timings":_timings,"buildIdentity":_shell._bridge.request("build.identity").result},"\t"))
	_shell.free(); await process_frame; print("PROVIDENCE_WORLD_CAPTURES_OK " + str(_captures.size())); quit()


func _primary_states(viewport_size: Vector2i) -> void:
	await _settle()
	var started:=Time.get_ticks_msec(); await _shell._navigation.open_map("land:0"); await _settle()
	_timings.append({"task":"open-imported-land","viewport":viewport_size.x,"elapsedMs":Time.get_ticks_msec()-started})
	_shell._workbenches.land.select_cell(9,17); await _save("land","maps.land",viewport_size)
	_shell._workbenches.land.fit_canvas(); await _save("fit","maps.land",viewport_size)
	_shell._workbenches.land.get_node("%LandMapCanvas").zoom_working()
	var dock: Control=_shell._maps.paint.workspace.tiles_dock
	dock.ui.search.text="shoreline"; dock.ui.search.text_changed.emit("shoreline"); await _save("filtered","maps.land",viewport_size)
	dock.ui.search.text="no-such-land-artwork"; dock.ui.search.text_changed.emit(dock.ui.search.text); await _save("no-results","maps.land",viewport_size)
	dock.ui.search.clear(); dock.ui.search.text_changed.emit("")
	await _settle()
	await _shell._navigation.open_map("dungeon:0"); await _settle()
	await _shell._workbenches.dungeon_cells.open_cell(8,8)
	await _save("dungeon","maps.dungeon",viewport_size)
	await _settle()
	await _shell._navigation.select_route("maps.layout"); await _settle()
	_shell._workbenches.land_layout._show_selected(2,3); await _save("layout","maps.layout",viewport_size)
	await _settle()
	await _shell._navigation.open_map("land:0"); await _settle()
	await _settle()
	await _shell._navigation.select_route("maps.special-land"); await _settle()
	var gallery: Control = _shell._maps.world_special._view
	for index in gallery._rows.size():
		if int(gallery._rows[index].value)==-180:
			gallery.get_node("%SpecialGallery").select(index); gallery.get_node("%SpecialGallery").item_selected.emit(index); break
	await _save("special","maps.special-land",viewport_size)
	await _settle()
	await _shell._navigation.open_map("land:0"); await _settle()
	_shell._maps.special_placement.choose(); await _save("picker","maps.special-land",viewport_size)
	_shell._maps.special_placement._picker.cancel()
	await _settle()


func _seed_layout() -> void:
	await _settle()
	await _shell._navigation.select_route("maps.layout"); await _settle()
	var coordinates := [Vector2i(3,2),Vector2i(3,1),Vector2i(4,2),Vector2i(3,3),Vector2i(2,2),Vector2i(2,1),Vector2i(4,1),Vector2i(2,3),Vector2i(4,3)]
	for index in coordinates.size():
		var cell: Vector2i = coordinates[index]
		await _shell._workbenches.layout_commands.set_cell(cell.y,cell.x,"land:%d" % index)
		assert((await _shell._workbenches.layout_commands.apply_review()).ok)
	await _settle()
	assert(_shell._workbenches.land_layout._cells.any(func(value): return int(value) == -1))


func _settle() -> void:
	for _frame in 1200:
		await process_frame
		if not _shell._operations.busy:
			for _after in 4: await process_frame
			if not _shell._operations.busy: return
	push_error("World capture did not settle."); quit(1)


func _integer_fields(value: Variant) -> Variant:
	if value is float: return int(value)
	if value is Array: return value.map(_integer_fields)
	if value is Dictionary:
		var result := {}
		for key in value: result[key]=_integer_fields(value[key])
		return result
	return value


func _save(state: String, route: String, viewport_size: Vector2i) -> void:
	await _settle(); await RenderingServer.frame_post_draw
	var validation: Dictionary = preload("res://tools/world_capture_validation.gd").verify(_shell,state,route)
	var pixels:=root.get_texture().get_image(); var name:="%s-%dx%d.png" % [state,viewport_size.x,viewport_size.y]
	assert(pixels.get_size()==viewport_size and pixels.save_png(_output.path_join(name))==OK)
	_captures.append({"state":state,"route":route,"viewport":[viewport_size.x,viewport_size.y],"file":name,"validation":validation})
