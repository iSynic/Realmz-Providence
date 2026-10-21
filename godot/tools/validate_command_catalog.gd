extends SceneTree

var _failed := false


func _initialize() -> void: _run.call_deferred()


func _run() -> void:
	var menu := load("res://src/application_menu.tscn").instantiate() as ProvidenceApplicationMenu
	root.add_child(menu)
	var rows := menu.command_catalog()
	var by_id := {}
	var bindings := {}
	for row: Dictionary in rows:
		_check(not by_id.has(row.command), "Repeated command identity: " + row.command)
		by_id[row.command] = row
		for binding: String in row.shortcuts:
			_check(not bindings.has(binding), "Conflicting menu shortcut: " + binding)
			bindings[binding] = row.command
	_check(by_id["file.close-project"].shortcuts != by_id["window.close-document"].shortcuts, "Project and document Close share a shortcut.")
	var close_project := _shortcut(menu, "File", ProvidenceApplicationMenu.CommandId.FILE_CLOSE)
	var close_document := _shortcut(menu, "Window", ProvidenceApplicationMenu.CommandId.WINDOW_CLOSE)
	var key := InputEventKey.new()
	key.keycode = KEY_W
	key.ctrl_pressed = true
	_check(close_document.matches_event(key) and not close_project.matches_event(key), "Ctrl+W must identify Close Document only.")
	key.shift_pressed = true
	_check(close_project.matches_event(key) and not close_document.matches_event(key), "Ctrl+Shift+W must identify Close Project only.")
	menu.update_command_state({"sessionConnected": false, "textCommands": {"edit.copy": true}})
	_check_catalog_state(menu, "file.save", false, "No project session is open.")
	_check_catalog_state(menu, "edit.copy", true, "")
	menu.update_command_state({"sessionConnected": true, "busy": true})
	_check_catalog_state(menu, "file.save", false, "Wait for the current operation to finish.")
	menu.update_command_state({"sessionConnected": true})
	_check_catalog_state(menu, "file.save", true, "")
	for busy in [true, true, false]: menu.update_command_state({"sessionConnected": true, "busy": busy})
	for row: Dictionary in menu.command_catalog():
		_check(row.enabled or not row.unavailableReason.is_empty(), "Disabled command lost its reason across busy refresh: " + row.command)
	if not _failed:
		var args := OS.get_cmdline_user_args()
		if args.size() == 1:
			var output := FileAccess.open(args[0], FileAccess.WRITE)
			_check(output != null, "Could not write the requested command receipt.")
			if output != null: output.store_string(JSON.stringify(menu.command_catalog(), "\t") + "\n")
		print("PROVIDENCE_COMMAND_CATALOG_OK commands=%d bindings=%d close=distinct availability=live" % [rows.size(), bindings.size()])
	menu.free()
	quit(1 if _failed else 0)


func _shortcut(menu: Node, group: String, id: int) -> Shortcut:
	var popup := menu.get_node(group) as PopupMenu
	return popup.get_item_shortcut(popup.get_item_index(id))


func _check_catalog_state(menu: ProvidenceApplicationMenu, command: String, enabled: bool, reason: String) -> void:
	var rows := menu.command_catalog().filter(func(row): return row.command == command)
	_check(rows.size() == 1 and rows[0].enabled == enabled and rows[0].unavailableReason == reason, "Incorrect live command availability: " + command)


func _check(value: bool, message: String) -> void:
	if not value: _failed = true; push_error(message)
