extends "res://tools/validate_map_paint_resources.gd"


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size()!=1 or not args[0].get_file().begins_with("providence-ui-paint-"): quit(1); return
	var prior := OS.get_environment("PROVIDENCE_PROJECT_PATH"); OS.set_environment("PROVIDENCE_PROJECT_PATH","")
	root.size=Vector2i(1600,900); root.gui_embed_subwindows=true
	var shell: Control = load("res://src/editor_shell.tscn").instantiate(); shell.set_script(CheckedShell); root.add_child(shell)
	await _frames(3); shell._bridge.stop(); shell._bridge=ResourceBridge.new(args[0].path_join("links-settings.cfg"))
	var path: String=args[0].path_join("links-project"); var created: Dictionary=shell._bridge.create_project("map-links",path)
	if _check(created.get("ok",false),"Map link project could not open"):
		await shell._activate_session(created)
		if await _setup(shell):
			await _script_link(shell,"land:1",Vector2i(11,11))
			if _mutate(shell,"map.create",{"levelType":"dungeon"}):
				await shell._reload_map_catalog(); await shell._navigation.open_map("dungeon:0")
				await _script_link(shell,"dungeon:0",Vector2i(8,8))
			await shell._project_session.save(); var reopened: Dictionary=shell._bridge.start_project(path)
			_check(reopened.get("ok",false),"Linked AP project could not reopen")
			await shell._activate_session(reopened)
			for identity in ["land:1","dungeon:0"]:
				var opened: Dictionary=shell._bridge.request("map.open",{"identity":identity})
				_check(opened.result.actionPoints.any(func(row): return int(row.coordinate.x)==(11 if identity=="land:1" else 8)),"Save/reopen lost a linked Action Point")
	shell.free(); await _frames(2); OS.set_environment("PROVIDENCE_PROJECT_PATH",prior)
	if not _failed: print("PROVIDENCE_MAP_PAINT_LINKS_OK land-dungeon contextual-creation exact-existing-open no-overwrite local-settings history linked-return selection zoom pan focus save-reopen teardown")
	quit(1 if _failed else 0)


func _script_link(shell, identity: String, cell: Vector2i) -> void:
	var dungeon := identity.begins_with("dungeon:")
	var view: Control=shell._workbenches.dungeon if dungeon else shell._workbenches.land
	var canvas: Control=view.get_node("%DungeonMapCanvas" if dungeon else "%LandMapCanvas")
	var button: Button=view.get_node("%CellScript" if dungeon else "PaintSelectionContext/CellScript")
	canvas.restore_navigation_state({"zoom":2,"pan":[-24,36],"cell":[cell.x,cell.y],"showActionPoints":true},true)
	await _settle(shell); button.grab_focus(); var before: Dictionary=view.read_navigation_state(); var revision: int=shell._session_view.revision
	button.pressed.emit(); await _settle(shell)
	var editor: Control=shell._documents.view("scripts.action-points")
	_check(shell._documents.identity_for_tab(shell._document_tabs.current_tab)=="scripts.action-points" and editor.current_map_identity()==identity and int(editor.get_node("%NewActionPointX").value)==cell.x and int(editor.get_node("%NewActionPointY").value)==cell.y,"Contextual creation lost the owning map or coordinate")
	_check(shell._session_view.revision==revision,"Opening Action Point creation wrote before explicit acceptance")
	editor.get_node("%CreateActionPoint").pressed.emit(); await _settle(shell)
	var chosen: String=editor.selected_identity()
	_check(not chosen.is_empty() and shell._session_view.revision==revision+1,"Explicit contextual creation did not make one bounded history entry")
	await shell._navigation.navigate_back(); await _settle(shell)
	var restored: Dictionary=view.read_navigation_state()
	_check(shell._maps.document.identity==identity and restored.canvas==before.canvas and button.has_focus(),"AP Back lost map, coordinate, zoom, pan or focus")
	_check(button.text=="Open Action Point…","Occupied AP cell still offered creation")
	button.pressed.emit(); await _settle(shell)
	_check(editor.selected_identity()==chosen and shell._session_view.revision==revision+1,"Opening an occupied cell overwrote it or selected the wrong AP")
	await shell._navigation.navigate_back(); await _settle(shell)
