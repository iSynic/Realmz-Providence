extends SceneTree


func _initialize() -> void:
	call_deferred("_capture")


func _capture() -> void:
	var arguments := OS.get_cmdline_user_args()
	if arguments.size() not in [3, 4] or arguments[2] not in ["monster", "library"] or (arguments.size() == 4 and arguments[3] not in ["bottom", "population", "multiple", "range"]):
		push_error("Expected project directory, output PNG, monster|library and optional bottom|population|multiple|range.")
		quit(2)
		return
	root.content_scale_size = DisplayServer.window_get_size()
	var shell = load("res://src/editor_shell.tscn").instantiate()
	root.add_child(shell)
	await process_frame
	await shell._project_session.open_project(arguments[0])
	if not shell._session_view.connected:
		push_error("Review project could not open.")
		quit(2)
		return
	var tab := 30 if arguments[2] == "monster" else 31
	await shell._navigation.select_tab(tab)
	var workbench = shell._document_tabs.get_current_tab_control().get_node("Workbench")
	if not workbench.browser.error.is_empty():
		push_error(workbench.browser.error)
		quit(2)
		return
	var opened: Dictionary = await _open_selected_record(workbench, arguments)
	if not bool(opened.get("ok", false)):
		push_error(str(opened.get("error", "Monster selection unavailable.")))
		quit(2)
		return
	for frame in 300:
		await process_frame
		if frame > 3 and not workbench.get_node("Thumbnails").is_loading():
			break
	if arguments.size() == 4 and arguments[3] == "bottom":
		var scroll := workbench.get_node("DetailScroll") as ScrollContainer
		scroll.scroll_vertical = int(scroll.get_v_scroll_bar().max_value)
		await process_frame
		await process_frame
	elif arguments.size() == 4 and arguments[3] == "population":
		workbench.library.get_node("Header/PopulateScenario").pressed.emit()
		await process_frame
	elif arguments.size() == 4 and arguments[3] == "multiple":
		var rows: Node = workbench.library.get_node("InventoryScroll/Rows")
		if rows.get_child_count() < 2:
			push_error("Two source-backed Library entries are required for the selection capture.")
			quit(2)
			return
		await workbench.library.select_entry(str(rows.get_child(1).get_meta("identity")), true)
		await process_frame
	elif arguments.size() == 4 and arguments[3] == "range":
		shell._bridge.measure_requests = true
		await workbench.library.load_page(128, true)
		var rows: Node = workbench.library.get_node("InventoryScroll/Rows")
		if rows.get_child_count() == 0:
			push_error("The range check requires a source-backed second Library page.")
			quit(2)
			return
		var identity := str(rows.get_child(-1).get_meta("identity"))
		var timings: Array[int] = []
		var blocking_steps: Array[int] = []
		var phases: Dictionary = {}
		for sample in 30:
			var started := Time.get_ticks_usec()
			var response: Dictionary = await workbench.library.select_entry(identity, false, true)
			if not bool(response.get("ok", false)):
				push_error(str(response.get("error")))
				quit(2)
				return
			while workbench.plan_loading:
				await process_frame
			var render_started := Time.get_ticks_usec()
			await RenderingServer.frame_post_draw
			var sample_phases: Dictionary = workbench.library.last_selection_metrics.duplicate()
			sample_phases.merge(workbench.last_plan_metrics, true)
			sample_phases["finalRenderWaitUsec"] = Time.get_ticks_usec() - render_started
			for key in sample_phases:
				if key == "maxStepUsec":
					continue
				if not phases.has(key):
					phases[key] = []
				phases[key].append(int(sample_phases[key]))
			timings.append(Time.get_ticks_usec() - started)
			blocking_steps.append(maxi(int(workbench.library.last_selection_metrics.get("maxStepUsec", 0)), int(workbench.last_plan_metrics.get("maxStepUsec", 0))))
			await process_frame
		var warmed_timings := timings.slice(1)
		var warmed_steps := blocking_steps.slice(1)
		warmed_timings.sort()
		warmed_steps.sort()
		print("PROVIDENCE_MONSTER_RANGE_FIRST_USE visible_ready_ms=%.3f blocking_step_ms=%.3f" % [timings[0] / 1000.0, blocking_steps[0] / 1000.0])
		print("PROVIDENCE_MONSTER_RANGE_WARM samples=29 visible_ready_p95_ms=%.3f visible_ready_max_ms=%.3f blocking_step_p95_ms=%.3f blocking_step_max_ms=%.3f" % [warmed_timings[27] / 1000.0, warmed_timings[28] / 1000.0, warmed_steps[27] / 1000.0, warmed_steps[28] / 1000.0])
		timings.sort()
		blocking_steps.sort()
		for key in phases:
			var values: Array = phases[key]
			var warmed := values.slice(1)
			warmed.sort()
			print("PROVIDENCE_MONSTER_PHASE_WARM %s first_use_ms=%.3f warm_p95_ms=%.3f" % [key, values[0] / 1000.0, warmed[27] / 1000.0])
			values.sort()
			print("PROVIDENCE_MONSTER_PHASE %s mean_ms=%.3f p95_ms=%.3f" % [key, float(values.reduce(func(total, value): return total + value, 0)) / values.size() / 1000.0, values[28] / 1000.0])
		print("PROVIDENCE_MONSTER_RANGE_TIMING samples=30 selected=%d visible_ready_p95_ms=%.3f visible_ready_max_ms=%.3f blocking_step_p95_ms=%.3f blocking_step_max_ms=%.3f" % [workbench.library.selected_identities().size(), timings[28] / 1000.0, timings[29] / 1000.0, blocking_steps[28] / 1000.0, blocking_steps[29] / 1000.0])
	await RenderingServer.frame_post_draw
	var detail: Control = workbench.get_node("DetailScroll/Details")
	var inspector: Control = shell.get_node("%InspectorHost")
	print("PROVIDENCE_MONSTER_GEOMETRY detail=%s inspector=%s visible=%s" % [detail.get_global_rect(), inspector.get_global_rect(), inspector.visible])
	var error := root.get_texture().get_image().save_png(arguments[1])
	print("PROVIDENCE_MONSTER_CAPTURE viewport=%s route=%s output=%s error=%d" % [root.content_scale_size, arguments[2], arguments[1], error])
	shell.queue_free()
	await process_frame
	quit(0 if error == OK else 1)


func _open_selected_record(workbench, arguments: PackedStringArray) -> Dictionary:
	var monster_id := OS.get_environment("PROVIDENCE_REVIEW_MONSTER_ID")
	var opened: Dictionary = await workbench.browser.open_record(int(monster_id) if monster_id.is_valid_int() else 0)
	if arguments[2] == "library":
		var rows = workbench.library.get_node("InventoryScroll/Rows")
		if rows.get_child_count() == 0:
			push_error("No source-backed Monster Library rows available.")
			return {"ok": false, "error": "No source-backed Monster Library rows available."}
		var identity := OS.get_environment("PROVIDENCE_REVIEW_LIBRARY_ENTRY")
		if identity.is_empty():
			identity = str(rows.get_child(0).get_meta("identity"))
		opened = await workbench.library.open_entry(identity)
		print("PROVIDENCE_MONSTER_CAPTURE_ENTRY identity=%s" % identity)
	return opened
