extends SceneTree


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 1 or not FileAccess.file_exists(args[0].path_join("assets-corpus-disposable.marker")):
		quit(2)
		return
	var shell = load("res://src/editor_shell.tscn").instantiate()
	root.add_child(shell)
	await process_frame
	await shell._project_session.open_project(args[0])
	assert(shell._bridge.is_project_backed())
	var revision: int = shell._session_view.revision
	for tab in [7, 8, 9]:
		for entry in [["CustomLibrary", "personal"], ["ReferenceAssets", "stock"]]:
			await shell._navigation.select_tab(tab)
			var button: Button = shell._document_tabs.get_current_tab_control().find_child(entry[0], true, false)
			assert(button != null and button.is_visible_in_tree() and not button.disabled)
			button.pressed.emit()
			assert(not shell._unapplied_dialog.visible)
			var library = shell._assets.library_workbench
			assert(library != null and shell._document_tabs.get_current_tab_control() == library)
			assert(library._scope == entry[1] and shell._session_view.revision == revision)
			if entry[1] == "stock":
				assert(not library.get_node("%Gallery")._rows.is_empty())
			else:
				assert(library.get_node("%Bag").is_visible_in_tree() and library.get_node("%Vault").is_visible_in_tree())
			await process_frame
	shell._bridge.stop()
	print("PROVIDENCE_LIBRARY_NAVIGATION_OK actual-picture-sound-icon-tabs personal-stock six-entry-paths no-mutation")
	quit()
