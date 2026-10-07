extends RefCounted

signal width_changed(width: int)

var land_inspector: Control
var dungeon_inspector: Control
var _sidebar: Control
var _land: Control
var _dungeon: Control
var _map
var _paint
var _smart
var _magic
var _regions
var _guard: Callable
var _setup: Callable
var _section: Callable
var _cell_tool: Callable
var _current_tool := "select"
var _current_land := "paint"
var _land_author
var _tool_request_generation := 0
var stamps := preload("res://src/stamp_inspector_controller.gd").new()


func initialize(sidebar: Control, land: Control, dungeon: Control, host: Control, inspector: Control, map, paint, smart, magic, regions, guard: Callable, setup: Callable, section: Callable, cell_tool: Callable) -> void:
	_sidebar = sidebar; _land = land; _dungeon = dungeon; _map = map; _paint = paint; _smart = smart; _regions = regions
	_guard = guard; _setup = setup; _section = section; _cell_tool = cell_tool
	land_inspector = preload("res://src/map_inspector_workspace.tscn").instantiate(); host.add_child(land_inspector)
	land_inspector.mount(paint.workspace.tiles_dock, "paint")
	land_inspector.mount(inspector, "selection")
	_magic=magic
	land_inspector.mount(smart.view.get_node("%SmartDetails"), "smart")
	land_inspector.mount(magic.view.get_node("%MagicDetails"), "magic")
	sidebar.mount_brush_controls(smart.view)
	sidebar.mount_brush_controls(magic.view)
	land_inspector.mount(regions.view, "regions")
	dungeon_inspector = dungeon.get_node("%DungeonCellInspector")
	dungeon_inspector.mount(dungeon.get_node("%DungeonCellBody"), "draw")
	land_inspector.pane_requested.connect(_pane)
	dungeon_inspector.pane_requested.connect(_pane)
	land_inspector.width_changed.connect(width_changed.emit)
	_sidebar.authoring_tool_requested.connect(request_tool)
	_dungeon.tool_changed.connect(_present_tool)
	_land.paint_tool_requested.connect(_present_tool)
	smart.active_changed.connect(_smart_changed)
	magic.active_changed.connect(_magic_changed)
	smart.view.recovery_changed.connect(land_inspector.set_recovery_available)
	land_inspector.recovery_requested.connect(smart.check_original)
	smart.set_focus_origin(sidebar.get_node("%SmartTool"))
	land_inspector.show_pane("paint", "Paint Inspector")
	dungeon_inspector.show_pane("draw", "Dungeon Draw")
	_land.get_node("PaintTools").hide()
	_dungeon.get_node("DungeonWorkbench/DungeonCanvasRegion/DungeonTools").hide()


func present(canvas_active: bool, connected: bool, available: bool) -> void:
	_sidebar.present_land_paint(not _map.is_dungeon, available)
	_sidebar.present_world_context(canvas_active)
	land_inspector.visible = canvas_active and (not _map.is_dungeon or _regions.active)
	for pane in [land_inspector, dungeon_inspector]: pane.set_context(_map.is_dungeon, connected and not _map.identity.is_empty())
	if _current_tool == "action-point":
		(dungeon_inspector if _map.is_dungeon else land_inspector).show_pane("action-point","Action Point Placement")
		_sidebar.set_tool_mode("action-point"); return
	if land_inspector.visible:
		land_inspector.show_pane("regions" if _regions.active else "smart" if _smart.is_open() else "magic" if _magic.is_open() else _current_land, "Random Rectangles" if _regions.active else "Paint Inspector" if _current_land != "selection" else "Selection Inspector")
		if _smart.is_open(): _sidebar.set_tool_mode("smart")
		elif _magic.is_open(): _sidebar.set_tool_mode("magic")
		elif _current_land == "stamp": _sidebar.set_tool_mode("stamp")


func request_tool(tool: String) -> void:
	if _map.identity.is_empty(): return
	_tool_request_generation += 1
	var generation := _tool_request_generation
	var origin: String = _map.identity
	if not _map.is_dungeon and not await _land_author.cancel_selection_preview(): return
	if generation != _tool_request_generation or _map == null or _map.identity != origin: return
	await _guard.call(_activate.bind(tool), "changing Map tools")


func _activate(tool: String) -> void:
	if tool != "magic" and _magic.is_open(): _magic.discard_draft()
	if tool == "smart": await _smart.open(); return
	if _smart.is_open(): _smart.discard_draft()
	if _regions.active: _regions.close()
	if tool == "magic": await _magic.open(); return
	if tool == "stamp": await _cell_tool.call("stamp"); return
	if _map.is_dungeon: _dungeon.request_tool(tool)
	elif tool == "wand": _land.paint_tool_requested.emit("wand")
	else: _land.paint_tool_requested.emit(tool)
	_present_tool(tool)
	if not _map.is_dungeon: land_inspector.restore()


func _present_tool(tool: String) -> void:
	_current_tool = tool
	if _smart.is_open(): _sidebar.set_tool_mode("smart"); return
	if _magic.is_open(): _sidebar.set_tool_mode("magic"); return
	_sidebar.set_tool_mode(tool)
	if tool == "action-point":
		(dungeon_inspector if _map.is_dungeon else land_inspector).show_pane("action-point","Action Point Placement")
		return
	if not _map.is_dungeon and tool != "smart":
		_current_land = "stamp" if tool == "stamp" else "selection" if tool in ["select", "wand"] else "paint"
		land_inspector.show_pane(_current_land, "Selection Inspector" if _current_land == "selection" else "Paint Inspector")
	elif _map.is_dungeon:
		dungeon_inspector.show_pane("stamp" if tool == "stamp" else "draw", "Dungeon Draw")
	if tool == "stamp": (dungeon_inspector if _map.is_dungeon else land_inspector).restore()


func bind_stamps(land_author, dungeon_stamps) -> void:
	_land_author = land_author; land_author.tool_activated.connect(_present_land_tool)
	stamps.initialize(land_author, dungeon_stamps, land_inspector, dungeon_inspector, _land, _dungeon, _paint.workspace.tiles_dock.ui.atlas, _present_tool, request_tool.bind("stamp"))


func _present_land_tool(tool: String) -> void:
	if not _map.is_dungeon: _present_tool(tool)


func _smart_changed(active: bool) -> void:
	_sidebar.show_brush_controls(active or _magic.is_open())
	if active: _sidebar.set_tool_mode("smart"); land_inspector.show_pane("smart", "Paint Inspector"); land_inspector.restore()
	else: land_inspector.show_pane(_current_land, "Selection Inspector" if _current_land == "selection" else "Paint Inspector")


func _magic_changed(active: bool) -> void:
	_sidebar.show_brush_controls(active or _smart.is_open())
	if active: _sidebar.set_tool_mode("magic"); land_inspector.show_pane("magic","Paint Inspector"); land_inspector.restore()
	else: land_inspector.show_pane(_current_land,"Selection Inspector" if _current_land=="selection" else "Paint Inspector")


func _pane(label: String) -> void:
	await _guard.call(_accept_pane.bind(label), "changing Map inspector")


func _accept_pane(label: String) -> void:
	if _smart.is_open(): _smart.discard_draft()
	if _magic.is_open(): _magic.discard_draft()
	if _regions.active and label != "Random Rectangles": _regions.close()
	match label:
		"Action Point Placement": await request_tool("action-point")
		"Map Setup": await _setup.call()
		"Land Layout": await _section.call("LandLayout")
		"Land Tiles": await _section.call("LandTiles")
		"Random Rectangles": await _section.call("RandomEncounters")
		"Dungeon Draw": dungeon_inspector.show_pane("draw", label); dungeon_inspector.restore()
		_:
			if _map.is_dungeon: dungeon_inspector.show_pane("draw", label); dungeon_inspector.restore()
			else: _current_land = "selection" if label == "Selection Inspector" else "paint"; land_inspector.show_pane(_current_land, label); land_inspector.restore()


func preferred_width() -> int:
	return land_inspector.preferred_width() if is_instance_valid(land_inspector) else 352


func remember_width(width: int) -> void:
	if is_instance_valid(land_inspector): land_inspector.remember_width(width)


func collapse() -> void:
	(dungeon_inspector if _map.is_dungeon else land_inspector).collapse()


func dispose() -> void:
	stamps.dispose()
	_land_author.tool_activated.disconnect(_present_land_tool); _land_author = null
	_sidebar.authoring_tool_requested.disconnect(request_tool)
	_dungeon.tool_changed.disconnect(_present_tool); _land.paint_tool_requested.disconnect(_present_tool)
	_smart.active_changed.disconnect(_smart_changed)
	_magic.active_changed.disconnect(_magic_changed)
	_smart.view.recovery_changed.disconnect(land_inspector.set_recovery_available)
	land_inspector.recovery_requested.disconnect(_smart.check_original)
	land_inspector.pane_requested.disconnect(_pane); dungeon_inspector.pane_requested.disconnect(_pane)
	land_inspector.width_changed.disconnect(width_changed.emit)
	for connection in width_changed.get_connections(): width_changed.disconnect(connection.callable)
	_map = null; _paint = null; _smart = null; _magic = null; _regions = null
	_guard = Callable(); _setup = Callable(); _section = Callable(); _cell_tool = Callable()


func mount_ap_placement() -> void:
	for inspector in [land_inspector,dungeon_inspector]:
		var panel := preload("res://src/map_ap_placement_inspector.tscn").instantiate()
		inspector.add_child(panel); inspector.mount(panel,"action-point")
