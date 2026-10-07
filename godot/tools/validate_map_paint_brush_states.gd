extends "res://tools/validate_map_paint_magic.gd"


func _run() -> void:
	var args:=OS.get_cmdline_user_args()
	if args.is_empty() or not args[0].get_file().begins_with("providence-ui-paint-"): quit(1); return
	if args.size()>1: _capture_root=args[1]
	OS.set_environment("PROVIDENCE_PROJECT_PATH","")
	root.gui_embed_subwindows=true; root.size=Vector2i(1600,900)
	var shell:Control=load("res://src/editor_shell.tscn").instantiate(); shell.set_script(CheckedShell); root.add_child(shell)
	await _frames(3); shell._bridge.stop(); shell._bridge=MagicBridge.new(args[0].path_join("state-settings.cfg"))
	var created:Dictionary=shell._bridge.create_project("brush-states",args[0].path_join("states-project"))
	if _check(created.get("ok",false),"Brush states project creation failed"):
		await shell._activate_session(created)
		if await _setup(shell):
			await _browsing(shell); await _smart_states(shell); await _special(shell); await _unsupported(shell)
	shell.free(); await _frames(2)
	if not _failed: print("PROVIDENCE_MAP_PAINT_BRUSH_STATES_OK real-artwork names sample before empty unsupported special-routing both-sizes")
	quit(1 if _failed else 0)


func _browsing(shell) -> void:
	await _seed(shell)
	var workspace=shell._maps.paint.workspace; var dock=workspace.tiles_dock
	workspace.set_tool("paint"); await _settle(shell)
	dock.select_tile(17); dock.ui.search.text="shore"; dock.ui.search.text_changed.emit("shore"); await _frames(3)
	_check(dock.ui.results.item_count>0 and dock.tile_description(17).length()>8,"Named shoreline browsing lost semantic labels")
	await _capture_both("named-browsing")
	dock.ui.search.text=""; workspace.set_tool("sample"); await _settle(shell)
	await _stroke(shell,Vector2i(35,20),Vector2i(35,20))
	_check(int(dock.brush.cells[0])==151 and shell._status.text.contains("151"),"Sample did not select and describe its exact tile")
	await _capture_both("sample")


func _smart_states(shell) -> void:
	var smart=shell._maps.smart_terrain
	await smart.open(); await _settle(shell)
	_check(smart.view.mask.is_empty() and smart.view.get_node("%ApplySmart").disabled,"Empty Smart draft allowed Apply")
	await _capture_both("smart-empty")
	_choose(smart.view.get_node("%MaskShape"),2)
	await _stroke(shell,Vector2i(24,24),Vector2i(29,29)); await _settle_smart(shell)
	_check(smart.view.review_is_current(),"Smart comparison fixture did not resolve")
	smart.view.get_node("%ShowBefore").button_pressed=true; await _frames(3)
	await _capture_both("before")
	smart.view.get_node("%ShowBefore").button_pressed=false; smart.discard_draft(); await _settle(shell)


func _special(shell) -> void:
	var magic=shell._maps.magic_brush; await magic.open()
	var revision:int=shell._session_view.revision
	await _stroke(shell,Vector2i(4,3),Vector2i(4,3)); await _settle(shell)
	_check(magic._strokes.is_empty() and shell._session_view.revision==revision and magic.view.status.text.contains("Stamps"),"Special artwork became an ordinary Magic stroke")
	await _capture_both("magic-special"); magic.discard_draft()


func _unsupported(shell) -> void:
	var runtime:Dictionary=shell._bridge.request("map.open",{"identity":"land:1"}).result.map.runtime.duplicate(true)
	runtime.landlook=4; runtime.tilesetId="classic.landlook.4"
	var edit:Dictionary=_integer_fields(runtime)
	_check(_mutate(shell,"map-runtime.set",{"identity":"land:1","metadata":edit}),"Castle layout setup failed")
	await shell._maps.document.load_map("land:1"); await _settle(shell)
	var smart=shell._maps.smart_terrain; await smart.open(); await _settle(shell)
	_check(not smart.view.context.available and smart.view.get_node("%ApplySmart").disabled,"Unsupported Castle geometry enabled Smart Apply")
	await _capture_both("unsupported"); smart.discard_draft()


func _settle_smart(shell) -> void:
	var deadline:=Time.get_ticks_msec()+15000
	while (shell._maps.smart_terrain._busy or shell._operations.busy or shell._maps.land_authoring._reading) and Time.get_ticks_msec()<deadline: await process_frame
	await _frames(8)


func _integer_fields(value: Variant) -> Variant:
	if value is float: return int(value)
	if value is Array: return value.map(_integer_fields)
	if value is Dictionary:
		var result: Dictionary = {}
		for key in value: result[key] = _integer_fields(value[key])
		return result
	return value
