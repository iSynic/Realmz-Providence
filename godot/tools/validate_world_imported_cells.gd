extends "res://tools/validate_map_paint_cells.gd"


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size()!=1 or not args[0].get_base_dir().get_file().begins_with("providence-maintenance-corpus-"): quit(1); return
	var prior := OS.get_environment("PROVIDENCE_PROJECT_PATH"); OS.set_environment("PROVIDENCE_PROJECT_PATH","")
	root.size=Vector2i(1600,900); root.gui_embed_subwindows=true
	var shell: Control = load("res://src/editor_shell.tscn").instantiate(); shell.set_script(CheckedShell); root.add_child(shell)
	await _frames(3); shell._bridge.stop(); shell._bridge=CellBridge.new(args[0].get_base_dir().path_join("cell-import-settings.cfg"))
	var opened: Dictionary=shell._bridge.start_project(args[0])
	if _check(opened.get("ok",false),"Imported cell project could not open"):
		await shell._activate_session(opened)
		var destination: Dictionary=await _destination(shell)
		if not destination.is_empty(): await _exercise_imported(shell,destination,args[0])
	shell.free(); await _frames(2); OS.set_environment("PROVIDENCE_PROJECT_PATH",prior)
	if not _failed: print("PROVIDENCE_WORLD_IMPORTED_CELLS_OK existing-solids shared-impact preview-pure cancel focus exact-word-preservation atomic-history undo-redo save-reopen original-result no-replay")
	quit(1 if _failed else 0)


func _destination(shell) -> Dictionary:
	for map: Dictionary in shell._maps.document.maps:
		if map.levelType!="land": continue
		var opened: Dictionary=shell._bridge.request("map.open",{"identity":map.identity})
		if not opened.get("ok",false): continue
		for index in opened.result.map.tiles.size():
			var tile:=int(opened.result.map.tiles[index])
			if tile>=0 or tile<=-1000: continue
			var params: Dictionary={"identity":map.identity,"x":index%90,"y":index/90,"expectedRevision":int(shell._session_view.revision)}
			var cell: Dictionary=shell._bridge.request("land-cell.open",params)
			if cell.get("ok",false) and cell.result.cell.solid!=null: return params
	_check(false,"Imported scenario had no representable existing Special Land passability row")
	return {}


func _read_cell(shell, destination: Dictionary) -> Dictionary:
	var params:=destination.duplicate(true); params.expectedRevision=int(shell._session_view.revision)
	var response: Dictionary=shell._bridge.request("land-cell.open",params)
	_check(response.get("ok",false),"Imported cell read failed")
	return response.get("result",{}).get("cell",{})


func _exercise_imported(shell, destination: Dictionary, path: String) -> void:
	await shell._maps.document.load_map(str(destination.identity)); await shell._navigation.select_route("maps.land")
	await _open_cell(shell,int(destination.x),int(destination.y))
	var controller=shell._maps.cell_behavior; var window: Window=controller.view
	var original: Dictionary=_read_cell(shell,destination); var revision: int=shell._session_view.revision
	_check(not window.get_node("%Passability").disabled and original.affectedMaps.size()>0,"Existing imported passability was unavailable or had no shared impact")
	var selected:=0 if original.solid else 1
	window.get_node("%Passability").select(selected); window.get_node("%Passability").item_selected.emit(selected)
	await controller.review()
	_check(window.review_is_current() and window.get_node("%CellImpact").item_count==original.affectedMaps.size() and _read_cell(shell,destination).solid==original.solid,
		"Imported passability review wrote early or omitted affected maps")
	window.get_node("%DiscardCellBehavior").pressed.emit(); window.cancel(); await _frames(2)
	_check(_read_cell(shell,destination)==original and shell._maps._inspector.get_node("%CellBehavior").has_focus(),"Imported Cancel changed passability or lost focus")
	await controller.open(); window.get_node("%Passability").select(selected); window.get_node("%Passability").item_selected.emit(selected)
	await controller.review(); await controller.apply_review(); await _settle(shell)
	var changed: Dictionary=_read_cell(shell,destination)
	_check(changed.solid!=original.solid and changed.before==original.before and shell._session_view.revision==revision+1,"Passability Apply changed a map word or lost atomic history")
	await shell._undo(); _check(_read_cell(shell,destination).solid==original.solid,"Imported passability Undo lost its exact value")
	await shell._redo(); _check(_read_cell(shell,destination).solid==changed.solid,"Imported passability Redo lost its reviewed value")
	await controller.open(); window.get_node("%Passability").select(1-selected); window.get_node("%Passability").item_selected.emit(1-selected)
	await controller.review(); shell._bridge.drop_cell=true; var writes: int=shell._bridge.cell_writes
	await controller.apply_review(); await controller.check_original(); await _settle(shell)
	_check(_read_cell(shell,destination).solid==original.solid and shell._bridge.cell_writes==writes+1,"Imported original-result recovery replayed or lost the original operation")
	await shell._project_session.save(); var reopened: Dictionary=shell._bridge.start_project(path)
	_check(reopened.get("ok",false),"Imported passability project did not reopen")
	await shell._activate_session(reopened); _check(_read_cell(shell,destination).solid==original.solid,"Save/reopen lost imported passability")
