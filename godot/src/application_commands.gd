extends Node

signal status_changed(message: String)
signal history_requested(direction: String)
signal commit_requested

var _bar: ProvidenceCommandBar
var _menu: ProvidenceApplicationMenu
var _palette: ProvidenceCommandPalette
var _operations: ProvidenceEditorOperation
var _tabs: TabContainer
var _registry
var _navigation
var _presentation
var _maps
var _issues
var _preview
var _layout
var _explorer: Control
var _inspector: Control
var _dock: ProvidenceProblemsDock
var _session
var _drafts
var _read_bridge: Callable
var _guard: Callable
var _project_actions: Dictionary
var _can_undo := false
var _can_redo := false
var _commit_was_disabled := true
var _manual
var _code_helper
var _discovery


func initialize(bar: ProvidenceCommandBar, palette: ProvidenceCommandPalette, operations: ProvidenceEditorOperation, tabs: TabContainer, registry) -> void:
	_bar = bar
	_menu = bar.get_node("ApplicationMenu")
	_palette = palette
	_operations = operations
	_tabs = tabs
	_registry = registry
	_menu.command_requested.connect(dispatch)
	_menu.command_state_refresh_requested.connect(refresh)
	palette.command_requested.connect(_palette_command)
	bar.commands_requested.connect(show_palette)
	bar.search_requested.connect(func(): dispatch(&"edit.find-global"))
	bar.undo_requested.connect(_request_history.bind("undo"))
	bar.redo_requested.connect(_request_history.bind("redo"))
	bar.back_requested.connect(func(): dispatch(&"navigate.back"))
	bar.forward_requested.connect(func(): dispatch(&"navigate.forward"))
	bar.commit_requested.connect(commit_requested.emit)
	operations.busy_changed.connect(_busy_changed)
	operations.completed.connect(_operation_completed)


func configure_workspace(navigation, presentation, maps, issues, preview, layout, explorer: Control, inspector: Control, dock: ProvidenceProblemsDock) -> void:
	_navigation = navigation
	_presentation = presentation
	_maps = maps
	maps.smart_terrain.history_changed.connect(refresh)
	maps.smart_terrain.active_changed.connect(func(_active): refresh())
	_tabs.tab_changed.connect(func(_tab): refresh())
	_issues = issues
	_preview = preview
	_layout = layout
	_explorer = explorer
	_inspector = inspector
	_dock = dock


func configure_session(session, drafts, read_bridge: Callable, guard: Callable, project_actions: Dictionary) -> void:
	_session = session
	_drafts = drafts
	_read_bridge = read_bridge
	_guard = guard
	_project_actions = project_actions
	_discovery = preload("res://src/discovery_controller.gd").new()
	add_child(_discovery)
	_discovery.initialize(_operations, _session.context, _read_bridge, _navigation, _registry, _tabs)
	for route in ["rules.races", "rules.castes", "scripts.global-macros", "scripts.quests", "text.messages", "scripts.action-points", "scripts.macros", "encounters.simple", "encounters.complex", "encounters.rogue", "encounters.timed", "economy.treasure", "economy.shops"]:
		var view = _registry.view(route)
		view.discovery_requested.connect(_open_authoring_links.bind(view, route))
		_discovery.register_flow_entry(view, route)

func _open_authoring_links(direction: String, origin: Control, route: String) -> void:
	var selection := preload("res://src/discovery_selection.gd").record(origin, route)
	var context: Dictionary = _session.context.call().duplicate(true)
	while _operations.busy:
		await get_tree().process_frame
		if origin != _tabs.get_current_tab_control() or selection != preload("res://src/discovery_selection.gd").record(origin, route): return
	if not _session.connected or _operations.requires_reopen or origin != _tabs.get_current_tab_control(): return
	if context != _session.context.call(): return
	await _discovery.open_current_links(direction)


func configure_help(manual, code_helper) -> void:
	_manual = manual
	_code_helper = code_helper
	if _discovery != null: _discovery.configure_help(code_helper)


func refresh() -> void:
	if _session == null: return
	var available: Dictionary = _preview.availability()
	_bar.back_button.disabled = not _navigation.can_go_back() or _operations.busy or _operations.requires_reopen
	_bar.forward_button.disabled = not _navigation.can_go_forward() or _operations.busy or _operations.requires_reopen
	_bar.set_session_state(_session.connected, _operations.busy, _operations.requires_reopen, _read_bridge.call().is_project_backed())
	var editor: Control = _tabs.get_current_tab_control()
	_refresh_history()
	if editor.has_method("can_apply_draft"):
		_bar.commit_button.disabled = not editor.can_apply_draft() or _operations.busy or _operations.requires_reopen
	_menu.update_command_state({
		"busy": _operations.busy, "sessionConnected": _session.connected, "recoveryRequired": _operations.requires_reopen,
		"projectBacked": _read_bridge.call().is_project_backed(),
		"canUndo": not _bar.undo_button.disabled, "canRedo": not _bar.redo_button.disabled,
		"documentTab": _tabs.current_tab, "selectedMap": _maps.document.identity,
		"explorerVisible": _explorer.visible, "inspectorVisible": _inspector_visible(),
		"centeredWorkspace": _layout.centered_workspace(),
		"tabCount": _tabs.get_tab_count(), "previewTargetAvailable": available.targetAvailable,
		"previewAvailable": available.available, "previewUnavailableReason": available.reason,
		"hasUnappliedDraft": _drafts.has_draft(), "canNavigateBack": _navigation.can_go_back(),
		"canNavigateForward": _navigation.can_go_forward()})
	_menu.set_flow_available(_session.connected and not _operations.requires_reopen and _discovery.can_open_current_flow())


func dispatch(command: StringName) -> void:
	if _operations.busy or _issues.guard_repair_command(command): return
	if command in [&"edit.find-global", &"navigate.go-to-entity", &"navigate.find-uses", &"navigate.view-flow", &"navigate.used-by", &"view.links-uses"] and (not _session.connected or _operations.requires_reopen): return
	if _project_actions.has(command):
		if command in [&"file.save", &"file.save-as"]: await _project_actions[command].call()
		else: await _guard.call(_project_actions[command], "publishing" if command == &"file.compile-targets" else "continuing")
	else:
		await _workspace_command(command)
	refresh()


func _workspace_command(command: StringName) -> void:
	match command:
		&"file.preview-rebuilt": await _preview.start()
		&"edit.undo": await _request_history("undo")
		&"edit.redo": await _request_history("redo")
		&"edit.duplicate": await _navigation.duplicate_map(_maps.document.identity)
		&"edit.find-document": _focus_search()
		&"view.project-explorer": _explorer.visible = not _explorer.visible
		&"view.inspector": _presentation.set_inspector_visible(not _inspector_visible())
		&"view.problems": await _open_diagnostic_surface(0)
		&"view.compiler-output": await _open_diagnostic_surface(2)
		&"view.source-evidence": await _open_diagnostic_surface(4)
		&"view.centered-workspace":
			if _layout.set_centered_workspace(not _layout.centered_workspace()) != OK: status_changed.emit("Workspace width changed; the preference could not be saved.")
		&"view.reset-layout": _reset_layout()
		&"navigate.go-to-entity", &"edit.find-global": _discovery.open_search()
		&"navigate.find-uses": _discovery.open_current_links("outgoing")
		&"navigate.view-flow": _discovery.open_current_flow()
		&"navigate.used-by", &"view.links-uses": _discovery.open_current_links("incoming")
		&"navigate.back": await _navigation.navigate_back()
		&"navigate.forward": await _navigation.navigate_forward()
		&"help.divinity-manual": _manual.open_page(1) if _manual != null else status_changed.emit("Divinity Manual is unavailable")
		&"help.code-helper": _code_helper.open_for_code(1) if _code_helper != null else status_changed.emit("Code Helper is unavailable")
		&"window.next-document": await _navigation.select_tab((_tabs.current_tab + 1) % _tabs.get_tab_count())
		&"window.previous-document": await _navigation.select_tab((_tabs.current_tab - 1 + _tabs.get_tab_count()) % _tabs.get_tab_count())


func _inspector_visible() -> bool:
	return _issues.inspector_visible() if _issues.is_selected() else _inspector.visible

func _open_diagnostic_surface(index: int) -> void:
	await _navigation.select_route("linter.issues")
	if not _issues.is_selected(): return
	_dock.open_surface(index)


func _focus_search() -> void:
	match _registry.identity_for_tab(_tabs.current_tab):
		"text.messages": _registry.view("text.messages").focus_search()
		"maps.land": _maps.focus_search()
		"linter.issues": _issues.focus_search()


func _reset_layout() -> void:
	_layout.reset()
	_presentation.set_inspector_visible(true)
	_presentation.resize_inspector.call_deferred()
	_dock.set_expanded(false)
	status_changed.emit("Workspace layout reset")


func show_palette() -> void:
	_palette.popup_palette({"hasMap": not _maps.document.identity.is_empty(),
		"flowAvailable": _session.connected and not _operations.requires_reopen and _discovery.can_open_current_flow(),
		"landEditable": _session.connected and _read_bridge.call().is_project_backed() and not _maps.document.is_dungeon})


func _palette_command(command: String) -> void:
	var land: ProvidenceLandEditor = _registry.view("maps.land")
	match command:
		"navigate.view-flow": await _discovery.open_current_flow()
		"map.open-current": await _navigation.open_map(_maps.document.identity)
		"map.fit":
			land.fit_canvas()
			status_changed.emit("Map canvas fit to the document")
		"map.toggle-action-points":
			status_changed.emit("Action Point overlays %s" % ("shown" if land.toggle_action_points() else "hidden"))
		"map.paint-selected-tile": _maps.set_tool_mode("paint")


func set_history(can_undo: bool, can_redo: bool) -> void:
	_can_undo = can_undo
	_can_redo = can_redo
	refresh()


func _smart_history() -> bool:
	return _maps != null and _registry.identity_for_tab(_tabs.current_tab)=="maps.land" and _maps.smart_terrain.is_open()


func _refresh_history() -> void:
	var local := _smart_history()
	var state: Dictionary = _maps.smart_terrain.history_state() if local else {"canUndo":_can_undo,"canRedo":_can_redo}
	_bar.undo_button.disabled = not state.canUndo or _operations.busy or _operations.requires_reopen
	_bar.redo_button.disabled = not state.canRedo or _operations.busy or _operations.requires_reopen
	_bar.undo_button.tooltip_text = "Undo Smart Terrain stroke" if local else "Undo document change"
	_bar.redo_button.tooltip_text = "Redo Smart Terrain stroke" if local else "Redo document change"


func _request_history(direction: String) -> void:
	if _operations.busy or _operations.requires_reopen: return
	if _smart_history(): await _maps.smart_terrain.step_history(direction=="redo")
	else: history_requested.emit(direction)


func _busy_changed(busy: bool, label: String) -> void:
	if busy:
		_commit_was_disabled = _bar.commit_button.disabled
		_bar.commit_button.disabled = true
		if not label.is_empty(): status_changed.emit(label + " in progress…")
	else:
		_bar.commit_button.disabled = _commit_was_disabled or _operations.requires_reopen
	set_history(_can_undo, _can_redo)


func _operation_completed(response: Dictionary) -> void:
	if _operations.busy or _operations.label.is_empty() or response.get("outcomeUnknown", false): return
	if response.get("ok", false):
		status_changed.emit(_operations.label + " complete")
	else:
		status_changed.emit(_operations.label + " failed · " + str(response.get("error","Your draft is kept.")))


func _input(event: InputEvent) -> void:
	if _operations == null or not _operations.busy: return
	# Ignore repeated history intent, including the focused control's local
	# Undo. Ordinary typing, selection and scrolling remain live.
	if event is InputEventKey and event.ctrl_pressed and event.keycode in [KEY_Z, KEY_Y]: get_viewport().set_input_as_handled()


func _unhandled_key_input(event: InputEvent) -> void:
	if _operations == null or _operations.busy or _issues.repair.visible: return
	if not event is InputEventKey or not event.pressed or not event.ctrl_pressed: return
	match event.keycode:
		KEY_F:
			if not event.shift_pressed: return
			dispatch(&"edit.find-global")
		KEY_P:
			if not event.shift_pressed: return
			show_palette()
		KEY_ENTER: commit_requested.emit()
		KEY_S: dispatch(&"file.save")
		KEY_Z: _request_history("redo" if event.shift_pressed else "undo")
		_: return
	get_viewport().set_input_as_handled()
