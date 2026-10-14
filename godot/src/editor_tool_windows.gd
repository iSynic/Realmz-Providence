extends RefCounted

signal failed(message: String)
signal changed

var _owner: Node
var _registry
var _drafts
var _commands: Callable
var _operations: ProvidenceEditorOperation
var _windows: Dictionary = {}
var _tools: Dictionary = {}
var _context: Callable
var _history := {"canUndo": false, "canRedo": false}


func initialize(owner: Node, registry, drafts, operations: ProvidenceEditorOperation, commands: Callable, context: Callable) -> void:
	_owner = owner; _registry = registry; _drafts = drafts; _operations = operations; _commands = commands; _context = context
	operations.busy_changed.connect(_busy_changed)


func register(key: String, editor: Control, caption: String, apply: Callable, route := "") -> void:
	_tools[key] = {"editor": editor, "caption": caption, "apply": apply, "route": route}


func is_detached(key: String) -> bool:
	return _windows.has(key)


func detach(key: String) -> void:
	if not _tools.has(key): return
	if _windows.has(key): focus(key); return
	var tool: Dictionary = _tools[key]
	var editor: Control = tool.editor
	var navigation: Dictionary = editor.read_navigation_state() if editor.has_method("read_navigation_state") else {}
	var host := editor.get_parent()
	var index := editor.get_index()
	var current: int = host.current_tab if host is TabContainer else -1
	if host is TabContainer: host.set_block_signals(true)
	var window: Window = preload("res://src/editor_tool_window.tscn").instantiate()
	_owner.add_child(window)
	if key == "region": window.min_size = Vector2i(420, 620); window.size = Vector2i(600, 850)
	else: window.min_size = Vector2i(1280, 650); window.size = Vector2i(1440, 850)
	window.title = "Providence · " + str(tool.caption)
	window.theme = _owner.theme
	var placeholder: Control = preload("res://src/editor_tool_placeholder.tscn").instantiate()
	placeholder.name = editor.name; placeholder.set_meta("route_identity", tool.route)
	placeholder.set_meta("detached_editor", true)
	_windows[key] = {"window": window, "parent": host, "index": index, "placeholder": placeholder, "wasVisible": editor.visible}
	# Keep the tab slot and its stable route while moving the sole editor instance.
	editor.reparent(window.get_node("%EditorHost")); editor.show()
	host.add_child(placeholder); host.move_child(placeholder, mini(index, host.get_child_count() - 1))
	if host is TabContainer: host.current_tab = current; host.set_block_signals(false)
	placeholder.get_node("FocusEditor").pressed.connect(focus.bind(key))
	placeholder.get_node("DockEditor").pressed.connect(dock.bind(key))
	window.dock_requested.connect(dock.bind(key))
	window.apply_requested.connect(_apply.bind(key))
	window.command_requested.connect(_commands)
	_drafts.register_detached(editor, func(): return window.has_focus())
	_refresh_window(window); window.reveal()
	if editor.has_method("restore_navigation_state"): editor.restore_navigation_state(navigation)
	changed.emit()


func focus(key: String) -> void:
	if _windows.has(key): _windows[key].window.reveal()


func dock(key: String) -> void:
	if not _windows.has(key): return
	var state: Dictionary = _windows[key]; var tool: Dictionary = _tools[key]
	var navigation: Dictionary = tool.editor.read_navigation_state() if tool.editor.has_method("read_navigation_state") else {}
	var current: int = state.parent.current_tab if state.parent is TabContainer else -1
	if state.parent is TabContainer: state.parent.set_block_signals(true)
	_drafts.unregister_detached(tool.editor)
	state.placeholder.get_parent().remove_child(state.placeholder); state.placeholder.queue_free()
	tool.editor.reparent(state.parent); state.parent.move_child(tool.editor, mini(state.index, state.parent.get_child_count() - 1))
	tool.editor.visible = state.wasVisible
	if state.parent is TabContainer: state.parent.current_tab = current; state.parent.set_block_signals(false)
	if tool.editor.has_method("restore_navigation_state"): tool.editor.restore_navigation_state(navigation)
	state.window.hide(); state.window.queue_free(); _windows.erase(key); changed.emit()


func _apply(key: String) -> void:
	if not _windows.has(key) or _operations.busy: return
	var response: Dictionary = await _drafts.commit_editor(_tools[key].editor)
	if _windows.has(key):
		_windows[key].window.set_status("Applied" if response.get("ok", false) else str(response.get("error", "Your draft is kept.")))
	changed.emit()


func refresh() -> void:
	for state: Dictionary in _windows.values(): _refresh_window(state.window)


func set_history(can_undo: bool, can_redo: bool) -> void:
	_history = {"canUndo": can_undo, "canRedo": can_redo}; refresh()


func _refresh_window(window: Window) -> void:
	window.set_history(_history.canUndo, _history.canRedo, _operations.busy or _operations.requires_reopen)


func _busy_changed(_busy: bool, _label: String) -> void:
	refresh()


func dock_all() -> void:
	for key: String in _windows.keys(): dock(key)


func dispose() -> void:
	dock_all()
	_operations.busy_changed.disconnect(_busy_changed)
	_tools.clear(); _owner = null; _registry = null; _drafts = null
	_commands = Callable(); _context = Callable()
