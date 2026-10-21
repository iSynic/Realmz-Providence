extends Node

const TOPICS := {"help.documents": "getting-started", "help.shortcuts": "shortcuts", "help.compatibility": "glossary", "help.source-evidence": "evidence", "help.about": "about"}
var _open_route: Callable
var _waiting_for_navigation := false


func initialize(commands: Callable, availability: Callable, open_route: Callable) -> void:
	%Reader.command_provider = commands
	%Reader.availability_provider = availability
	_open_route = open_route
	%Reader.tool_requested.connect(_request_tool)


func handles(command: StringName) -> bool:
	return TOPICS.has(String(command))


func open_command(command: StringName) -> void:
	_waiting_for_navigation = false
	var source: Theme = ThemeDB.get_project_theme()
	if source != null and "mode" in source: %Reader.apply_theme(source.mode, source.density)
	%Reader.open_topic(TOPICS.get(String(command), "getting-started"))


func _request_tool(route: String, title: String) -> void:
	_waiting_for_navigation = true
	%Reader.suspend_reader()
	await _open_route.call(route, title, func(): _waiting_for_navigation = false)


func navigation_canceled() -> void:
	if not _waiting_for_navigation: return
	_waiting_for_navigation = false
	%Reader.popup_centered(Vector2i(1560, 840))
	%Reader.get_node("%OpenTool").grab_focus()


func focused_control() -> Control:
	var peek: Window = %Reader.get_node("%ImagePeek")
	if peek.visible and peek.has_focus(): return peek.get_viewport().gui_get_focus_owner()
	return %Reader.get_viewport().gui_get_focus_owner() if %Reader.visible and %Reader.has_focus() else null
