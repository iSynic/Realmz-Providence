extends "res://tools/validate_map_paint_inline.gd"


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	var source := OS.get_environment("PROVIDENCE_PAINT_SCENARIO")
	if args.size() != 1 or not args[0].get_file().begins_with("providence-ui-paint-") or source.is_empty(): quit(1); return
	var prior := OS.get_environment("PROVIDENCE_PROJECT_PATH"); OS.set_environment("PROVIDENCE_PROJECT_PATH", "")
	root.size = Vector2i(1600,900); root.gui_embed_subwindows = true
	var shell: Control = load("res://src/editor_shell.tscn").instantiate(); shell.set_script(CheckedShell); root.add_child(shell)
	await _frames(3); shell._bridge.stop()
	shell._bridge = ProvidenceNativeBridge.new(args[0].path_join("scenario-settings.cfg"))
	var path := args[0].path_join("scenario-project")
	var created: Dictionary = shell._bridge.create_project("scenario-paint",path)
	if _check(created.get("ok",false),"Scenario project creation failed"):
		await shell._activate_session(created)
		var imported: Dictionary = await shell._operations.run_workflow(shell._bridge,"Import paint fixture",func(op):
			return await op.request("project.import-classic-scenario",{"expectedRevision":shell._session_view.revision,"directory":source,"applicationDataDirectory":ProjectSettings.globalize_path("res://bundled/realmz-reference")}))
		if _check(imported.get("ok",false),"Scenario import failed: " + str(imported.get("error",""))):
			shell._session_view.apply(imported.result)
			await shell._maps.document.load_map("land:0"); await shell._navigation.select_route("maps.land"); await _settle(shell)
			var placed := await _paint_scenario(shell)
			await _check_reopened_art(shell,path,placed)
			await _publish_route(shell)
	shell.free(); await _frames(3); OS.set_environment("PROVIDENCE_PROJECT_PATH",prior)
	if not _failed: print("PROVIDENCE_MAP_PAINT_SCENARIO_OK exact-artwork brush-switch stamp history save-reopen publish-route")
	quit(1 if _failed else 0)


func _paint_scenario(shell) -> Array:
	var helper = shell._maps.special_placement.palette
	var canvas: Control = shell._workbenches.land.get_node("%LandMapCanvas")
	await helper.open(); await _settle(shell)
	var choices: Array = helper.view._rows.filter(func(row): return row.available).slice(0,8).duplicate(true)
	_check(choices.size()==8,"Too few actual Special resources in the scenario catalog")
	var placed: Array = []
	for index in choices.size():
		var choice: Dictionary = choices[index]; var cell := Vector2i(30+index,30)
		await _select_art(shell,int(choice.value))
		canvas.reveal_cell(cell.x,cell.y); await _frames(2)
		await _input_click(canvas,cell); await _settle(shell)
		_check(canvas.cell_artwork(cell).overlay != null,"Painted scenario artwork vanished: " + str(choice.value))
		placed.append({"cell":cell,"value":int(choice.value)})
	helper.show_terrain(); await _settle(shell)
	_check_art(shell,placed)
	var cell := Vector2i(39,30)
	shell._maps.special_placement.select_placement(choices.back())
	await _stamp_destination(shell._maps.land_authoring,cell); await _settle(shell)
	placed.append({"cell":cell,"value":int(choices.back().value)})
	_check_art(shell,placed)
	await shell._undo(); await _settle(shell); await shell._redo(); await _settle(shell)
	_check_art(shell,placed)
	return placed


func _check_art(shell, placed: Array) -> void:
	var canvas: Control = shell._workbenches.land.get_node("%LandMapCanvas")
	var opened: Dictionary = shell._bridge.request("map.open",{"identity":"land:0"})
	for item: Dictionary in placed:
		var cell: Vector2i = item.cell
		_check(int(opened.result.map.tiles[cell.y*90+cell.x]) % 1000 == item.value,"Committed resource identity changed")
		_check(canvas.cell_artwork(cell).overlay != null,"Committed map lost artwork for " + str(item.value))


func _check_reopened_art(shell, path: String, placed: Array) -> void:
	await shell._project_session.save()
	var reopened: Dictionary = shell._bridge.start_project(path)
	_check(reopened.get("ok",false),"Scenario paint reopen failed")
	await shell._activate_session(reopened)
	await shell._maps.document.load_map("land:0"); await shell._navigation.select_route("maps.land"); await _settle(shell)
	_check_art(shell,placed)


func _publish_route(shell) -> void:
	for viewport in [Vector2i(1600,900),Vector2i(1920,1080)]:
		root.size=viewport
		await shell._navigation.select_route("maps.land"); await _settle(shell)
		var revision: int=shell._session_view.revision
		var button: Button=shell._command_bar.get_node("Compile")
		_check(button.text=="Publish" and button.get_global_rect().end.x <= root.size.x,"Publish action is unclear or clipped")
		button.pressed.emit(); await _settle(shell)
		_check(shell._documents.identity_for_tab(shell._document_tabs.current_tab)=="export.export-plan","Toolbar did not open the visible Publish workbench")
		_check(shell._session_view.revision==revision,"Opening Publish changed authored state")
