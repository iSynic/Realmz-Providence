extends SceneTree

class IsolatedBridge extends "res://src/native_bridge.gd":
	var personal_root := ""
	var application_root := ""
	func configured_personal_library_root() -> String: return personal_root
	func configured_application_library_root(_explicit_root: String = "") -> String: return application_root
	func configured_reference_catalog_root(_explicit_root: String = "") -> String: return ""
	func configured_monster_library_root(_explicit_root: String = "") -> String: return ""

var bridge: IsolatedBridge
var workbench: Control
var dialog: Window
var job_root := ""
var fixture_root := ""
var captures := false
var checks: Array = []
var failed := false


func _initialize() -> void: call_deferred("_run")


func _run() -> void:
	create_timer(60).timeout.connect(func(): push_error("Asset export exceeded its deadline"); quit(1))
	var args := OS.get_cmdline_user_args()
	if not _check(not args.is_empty(), "caller-owned output root required"): return
	job_root = args[0]; fixture_root = job_root.path_join("fixture")
	captures = "--capture" in args
	DirAccess.make_dir_recursive_absolute(fixture_root)
	root.gui_embed_subwindows = true; root.size = Vector2i(1920, 1080)
	bridge = IsolatedBridge.new(fixture_root.path_join("settings.cfg"))
	bridge.personal_root = fixture_root.path_join("library")
	if not _check(bridge.create_project("asset-export", fixture_root.path_join("scenario")).get("ok", false), "create isolated real scenario"): return
	workbench = load("res://src/unified_assets_editor.tscn").instantiate()
	root.add_child(workbench); workbench.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	await workbench.reload(bridge)
	dialog = workbench.get_node("%AssetExportDialog")
	await _import_fixtures()
	if failed: return
	await _bulk_journey()
	if failed: return
	await _individual_journey()
	if failed: return
	var stock_root := OS.get_environment("PROVIDENCE_EXPORT_TEST_STOCK_ROOT")
	if not stock_root.is_empty():
		await _stock_journey(stock_root)
		if failed: return
	FileAccess.open(job_root.path_join("native-receipts.json"), FileAccess.WRITE).store_string(JSON.stringify(checks, "\t"))
	bridge.stop(); workbench.queue_free(); await process_frame
	print("PROVIDENCE_ASSET_EXPORT_OK real-import category-selection individual exact-original full-pixels no-author-mutation")
	quit()


func _check(condition: bool, message: String) -> bool:
	checks.append({"check": message, "passed": condition})
	if condition: return true
	failed = true; push_error("ASSET_EXPORT_FAILED " + message)
	if bridge != null: bridge.stop()
	quit(1); return false


func _import_fixtures() -> void:
	var image := Image.create(96, 64, false, Image.FORMAT_RGBA8)
	image.fill(Color(0.8, 0.2, 0.1, 0.5))
	var path := fixture_root.path_join("Ruby.png"); image.save_png(path)
	var media: Window = workbench.get_node("%MediaDialog")
	for scope in ["scenario", "personal"]:
		await media.open_review("import", bridge, workbench._media_commands, {"scope":scope, "kind":"picture"})
		media.get_node("%Path").text = path; media.get_node("%DraftName").text = "Ruby picture"
		if scope == "scenario": media.get_node("%Number").value = 30000
		media.get_node("%PrepareDelay").stop(); await media._prepare()
		if not _check(not media.get_node("%Accept").disabled, "real reviewed " + scope + " import: " + media.get_node("%Impact").text): return
		await media._accept()
		while bridge.operation_busy(): await process_frame
		if not _check(not media.visible, "import acknowledged " + scope): return
	await workbench.show_scope("scenario")


func _bulk_journey() -> void:
	var revision: int = bridge.request("session.describe", {}).result.revision
	var menu: PopupMenu = workbench.get_node("%ExportAssets").get_popup()
	menu.about_to_popup.emit()
	if not _check(not menu.is_item_disabled(1), "bulk export available without asset selection"): return
	await _capture_menu()
	menu.id_pressed.emit(1)
	for frame in 200:
		await process_frame
		if dialog.visible and not dialog.get_node("%Export").disabled: break
	if not _check(dialog.visible and not dialog.get_node("%Export").disabled, "menu opens reviewed native export dialog: " + dialog.get_node("%Summary").text): return
	if not _check(dialog.get_node("%Stock").disabled, "unconfigured Stock scope disabled"): return
	await _capture("bulk")
	for node in dialog.get_node("%Categories").get_children(): node.set_pressed_no_signal(false)
	dialog._changed(); dialog.get_node("%PrepareDelay").stop(); await dialog._prepare()
	if not _check(dialog.get_node("%Export").disabled, "empty category selection blocks export"): return
	await _capture("empty-selection")
	dialog.get_node("%Categories").get_child(0).set_pressed_no_signal(true)
	await _click(dialog.get_node("%Library"), Vector2(dialog.position))
	if not _check(dialog.get_node("%Library").button_pressed, "pointer toggles My Library checkbox"): return
	dialog._changed(); dialog.get_node("%PrepareDelay").stop(); await dialog._prepare()
	if not _check(dialog._prepared.assets == 2, "checked picture category combines Scenario and My Library"): return
	await dialog.export_to(fixture_root)
	if not _check(not dialog._directory.is_empty() and dialog.get_node("%OpenFolder").visible, "complete export exposes its folder"): return
	var manifest: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(dialog._directory.path_join("export-manifest.json")))
	if not _check_entry_outputs(manifest): return
	if not _check(manifest.assets.size() == 2 and manifest.issues.is_empty(), "receipt includes both exact owners and no failures"): return
	var original := FileAccess.get_file_as_bytes(fixture_root.path_join("Ruby.png"))
	for file: Dictionary in manifest.files:
		var exported := FileAccess.get_file_as_bytes(dialog._directory.path_join(file.path))
		if "converted" in file.get("formats", [file.format]):
			var decoded := Image.new(); decoded.load_png_from_buffer(exported)
			if not _check(decoded.get_size() == Vector2i(96, 64), "converted PNG preserves full dimensions"): return
		if file.format == "originals" and file.scope == "library":
			if not _check(exported == original, "prepared library retains exact imported source"): return
	if not _check(bridge.request("session.describe", {}).result.revision == revision, "export leaves canonical scenario revision unchanged"): return
	await _capture("complete")
	dialog._close()


func _individual_journey() -> void:
	await workbench.show_scope("scenario")
	var gallery: Control = workbench.get_node("%Gallery")
	await gallery._select(0)
	var menu: PopupMenu = workbench.get_node("%ExportAssets").get_popup()
	menu.about_to_popup.emit()
	if not _check(not menu.is_item_disabled(0), "selected asset enables individual export"): return
	menu.id_pressed.emit(0)
	for frame in 200:
		await process_frame
		if dialog.visible and not dialog.get_node("%Export").disabled: break
	if not _check(dialog.visible and not dialog.get_node("%Scopes").visible and dialog._prepared.assets == 1, "individual export fixes selected source and identity"): return
	await _capture("individual")
	await dialog.export_to(fixture_root)
	var manifest: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(dialog._directory.path_join("export-manifest.json")))
	if not _check_entry_outputs(manifest): return
	if not _check(manifest.assets.size() == 1 and manifest.files.size() == 2, "individual export writes one original PICT and one PNG"): return
	dialog._close()
	await dialog.open_export(bridge, workbench._operations, "scenario")
	var before := DirAccess.get_directories_at(fixture_root)
	dialog._close()
	_check(DirAccess.get_directories_at(fixture_root) == before, "Cancel creates no output")


func _capture(state: String) -> void:
	if not captures: return
	for viewport in [Vector2i(1920, 1080), Vector2i(1600, 900)]:
		root.size = viewport
		dialog.popup_centered(dialog.size)
		for frame in 8: await process_frame
		await RenderingServer.frame_post_draw
		var rect: Rect2 = dialog.get_node("%Cancel").get_global_rect()
		if not _check(rect.end.y <= dialog.size.y and rect.end.x <= dialog.size.x, "dialog actions fit " + str(viewport)): return
		root.get_texture().get_image().save_png(job_root.path_join("%s-%dx%d.png" % [state, viewport.x, viewport.y]))


func _stock_journey(stock_root: String) -> void:
	bridge.stop(); bridge.application_root = stock_root
	if not _check(bridge.start_project(fixture_root.path_join("scenario")).get("ok", false), "reopen with explicitly supplied Stock store"): return
	await workbench.reload(bridge); await workbench.show_scope("stock")
	await dialog.open_export(bridge, workbench._operations, "stock")
	if not _check(not dialog.get_node("%Stock").disabled and dialog._prepared.assets > 128, "Stock export includes complete catalog beyond current page"): return
	await _capture("stock-bulk")
	dialog._close()

	await workbench.get_node("%Gallery")._select(0)
	var identity: String = workbench.selected_asset_identity()
	await dialog.open_export(bridge, workbench._operations, "stock", identity)
	await dialog.export_to(fixture_root)
	var manifest: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(dialog._directory.path_join("export-manifest.json")))
	if not _check_entry_outputs(manifest): return
	if not _check(manifest.assets.size() == 1 and manifest.files.size() == 2 and manifest.issues.is_empty(), "actual Stock resource exports exactly one original and one converted payload"): return
	for file: Dictionary in manifest.files:
		if not _check(file.scope == "stock", "Stock output retains application ownership"): return
	dialog._close()


func _check_entry_outputs(manifest: Dictionary) -> bool:
	var entries: Dictionary = {}
	for file: Dictionary in manifest.files:
		var key := str(file.scope) + ":" + str(file.identity)
		if not entries.has(key): entries[key] = []
		if not _check(file.format in ["originals", "converted"], "only source original and editable output folders"): return false
		if not _check(file.sha256 not in entries[key], "no duplicate file bytes per entry"): return false
		entries[key].append(file.sha256)
		if not _check(entries[key].size() <= 2, "at most two files per entry"): return false
	return true


func _click(control: Control, offset := Vector2.ZERO) -> void:
	var position := offset + control.get_global_rect().get_center()
	var motion := InputEventMouseMotion.new()
	motion.position = position; motion.global_position = position
	root.push_input(motion, true)
	for pressed in [true, false]:
		var event := InputEventMouseButton.new()
		event.button_index = MOUSE_BUTTON_LEFT; event.pressed = pressed
		event.position = position; event.global_position = position
		root.push_input(event, true)
	for frame in 3: await process_frame


func _capture_menu() -> void:
	if not captures: return
	var button: MenuButton = workbench.get_node("%ExportAssets")
	var menu: PopupMenu = button.get_popup()
	for viewport in [Vector2i(1920, 1080), Vector2i(1600, 900)]:
		root.size = viewport
		for frame in 8: await process_frame
		await _click(button)
		if not _check(menu.visible, "pointer opens Export menu " + str(viewport)): return
		await RenderingServer.frame_post_draw
		root.get_texture().get_image().save_png(job_root.path_join("menu-%dx%d.png" % [viewport.x, viewport.y]))
		menu.hide()
