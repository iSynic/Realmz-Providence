class_name ProvidenceApplicationMenu
extends MenuBar

signal command_requested(command: StringName)
signal command_state_refresh_requested

const UNAVAILABLE_REASON := "Visible for the approved menu contract; this command is not implemented yet."

enum CommandId {
	FILE_NEW = 100,
	FILE_OPEN,
	FILE_IMPORT,
	FILE_SAVE,
	FILE_SAVE_AS,
	FILE_CLOSE,
	FILE_COMPILE,
	FILE_PREVIEW_REBUILT,
	FILE_EXIT,
	EDIT_UNDO = 200,
	EDIT_REDO,
	EDIT_CUT,
	EDIT_COPY,
	EDIT_PASTE,
	EDIT_DUPLICATE,
	EDIT_DELETE,
	EDIT_FIND,
	EDIT_PREFERENCES,
	EDIT_GLOBAL_SEARCH,
	VIEW_EXPLORER = 300,
	VIEW_INSPECTOR,
	VIEW_LINKS,
	VIEW_PROBLEMS,
	VIEW_COMPILER,
	VIEW_EVIDENCE,
	VIEW_BALANCED,
	VIEW_COMPACT,
	VIEW_DARK,
	VIEW_LIGHT,
	VIEW_HIGH_CONTRAST,
	VIEW_RESET,
	VIEW_CENTERED,
	NAVIGATE_BACK = 400,
	NAVIGATE_FORWARD,
	NAVIGATE_ENTITY,
	NAVIGATE_PEEK,
	NAVIGATE_SIDE,
	NAVIGATE_REVEAL,
	NAVIGATE_FIND_USES,
	NAVIGATE_USED_BY,
	NAVIGATE_FLOW,
	WINDOW_NEW = 500,
	WINDOW_MOVE,
	WINDOW_NEXT,
	WINDOW_PREVIOUS,
	WINDOW_CLOSE,
	WINDOW_RESTORE,
	HELP_DOCUMENTS = 600,
	HELP_DIVINITY_MANUAL,
	HELP_CODE_HELPER,
	HELP_SHORTCUTS,
	HELP_COMPATIBILITY,
	HELP_EVIDENCE,
	HELP_ABOUT,
}

var _commands: Dictionary = {}
var _command_by_menu_id: Dictionary = {}
var _before_busy: Dictionary = {}


func _ready() -> void:
	_build_file_menu()
	_build_edit_menu()
	_build_view_menu()
	_build_navigate_menu()
	_build_window_menu()
	_build_help_menu()
	for menu_name in [&"File", &"Edit", &"View", &"Navigate", &"Window", &"Help"]:
		var popup := get_node(NodePath(String(menu_name))) as PopupMenu
		popup.about_to_popup.connect(command_state_refresh_requested.emit)
		popup.id_pressed.connect(_on_menu_id_pressed.bind(menu_name))


func update_command_state(context: Dictionary) -> void:
	for command in _before_busy: _set_enabled(command, _before_busy[command], "")
	_before_busy.clear()
	var session_connected := bool(context.get("sessionConnected", false))
	var project_backed := bool(context.get("projectBacked", false))
	var document_tab := int(context.get("documentTab", -1))
	var has_map := not str(context.get("selectedMap", "")).is_empty()
	_set_enabled(&"file.import-scenario", session_connected and project_backed, "Open a portable project before importing a scenario.")
	_set_enabled(&"file.save", session_connected, "No project session is open.")
	_set_enabled(&"file.save-as", session_connected and project_backed, "Save As requires an open portable project.")
	_set_enabled(&"file.close-project", session_connected, "No project session is open.")
	_set_enabled(&"file.compile-targets", session_connected and project_backed, "Compilation requires an open portable project.")
	_set_enabled(
		&"file.preview-rebuilt",
		session_connected and project_backed and bool(context.get("previewTargetAvailable", false)) and bool(context.get("previewAvailable", false)) and not bool(context.get("hasUnappliedDraft", false)),
		str(context.get("previewUnavailableReason", "Select an applied map cell, Action Point, Simple Encounter, or scrolling TEXT resource."))
	)
	_set_enabled(&"edit.undo", session_connected and bool(context.get("canUndo", false)), "Nothing is available to undo.")
	_set_enabled(&"edit.redo", session_connected and bool(context.get("canRedo", false)), "Nothing is available to redo.")
	_set_enabled(&"edit.duplicate", session_connected and project_backed and document_tab == 1 and has_map, "Duplicate is currently available only for the selected persistent map.")
	_set_enabled(&"edit.find-document", document_tab in [0, 1, 33], "This document has no bounded search projection yet.")
	_set_enabled(&"navigate.back", bool(context.get("canNavigateBack", false)), "No earlier authoring location is available.")
	_set_enabled(&"navigate.forward", bool(context.get("canNavigateForward", false)), "No later authoring location is available.")
	for command in [&"navigate.go-to-entity", &"edit.find-global", &"navigate.find-uses", &"navigate.view-flow", &"navigate.used-by", &"view.links-uses"]:
		_set_enabled(command, session_connected and not bool(context.get("recoveryRequired", false)), "Reopen the project before searching." if context.get("recoveryRequired", false) else "Open a project to search content and links.")
	_set_checked(&"view.project-explorer", bool(context.get("explorerVisible", true)))
	_set_checked(&"view.inspector", bool(context.get("inspectorVisible", false)))
	_set_checked(&"view.centered-workspace", bool(context.get("centeredWorkspace", false)))
	var has_multiple_tabs := int(context.get("tabCount", 0)) > 1
	_set_enabled(&"window.next-document", has_multiple_tabs, "Only one document is available.")
	_set_enabled(&"window.previous-document", has_multiple_tabs, "Only one document is available.")
	if context.get("busy", false):
		for command in _commands:
			if str(command).begins_with("file.") or str(command).begins_with("edit.") or str(command).begins_with("window."):
				_before_busy[command] = is_command_enabled(command)
				_set_enabled(command, false, "Wait for the current operation to finish.")


func is_command_enabled(command: StringName) -> bool:
	var entry := _commands.get(command, {}) as Dictionary
	if entry.is_empty():
		return false
	return not (entry.popup as PopupMenu).is_item_disabled((entry.popup as PopupMenu).get_item_index(int(entry.id)))


func _build_file_menu() -> void:
	var popup := $File as PopupMenu
	_add(popup, &"File", "New Project", &"file.new-project", CommandId.FILE_NEW, KEY_N, true)
	_add(popup, &"File", "Open Project…", &"file.open-project", CommandId.FILE_OPEN, KEY_O, true)
	_add(popup, &"File", "Import Scenario…", &"file.import-scenario", CommandId.FILE_IMPORT)
	popup.add_separator()
	_add(popup, &"File", "Save", &"file.save", CommandId.FILE_SAVE, KEY_S, true)
	_add(popup, &"File", "Save Snapshot As…", &"file.save-as", CommandId.FILE_SAVE_AS, KEY_S, true, true)
	_add(popup, &"File", "Close Project", &"file.close-project", CommandId.FILE_CLOSE, KEY_W, true)
	popup.add_separator()
	_add(popup, &"File", "Compile Targets…", &"file.compile-targets", CommandId.FILE_COMPILE)
	_add(popup, &"File", "Preview in Rebuilt", &"file.preview-rebuilt", CommandId.FILE_PREVIEW_REBUILT, KEY_F6)
	popup.add_separator()
	_add(popup, &"File", "Exit", &"file.exit", CommandId.FILE_EXIT, KEY_F4, false, false, true)


func _build_edit_menu() -> void:
	var popup := $Edit as PopupMenu
	_add(popup, &"Edit", "Undo", &"edit.undo", CommandId.EDIT_UNDO, KEY_Z, true)
	_add(popup, &"Edit", "Redo", &"edit.redo", CommandId.EDIT_REDO, KEY_Z, true, true)
	popup.add_separator()
	_add_disabled(popup, &"Edit", "Cut", &"edit.cut", CommandId.EDIT_CUT, KEY_X, true)
	_add_disabled(popup, &"Edit", "Copy", &"edit.copy", CommandId.EDIT_COPY, KEY_C, true)
	_add_disabled(popup, &"Edit", "Paste", &"edit.paste", CommandId.EDIT_PASTE, KEY_V, true)
	_add(popup, &"Edit", "Duplicate", &"edit.duplicate", CommandId.EDIT_DUPLICATE, KEY_D, true)
	_add_disabled(popup, &"Edit", "Delete", &"edit.delete", CommandId.EDIT_DELETE, KEY_DELETE)
	popup.add_separator()
	_add(popup, &"Edit", "Find in Document…", &"edit.find-document", CommandId.EDIT_FIND, KEY_F, true)
	_add(popup, &"Edit", "Search Scenario…", &"edit.find-global", CommandId.EDIT_GLOBAL_SEARCH, KEY_F, true, true)
	_add_disabled(popup, &"Edit", "Preferences…", &"edit.preferences", CommandId.EDIT_PREFERENCES)


func _build_view_menu() -> void:
	var popup := $View as PopupMenu
	_add_check(popup, &"View", "Project Explorer", &"view.project-explorer", CommandId.VIEW_EXPLORER)
	_add_check(popup, &"View", "Inspector", &"view.inspector", CommandId.VIEW_INSPECTOR)
	_add(popup, &"View", "Links and Uses", &"view.links-uses", CommandId.VIEW_LINKS)
	_add(popup, &"View", "Problems", &"view.problems", CommandId.VIEW_PROBLEMS)
	_add(popup, &"View", "Compiler Output", &"view.compiler-output", CommandId.VIEW_COMPILER)
	_add(popup, &"View", "Source Evidence", &"view.source-evidence", CommandId.VIEW_EVIDENCE)
	popup.add_separator()
	_add_radio(popup, &"View", "Balanced Density", &"view.balanced-density", CommandId.VIEW_BALANCED, true)
	_add_radio(popup, &"View", "Compact Density", &"view.compact-density", CommandId.VIEW_COMPACT)
	popup.add_separator()
	_add_radio(popup, &"View", "Dark Theme", &"view.dark-theme", CommandId.VIEW_DARK, true)
	_add_radio(popup, &"View", "Light Theme", &"view.light-theme", CommandId.VIEW_LIGHT)
	_add_radio(popup, &"View", "High Contrast", &"view.high-contrast", CommandId.VIEW_HIGH_CONTRAST)
	popup.add_separator()
	_add(popup, &"View", "Reset Layout", &"view.reset-layout", CommandId.VIEW_RESET)
	_add_check(popup, &"View", "Center Workspace at 16:9", &"view.centered-workspace", CommandId.VIEW_CENTERED)


func _build_navigate_menu() -> void:
	var popup := $Navigate as PopupMenu
	_add(popup, &"Navigate", "Back", &"navigate.back", CommandId.NAVIGATE_BACK, KEY_LEFT, false, false, true)
	_add(popup, &"Navigate", "Forward", &"navigate.forward", CommandId.NAVIGATE_FORWARD, KEY_RIGHT, false, false, true)
	popup.add_separator()
	_add(popup, &"Navigate", "Go to Entity…", &"navigate.go-to-entity", CommandId.NAVIGATE_ENTITY, KEY_P, true)
	_add_disabled(popup, &"Navigate", "Peek", &"navigate.peek", CommandId.NAVIGATE_PEEK)
	_add_disabled(popup, &"Navigate", "Open to Side", &"navigate.open-to-side", CommandId.NAVIGATE_SIDE)
	_add_disabled(popup, &"Navigate", "Reveal in Explorer", &"navigate.reveal-explorer", CommandId.NAVIGATE_REVEAL, KEY_R, true, true)
	_add(popup, &"Navigate", "Find Uses", &"navigate.find-uses", CommandId.NAVIGATE_FIND_USES)
	_add(popup, &"Navigate", "Used By", &"navigate.used-by", CommandId.NAVIGATE_USED_BY)
	_add(popup, &"Navigate", "View Flow…", &"navigate.view-flow", CommandId.NAVIGATE_FLOW)


func _build_window_menu() -> void:
	var popup := $Window as PopupMenu
	_add_disabled(popup, &"Window", "New Document Window", &"window.new-document", CommandId.WINDOW_NEW)
	_add_disabled(popup, &"Window", "Move Document to New Window", &"window.move-document", CommandId.WINDOW_MOVE)
	popup.add_separator()
	_add(popup, &"Window", "Next Document", &"window.next-document", CommandId.WINDOW_NEXT, KEY_TAB, true)
	_add(popup, &"Window", "Previous Document", &"window.previous-document", CommandId.WINDOW_PREVIOUS, KEY_TAB, true, true)
	_add_disabled(popup, &"Window", "Close Document", &"window.close-document", CommandId.WINDOW_CLOSE, KEY_W, true)
	popup.add_separator()
	_add_disabled(popup, &"Window", "Restore Saved Layout", &"window.restore-layout", CommandId.WINDOW_RESTORE)


func _build_help_menu() -> void:
	var popup := $Help as PopupMenu
	_add(popup, &"Help", "Divinity Manual…", &"help.divinity-manual", CommandId.HELP_DIVINITY_MANUAL, KEY_F1)
	_add(popup, &"Help", "Code Helper…", &"help.code-helper", CommandId.HELP_CODE_HELPER, KEY_F1, false, true)
	popup.add_separator()
	_add_disabled(popup, &"Help", "Providence Documents", &"help.documents", CommandId.HELP_DOCUMENTS)
	_add_disabled(popup, &"Help", "Keyboard Shortcuts", &"help.shortcuts", CommandId.HELP_SHORTCUTS)
	_add_disabled(popup, &"Help", "Compatibility Glossary", &"help.compatibility", CommandId.HELP_COMPATIBILITY)
	_add_disabled(popup, &"Help", "Source Evidence Guide", &"help.source-evidence", CommandId.HELP_EVIDENCE)
	popup.add_separator()
	_add_disabled(popup, &"Help", "About Providence", &"help.about", CommandId.HELP_ABOUT)


func _add(popup: PopupMenu, menu_name: StringName, label: String, command: StringName, id: int, keycode: Key = KEY_NONE, ctrl := false, shift := false, alt := false) -> void:
	popup.add_item(label, id)
	_register(popup, menu_name, command, id)
	if keycode != KEY_NONE:
		var input := InputEventKey.new()
		input.keycode = keycode
		input.ctrl_pressed = ctrl
		input.shift_pressed = shift
		input.alt_pressed = alt
		var shortcut := Shortcut.new()
		shortcut.events = [input]
		popup.set_item_shortcut(popup.get_item_index(id), shortcut)


func _add_disabled(popup: PopupMenu, menu_name: StringName, label: String, command: StringName, id: int, keycode: Key = KEY_NONE, ctrl := false, shift := false, alt := false) -> void:
	_add(popup, menu_name, label, command, id, keycode, ctrl, shift, alt)
	_set_enabled(command, false, UNAVAILABLE_REASON)


func _add_check(popup: PopupMenu, menu_name: StringName, label: String, command: StringName, id: int, enabled := true, reason := "") -> void:
	popup.add_check_item(label, id)
	_register(popup, menu_name, command, id)
	_set_enabled(command, enabled, reason)


func _add_radio(popup: PopupMenu, menu_name: StringName, label: String, command: StringName, id: int, checked := false) -> void:
	popup.add_radio_check_item(label, id)
	_register(popup, menu_name, command, id)
	_set_checked(command, checked)
	_set_enabled(command, false, UNAVAILABLE_REASON)


func _register(popup: PopupMenu, menu_name: StringName, command: StringName, id: int) -> void:
	_commands[command] = {"popup": popup, "id": id}
	_command_by_menu_id["%s:%d" % [menu_name, id]] = command


func _set_enabled(command: StringName, enabled: bool, reason: String) -> void:
	var entry := _commands.get(command, {}) as Dictionary
	if entry.is_empty():
		return
	var popup := entry.popup as PopupMenu
	var index := popup.get_item_index(int(entry.id))
	popup.set_item_disabled(index, not enabled)
	popup.set_item_tooltip(index, "" if enabled else reason)

func set_flow_available(available: bool) -> void:
	_set_enabled(&"navigate.view-flow", available, "Select an applied record before opening View Flow.")


func _set_checked(command: StringName, checked: bool) -> void:
	var entry := _commands.get(command, {}) as Dictionary
	if entry.is_empty():
		return
	var popup := entry.popup as PopupMenu
	popup.set_item_checked(popup.get_item_index(int(entry.id)), checked)


func _on_menu_id_pressed(id: int, menu_name: StringName) -> void:
	var command := _command_by_menu_id.get("%s:%d" % [menu_name, id], &"") as StringName
	if not command.is_empty() and is_command_enabled(command):
		command_requested.emit(command)
