extends RefCounted

signal failed(message: String)

const Target = preload("res://src/map_selection_target.gd")
var selected: ProvidenceMapSelectionTarget
var windows := preload("res://src/editor_tool_windows.gd").new()
var _maps
var _registry
var _operations: ProvidenceEditorOperation
var _navigation
var _scripts
var _players
var _commands
var _drafts
var _guard
var _context: Callable
var _bridge: RefCounted
var _owner: Node
var _chooser: PopupPanel
var _panels: Dictionary = {}
var _generation := 0
var _selection := 0
var _queued := false
var _reading := false
var _catalog: Dictionary = {}
var _canvases: Array = []
var _last_revision := -1
var _refreshing_windows := false


func initialize(owner: Node, maps, registry, operations: ProvidenceEditorOperation, navigation, scripts, players, drafts, commands, context: Callable, guard) -> void:
	_owner = owner; _maps = maps; _registry = registry; _operations = operations; _navigation = navigation
	_scripts = scripts; _players = players; _drafts = drafts; _commands = commands; _context = context; _guard = guard
	windows.initialize(owner, registry, drafts, operations, commands.dispatch, context)
	windows.register("ap", registry.view("scripts.action-points"), "Action Points", Callable(), "scripts.action-points")
	windows.register("player", registry.view("player-maps.map-records"), "Player Maps", Callable(), "player-maps.map-records")
	windows.register("region", maps.regions.view, "Random Rectangles", Callable())
	drafts.register_editor(maps.regions.view, maps.regions.has_unapplied_changes, maps.regions.discard_draft, maps.regions.commit_selected)
	windows.changed.connect(_window_changed)
	commands.history_state_changed.connect(windows.set_history)
	_create_views()
	for route in ["maps.land", "maps.dungeon"]:
		var canvas: ProvidenceMapCanvas = registry.view(route).get_node("%LandMapCanvas" if route == "maps.land" else "%DungeonMapCanvas")
		canvas.record_selection_requested.connect(_click.bind(canvas)); _canvases.append(canvas)
	maps.document.document_opened.connect(_document_opened)
	maps.document.document_cleared.connect(clear)
	operations.completed.connect(_completed)
	maps.chrome.context_pane_requested.connect(_pane_requested)
	maps.regions.view.detach_requested.connect(_detach_region)
	commands.project_guard = guard.request_all
	owner.get_tree().auto_accept_quit = false
	owner.get_tree().root.close_requested.connect(func(): commands.dispatch(&"file.exit"))


func _create_views() -> void:
	_chooser = preload("res://src/map_selection_chooser.tscn").instantiate(); _owner.add_child(_chooser)
	_chooser.chosen.connect(_choose)
	for key in ["ap", "player", "region-preview"]:
		var panel: Control = preload("res://src/map_record_sidebar.tscn").instantiate()
		_owner.add_child(panel); panel.hide(); _panels[key] = panel
		panel.draft_probe = _update_draft_status
		panel.edit_requested.connect(_edit.bind(key))
		panel.focus_editor_requested.connect(func(): _focus(key))
		panel.target_requested.connect(_open_reference)
		panel.reveal_requested.connect(func(cell):
			if selected != null and selected.map_identity == _maps.document.identity:
				var canvas: ProvidenceMapCanvas = _canvases[1 if _maps.document.is_dungeon else 0]
				canvas.reveal_cell(cell.x, cell.y))
		panel.flow_requested.connect(func():
			if selected != null: _commands.open_record_flow({"kind": "action-point", "identity": selected.identity, "scope": "scenario"}))


func attach_session(bridge: RefCounted) -> void:
	_generation += 1; _bridge = bridge; _catalog.clear(); _queued = false
	if _owner != null: windows.dock_all(); clear()


func clear() -> void:
	_selection += 1; selected = null; _queued = false
	if _chooser != null: _chooser.hide()
	for canvas: ProvidenceMapCanvas in _canvases: canvas.set_record_highlight({})
	if _maps != null: _maps.chrome.clear_record_context()


func _click(cell: Vector2i, point: Vector2, canvas: ProvidenceMapCanvas) -> void:
	if _maps.mode != "select": return
	if _maps.has_unapplied_changes(): await _navigation.request_authoring_navigation(_select_at.bind(cell, point, canvas), "selecting on the map")
	else: _select_at(cell, point, canvas)


func _select_at(cell: Vector2i, point: Vector2, canvas: ProvidenceMapCanvas) -> void:
	canvas.select_cell(cell.x, cell.y, false)
	var hits := preload("res://src/map_selection_hits.gd").collect(canvas, _maps.document.identity, cell, point,
		canvas.get_node("RandomRegionOverlay"), canvas.get_node("MapViewOverlay"))
	var plain := Target.create(Target.Kind.CELL, "", _maps.document.identity, cell, "Select cell %d, %d" % [cell.x, cell.y])
	if hits.is_empty(): _choose(plain)
	elif hits.size() == 1: _choose(hits[0])
	else:
		var popup_point := Vector2i(canvas.global_position + point) if _owner.get_viewport().gui_embed_subwindows else Vector2i(canvas.get_screen_transform() * point)
		_chooser.present(hits, plain, popup_point)


func _choose(target: ProvidenceMapSelectionTarget) -> void:
	if target.map_identity != _maps.document.identity: return
	if target.kind == Target.Kind.CELL:
		await _navigation.request_authoring_navigation(_select_plain.bind(target), "selecting a map cell"); return
	if target.kind == Target.Kind.RANDOM_RECTANGLE and not windows.is_detached("region"):
		if not _operations.busy:
			await _navigation.request_authoring_navigation(_select_region.bind(target), "selecting another rectangle"); return
	_accept_selection(target)
	var key := "ap" if target.kind == Target.Kind.ACTION_POINT else "player" if target.kind == Target.Kind.PLAYER_MAP else "region-preview"
	_show_panel(key); _queue_read()


func _select_plain(target: ProvidenceMapSelectionTarget) -> void:
	clear()
	if not _maps.regions.pinned: _maps.regions.close()
	_maps.chrome.present_record_context("selection", "Selection Inspector", null)


func _select_region(target: ProvidenceMapSelectionTarget) -> void:
	if target.map_identity != _maps.document.identity: return
	_accept_selection(target)
	await _maps.regions.open(target.slot)
	if selected == target: _maps.chrome.present_record_context("regions", "Random Rectangles", _maps.regions.view)


func _accept_selection(target: ProvidenceMapSelectionTarget) -> void:
	_selection += 1; selected = target; _queued = false
	_chooser.hide()
	var canvas: ProvidenceMapCanvas = _canvases[1 if _maps.document.is_dungeon else 0]
	canvas.set_record_highlight({"kind": target.kind, "identity": target.identity, "cell": target.cell})


func _show_panel(key: String) -> void:
	var label := "Action Points" if key == "ap" else "Player Maps" if key == "player" else "Random Rectangles"
	_maps.chrome.present_record_context(key, label, _panels[key])
	_panels[key].loading(selected.identity, key == "ap")


func _queue_read() -> void:
	_queued = selected != null and selected.kind != Target.Kind.CELL
	if _queued and not _reading and not _operations.busy: _drain()


func _drain() -> void:
	_reading = true
	while _queued and _bridge != null:
		_queued = false
		var target := selected; var token := {"session": _generation, "selection": _selection, "revision": int(_context.call().revision)}
		var response := await _operations.run_workflow(_bridge, "Read map selection", _read.bind(target, token), null, true)
		if _matches(token) and not response.get("ok", false): _panel_for(target).show_failure(str(response.get("error", "Selection unavailable.")))
		if _matches(token) and response.get("ok", false) and target.kind == Target.Kind.RANDOM_RECTANGLE and not windows.is_detached("region") and not _maps.has_unapplied_changes(): await _select_region(target)
	_reading = false


func _read(operation: ProvidenceEditorOperation, target: ProvidenceMapSelectionTarget, token: Dictionary) -> Dictionary:
	var panel: Control = _panel_for(target)
	var method := "action-point.open" if target.kind == Target.Kind.ACTION_POINT else "player-map.open" if target.kind == Target.Kind.PLAYER_MAP else "random-region.open"
	var params := {"mapIdentity": target.map_identity, "slot": target.slot} if target.kind == Target.Kind.RANDOM_RECTANGLE else {"identity": target.identity}
	var response := await operation.request(method, params)
	if not _matches(token): return {"ok": false, "stale": true}
	if not response.get("ok", false):
		if str(response.get("error", "")).to_lower().contains("not found"): clear()
		return response
	if target.kind == Target.Kind.ACTION_POINT:
		if _catalog.is_empty():
			var catalog := await operation.request("action-definition.list", {"cursor": "0", "limit": 128})
			if not _matches(token): return {"ok": false, "stale": true}
			if not catalog.get("ok", false): return catalog
			_catalog = catalog.result
		panel.present_ap(response.result, _catalog)
	elif target.kind == Target.Kind.PLAYER_MAP:
		panel.present_player_map(response.result)
		var preview := await operation.request("player-map.preview", {"expectedRevision": token.revision, "playerMap": response.result.playerMap})
		if _matches(token): panel.receive_preview(preview)
	else: panel.present_region(response.result)
	_update_draft_status()
	return response


func _matches(token: Dictionary) -> bool:
	return _bridge != null and token.session == _generation and token.selection == _selection and token.revision == int(_context.call().revision) and selected != null and selected.map_identity == _maps.document.identity


func _panel_for(target: ProvidenceMapSelectionTarget) -> Control:
	return _panels["ap" if target.kind == Target.Kind.ACTION_POINT else "player" if target.kind == Target.Kind.PLAYER_MAP else "region-preview"]


func _edit(slot: int, detached: bool, key: String) -> void:
	if selected == null or _operations.busy: return
	var target := selected
	var editor: Control = _registry.view("scripts.action-points" if key == "ap" else "player-maps.map-records") if key != "region-preview" else _maps.regions.view
	var id := str(editor.read_state().get("identity", "")) if editor.has_method("read_state") else str(editor.draft.get("identity", ""))
	if id == target.identity:
		await _open_editor(target, slot, detached, key); return
	_drafts.guard_editor(editor)
	await _guard.request(_open_editor.bind(target, slot, detached, key), "opening the selected record")


func _open_editor(target: ProvidenceMapSelectionTarget, slot: int, detached: bool, key: String) -> void:
	if target.map_identity != _maps.document.identity: return
	var window_key := "region" if key == "region-preview" else key
	var opened := true
	if key == "ap": opened = await _scripts.open_action_point_at_step(target.identity, slot)
	elif key == "player":
		if str(_registry.view("player-maps.map-records").read_state().get("identity", "")) != target.identity:
			opened = (await _players.open_record(target.identity)).get("ok", false)
	else:
		_maps.regions.pinned = false
		opened = (await _maps.regions.open(target.slot)).get("ok", false)
	if not opened: return
	if detached:
		windows.detach(window_key)
		if window_key == "region": _maps.regions.pinned = true
	elif windows.is_detached(window_key): windows.focus(window_key)
	elif key == "region-preview": _maps.chrome.present_record_context("regions", "Random Rectangles", _maps.regions.view)
	elif key != "region-preview": await _navigation.select_route("scripts.action-points" if key == "ap" else "player-maps.map-records")
	_update_draft_status()


func _focus(key: String) -> void:
	if windows.is_detached("region" if key == "region-preview" else key): windows.focus("region" if key == "region-preview" else key)
	else: _edit(0, false, key)


func _open_reference(reference: Dictionary) -> void:
	if str(reference.get("resolution", "missing")) != "resolved": return
	var kind := str(reference.get("targetKind", "")); var identity := str(reference.get("targetId", ""))
	if kind in ["map", "action-point"]: await _maps.open_reference(reference); return
	var native_id := preload("res://src/source_navigation.gd").last_integer(identity)
	await _navigation.open_script_target(kind, native_id, identity, {})


func _detach_region() -> void:
	windows.detach("region"); _maps.regions.pinned = true
	if selected != null and selected.kind == Target.Kind.RANDOM_RECTANGLE:
		_show_panel("region-preview"); _queue_read()


func _window_changed() -> void:
	_maps.regions.pinned = windows.is_detached("region")
	if not _maps.regions.pinned and selected != null and selected.kind == Target.Kind.RANDOM_RECTANGLE and selected.map_identity == _maps.document.identity:
		_maps.chrome.present_record_context("regions", "Random Rectangles", _maps.regions.view)
	_update_draft_status()


func _update_draft_status() -> void:
	if selected == null: return
	var editor: Control = _registry.view("scripts.action-points" if selected.kind == Target.Kind.ACTION_POINT else "player-maps.map-records") if selected.kind != Target.Kind.RANDOM_RECTANGLE else _maps.regions.view
	var id := str(editor.read_state().get("identity", "")) if editor.has_method("read_state") else ""
	if editor == _maps.regions.view: id = str(editor.draft.get("identity", ""))
	_panel_for(selected).set_draft_status(id == selected.identity and _drafts.editor_has_draft(editor))


func _completed(_response: Dictionary) -> void:
	if _owner == null: return
	if not _owner.get_tree().process_frame.is_connected(_settled): _owner.get_tree().process_frame.connect(_settled, CONNECT_ONE_SHOT)


func _settled() -> void:
	if _owner == null: return
	windows.refresh(); _update_draft_status()
	var revision := int(_context.call().revision)
	if revision != _last_revision and not _refreshing_windows:
		_last_revision = revision; _queue_read(); _refresh_detached()
	if _queued and not _reading and not _operations.busy: _drain()


func _refresh_detached() -> void:
	_refreshing_windows = true
	var generation := _generation
	for key in ["ap", "player"]:
		if not windows.is_detached(key): continue
		var editor: Control = _registry.view("scripts.action-points" if key == "ap" else "player-maps.map-records")
		if _drafts.editor_has_draft(editor): continue
		var state: Dictionary = editor.read_navigation_state()
		while _owner != null and _operations.busy: await _owner.get_tree().process_frame
		if _owner == null or _bridge == null or generation != _generation: break
		if key == "ap": await _scripts.open_action_point(str(state.get("identity", "")))
		else: await _players.open_record(str(state.get("identity", "")))
		if generation == _generation and is_instance_valid(editor): editor.restore_navigation_state(state)
	_refreshing_windows = false


func _document_opened(_projection: Dictionary, reset: bool) -> void:
	if selected == null: return
	if reset or selected.map_identity != _maps.document.identity: clear(); return
	_queue_read()


func _pane_requested(label: String) -> void:
	if selected != null:
		if label == "Action Points" and selected.kind == Target.Kind.ACTION_POINT: _show_panel("ap"); _queue_read(); return
		if label == "Player Maps" and selected.kind == Target.Kind.PLAYER_MAP: _show_panel("player"); _queue_read(); return
	await _navigation.select_route("scripts.action-points" if label == "Action Points" else "player-maps.map-records")


func dispose() -> void:
	if _owner == null: return
	windows.dispose()
	_operations.completed.disconnect(_completed)
	_maps.document.document_opened.disconnect(_document_opened); _maps.document.document_cleared.disconnect(clear)
	_maps.chrome.context_pane_requested.disconnect(_pane_requested)
	for canvas: ProvidenceMapCanvas in _canvases: canvas.record_selection_requested.disconnect(_click)
	for panel: Control in _panels.values(): panel.draft_probe = Callable(); panel.queue_free()
	_chooser.queue_free(); _panels.clear(); _canvases.clear()
	_owner = null; _bridge = null; _maps = null; _registry = null; _scripts = null; _players = null
	_context = Callable(); _guard = null; _commands = null; _drafts = null
