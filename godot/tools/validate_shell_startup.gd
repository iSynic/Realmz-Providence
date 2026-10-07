extends SceneTree


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	assert(OS.get_cmdline_user_args().has("--demo"), "Startup check requires --demo")
	var shell = load("res://src/editor_shell.tscn").instantiate()
	root.add_child(shell)
	var deadline := Time.get_ticks_msec() + 15000
	while Time.get_ticks_msec() < deadline:
		await process_frame
		if shell._session_view.context().connected and not shell._operations.busy and not shell._bridge.operation_busy(): break
	var context: Dictionary = shell._session_view.context()
	var passed: bool = context.connected and context.projectId == "ashen-crown" and context.revision == 0
	if passed:
		await shell._navigation.select_route("economy.items")
		await process_frame; await process_frame
		passed = shell._navigation.current_route() == "economy.items" and shell._session_view.context().revision == 0
	if passed: print("PROVIDENCE_SHELL_STARTUP_OK real-adapter automatic-connect inactive-diagnostics-no-lease economy-navigation-revision-preserved")
	else: push_error("PROVIDENCE_SHELL_STARTUP_FAILED: " + JSON.stringify(context))
	shell.queue_free()
	await process_frame
	quit(0 if passed else 1)
