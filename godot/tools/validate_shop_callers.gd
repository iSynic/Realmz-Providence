extends SceneTree

var shell: Control
var output := ""
var checks: Array = []


func _initialize() -> void: _run.call_deferred()


func _run() -> void:
	create_timer(180).timeout.connect(func(): push_error("Shop caller check timed out"); quit(1))
	var args := OS.get_cmdline_user_args()
	assert(args.size() == 3)
	output = args[2]
	DirAccess.make_dir_recursive_absolute(args[1]); DirAccess.make_dir_recursive_absolute(output)
	root.gui_embed_subwindows = true
	shell = load("res://src/editor_shell.tscn").instantiate()
	shell._bridge = ProvidenceNativeBridge.new(args[1].path_join("settings.cfg"))
	root.add_child(shell); await process_frame
	assert(shell._bridge.create_project("shop-callers", args[1].path_join("project")).ok)
	var imported: Dictionary = shell._bridge.request("project.import-classic-scenario", {
		"directory": args[0], "expectedRevision": 0, "applicationDataDirectory": OS.get_environment("PROVIDENCE_APPLICATION_RULES_ROOT")})
	assert(imported.ok, str(imported))
	await settle()
	await shell._activate_session(shell._bridge.request("session.describe", {})); await settle()
	for viewport in [Vector2i(1920,1080), Vector2i(1600,900)]:
		root.size = viewport; root.content_scale_size = viewport
		await verify_callers(viewport)
	FileAccess.open(output.path_join("receipt.json"), FileAccess.WRITE).store_string(JSON.stringify({"checks": checks}, "\t"))
	shell._bridge.stop(); shell.free(); await process_frame
	print("PROVIDENCE_SHOP_CALLERS_OK"); quit()


func verify_callers(viewport: Vector2i) -> void:
	await shell._navigation.select_route("economy.shops"); await settle()
	var view: Control = shell._workbenches.shop
	await shell._workbenches.shop_commands.open_native_id(20); await settle()
	check(not view.get_node("%Callers").disabled, "Selected Shop caller access")
	var field: LineEdit = view.get_node("%Inflation")
	var original := field.text
	field.text = "150"; field.text_changed.emit(field.text)
	await click(view.get_node("%Callers")); await settle()
	var discovery = shell._commands._discovery
	check(discovery._view.visible and discovery._view._record.identity == "shop:20", "Exact Shop callers from dirty form")
	check(view.has_unapplied_changes(), "Caller browsing preserves draft")
	var items: Array = discovery._view._page.get("items", [])
	check(not items.is_empty(), "Hax Shop 20 has a real caller")
	check(str(items[0].source).contains("593"), "Caller identifies XAP 593")
	await capture(viewport)
	discovery.open_source(items[0]); await settle()
	check(shell._unapplied_dialog.visible, "Following caller guards draft")
	shell._unapplied_dialog.canceled.emit(); shell._unapplied_dialog.hide(); await settle()
	check(view.has_unapplied_changes() and field.text == "150", "Canceled navigation keeps Shop draft")
	discovery._view.hide(); view.discard_draft()
	check(field.text == original, "Discard restores Shop")
	await click(view.get_node("%Callers")); await settle()
	await discovery.open_source(discovery._view._page.items[0]); await settle()
	check(shell._documents.identity_for_tab(shell._document_tabs.current_tab) == "scripts.macros", "Caller opens XAP editor")
	await shell._navigation.navigate_back(); await settle()
	check(view.current_selection() == 20, "Back returns to exact Shop")


func settle() -> void:
	await create_timer(0.3).timeout
	while shell._operations.busy: await shell._operations.completed
	for _frame in 8: await process_frame


func click(control: Control) -> void:
	var position := control.get_global_rect().get_center()
	if control.get_window() != root: position += Vector2(control.get_window().position)
	for pressed in [true,false]:
		var event := InputEventMouseButton.new(); event.button_index = MOUSE_BUTTON_LEFT
		event.position = position; event.global_position = position; event.pressed = pressed
		root.push_input(event, true); await process_frame


func capture(viewport: Vector2i) -> void:
	await RenderingServer.frame_post_draw
	assert(root.get_texture().get_image().save_png(output.path_join("callers-%dx%d.png" % [viewport.x,viewport.y])) == OK)


func check(passed: bool, label: String) -> void:
	checks.append({"check": label, "passed": passed})
	if not passed:
		push_error(label)
		FileAccess.open(output.path_join("failure.json"), FileAccess.WRITE).store_string(JSON.stringify(checks,"\t"))
		quit(1)
		assert(passed, label)
