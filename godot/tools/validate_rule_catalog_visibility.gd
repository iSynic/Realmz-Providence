extends SceneTree

var bridge: ProvidenceNativeBridge
var operations: ProvidenceEditorOperation
var failed := false
var receipt := {}
var revision := 0

func _initialize() -> void: run.call_deferred()

func run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 4: quit(1); return
	root.size = Vector2i(int(args[2]), 900 if int(args[2]) == 1600 else 1080)
	root.content_scale_size = root.size; root.gui_embed_subwindows = true
	bridge = ProvidenceNativeBridge.new(args[0].path_join("settings.cfg"))
	operations = ProvidenceEditorOperation.new(); root.add_child(operations)
	if not check(bridge.create_project("rule-visibility", args[0].path_join("project")).get("ok", false), "Owned project opens"): finish(args[1]); return
	var imported := bridge.request("project.import-classic-scenario", {"directory":args[3], "expectedRevision":0,
		"applicationDataDirectory":OS.get_environment("PROVIDENCE_CLASSIC_APPLICATION_DATA_ROOT")})
	if not check(imported.get("ok", false), str(imported.get("error", "Import failed"))): finish(args[1]); return
	revision = int(bridge.request("session.describe").result.revision)
	var original: Dictionary = bridge.request("project.inspect-classic-no-edit").result
	for kind in ["race", "caste"]: await inspect(kind)
	await idle()
	check(bridge.request("project.inspect-classic-no-edit").result == original, "Browsing retains every captured source byte")
	receipt.source = args[3]; receipt.viewport = [root.size.x, root.size.y]
	finish(args[1])

func inspect(kind: String) -> void:
	var view = load("res://src/" + kind + "_editor.tscn").instantiate()
	root.add_child(view); view.size = Vector2(root.size)
	var controller = preload("res://src/rule_workbench_controller.gd").new()
	controller.initialize(view, operations, func(): return {"revision":revision}, func(): return bridge, func(response): return response.get("ok", false))
	controller.attach_session(bridge)
	check((await controller.reload()).get("ok", false), "Scenario catalog loads")
	await idle()
	check(view.catalog_query().source == "authoring", "Authoring combines standard and retained custom definitions")
	var populated: Array = []; var empty: Array = []
	for index in view._rows.size():
		var row: Dictionary = view._rows[index]
		check(view.get_node("%RecordList").get_item_tooltip(index).contains(view.get_node("%RecordList").get_item_text(index)), "Hover help retains the full label and source")
		if not row.custom: continue
		check(int(row.authorId) == int(row.classicId) - 1, "Projected Divinity number preserves canonical ID")
		if row.recordContent == "populated" and row.creationReady:
			check(not str(row.displayName).is_empty(), "Unnamed mechanics have a readable display label")
			populated.append({"identity":row.identity, "authorId":row.authorId, "label":view.get_node("%RecordList").get_item_text(index)})
		else: empty.append(row.identity)
	var expected := (2 if args_has_caste() else 1) if kind == "race" else (2 if args_has_caste() else 0)
	check(populated.size() == expected, "All expected populated custom " + kind + " records are listed")
	for row in populated:
		check((await controller.open_rule(row.identity)).get("ok", false), "Every populated row opens")
		await idle(); await RenderingServer.frame_post_draw
		check(view.get_node("%RecordIdentity").text.contains("%02d" % int(row.authorId)), "Visible record heading uses Divinity number")
		var list: ItemList = view.get_node("%RecordList")
		var selected := list.get_selected_items()
		check(selected.size() == 1 and view._rows[selected[0]].identity == row.identity, "Visible catalog selection retains the exact canonical row")
		var bounds := list.get_item_rect(selected[0]); var scroll := list.get_v_scroll_bar().value
		check(bounds.position.y >= scroll - 1 and bounds.end.y <= scroll + list.size.y + 1, "Selected populated record is actually visible in the list")
	check((await controller.select_source("application")).get("ok", false), "Application reference remains accessible")
	await idle()
	check((await controller.select_source("authoring")).get("ok", false), "Returning restores the combined authoring list")
	await idle()
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(OS.get_cmdline_user_args()[0].path_join("capture-" + kind + ".png"))
	receipt[kind] = {"populated":populated,"otherRetainedRows":empty,"statusText":view.get_node("%RecordStatus").text}
	controller.dispose(); view.queue_free(); await process_frame

func args_has_caste() -> bool:
	return FileAccess.file_exists(OS.get_cmdline_user_args()[3].path_join("Data Caste"))

func idle() -> void:
	var quiet_until := Time.get_ticks_msec() + 150
	while Time.get_ticks_msec() < quiet_until:
		await process_frame
		if operations.busy or bridge.operation_busy(): quiet_until = Time.get_ticks_msec() + 150

func check(condition: bool, message: String) -> bool:
	if not condition: failed = true; push_error(message)
	return condition

func finish(path: String) -> void:
	receipt.status = "failed" if failed else "passed"
	receipt.buildIdentity = bridge.request("build.identity").get("result", {})
	FileAccess.open(path, FileAccess.WRITE).store_string(JSON.stringify(receipt, "\t"))
	bridge.stop(); operations.queue_free(); await process_frame
	print("PROVIDENCE_RULE_CATALOG_VISIBILITY_", "FAILED" if failed else "OK")
	quit(1 if failed else 0)
