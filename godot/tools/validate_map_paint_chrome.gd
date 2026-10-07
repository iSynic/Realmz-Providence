extends "res://tools/validate_map_paint_smart.gd"


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 1 or not args[0].get_file().begins_with("providence-ui-paint-"): push_error("A disposable Maps chrome root is required"); quit(1); return
	OS.set_environment("PROVIDENCE_PROJECT_PATH", "")
	root.size = Vector2i(1600, 900); root.gui_embed_subwindows = true
	var shell: Control = load("res://src/editor_shell.tscn").instantiate(); shell.set_script(CheckedShell); root.add_child(shell)
	await _frames(3); shell._bridge.stop(); shell._bridge = SmartBridge.new(args[0].path_join("chrome-settings.cfg"))
	var created: Dictionary = shell._bridge.create_project("maps-chrome", args[0].path_join("chrome-project"))
	if _check(created.get("ok", false), "Maps chrome project creation failed"):
		await shell._activate_session(created)
		if await _setup(shell):
			await _chooser_and_tools(shell)
			await _wand_switching(shell)
			await _inspectors(shell)
			await _dirty_tools(shell)
	shell.free(); await _frames(2)
	if not _failed: print("PROVIDENCE_MAP_PAINT_CHROME_OK chooser tools wand-select-pointer preserved-shape canceled-gesture inline-smart collapsed-recovery guarded-switch both-viewports no-early-write")
	quit(1 if _failed else 0)


func _chooser_and_tools(shell) -> void:
	var sidebar: Control = shell._map_context_sidebar
	sidebar.get_node("%ChooseMap").pressed.emit(); await _frames(2)
	_check(sidebar.get_node("%MapPicker").visible and sidebar.search.has_focus(), "Map picker did not open with search focus")
	sidebar.search.text = "land:1"; sidebar.search.text_changed.emit(sidebar.search.text); await _frames(1)
	_check(sidebar.collection.item_count == 1, "Map chooser search did not find exact named map")
	sidebar.get_node("%MapPicker").hide(); sidebar.search.text = ""; sidebar.search.text_changed.emit("")
	var revision: int = shell._session_view.revision
	for node: String in ["PaintTool", "PanTool", "SampleTool", "BucketTool", "WandTool", "EraseTool", "SelectTool"]:
		var button: Button = sidebar.get_node("%" + node)
		_check(button.is_visible_in_tree() and not button.disabled, "Sidebar tool unavailable: " + node)
		button.pressed.emit(); await _settle(shell)
	_check(shell._session_view.revision == revision, "Choosing tools wrote the map")
	await shell._maps.chrome.request_tool("paint")


func _wand_switching(shell) -> void:
	for x in [70, 71]:
		if not _mutate(shell, "map.update-cell", {"identity":"land:1", "x":x, "y":70, "tile":5}): return
	await shell._maps.document.load_map("land:1")
	var author = shell._maps.land_authoring
	var sidebar: Control = shell._map_context_sidebar
	var canvas: ProvidenceMapCanvas = author._overlay.get_parent()
	var revision: int = shell._session_view.revision
	var before := _tiles(shell)
	for viewport in [Vector2i(1920,1080), Vector2i(1600,900)]:
		root.size = viewport; await _frames(4)
		author.options.shape = "freehand"; author.options.match = "connected-behavior"
		sidebar.get_node("%WandTool").pressed.emit(); await _settle(shell)
		_area_pointer(author._overlay, Vector2i(70,70), true); _area_pointer(author._overlay, Vector2i(70,70), false)
		await _settle(shell)
		_check(author.selected.size() == 2 and sidebar.get_node("%WandTool").button_pressed, "Wand did not select only its connected exact tile region")
		sidebar.get_node("%SelectTool").pressed.emit(); await _settle(shell)
		_pointer(canvas, Vector2i(70,70), true); _pointer(canvas, Vector2i(70,70), false)
		_check(author.selected == [{"x":70,"y":70}] and not author._overlay.active, "Select kept Wand selection after switching tools")
		_check(author.options.match == "connected-behavior", "Wand replaced the saved selection matching preference")
		author.options.shape = "rectangle"
		sidebar.get_node("%WandTool").pressed.emit(); await _settle(shell)
		sidebar.get_node("%SelectTool").pressed.emit(); await _settle(shell)
		_area_pointer(author._overlay, Vector2i(70,70), true)
		var motion := InputEventMouseMotion.new(); motion.position = canvas.cell_rect(Vector2i(71,72)).get_center()
		author._overlay._gui_input(motion); _area_pointer(author._overlay, Vector2i(71,72), false)
		await _settle(shell)
		_check(author.selected.size() == 6 and author.options.shape == "rectangle", "Wand replaced the author's previous rectangle selection")
		sidebar.get_node("%WandTool").pressed.emit(); await _settle(shell)
		_area_pointer(author._overlay, Vector2i(70,70), true)
		sidebar.get_node("%SelectTool").pressed.emit(); await _settle(shell)
		_area_pointer(author._overlay, Vector2i(70,70), false); await _settle(shell)
		_check(author.selected.size() == 6 and author._overlay.preview.is_empty(), "Switching tools accepted a stale Wand gesture: selected=%d preview=%d tool=%s" % [author.selected.size(), author._overlay.preview.size(), author._tool])
		sidebar.get_node("%WandTool").pressed.emit(); await _settle(shell)
		_area_pointer(author._overlay, Vector2i(70,70), true); _area_pointer(author._overlay, Vector2i(70,70), false)
		sidebar.get_node("%SelectTool").pressed.emit(); await _settle(shell)
		_check(author._tool == "select" and author.selected.size() == 6, "Tool switch during released Wand acceptance was lost")
		sidebar.get_node("%WandTool").pressed.emit(); await _settle(shell)
		_area_pointer(author._overlay, Vector2i(70,70), true)
		sidebar.get_node("%SelectTool").pressed.emit(); sidebar.get_node("%PanTool").pressed.emit(); await _settle(shell)
		_check(author._tool == "pan" and sidebar.get_node("%PanTool").button_pressed, "A superseded tool request won over the latest request")
	_check(shell._session_view.revision == revision and _tiles(shell) == before, "Wand or Select wrote terrain or document history")
	author.options.shape = "freehand"; sidebar.get_node("%SelectTool").pressed.emit(); await _settle(shell)


func _area_pointer(overlay: Control, cell: Vector2i, pressed: bool) -> void:
	var event := InputEventMouseButton.new(); event.button_index = MOUSE_BUTTON_LEFT; event.pressed = pressed
	event.position = overlay.get_parent().cell_rect(cell).get_center()
	overlay._gui_input(event)


func _inspectors(shell) -> void:
	var inspector: Control = shell._maps.chrome.land_inspector
	for viewport in [Vector2i(1920, 1080), Vector2i(1600, 900)]:
		root.size = viewport; await _frames(5)
		var before: Dictionary = shell._workbenches.land.read_navigation_state()
		var split: SplitContainer = shell._layout._document_split
		split.split_offset = int((split.size.x - split.get_theme_constant("separation")) / 2) - 400
		split.dragged.emit(split.split_offset); await _frames(3)
		inspector.get_node("%CollapseMapInspector").pressed.emit(); await _frames(3)
		_check(inspector.get_node("%ShowMapInspector").is_visible_in_tree() and inspector.size.x <= 140, "Collapsed inspector lost its recovery rail")
		inspector.get_node("%ShowMapInspector").pressed.emit(); await _frames(3)
		_check(inspector.get_node("%InspectorChooser").is_visible_in_tree() and shell._workbenches.land.read_navigation_state() == before, "Inspector collapse changed canvas state")
		var chooser: OptionButton = inspector.get_node("%InspectorChooser")
		chooser.select(3); chooser.item_selected.emit(3); await _settle(shell)
		_check(shell._map_inspector.is_visible_in_tree(), "Selection Inspector did not open")
		chooser.select(1); chooser.item_selected.emit(1); await _settle(shell)
		_check(shell._maps.paint.workspace.tiles_dock.is_visible_in_tree(), "Paint Inspector did not return")
		_check(absf(shell._layout._inspector_host.size.x - 400) < 5, "Pane changes lost the resized inspector width")
		var land: Control = shell._workbenches.land
		for control in [land.get_node("MapToolbar/ZoomIn"),land.get_node("MapToolbar/ZoomFit"),land.get_node("PaintSelectionContext/CellScript")]:
			_check(land.get_global_rect().encloses(control.get_global_rect()), "Map controls overflowed the compact document")


func _dirty_tools(shell) -> void:
	var smart = shell._maps.smart_terrain
	await smart.open(); smart.view.accept_mask([{"x":30,"y":30},{"x":31,"y":30}]); await smart.review()
	var draft: Dictionary = smart.view.draft()
	var chooser: OptionButton = shell._maps.chrome.land_inspector.get_node("%InspectorChooser")
	chooser.select(3); chooser.item_selected.emit(3); await _frames(3)
	_check(shell._unapplied_dialog.visible, "Changing the inspector skipped the Smart draft guard")
	shell._unapplied_dialog.canceled.emit(); shell._unapplied_dialog.hide(); await _frames(3)
	_check(chooser.selected == 1 and smart.view.draft() == draft, "Cancelled inspector change lost its actual pane label or draft")
	shell._map_context_sidebar.get_node("%PanTool").pressed.emit(); await _frames(3)
	_check(shell._unapplied_dialog.visible, "Changing tool skipped the Smart draft guard")
	shell._unapplied_dialog.canceled.emit(); shell._unapplied_dialog.hide(); await _frames(3)
	_check(smart.is_open() and smart.view.draft() == draft, "Cancel lost the Smart mask")
	shell._bridge.lose_smart = true; await smart.commit_selected()
	shell._maps.chrome.land_inspector.collapse(); await _frames(3)
	_check(shell._maps.chrome.land_inspector.get_node("%RecoverMapOperation").is_visible_in_tree(), "Uncertain outcome recovery disappeared when collapsed")
	await smart.check_original(); await _settle(shell)
	_check(not smart.is_open(), "Recovered Smart operation remained pending")
	shell._maps.chrome.land_inspector.restore()
