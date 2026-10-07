extends SceneTree

var shell
var frame_gaps: Array[float] = []
var measuring := false
var last_frame := 0
var failed := false

func _initialize() -> void: run.call_deferred()

func run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 3: quit(1); return
	var width := int(args[2])
	root.size = Vector2i(width, 900 if width == 1600 else 1080)
	root.content_scale_size = root.size
	var project := args[1].path_join("project")
	var bridge := ProvidenceNativeBridge.new(args[1].path_join("settings.cfg"))
	if not bridge.create_project("rule-visible-profile", project).get("ok", false): quit(1); return
	var source := OS.get_environment("PROVIDENCE_PROFILE_CLASSIC_SOURCE")
	if not source.is_empty():
		var imported := bridge.request("project.import-classic-scenario", {"directory": source, "expectedRevision": 0,
			"applicationDataDirectory": OS.get_environment("PROVIDENCE_CLASSIC_APPLICATION_DATA_ROOT")})
		if not imported.get("ok", false): push_error(str(imported)); bridge.stop(); quit(1); return
	bridge.stop()
	shell = load("res://src/editor_shell.tscn").instantiate(); root.add_child(shell)
	await process_frame
	await shell._project_session.open_project(project)
	process_frame.connect(frame_tick)
	var measurements := {}
	for kind in ["race", "caste"]:
		await settle()
		await shell._navigation.select_route("rules." + kind + "s")
		await settle()
		var view = shell._documents.view("rules." + kind + "s")
		var controller
		for candidate in shell._workbenches.rule_commands._controllers:
			if candidate._view == view: controller = candidate
		if not view.is_visible_in_tree() or controller._bridge == null:
			push_error("Performance route was not opened: " + kind); quit(1); return
		for frame in 30: await process_frame
		measurements[kind + "CatalogVisible"] = await measure(func(): await controller.load_catalog(view.catalog_query()))
		measurements[kind + "OpenVisible"] = await measure(func(): await controller.open_rule("classic.%s.1" % kind))
		if view.current_selection() != "classic.%s.1" % kind:
			push_error("Performance record was not opened: " + kind); quit(1); return
	await settle()
	var identity: Dictionary = shell._bridge.request("build.identity")
	assert(identity.get("ok", false) and identity.result.profile == "release")
	var receipt := {"viewport": [width, root.size.y], "measurements": measurements,
		"frameGaps": summary(frame_gaps), "budgetMs": 100, "status": "failed" if failed else "passed",
		"scope": "Warmed release-backed bounded catalog/open commands through the rendered frame; not whole-editor or mutation latency.", "source": source,
		"adapter": identity.result}
	FileAccess.open(args[0], FileAccess.WRITE).store_string(JSON.stringify(receipt, "\t"))
	shell._close_project(); shell.queue_free(); await process_frame
	print("RULE_VISIBLE_PROFILE_", "FAILED" if failed else "OK")
	quit(1 if failed else 0)

func settle() -> void:
	for frame in 1800:
		await process_frame
		if not shell._operations.busy and not shell._bridge.operation_busy(): return
	push_error("Performance operation exceeded its bounded wait"); quit(1)

func measure(action: Callable) -> Dictionary:
	var values: Array[float] = []
	for sample in 33:
		measuring = sample >= 3
		last_frame = Time.get_ticks_usec()
		var start := Time.get_ticks_usec()
		await action.call()
		await RenderingServer.frame_post_draw
		if measuring: values.append((Time.get_ticks_usec() - start) / 1000.0)
		measuring = false
	var result := summary(values)
	failed = failed or result.p95Ms > 100 or result.count != 30
	return result

func frame_tick() -> void:
	var now := Time.get_ticks_usec()
	if measuring:
		var gap := (now - last_frame) / 1000.0
		frame_gaps.append(gap)
		failed = failed or gap > 100
	last_frame = now

func summary(values: Array[float]) -> Dictionary:
	values.sort()
	if values.is_empty(): return {"count": 0, "p95Ms": 0, "maxMs": 0}
	return {"count": values.size(), "samples": values, "medianMs": values[values.size() / 2],
		"p95Ms": values[int(ceil(values.size() * 0.95)) - 1], "maxMs": values[-1]}
