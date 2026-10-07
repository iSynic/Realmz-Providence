extends SceneTree


func _initialize() -> void:
	call_deferred("_open")


func _open() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 1:
		push_error("Expected one disposable project directory")
		quit(2)
		return
	var shell = load("res://src/editor_shell.tscn").instantiate()
	root.add_child(shell)
	await process_frame
	await shell._project_session.open_project(args[0])
	if not shell._session_view.connected or not shell._bridge.is_project_backed() or shell._bridge.current_project_path() != args[0].strip_edges():
		push_error("The requested review project did not open")
		quit(1)
		return
	await shell._navigation.select_tab(32)
	await process_frame
	print("PROVIDENCE_VAULT_REVIEW_READY viewport=%s shell=%s visible=%s" % [root.size, shell.size, shell.is_visible_in_tree()])
