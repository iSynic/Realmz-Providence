extends SceneTree

const Routes = preload("res://src/route_catalog.gd")

var _shell: Control
var _view: ProvidencePublishWorkbench
var _controller: ProvidencePublishWorkbenchController
var _output_root := ""
var _frames_root := ""
var _work_root := ""
var _captures: Array = []
var _publication: Dictionary = {}


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 5: return _fail("Expected project, application library, review output, frame root, and disposable work root.")
	_output_root = args[2]
	_frames_root = args[3]
	_work_root = args[4]
	if not FileAccess.file_exists(args[0].path_join("publish-review-disposable.marker")): return _fail("The project is not a declared disposable Publish fixture.")
	for path in [_output_root, _frames_root, _work_root]:
		if not DirAccess.dir_exists_absolute(path): return _fail("Declared capture directory does not exist: " + path)
	root.gui_embed_subwindows = true
	root.content_scale_size = Vector2i(1600, 900)
	_shell = (load("res://src/editor_shell.tscn") as PackedScene).instantiate()
	root.add_child(_shell)
	await _frames(6)
	var opened: Dictionary = _shell._bridge.start_project(args[0], args[1])
	if not opened.get("ok", false): return _fail(str(opened.get("error", "Publish fixture did not open.")))
	await _shell._activate_session(opened)
	if not await _activate_route("linter.readiness"): return
	if not await _ready_target("classic"): return
	if not await _capture_pair("classic-ready", "linter.readiness", "Real Half Truth Classic slice readiness and bounded file plan"): return
	print("PROVIDENCE_PUBLISH_CAPTURE_STAGE classic-readiness")
	if not await _activate_route("export.export-plan"): return
	if not await _ready_target("classic"): return
	if not await _capture_pair("classic-export-ready", "export.export-plan", "Real Half Truth Classic slice export action and bounded file plan"): return
	if not await _publish_classic(): return
	if not await _capture("classic-success", "export.export-plan", "Actual no-clobber Classic slice publication result", Vector2i(1600, 900)): return
	if not await _capture_classic_existing_refusal(): return
	print("PROVIDENCE_PUBLISH_CAPTURE_STAGE classic-publication")
	if not await _ready_target("rebuilt"): return
	if not await _capture_pair("rebuilt-ready", "export.export-plan", "Real Half Truth Rebuilt package readiness and bounded file plan"): return
	if not await _publish_rebuilt(): return
	if not await _capture("rebuilt-success", "export.export-plan", "Actual no-clobber Rebuilt package publication result", Vector2i(1600, 900)): return
	print("PROVIDENCE_PUBLISH_CAPTURE_STAGE rebuilt-success")
	if not await _capture_existing_refusal(): return
	print("PROVIDENCE_PUBLISH_CAPTURE_STAGE rebuilt-refusal")
	if not await _activate_route("export.benchmark"): return
	if not await _ready_target("rebuilt"): return
	if not await _capture_pair("benchmark-ready", "export.benchmark", "Real Half Truth aggregate benchmark in its native route context"): return
	print("PROVIDENCE_PUBLISH_CAPTURE_STAGE benchmark-route")
	if not await _capture_state_matrix(): return
	print("PROVIDENCE_PUBLISH_CAPTURE_STAGE state-matrix")
	if not _write_packet(): return
	_shell._bridge.stop()
	_shell.free()
	print("PROVIDENCE_PUBLISH_CAPTURE_OK captures=%d targets=2 publication=real-no-clobber" % _captures.size())
	quit(0)


func _activate_route(route: String) -> bool:
	await _shell._navigation.select_tab(Routes.tab_for_route(route))
	await _wait_for_operations()
	_view = _shell._document_tabs.get_current_tab_control()
	var index: int = _shell._workbenches.publish.find(_view)
	if index < 0: return _fail("Publish route did not bind its controller: " + route)
	_controller = _shell._workbenches.publish_commands[index]
	if _view.route_identity() != route: return _fail("Publish route identity did not follow navigation: " + route)
	return true


func _ready_target(target: String) -> bool:
	var target_index := 0 if target == "classic" else 1
	if _view.target_selector.selected != target_index:
		_view.target_selector.select(target_index)
		_view.target_selector.item_selected.emit(target_index)
		await _wait_for_operations()
	var response := await _controller.reload()
	if not response.get("ok", false): return _fail(str(response.get("error", "%s readiness failed." % target)))
	if _view.target() != target or _view.checked_revision() != _shell._session_view.revision or _view.export_button.disabled:
		return _fail("%s readiness did not enable the exact current revision: checked=%d session=%d disabled=%s status=%s result=%s" % [
			target.capitalize(), _view.checked_revision(), _shell._session_view.revision, _view.export_button.disabled,
			_view.readiness_status.text, JSON.stringify(response.get("result", {}))])
	return true


func _publish_classic() -> bool:
	var parent := _work_root.path_join("published")
	if DirAccess.make_dir_recursive_absolute(parent) != OK: return _fail("Classic publication parent could not be created.")
	var path := parent.path_join(_view._required_directory_name)
	var response := await _controller.publish_to("classic", path)
	if not response.get("ok", false): return _fail(str(response.get("error", "Classic publication failed.")))
	if not DirAccess.dir_exists_absolute(path) or not FileAccess.file_exists(path.path_join("Scenario.rsrc")):
		return _fail("Classic publication did not produce the planned directory.")
	var hashes := _directory_hashes(path)
	_publication["classic"] = {"disposablePath": path, "files": hashes.size(), "hashes": hashes}
	return true


func _publish_rebuilt() -> bool:
	var path := _work_root.path_join("published.realmz2")
	var response := await _controller.publish_to("rebuilt", path)
	if not response.get("ok", false): return _fail(str(response.get("error", "Rebuilt publication failed.")))
	if not FileAccess.file_exists(path) or FileAccess.get_file_as_bytes(path).is_empty():
		return _fail("Rebuilt publication did not produce a package.")
	_publication["rebuilt"] = {"disposablePath": path, "bytes": FileAccess.get_file_as_bytes(path).size(),
		"sha256": FileAccess.get_sha256(path)}
	return true


func _capture_classic_existing_refusal() -> bool:
	if not await _ready_target("classic"): return false
	var details := _publication.classic as Dictionary
	var path := str(details.disposablePath)
	var before := _directory_hashes(path)
	var response := await _controller.publish_to("classic", path)
	if response.get("ok", false) or _directory_hashes(path) != before:
		return _fail("Existing Classic output was replaced or incorrectly reported successful.")
	details["existingRefusalPreserved"] = true
	return await _capture("classic-existing-refusal", "export.export-plan", "Actual existing-output refusal; original Classic folder retained", Vector2i(1600, 900))


func _capture_existing_refusal() -> bool:
	if not await _ready_target("rebuilt"): return false
	var details := _publication.rebuilt as Dictionary
	var path := str(details.disposablePath)
	var before := FileAccess.get_sha256(path)
	var response := await _controller.publish_to("rebuilt", path)
	if response.get("ok", false) or FileAccess.get_sha256(path) != before:
		return _fail("Existing Rebuilt output was replaced or incorrectly reported successful.")
	details["existingRefusalPreserved"] = true
	return await _capture("rebuilt-existing-refusal", "export.export-plan", "Actual existing-output refusal; original package retained", Vector2i(1600, 900))


func _capture_state_matrix() -> bool:
	if not await _activate_route("export.export-plan"): return false
	if not await _ready_target("classic"): return false
	_view.present_check({"revision": 1, "status": "blocked", "groups": [
		{"code": "classic.resource.missing-picture", "count": 3},
		{"code": "classic.link.unresolved", "count": 12},
		{"code": "classic.export.unsupported-family", "count": 2}]}, {}, {})
	if not await _capture("classic-blocked", "export.export-plan", "Controlled blocked readiness with grouped repair entry", Vector2i(1600, 900)): return false
	_view.show_unavailable("Open a persistent project before publishing.")
	if not await _capture("no-project", "export.export-plan", "Controlled no-project prerequisite", Vector2i(1600, 900)): return false
	_view.show_unsaved()
	if not await _capture("unsaved-project", "export.export-plan", "Controlled unsaved Classic project prerequisite", Vector2i(1600, 900)): return false
	_controller.attach_session()
	if not await _ready_target("classic"): return false
	_view.show_unapplied()
	if not await _capture("unapplied-edits", "export.export-plan", "Controlled unapplied editor change guard", Vector2i(1600, 900)): return false
	if not await _ready_target("classic"): return false
	_view.invalidate("Project changed · Recheck before publishing.")
	if not await _capture("stale-plan", "export.export-plan", "Controlled changed-project plan invalidation", Vector2i(1600, 900)): return false
	if not await _ready_target("classic"): return false
	_view.begin_publish()
	if not await _capture("publishing", "export.export-plan", "Controlled in-progress no-overwrite publication state", Vector2i(1600, 900)): return false
	if not await _ready_target("classic"): return false
	_view.present_publish_failure("Classic compilation failed: missing picture 30001.", false, "assets.project-assets", "Open Scenario Assets")
	if not await _capture("compile-failure", "export.export-plan", "Controlled useful compiler failure with repair navigation", Vector2i(1600, 900)): return false
	if not await _ready_target("classic"): return false
	_view.present_publish_failure("Could not write the selected destination. Choose another writable parent folder.", false)
	if not await _capture("write-failure", "export.export-plan", "Controlled general destination write failure", Vector2i(1600, 900)): return false
	if not await _ready_target("classic"): return false
	_view.present_published({"directory": "C:/Review/Published/Half Truth", "revision": 1, "files": [{}, {}],
		"warnings": ["Picture 30001 uses an application-library fallback."]})
	if not await _capture("warning-success", "export.export-plan", "Controlled successful Classic output with a nonblocking warning", Vector2i(1600, 900)): return false
	_view.invalidate("Project changed · Recheck before publishing again.")
	_view.summary.text = "The previous successful output is older than the current project."
	if not await _capture("older-export", "export.export-plan", "Controlled older successful output retained after project change", Vector2i(1600, 900)): return false
	return true


func _directory_hashes(path: String) -> Dictionary:
	var hashes := {}
	for filename in DirAccess.get_files_at(path):
		hashes[filename] = FileAccess.get_sha256(path.path_join(filename))
	return hashes


func _capture_pair(name: String, route: String, state: String) -> bool:
	for size in [Vector2i(1600, 900), Vector2i(1920, 1080)]:
		if not await _capture(name, route, state, size): return false
	return true


func _capture(name: String, route: String, state: String, size: Vector2i) -> bool:
	DisplayServer.window_set_size(size)
	root.content_scale_size = size
	await _frames(8)
	await RenderingServer.frame_post_draw
	var image := root.get_texture().get_image()
	var filename := "%s-%dx%d.png" % [name, size.x, size.y]
	if image == null or image.get_size() != size or image.save_png(_frames_root.path_join(filename)) != OK:
		return _fail("Could not capture " + filename)
	_captures.append({"route": route, "target": _view.target(), "state": state, "viewport": [size.x, size.y],
		"fullFrame": _frames_root.path_join(filename), "revision": _shell._session_view.revision,
		"selectedPath": _view.selected_path.text, "status": _shell._status.text})
	return true


func _write_packet() -> bool:
	var rows := ceili(float(_captures.size()) / 2.0)
	var sheet := Image.create(1600, rows * 450, false, Image.FORMAT_RGB8)
	sheet.fill(Color("202020"))
	for index in _captures.size():
		var source := Image.load_from_file(str((_captures[index] as Dictionary).fullFrame))
		if source == null: return _fail("Could not reopen captured frame.")
		source.convert(Image.FORMAT_RGB8)
		source.resize(800, 450, Image.INTERPOLATE_LANCZOS)
		var location := Vector2i((index % 2) * 800, (index / 2) * 450)
		sheet.blit_rect(source, Rect2i(0, 0, 800, 450), location)
		(_captures[index] as Dictionary)["sheetRect"] = [location.x, location.y, 800, 450]
	if sheet.save_png(_output_root.path_join("native-contact-sheet.png")) != OK: return _fail("Could not write contact sheet.")
	var file := FileAccess.open(_output_root.path_join("capture.json"), FileAccess.WRITE)
	if file == null: return _fail("Could not write capture manifest.")
	file.store_string(JSON.stringify({"kind": "publish-native-review", "captures": _captures,
		"publication": _publication, "scope": "Fresh Half Truth import; real bounded plans and no-clobber publications",
		"retention": "One contact sheet and manifests retained; full frames temporary through critic review"}, "\t"))
	file.close()
	return true


func _wait_for_operations() -> void:
	var idle := 0
	var deadline := Time.get_ticks_msec() + 120000
	while idle < 4:
		if Time.get_ticks_msec() >= deadline: return
		await process_frame
		idle = 0 if _shell._operations.busy else idle + 1


func _frames(count: int) -> void:
	for _index in count: await process_frame


func _fail(message: String) -> bool:
	push_error(message)
	if _shell != null and _shell._bridge != null: _shell._bridge.stop()
	quit(2)
	return false
