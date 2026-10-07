extends SceneTree

const ENV_PREVIEW := "PROVIDENCE_REBUILT_PREVIEW_PATH"
const ENV_REBUILT := "PROVIDENCE_REBUILT_ROOT"
const ENV_GODOT := "PROVIDENCE_REBUILT_GODOT_PATH"

const PROJECT_PROBES := [
	{"flag": "--project-natural-exit", "kind": "simple-encounter", "interaction": "encounter_choice", "error": "--project-natural-exit requires project, application library, Rebuilt root, Godot executable, preview helper, and Simple Encounter ID"},
	{"flag": "--project-live", "kind": "simple-encounter", "interaction": "encounter_choice", "error": "--project-live requires project, application library, Rebuilt root, Godot executable, preview helper, and Simple Encounter ID"},
	{"flag": "--project-complex-live", "kind": "complex-encounter", "interaction": "complex_encounter", "error": "--project-complex-live requires project, application library, Rebuilt root, Godot executable, preview helper, and Complex Encounter ID"},
	{"flag": "--project-thief-live", "kind": "thief-encounter", "interaction": "thief_encounter", "error": "--project-thief-live requires project, application library, Rebuilt root, Godot executable, preview helper, Rogue Encounter ID, and owning Complex Encounter ID"},
	{"flag": "--project-extra-action-point-live", "kind": "extra-action-point-program", "interaction": "", "error": "--project-extra-action-point-live requires project, application library, Rebuilt root, Godot executable, preview helper, and Extra Action Point ID"},
	{"flag": "--project-battle-live", "kind": "battle", "interaction": "combat_action", "error": "--project-battle-live requires project, application library, Rebuilt root, Godot executable, preview helper, and Battle ID"},
	{"flag": "--project-treasure-live", "kind": "treasure", "interaction": "treasure_distribution", "error": "--project-treasure-live requires project, application library, Rebuilt root, Godot executable, preview helper, and Treasure ID"},
	{"flag": "--project-shop-live", "kind": "shop", "interaction": "shop_action", "error": "--project-shop-live requires project, application library, Rebuilt root, Godot executable, preview helper, and Shop ID"},
]

const TargetChecks = preload("res://tools/rebuilt_preview_target_checks.gd")

const PreviewPackageBridge = preload("res://tools/preview_package_bridge.gd")

func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var controller: Node = load("res://src/rebuilt_preview_controller.tscn").instantiate()
	root.add_child(controller)
	await process_frame
	if not TargetChecks.exercise(controller, Callable(self, "_fail")):
		return
	if not _exercise_context_status(controller):
		return
	if not await _exercise_player_map_text_identity():
		return
	if controller._is_owned_temp_root(OS.get_temp_dir().path_join("unrelated")):
		_fail("preview cleanup accepted an unrelated temporary directory")
		return
	if not _exercise_terminal_states(controller):
		return
	if not await _exercise_tree_exit_cleanup():
		return
	if not _exercise_configuration_paths(controller):
		return
	if not await _run_optional_probe(controller, OS.get_cmdline_user_args()):
		return
	print("PROVIDENCE_REBUILT_PREVIEW_CONTROLLER_OK targets=10 isolatedCleanup=guarded configuration=resolved")
	controller.queue_free()
	quit(0)


func _exercise_player_map_text_identity() -> bool:
	var editor: Node = load("res://src/player_maps_editor.tscn").instantiate()
	root.add_child(editor)
	await process_frame
	editor.set_document({
		"playerMap": {
			"identity": "player-map:3",
			"nativeId": 3,
			"markers": [],
			"startX": 0,
			"startY": 0,
			"level": 0,
			"pictureId": 0,
			"iconSize": 1,
			"show": -201,
			"isDungeon": false,
			"pictureRect": {"top": 0, "left": 0, "bottom": 0, "right": 0},
			"note": "",
		},
		"names": {},
	})
	var selected: Array[int] = []
	editor.text_open_requested.connect(func(resource_id: int) -> void: selected.append(resource_id))
	editor.get_node("%OpenPlayerMapText").pressed.emit()
	if int(editor.applied_scrolling_text_resource_id()) != -201 or selected != [-201]:
		editor.queue_free()
		_fail("Player Maps did not preserve the exact signed scenario TEXT selection")
		return false
	editor.queue_free()
	return await _exercise_reference_text_identity()


func _run_project_natural_exit_controller(controller: Node, project_path: String, application_library: String, rebuilt_root: String, godot_path: String, helper_path: String, encounter_id: int) -> bool:
	OS.set_environment(ENV_PREVIEW, helper_path)
	OS.set_environment(ENV_REBUILT, rebuilt_root)
	OS.set_environment(ENV_GODOT, godot_path)
	ProjectSettings.set_setting("providence/rebuilt_preview_headless", true)
	var bridge := ProvidenceNativeBridge.new()
	var opened := bridge.start_project(project_path, application_library) as Dictionary
	if not bool(opened.get("ok", false)):
		ProjectSettings.set_setting("providence/rebuilt_preview_headless", null)
		_clear_live_environment()
		_fail("natural-exit bridge failed to open: %s" % str(opened.get("error", "")))
		return false
	var revision := int((opened.get("result", {}) as Dictionary).get("revision", -1))
	var ready: Array[Dictionary] = []
	var failures: Array[Dictionary] = []
	var finished: Array[bool] = []
	var statuses: Array[String] = []
	controller.preview_ready.connect(func(result: Dictionary) -> void: ready.append(result))
	controller.preview_failed.connect(func(error: Dictionary) -> void: failures.append(error))
	controller.preview_finished.connect(func() -> void: finished.append(true))
	controller.status_changed.connect(func(message: String) -> void: statuses.append(message))
	var launched := await controller.start_preview(
		bridge,
		{"kind": "simple-encounter", "id": encounter_id},
		revision
	) as Dictionary
	var scratch_root := str(launched.get("scratchRoot", ""))
	var process_id := int(launched.get("processId", -1))
	if not bool(launched.get("ok", false)):
		_finish_project_preview(bridge)
		_fail("natural-exit controller launch failed: %s" % str(launched.get("error", "")))
		return false
	var deadline := Time.get_ticks_msec() + 90000
	while finished.is_empty() and failures.is_empty() and Time.get_ticks_msec() < deadline:
		await process_frame
	if controller.is_active():
		controller.cancel_preview("Natural-exit validation timed out.")
	_finish_project_preview(bridge)
	if not failures.is_empty():
		_fail("natural-exit controller reported failure: %s" % str(failures[0]))
		return false
	if ready.size() != 1 or finished.size() != 1:
		_fail("natural-exit controller did not emit exactly one ready and one finished signal")
		return false
	if OS.is_process_running(process_id):
		_fail("natural-exit Rebuilt child is still running")
		return false
	if DirAccess.dir_exists_absolute(scratch_root):
		_fail("natural-exit controller did not remove its isolated temporary package")
		return false
	if not statuses.has("Rebuilt preview closed · temporary package removed"):
		_fail("natural-exit controller did not report its natural close status")
		return false
	var result := ready[0]
	if str(result.get("status", "")) != "ready" or str(result.get("targetKind", "")) != "simple-encounter" or int(result.get("targetId", -1)) != encounter_id:
		_fail("natural-exit controller returned the wrong target identity: %s" % str(result))
		return false
	print("PROVIDENCE_REBUILT_PREVIEW_CONTROLLER_NATURAL_EXIT_OK target=simple-encounter:%d revision=%d" % [encounter_id, int(result.get("revision", -1))])
	return true


func _run_project_live_controller(controller: Node, project_path: String, application_library: String, rebuilt_root: String, godot_path: String, helper_path: String, target_id: int, target_kind := "simple-encounter", expected_interaction := "encounter_choice", complex_owner_id := -1) -> bool:
	OS.set_environment(ENV_PREVIEW, helper_path)
	OS.set_environment(ENV_REBUILT, rebuilt_root)
	OS.set_environment(ENV_GODOT, godot_path)
	var bridge := ProvidenceNativeBridge.new()
	var opened := bridge.start_project(project_path, application_library) as Dictionary
	if not bool(opened.get("ok", false)):
		_clear_live_environment()
		_fail("project-backed bridge failed to open: %s" % str(opened.get("error", "")))
		return false
	var revision := int((opened.get("result", {}) as Dictionary).get("revision", -1))
	var ready: Array[Dictionary] = []
	var failures: Array[Dictionary] = []
	controller.preview_ready.connect(func(result: Dictionary) -> void: ready.append(result))
	controller.preview_failed.connect(func(error: Dictionary) -> void: failures.append(error))
	var target := {"kind": target_kind, "id": target_id}
	if target_kind == "thief-encounter":
		target["complexEncounterId"] = complex_owner_id
	var launched := await controller.start_preview(bridge, target, revision) as Dictionary
	var scratch_root := str(launched.get("scratchRoot", ""))
	if not bool(launched.get("ok", false)):
		bridge.stop()
		_clear_live_environment()
		_fail("project-backed controller launch failed: %s" % str(launched.get("error", "")))
		return false
	var deadline := Time.get_ticks_msec() + 90000
	while ready.is_empty() and failures.is_empty() and Time.get_ticks_msec() < deadline:
		await process_frame
	controller.cancel_preview("Controlled project-backed preview complete.")
	bridge.stop()
	_clear_live_environment()
	if not failures.is_empty():
		_fail("project-backed controller reported failure: %s" % str(failures[0]))
		return false
	if ready.is_empty():
		_fail("project-backed controller did not receive readiness before timeout")
		return false
	if DirAccess.dir_exists_absolute(scratch_root):
		_fail("project-backed controller did not remove its isolated temporary package")
		return false
	var result := ready[0]
	if str(result.get("status", "")) != "ready" or str(result.get("targetKind", "")) != target_kind or int(result.get("targetId", -1)) != target_id or str(result.get("pendingInteractionKind", "")) != expected_interaction:
		_fail("project-backed controller returned the wrong target identity: %s" % str(result))
		return false
	print("PROVIDENCE_REBUILT_PREVIEW_CONTROLLER_PROJECT_OK target=%s:%d projectRevision=%d runtimeRevision=%d interaction=%s cleanup=verified" % [target_kind, target_id, revision, int(result.get("revision", -1)), expected_interaction])
	return true


func _clear_live_environment() -> void:
	OS.set_environment(ENV_PREVIEW, "")
	OS.set_environment(ENV_REBUILT, "")
	OS.set_environment(ENV_GODOT, "")


func _exercise_terminal_states(controller: Node) -> bool:
	var failures: Array[Dictionary] = []
	controller.preview_failed.connect(func(error: Dictionary) -> void: failures.append(error))
	for case in [
		{"code": "runtime.exited-before-ready", "started": Time.get_ticks_msec()},
		{"code": "runtime.ready-timeout", "started": Time.get_ticks_msec() - 2000},
	]:
		var scratch := controller._create_temp_root() as Dictionary
		if not bool(scratch.get("ok", false)):
			_fail("could not create terminal-state scratch root")
			return false
		var root_path := str(scratch.root)
		var package := FileAccess.open(root_path.path_join("scenario.realmz2"), FileAccess.WRITE)
		package.store_string("controlled terminal-state fixture")
		package.close()
		controller._active = true
		controller._process_id = 2147483647
		controller._started_msec = int(case.started)
		controller._temp_root = root_path
		controller._result_path = root_path.path_join("preview-result.json")
		ProjectSettings.set_setting("providence/rebuilt_preview_ready_timeout_seconds", 1.0)
		controller._process(0.0)
		if failures.is_empty() or str(failures[-1].get("code", "")) != str(case.code):
			_fail("terminal preview state did not report %s" % str(case.code))
			return false
		if DirAccess.dir_exists_absolute(root_path):
			_fail("terminal preview state did not clean its owned scratch root")
			return false
	ProjectSettings.set_setting("providence/rebuilt_preview_ready_timeout_seconds", null)
	return true


func _exercise_tree_exit_cleanup() -> bool:
	var controller: Node = load("res://src/rebuilt_preview_controller.tscn").instantiate()
	root.add_child(controller)
	var scratch := controller._create_temp_root() as Dictionary
	if not bool(scratch.get("ok", false)):
		_fail("could not create tree-exit scratch root")
		return false
	var root_path := str(scratch.root)
	var package := FileAccess.open(root_path.path_join("scenario.realmz2"), FileAccess.WRITE)
	package.store_string("controlled tree-exit fixture")
	package.close()
	controller._active = true
	controller._process_id = 2147483647
	controller._temp_root = root_path
	controller.queue_free()
	await process_frame
	if DirAccess.dir_exists_absolute(root_path):
		_fail("tree exit did not clean its owned preview scratch root")
		return false
	return true


func _run_live_controller(controller: Node, package_path: String, rebuilt_root: String, godot_path: String, helper_path: String, encounter_id: int) -> bool:
	OS.set_environment(ENV_PREVIEW, helper_path)
	OS.set_environment(ENV_REBUILT, rebuilt_root)
	OS.set_environment(ENV_GODOT, godot_path)
	var ready: Array[Dictionary] = []
	var failures: Array[Dictionary] = []
	controller.preview_ready.connect(func(result: Dictionary) -> void: ready.append(result))
	controller.preview_failed.connect(func(error: Dictionary) -> void: failures.append(error))
	var launched := await controller.start_preview(
		PreviewPackageBridge.new(package_path),
		{"kind": "simple-encounter", "id": encounter_id},
		0
	) as Dictionary
	var scratch_root := str(launched.get("scratchRoot", ""))
	if not bool(launched.get("ok", false)):
		OS.set_environment(ENV_PREVIEW, "")
		OS.set_environment(ENV_REBUILT, "")
		OS.set_environment(ENV_GODOT, "")
		_fail("live controller launch failed: %s" % str(launched.get("error", "")))
		return false
	var deadline := Time.get_ticks_msec() + 90000
	while ready.is_empty() and failures.is_empty() and Time.get_ticks_msec() < deadline:
		await process_frame
	controller.cancel_preview("Controlled live preview complete.")
	OS.set_environment(ENV_PREVIEW, "")
	OS.set_environment(ENV_REBUILT, "")
	OS.set_environment(ENV_GODOT, "")
	if not failures.is_empty():
		_fail("live controller reported failure: %s" % str(failures[0]))
		return false
	if ready.is_empty():
		_fail("live controller did not receive readiness before timeout")
		return false
	if DirAccess.dir_exists_absolute(scratch_root):
		_fail("live controller did not remove its isolated temporary package")
		return false
	var result := ready[0]
	if str(result.get("status", "")) != "ready" or str(result.get("targetKind", "")) != "simple-encounter" or int(result.get("targetId", -1)) != encounter_id:
		_fail("live controller returned the wrong target identity: %s" % str(result))
		return false
	print("PROVIDENCE_REBUILT_PREVIEW_CONTROLLER_LIVE_OK target=simple-encounter:%d revision=%d" % [encounter_id, int(result.get("revision", -1))])
	return true


func _cleanup_fixture(root_path: String, rebuilt_root: String, host_root: String, preview_executable: String, godot_executable: String) -> void:
	for path in [
		preview_executable,
		godot_executable,
		rebuilt_root.path_join("project.godot"),
		host_root.path_join("development_preview_host.tscn"),
	]:
		DirAccess.remove_absolute(path)
	DirAccess.remove_absolute(host_root)
	DirAccess.remove_absolute(rebuilt_root)
	DirAccess.remove_absolute(root_path)


func _fail(message: String) -> void:
	push_error("PROVIDENCE_REBUILT_PREVIEW_CONTROLLER_FAILED: %s" % message)
	quit(1)


func _exercise_context_status(controller: Node) -> bool:
	if controller._compile_status("extra-action-point-program") != "Compiling current revision for isolated standalone Extra AP program preview…":
		_fail("standalone Extra AP compile status lost its execution-context boundary")
		return false
	if controller._ready_status("extra-action-point-program") != "Rebuilt standalone Extra AP program ready · caller-specific eligibility was not evaluated · editor state remains isolated":
		_fail("standalone Extra AP ready status lost its caller-eligibility limitation")
		return false
	return true


func _exercise_configuration_paths(controller: Node) -> bool:
	var fixture_root := OS.get_temp_dir().path_join("providence-preview-controller-validation-%d" % Time.get_ticks_usec())
	var rebuilt_root := fixture_root.path_join("rebuilt")
	var host_root := rebuilt_root.path_join("tools")
	if DirAccess.make_dir_recursive_absolute(host_root) != OK:
		_fail("could not create resolver fixture")
		return false
	var preview_executable := fixture_root.path_join("preview-helper.exe")
	var godot_executable := fixture_root.path_join("godot.exe")
	for path in [preview_executable, godot_executable, rebuilt_root.path_join("project.godot"), host_root.path_join("development_preview_host.tscn")]:
		var file := FileAccess.open(path, FileAccess.WRITE)
		if file == null:
			_fail("could not create resolver fixture file")
			return false
		file.store_string("fixture")
		file.close()
	OS.set_environment(ENV_PREVIEW, preview_executable)
	OS.set_environment(ENV_REBUILT, rebuilt_root)
	OS.set_environment(ENV_GODOT, godot_executable)
	var availability := controller.availability() as Dictionary
	OS.set_environment(ENV_PREVIEW, "")
	OS.set_environment(ENV_REBUILT, "")
	OS.set_environment(ENV_GODOT, "")
	_cleanup_fixture(fixture_root, rebuilt_root, host_root, preview_executable, godot_executable)
	if not bool(availability.get("available", false)):
		_fail("configured preview paths were not accepted: %s" % str(availability.get("reason", "")))
		return false
	return true


func _run_optional_probe(controller: Node, arguments: PackedStringArray) -> bool:
	for probe in PROJECT_PROBES:
		var flag: String = probe["flag"]
		if not arguments.has(flag):
			continue
		var index := arguments.find(flag)
		var extra_owner: bool = probe["kind"] == "thief-encounter"
		if index + (7 if extra_owner else 6) >= arguments.size():
			_fail(probe["error"])
			return false
		return await _run_selected_project_probe(controller, arguments, probe, index)
	if arguments.has("--live"):
		return await _run_optional_package_probe(controller, arguments)
	return true


func _run_selected_project_probe(controller: Node, arguments: PackedStringArray, probe: Dictionary, index: int) -> bool:
	if probe["flag"] == "--project-natural-exit":
		return await _run_project_natural_exit_controller(
			controller, arguments[index + 1], arguments[index + 2],
			arguments[index + 3], arguments[index + 4], arguments[index + 5],
			int(arguments[index + 6])
		)
	return await _run_project_live_controller(
		controller, arguments[index + 1], arguments[index + 2],
		arguments[index + 3], arguments[index + 4], arguments[index + 5],
		int(arguments[index + 6]), probe["kind"], probe["interaction"],
		int(arguments[index + 7]) if probe["kind"] == "thief-encounter" else -1
	)


func _run_optional_package_probe(controller: Node, arguments: PackedStringArray) -> bool:
	var live_index := arguments.find("--live")
	if live_index + 4 >= arguments.size():
		_fail("--live requires package, Rebuilt root, Godot executable, and preview helper")
		return false
	var live_ok := await _run_live_controller(
		controller,
		arguments[live_index + 1],
		arguments[live_index + 2],
		arguments[live_index + 3],
		arguments[live_index + 4],
		int(arguments[live_index + 5]) if live_index + 5 < arguments.size() else 0
	)
	if not live_ok:
		return false
	return true


func _exercise_reference_text_identity() -> bool:
	var references: Node = load("res://src/reference_strings.tscn").instantiate()
	root.add_child(references)
	await process_frame
	var reference_selections: Array[int] = []
	references.scrolling_text_selection_changed.connect(func(resource_id: int) -> void: reference_selections.append(resource_id))
	references.set_document({
		"group": {
			"identity": "reference-string:asset:classic-resource:TEXT:-201",
			"resourceType": "TEXT",
			"resourceId": -201,
			"label": "Chronicle",
			"source": "Scenario.rsrc",
			"ownership": "project-text",
		},
		"entries": [{"index": 0, "text": "Chronicle"}],
	})
	references.set_document({
		"group": {
			"identity": "reference-string:asset:classic-resource:styl:-201",
			"resourceType": "styl",
			"resourceId": -201,
			"label": "Chronicle style",
			"source": "Scenario.rsrc",
			"ownership": "compatibility-preserved-style",
		},
		"entries": [],
	})
	if reference_selections != [-201, 0]:
		references.queue_free()
		_fail("Reference Strings conflated scenario TEXT with its same-ID styl companion")
		return false
	references.queue_free()
	return true


func _finish_project_preview(bridge: ProvidenceNativeBridge) -> void:
	bridge.stop()
	ProjectSettings.set_setting("providence/rebuilt_preview_headless", null)
	_clear_live_environment()
