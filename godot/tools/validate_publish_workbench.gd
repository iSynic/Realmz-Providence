extends SceneTree

const Operation = preload("res://src/editor_operation.gd")
const Controller = preload("res://src/publish_workbench_controller.gd")

class Bridge extends ProvidenceNativeBridge:
	func supports_validation_jobs() -> bool: return false
	var calls: Array[Dictionary] = []
	var failure_method := ""
	var unknown := false
	var benchmark_revision := 7
	var readiness := "ready"

	func _init() -> void:
		_project_backed = true
		_project_path = "fixture-project"
		_application_library_root = "fixture-library"

	func _request(method: String, params: Dictionary) -> Dictionary:
		OS.delay_msec(15)
		calls.append({"method": method, "params": params.duplicate(true)})
		if method == failure_method:
			return {"ok": false, "outcomeUnknown": unknown, "error": "Controlled failure"}
		match method:
			"compiler.describe":
				return {"ok": true, "result": {"commit": "fixture-commit", "version": "fixture"}}
			"project.inspect-classic-readiness", "project.inspect-rebuilt-readiness":
				return {"ok": true, "result": {"status": readiness, "revision": 7, "groups": [], "blockerCount": 0,
					"warningCount":1 if readiness == "ready-with-warnings" else 0,"warnings":[{"message":"Preserved imported missing message."}] if readiness == "ready-with-warnings" else []}}
			"project.inspect-classic-plan":
				return {"ok": true, "result": _classic_plan(params)}
			"project.inspect-classic-stuffit":
				var plan := _classic_plan(params)
				plan["manifestSha256"] = "reviewed-forks"
				plan["warnings"] = ["Original Expander verification pending."]
				return {"ok": true, "result": plan}
			"project.inspect-rebuilt-package":
				return {"ok": true, "result": _rebuilt_plan(params)}
			"project.benchmark":
				return {"ok": true, "result": _benchmark()}
			"project.compile-classic-slice":
				return {"ok": true, "result": {"directory": params.directory, "revision": 7, "files": [{}, {}]}}
			"project.compile-rebuilt-package":
				return {"ok": true, "result": {"path": params.path, "revision": 7, "fileCount": 10}}
			"project.compile-classic-stuffit":
				return {"ok": true, "result": {"path": params.path, "revision": 7, "fileCount": 8}}
		return {"ok": false, "error": "Unexpected request " + method}

	func _classic_plan(params: Dictionary) -> Dictionary:
		var offset := int(params.get("offset", 0))
		return {"revision": 7, "completeScenario": false, "requiredDirectoryName": "Fixture Scenario",
			"manifestSha256": "fixture-trim-plan", "trim": {"preview": {"removableBytes":317040}},
			"files": _page(offset, ["Data DD", "Data ED3", "Data LD", "Data SD", "Global", "Scenario.rsrc", "Data NI", "Data TD", "Data MD2"], "family")}

	func _rebuilt_plan(params: Dictionary) -> Dictionary:
		var offset := int(params.get("offset", 0))
		return {"revision": 7, "files": _page(offset, ["assets/index.json", "content.json", "manifest.json", "scenario.json", "world.json"], "kind")}

	func _page(offset: int, paths: Array, type_key: String) -> Dictionary:
		var rows: Array = []
		for path in paths.slice(offset, mini(paths.size(), offset + 4)):
			rows.append({"path": path, "bytes": 42, type_key: "document"})
		return {"items": rows, "offset": offset, "limit": 4, "total": paths.size(), "truncated": offset + 4 < paths.size()}

	func _benchmark() -> Dictionary:
		return {"revision": benchmark_revision, "ok": true, "counts": {"maps": 2, "mapTiles": 16200,
			"actionPoints": 100, "extraActionPoints": 3, "extraCodes": 4}, "timing": {"validationMs": 12}}

class Context extends RefCounted:
	var revision := 7
	func read() -> Dictionary: return {"connected": true, "projectId": "Fixture Project", "revision": revision}

var _operations: ProvidenceEditorOperation
var _bridge := Bridge.new()
var _context := Context.new()
var _view: ProvidencePublishWorkbench
var _controller: ProvidencePublishWorkbenchController
var _failed := false
var _requested_route := ""
var _requested_action := ""


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	_operations = Operation.new()
	root.add_child(_operations)
	_view = preload("res://src/publish_workbench.tscn").instantiate()
	root.add_child(_view)
	_controller = Controller.new()
	_controller.initialize(_view, _operations, _context.read, func(): return _bridge)
	_controller.attach_session()
	_destination_paths()
	await _classic_check_and_paging()
	await _trim_confirmation()
	await _stuffit_check()
	await _rebuilt_check()
	await _warning_readiness()
	await _route_geometry_and_focus()
	await _publication()
	await _revision_guard()
	await _page_failure_recovery()
	await _benchmark_revision_guard()
	await _known_failure_repair()
	await _failure_boundary()
	_controller.teardown()
	_bridge.stop()
	_view.free()
	_operations.free()
	if not _failed:
		print("PROVIDENCE_PUBLISH_WORKBENCH_OK targets=3 paging=direct revisions=guarded publication=no-overwrite recovery=explicit")
	quit(1 if _failed else 0)


func _classic_check_and_paging() -> void:
	var response := await _controller.reload()
	_check(response.get("ok", false), "Classic ready check failed")
	_check(_methods() == ["project.inspect-classic-readiness", "compiler.describe", "project.inspect-classic-plan", "project.benchmark"], "Classic request sequence changed")
	_check(_view.files.item_count == 4 and _view.files_meta.text.contains("1–4"), "Classic first page was not bounded")
	_view.page_number.text = "2"
	_view.page_number.text_submitted.emit("2")
	while _operations.busy: await process_frame
	_check(_view.files_meta.text.contains("5–8") and _view.selected_path.text == "Global", "Direct Classic page navigation failed")
	_view.page_number.text = "99"
	_view.page_number.text_submitted.emit("99")
	_check(_view.page_number.text == "2", "Out-of-range direct page navigation was not rejected")


func _rebuilt_check() -> void:
	_bridge.calls.clear()
	_view.target_selector.select(1)
	_view.target_selector.item_selected.emit(1)
	while _operations.busy: await process_frame
	await process_frame
	while _operations.busy: await process_frame
	_check(_methods() == ["project.inspect-rebuilt-readiness", "compiler.describe", "project.inspect-rebuilt-package", "project.benchmark"], "Rebuilt request sequence changed")
	var params: Dictionary = _bridge.calls[2].params
	_check(params.get("compilerCommit") == "fixture-commit" and params.get("limit") == 4, "Rebuilt plan lost compiler identity or bound")
	_check(not _view.trim_option.visible and _view.trim_parameters().is_empty(), "Classic trimming leaked into Rebuilt")


func _trim_confirmation() -> void:
	_check(not _view.trim_option.button_pressed, "Trimming must default off")
	_view.trim_option.button_pressed = true
	await process_frame
	while _operations.busy: await process_frame
	_check(_view.trim_notice.text.contains("317040"), "Trim warning lost its byte count")
	_check(_bridge.calls.any(func(call): return call.method == "project.inspect-classic-plan" and call.params.get("trimExtraCodeTail", false)), "Trim selection did not reach the plan")
	_bridge.calls.clear()
	_view.export_button.pressed.emit()
	_check(_view.trim_confirmation.visible, "Trim confirmation was skipped")
	_view.trim_confirmation.canceled.emit()
	_view.trim_confirmation.hide()
	_check(_bridge.calls.is_empty() and not _view.trim_parameters(true).acknowledgeTrim, "Cancel acknowledged or published a trimmed export")
	_view.export_button.pressed.emit()
	_view.trim_confirmation.confirmed.emit()
	_view.trim_confirmation.hide()
	_view.classic_parent_picker.hide()
	var response := await _controller.publish_to("classic", "trimmed-fixture")
	_check(response.get("ok", false), "Confirmed trim publication failed")
	var params: Dictionary = _bridge.calls.back().params
	_check(params.get("trimExtraCodeTail", false) and params.get("acknowledgeTrim", false) and params.manifestSha256 == "fixture-trim-plan", "Trim publication lost consent or plan identity")
	_controller.attach_session()
	_check(not _view.trim_option.button_pressed, "Trimming selection survived a project attachment")


func _stuffit_check() -> void:
	_bridge.calls.clear()
	_view.target_selector.select(2)
	_view.target_selector.item_selected.emit(2)
	await process_frame
	while _operations.busy: await process_frame
	_check(_view.target() == "stuffit" and _methods() == ["project.inspect-classic-readiness", "compiler.describe", "project.inspect-classic-stuffit", "project.benchmark"], "StuffIt did not use the Classic compiler")
	_check(_view.diagnostics.text.contains("Original Expander"), "StuffIt qualification warning was hidden")
	_check(_view.stuffit_archive_picker.file_mode == FileDialog.FILE_MODE_SAVE_FILE and _view.stuffit_archive_picker.use_native_dialog, "StuffIt lost the native save dialog")
	for viewport in [Vector2i(1600, 900), Vector2i(1920, 1080)]:
		root.size = viewport
		_view.size = Vector2(viewport.x - 356, viewport.y - 76)
		await process_frame
		var panel: Control = _view.get_node("PublishPanel")
		for control: Control in [_view.target_selector, _view.export_button, _view.get_node("%ApplicationLibraryStatus")]:
			_check(panel.get_global_rect().encloses(control.get_global_rect()), "StuffIt target clips at %s" % viewport)
	_bridge.calls.clear()
	var response := await _controller.publish_to("stuffit", "fixture.sit")
	_check(response.get("ok", false), "StuffIt publication failed")
	_check(_bridge.calls[0].method == "project.compile-classic-stuffit" and _bridge.calls[0].params.expectedRevision == 7 and _bridge.calls[0].params.manifestSha256 == "reviewed-forks", "StuffIt omitted the reviewed manifest or revision")
	_check(_view.diagnostics.text.contains("Published Legacy Realmz archive successfully"), "StuffIt receipt was not displayed")


func _route_geometry_and_focus() -> void:
	for viewport in [Vector2i(1600, 900), Vector2i(1920, 1080)]:
		root.size = viewport
		_view.size = Vector2(viewport.x - 356, viewport.y - 76)
		await process_frame
		for node: Control in [_view.get_node("PublishPanel"), _view.get_node("Columns/Left"), _view.get_node("Columns/Right")]:
			_check(_view.get_global_rect().encloses(node.get_global_rect()), "Publish region clips at %s" % viewport)
		for route in ["export.export-plan", "linter.readiness", "export.benchmark"]:
			_view.focus_route(route)
			await process_frame
			var expected: Control = {"export.export-plan": _view.export_button,
				"linter.readiness": _view.recheck_button, "export.benchmark": _view.run_benchmark}[route]
			_check(root.gui_get_focus_owner() == expected, "%s did not focus its primary control at %s" % [route, viewport])


func _warning_readiness() -> void:
	_bridge.readiness = "ready-with-warnings"
	for target in ["classic","rebuilt"]:
		_view._target = target
		var response := await _controller.recheck()
		_check(response.get("ok", false) and _view._plan_ready and _view.files.item_count > 0,"Warnings must keep the derived file plan exportable: " + target)
		_check(_view.blocker_groups.text.contains("Preserved imported missing message."),"Exportable warnings must remain visible")
	_bridge.readiness = "blocked"
	await _controller.recheck()
	_check(not _view._plan_ready,"Blocked readiness must remain unavailable")
	_bridge.readiness = "ready"
	await _controller.recheck()


func _destination_paths() -> void:
	var selected: Array = []
	_view.destination_selected.connect(func(target: String, path: String): selected.append([target, path]))
	_view._required_directory_name = "Fixture Scenario"
	_view._classic_parent_selected("C:/fixture-output")
	_view._rebuilt_path_selected("C:/fixture-output/Fixture")
	_view._stuffit_path_selected("C:/fixture-output/Fixture")
	_check(selected == [["classic", "C:/fixture-output/Fixture Scenario"], ["rebuilt", "C:/fixture-output/Fixture.realmz2"], ["stuffit", "C:/fixture-output/Fixture.sit"]],
		"Native destination pickers lost Classic directory naming or Rebuilt extension rules")


func _publication() -> void:
	_bridge.calls.clear()
	var response := await _controller.publish_to("rebuilt", "fixture.realmz2")
	_check(response.get("ok", false), "Rebuilt publication failed")
	var call: Dictionary = _bridge.calls[0]
	_check(call.method == "project.compile-rebuilt-package" and call.params.expectedRevision == 7, "Rebuilt publication omitted its revision guard")
	_check(_view.diagnostics.text.contains("Published Rebuilt successfully"), "Publication result was not visible")
	_check(not _view.next_page.disabled, "Publication completion left valid file paging disabled")


func _revision_guard() -> void:
	_bridge.calls.clear()
	_context.revision = 8
	var response := await _controller.publish_to("rebuilt", "stale.realmz2")
	_check(not response.get("ok", false) and _bridge.calls.is_empty(), "Stale publication reached the adapter")
	_check(_view.readiness_status.text.contains("Project changed"), "Stale plan was not visibly invalidated")
	_context.revision = 7


func _failure_boundary() -> void:
	await _controller.recheck()
	_bridge.calls.clear()
	_bridge.failure_method = "project.compile-rebuilt-package"
	_bridge.unknown = true
	var response := await _controller.publish_to("rebuilt", "unknown.realmz2")
	_check(response.get("outcomeUnknown", false), "Unknown publication outcome was discarded")
	_check(_view.diagnostics.text.contains("inspect the destination"), "Unknown outcome permitted an unsafe retry")
	_check(_view.export_button.disabled, "Unknown publication outcome permitted a retry")
	_check(not _view.repair_issue.visible, "Unknown publication outcome offered unsafe repair navigation")


func _known_failure_repair() -> void:
	_bridge.failure_method = ""
	_bridge.unknown = false
	await _controller.recheck()
	_bridge.failure_method = "project.compile-rebuilt-package"
	_requested_route = ""
	_requested_action = ""
	_view.route_requested.connect(func(route: String): _requested_route = route, CONNECT_ONE_SHOT)
	_view.recovery_requested.connect(func(action: String): _requested_action = action, CONNECT_ONE_SHOT)
	var response := await _controller.publish_to("rebuilt", "known.realmz2")
	_check(not response.get("ok", false) and not response.get("outcomeUnknown", false), "Known publication failure was not retained")
	_check(_view.repair_issue.visible and _view.repair_issue.text == "Choose Another Location…", "Known publication failure lacked destination recovery")
	_view.repair_issue.pressed.emit()
	_check(_requested_route.is_empty() and _requested_action == "choose-location", "Known publication failure did not request a new destination")


func _page_failure_recovery() -> void:
	_bridge.failure_method = ""
	_bridge.unknown = false
	await _controller.recheck()
	_bridge.failure_method = "project.inspect-rebuilt-package"
	var response := await _controller.load_page(4)
	_check(not response.get("ok", false), "Controlled file-page failure was accepted")
	_check(_view.checked_revision() == 7 and not _view.export_button.disabled, "Known page failure discarded the valid publish plan")
	_check(not _view.next_page.disabled, "Known page failure did not restore paging")


func _benchmark_revision_guard() -> void:
	_bridge.failure_method = ""
	_bridge.benchmark_revision = 6
	var response := await _controller.run_benchmark()
	_check(response.get("stale", false), "A stale benchmark result was presented")
	_check(_view.checked_revision() == -1 and _view.export_button.disabled, "Stale benchmark left publication enabled")
	_bridge.benchmark_revision = 7


func _methods() -> Array:
	return _bridge.calls.map(func(call): return call.method)


func _check(condition: bool, message: String) -> void:
	if condition: return
	_failed = true
	push_error("PROVIDENCE_PUBLISH_WORKBENCH_FAILED " + message)
