extends Node

signal status_changed(message: String)

var _session: Node
var _drafts
var _read_bridge: Callable
var _read_context: Callable
var _go_to_draft: Callable
var _setup_context: Dictionary = {}
var _view_state: Dictionary = {}
var _selected_hold := ""
var _folder_target: LineEdit
var _return_focus: WeakRef
var _status_button: Button
@onready var _window: Window = %Connections
@onready var _clients: Tree = %Clients


func initialize(session: Node, drafts, read_bridge: Callable, read_context: Callable, go_to_draft: Callable) -> void:
	_session = session
	_drafts = drafts
	_read_bridge = read_bridge
	_read_context = read_context
	_go_to_draft = go_to_draft
	session.state_changed.connect(_present)
	%AllowEdits.toggled.connect(_allow_edits)
	%Pause.pressed.connect(func(): _allow_edits(false))
	%Disconnect.pressed.connect(_disconnect_selected)
	%Close.pressed.connect(_close)
	_window.close_requested.connect(_close)
	%Setup.pressed.connect(_show_setup)
	%SetupClose.pressed.connect(func(): %SetupWindow.hide())
	%SetupWindow.close_requested.connect(func(): %SetupWindow.hide())
	%ProjectChoose.pressed.connect(_choose_folder.bind(%ProjectRoot))
	%ExportChoose.pressed.connect(_choose_folder.bind(%ExportRoot))
	%Folders.dir_selected.connect(_folder_selected)
	%ProjectRoot.text_changed.connect(func(_text): _validate_setup())
	%ExportRoot.text_changed.connect(func(_text): _validate_setup())
	%Copy.pressed.connect(_copy_configuration)
	%Draft.pressed.connect(_open_draft)
	%ReviewHold.pressed.connect(_review_hold)
	%ConfirmHold.pressed.connect(_release_hold)
	%CancelHold.pressed.connect(func(): %ReleaseHold.hide())
	%ReleaseHold.close_requested.connect(func(): %ReleaseHold.hide())
	for window: Window in [_window, %SetupWindow, %ReleaseHold]:
		window.window_input.connect(_window_input.bind(window))
	_clients.item_selected.connect(_selection_changed)
	_clients.set_column_title(0, "CLIENT")
	_clients.set_column_title(1, "CONNECTION")
	_clients.set_column_title(2, "EDITING")
	_clients.set_column_expand(0, true)
	for column in [1,2]:
		_clients.set_column_expand(column, false)
		_clients.set_column_custom_minimum_width(column, 220)


func open() -> void:
	var focused := get_viewport().gui_get_focus_owner()
	_return_focus = weakref(focused) if focused != null else null
	_window.popup_centered(Vector2i(980,650))
	_present(_session.state)
	%Close.grab_focus()


func bind_status(button: Button) -> void:
	_status_button = button
	button.pressed.connect(open)
	_present(_session.state)


func _present(state: Dictionary) -> void:
	_view_state = state
	if not is_node_ready(): return
	var bridge = _read_bridge.call()
	var connected: bool = bridge.is_project_backed() and bridge.shared_session_enabled()
	if not connected:
		state = {}
		_view_state = {}
	if _status_button != null:
		_status_button.visible = connected
		var count: int = state.get("clients", []).filter(func(client): return client.kind == "mcp" and client.connected).size()
		_status_button.text = "MCP · %d · %s" % [count, "draft hold" if state.get("draftActive",false) else ("paused" if state.get("editsPaused",true) else "allowed")]
	var context: Dictionary = _read_context.call()
	%Context.text = "%s  ·  Shared project session  ·  Revision %d" % [context.get("projectId", "No project"), context.get("revision",0)] if connected else "Open a project with shared sessions enabled."
	%AllowEdits.set_pressed_no_signal(connected and not state.get("editsPaused",true))
	%AllowEdits.disabled = not connected
	%Pause.disabled = not connected or state.get("editsPaused",true)
	%Draft.visible = connected and _drafts.has_any_draft()
	var local_locations: Array = _drafts.draft_locations() if _drafts.has_method("draft_locations") else []
	%Draft.text = "Go to %s draft (this window)" % local_locations[0].label if not local_locations.is_empty() else "Go to this window's draft"
	%ReviewHold.visible = connected and _has_disconnected_hold(state)
	%DraftStatus.text = "MCP edits are paused while native drafts or disconnected editing holds remain." if state.get("draftActive",false) else "Edits use the same revision checks, validation and Undo / Redo as native controls."
	var latest: Variant = state.get("latestChange")
	%Latest.text = "Changes share one project history. Apply or discard drafts before allowing assistant edits."
	if latest is Dictionary:
		var action := "Undo" if latest.method == "history.undo" else ("Redo" if latest.method == "history.redo" else "Scenario edit")
		%Latest.text = "Latest shared change · %s · revision %d · %s client %d" % [action, latest.revision, "MCP" if latest.clientKind == "mcp" else "Native", latest.clientId]
	_populate_clients(state)


func _populate_clients(state: Dictionary) -> void:
	var selected := _clients.get_selected()
	var selection: Dictionary = selected.get_metadata(0) if selected != null else {}
	_clients.clear()
	var root := _clients.create_item()
	for client: Dictionary in state.get("clients",[]):
		var row := _clients.create_item(root)
		var label := "MCP client %d" % int(client.id) if client.kind == "mcp" else "Providence window %d" % int(client.id)
		var locations: Array = client.get("draftLocations", [])
		if not locations.is_empty(): label += " · " + str(locations[0].label)
		row.set_text(0, label)
		row.set_tooltip_text(0,label)
		row.set_text(1,"Connected" if client.connected else "Disconnected")
		var editing := "Native editor" if client.kind == "native" else ("Blocked by draft" if state.get("draftActive",false) else ("Paused" if state.get("editsPaused",true) else "Allowed"))
		row.set_text(2,"Draft hold" if client.draftActive or not client.get("ready",true) else editing)
		row.set_metadata(0,client)
		if selection.get("id", -1)==client.id: row.select(0)
	for hold: Dictionary in state.get("disconnectedHolds",[]):
		var row := _clients.create_item(root)
		var locations: Array = hold.get("locations", [])
		var label := "Previous Providence window" + (" · " + str(locations[0].label) if not locations.is_empty() else "")
		row.set_text(0,label)
		row.set_tooltip_text(0,label)
		row.set_text(1,"Disconnected")
		row.set_text(2,"Editing hold")
		row.set_metadata(0,{"kind":"native","owner":hold.owner,"connected":false})
		if selection.get("owner", "")==hold.owner: row.select(0)
	_selection_changed()


func _has_disconnected_hold(state: Dictionary) -> bool:
	return not state.get("disconnectedHolds",[]).is_empty() or state.get("clients",[]).any(func(row): return row.kind=="native" and not row.connected)


func _selection_changed() -> void:
	var row := _clients.get_selected()
	var client: Dictionary = row.get_metadata(0) if row != null else {}
	%Disconnect.disabled = client.get("kind", "") != "mcp" or not client.get("connected",false)


func _allow_edits(allowed: bool) -> void:
	var response: Dictionary = await _session.command("session.external-edits",{"allowed":allowed})
	if not response.get("ok",false): status_changed.emit(str(response.get("error","Could not change editing permission.")))
	_present(_session.state)


func _disconnect_selected() -> void:
	var row := _clients.get_selected()
	if row == null: return
	var client: Dictionary = row.get_metadata(0)
	var response: Dictionary = await _session.command("session.disconnect-client",{"clientId":int(client.id)})
	if not response.get("ok",false): status_changed.emit(str(response.get("error","Could not disconnect client.")))


func _open_draft() -> void:
	_close()
	_go_to_draft.call(_drafts.first_draft())


func _review_hold() -> void:
	_selected_hold = ""
	var selected := _clients.get_selected()
	var client: Dictionary = selected.get_metadata(0) if selected != null else {}
	if client.get("kind", "") == "native" and not client.get("connected",true): _selected_hold = client.owner
	for hold: Dictionary in _view_state.get("disconnectedHolds",[]):
		if not _selected_hold.is_empty(): break
		_selected_hold = hold.owner
		break
	if _selected_hold.is_empty():
		for peer: Dictionary in _view_state.get("clients",[]):
			if peer.kind=="native" and not peer.connected:
				_selected_hold = peer.owner
				break
	if not _selected_hold.is_empty():
		%ReleaseHold.popup_centered(Vector2i(980,650))
		%CancelHold.grab_focus()


func _release_hold() -> void:
	var response: Dictionary = await _session.command("session.release-hold",{"owner":_selected_hold,"confirmed":true})
	if not response.get("ok",false): status_changed.emit(str(response.get("error","Could not release the editing hold.")))
	else: %ReleaseHold.hide()


func _show_setup() -> void:
	_setup_context = _read_bridge.call().mcp_setup_context()
	%Executable.text = _setup_context.server
	%Executable.add_theme_color_override("font_uneditable_color", %ProjectRoot.get_theme_color("font_color", "LineEdit"))
	var roots := preload("res://src/mcp_client_setup.gd").saved_roots()
	%ProjectRoot.text = roots.project
	%ExportRoot.text = roots.output
	_validate_setup()
	%SetupWindow.popup_centered(Vector2i(980,650))


func _validate_setup() -> void:
	if _setup_context.is_empty(): return
	var result := preload("res://src/mcp_client_setup.gd").configuration(_setup_context,%ProjectRoot.text,%ExportRoot.text)
	%Copy.disabled = not result.ok
	%SetupStatus.text = "Ready · Server and folders are available" if result.ok else result.error


func _choose_folder(target: LineEdit) -> void:
	_folder_target = target
	%Folders.popup_centered_ratio(0.7)


func _folder_selected(path: String) -> void:
	_folder_target.text = path
	_validate_setup()


func _copy_configuration() -> void:
	var result := preload("res://src/mcp_client_setup.gd").configuration(_setup_context,%ProjectRoot.text,%ExportRoot.text)
	if not result.ok: return
	DisplayServer.clipboard_set(JSON.stringify(result.configuration,"  "))
	var saved: Error = preload("res://src/mcp_client_setup.gd").save_roots(%ProjectRoot.text,%ExportRoot.text)
	%SetupStatus.text = "Configuration copied. Paste it into your MCP client." if saved == OK else "Configuration copied; folder preferences could not be saved."


func _close() -> void:
	_window.hide()
	if _return_focus != null:
		var control: Control = _return_focus.get_ref()
		if is_instance_valid(control) and control.is_visible_in_tree(): control.grab_focus()


func _window_input(event: InputEvent, window: Window) -> void:
	if event is InputEventKey and event.pressed and event.keycode == KEY_ESCAPE:
		if window == _window: _close()
		else: window.hide()
		window.set_input_as_handled()
