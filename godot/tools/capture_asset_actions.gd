extends SceneTree

var _shell
var _passed := false


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 2 or not FileAccess.file_exists(args[0].path_join("assets-corpus-disposable.marker")) or not DirAccess.dir_exists_absolute(args[1]):
		quit(2)
		return
	_shell = load("res://src/editor_shell.tscn").instantiate()
	root.add_child(_shell)
	await process_frame
	await _capture(args[0], args[1])
	_shell._bridge.stop()
	quit(0 if _passed else 1)


func _capture(project_path: String, output: String) -> void:
	await _shell._project_session.open_project(project_path)
	assert(_shell._bridge.is_project_backed() and _shell._bridge.current_project_path() == project_path)
	var workbench = load("res://src/unified_assets_editor.tscn").instantiate()
	_shell._document_tabs.add_child(workbench)
	_shell.configure_assets_workbench(workbench)
	await workbench.reload(_shell._bridge)
	await workbench.show_scope("scenario")
	var tab: int = _shell._document_tabs.get_tab_count() - 1
	await _shell._navigation.select_tab(tab)
	var panel = workbench.get_node("%Gallery")
	assert(not panel._rows.is_empty())
	var used := 0
	var removable := -1
	for index in panel._rows.size():
		if int(panel._rows[index].usedBy) > int(panel._rows[used].usedBy):
			used = index
		if bool(panel._rows[index].removable):
			removable = index
	assert(removable >= 0)
	for size in [Vector2i(1600, 900), Vector2i(1920, 1080)]:
		root.size = size
		root.content_scale_size = size
		await _shell._navigation.select_tab(tab)
		panel.get_node("%Gallery").select(used)
		panel._select(used)
		for frame in 35:
			await process_frame
		panel.get_node("%FindScenarioUses").pressed.emit()
		var menu = panel.get_node("%ItemUsesMenu")
		assert(menu.visible)
		assert(await _save(output, "uses", size))
		print("ASSET_ACTION_USES identity=%s rows=%d viewport=%s" % [panel._rows[used].identity, menu._rows.size(), size])
		menu.reset()
		panel.get_node("%Gallery").select(removable)
		panel._select(removable)
		panel.get_node("%RemoveScenario").pressed.emit()
		var dialog: ConfirmationDialog
		for child in _shell._documents.view("assets.icons").get_children():
			if child is ConfirmationDialog and child.visible:
				dialog = child
		assert(dialog != null)
		assert(await _save(output, "remove", size))
		dialog.canceled.emit()
		await process_frame
	_passed = true


func _save(output: String, state: String, size: Vector2i) -> bool:
	for frame in 8:
		await process_frame
	await RenderingServer.frame_post_draw
	var capture := root.get_texture().get_image()
	assert(capture.get_size() == size)
	assert(capture.save_png(output.path_join("%s-%dx%d.png" % [state, size.x, size.y])) == OK)
	return true
