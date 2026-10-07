extends SceneTree


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var command_bar: Node = load("res://src/command_bar.tscn").instantiate()
	root.add_child(command_bar)
	await process_frame
	await process_frame
	var project_label: Label = command_bar.get_node("ProvidenceBrand/ProjectName")
	for identity in [["ashen-crown", false, "Example — ashen-crown"], ["cob", true, "cob"], ["", false, "No project open"]]:
		command_bar.set_project_identity(identity[0], identity[1])
		if project_label.text != identity[2] or project_label.tooltip_text != identity[2]:
			_fail("project identity must distinguish the open project, example and closed session")
			return
	var menu = command_bar.get_node("ApplicationMenu")
	menu.update_command_state({
		"sessionConnected": true,
		"projectBacked": true,
		"canUndo": true,
		"canRedo": false,
		"documentTab": 1,
		"selectedMap": "land:0",
		"explorerVisible": true,
		"inspectorVisible": false,
		"tabCount": 6,
		"previewTargetAvailable": true,
		"previewAvailable": true,
		"previewUnavailableReason": "",
		"hasUnappliedDraft": false,
	})
	if (
		not menu.is_command_enabled(&"file.save-as")
		or not menu.is_command_enabled(&"file.preview-rebuilt")
		or menu.is_command_enabled(&"edit.cut")
	):
		_fail("application menu command-state truth changed")
		return
	var emitted: Array[StringName] = []
	command_bar.undo_requested.connect(func() -> void: emitted.append(&"undo"))
	command_bar.commands_requested.connect(func() -> void: emitted.append(&"commands"))
	menu.command_requested.connect(func(command: StringName) -> void: emitted.append(command))
	(command_bar.get_node("Undo") as Button).pressed.emit()
	(command_bar.get_node("Commands") as Button).pressed.emit()
	var file_menu := menu.get_node("File") as PopupMenu
	file_menu.id_pressed.emit(file_menu.get_item_id(0))
	if emitted != [&"undo", &"commands", &"file.new-project"]:
		_fail("command bar or native menu signals did not cross the scene boundary: %s" % [emitted])
		return
	command_bar.set_route_has_commit(false)
	command_bar._update_compact_layout()
	if command_bar.commit_button.visible:
		_fail("inspection or picker route exposed a stale commit action")
		return
	command_bar.set_route_has_commit(true, true)
	if not command_bar.commit_button.visible:
		_fail("returning to an editor hid its commit action")
		return
	command_bar.set_route_has_commit(true)
	if command_bar.commit_button.visible != (command_bar.size.x >= 1760.0):
		_fail("ordinary editor compact toolbar behavior changed")
		return
	print("PROVIDENCE_COMMAND_SURFACES_OK menus=6 toolbarSignals=2 routeCommit=guarded")
	command_bar.queue_free()
	quit(0)


func _fail(message: String) -> void:
	push_error("PROVIDENCE_COMMAND_SURFACES_FAILED: %s" % message)
	quit(1)
