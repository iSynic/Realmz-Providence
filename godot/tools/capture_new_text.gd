extends SceneTree

class CaptureBridge extends "res://tools/validate_text_assets_native.gd".TestBridge:
	var fail_create := false
	var uncertain_create := false
	func request(method: String, params: Dictionary = {}) -> Dictionary:
		if method == "text-resource.create" and fail_create:
			return {"ok": false, "error": "Storage is full. Free space, then retry.", "outcomeUnknown": uncertain_create}
		return super.request(method, params)

const PROSE := "The old bridge rises from the mist.\n\nA lantern moves between the ruined arches.\nSomeone is waiting on the far bank.\n"
var _shell
var _bridge
var _sheet: Image
var _work := ""


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	assert(args.size() == 2 and args[0].get_file().begins_with("providence-text-capture-") and DirAccess.dir_exists_absolute(args[1]))
	_work = args[0]
	root.gui_embed_subwindows = true
	root.size = Vector2i(1600, 900)
	root.content_scale_size = root.size
	OS.set_environment("PROVIDENCE_PROJECT_PATH", "")
	_shell = load("res://src/editor_shell.tscn").instantiate()
	root.add_child(_shell)
	await process_frame
	_shell._bridge.stop()
	_bridge = CaptureBridge.new(_work.path_join("settings.cfg"))
	_shell._bridge = _bridge
	var created: Dictionary = _bridge.create_project("text-authoring-sample", _work.path_join("project"))
	if not created.get("ok", false):
		push_error(str(created.get("error", "Sample project creation failed.")))
		_bridge.stop()
		quit(1)
		return
	_seed()
	await _shell._activate_session(_bridge.request("session.describe"))
	await _shell._navigation.activate_domain("assets")
	var workbench = _shell._assets.library_workbench
	var dialog = workbench.get_node("%NewTextDialog")
	_sheet = Image.create(3520, 3420, false, Image.FORMAT_RGBA8)
	_sheet.fill(Color("202020"))
	for frame in 25: await process_frame
	workbench.get_node("%NewText").pressed.emit()
	dialog.get_node("%TextName").text = "Arrival at the old bridge"
	dialog.get_node("%Number").text = "203"
	var file := FileAccess.open(_work.path_join("bridge.txt"), FileAccess.WRITE)
	file.store_string("\ufeff" + PROSE.replace("\n", "\r\n"))
	file.close()
	await dialog.load_file(_work.path_join("bridge.txt"))
	await _full_capture(Vector2i.ZERO)
	assert(dialog.get_node("%Draft").size.y == 250 and dialog.get_node("%Number").size.x == 132)
	print("PROVIDENCE_NEW_TEXT_BOUNDS dialog=760x700 draftHeight=250 numberWidth=132")
	await dialog.create_text()
	for frame in 20: await process_frame
	assert(not dialog.visible and workbench.get_node("%Gallery").get_node("%Name").text == "Arrival at the old bridge")
	root.size = Vector2i(1920, 1080)
	root.content_scale_size = root.size
	await _full_capture(Vector2i(1600, 0))
	root.size = Vector2i(1600, 900)
	root.content_scale_size = root.size
	await _recoveries(dialog)
	_bridge.stop()
	_shell.queue_free()
	await process_frame
	assert(_sheet.save_png(args[1].path_join("contact-sheet.png")) == OK)
	print("PROVIDENCE_NEW_TEXT_CAPTURE_OK synthetic-project actual-import-create controlled-failures")
	quit(0)


func _seed() -> void:
	var revision := 0
	var titles := ["The river road", "At the gate", "The lantern keeper", "A weathered sign", "The moonlit crossing", "Pages from the chronicle"]
	for index in 6:
		var result: Dictionary = _bridge.request("text-resource.create", {"expectedRevision": revision, "resourceId": 100 + index, "label": titles[index], "text": PROSE if index < 5 else PROSE.repeat(1000)})
		assert(result.ok)
		revision = int(result.result.revision)
	for number in [100, 101, 102, 400]:
		var path := _work.path_join("style-%d.bin" % number)
		var file := FileAccess.open(path, FileAccess.WRITE)
		file.store_buffer(PackedByteArray([0, 0]))
		file.close()
		var result: Dictionary = _bridge.request("asset.import", {"expectedRevision": revision, "path": path, "asset": {"identity": "style:%d" % number, "label": "Style %d" % number, "kind": "text-style-resource", "mimeType": "application/octet-stream", "classicResource": {"resourceType": "styl", "resourceId": number}, "source": "Synthetic capture fixture"}})
		assert(result.ok)
		revision = int(result.result.revision)
	assert(_bridge.request("project.save").ok)


func _full_capture(position: Vector2i) -> void:
	for frame in 6: await process_frame
	await RenderingServer.frame_post_draw
	_sheet.blit_rect(root.get_texture().get_image(), Rect2i(Vector2i.ZERO, root.size), position)


func _recoveries(dialog: Window) -> void:
	var labels := ["BLANK DRAFT · dark / balanced", "NUMBER COLLISION · dark / balanced", "ENCODING ERROR · light / compact", "EXISTING FORMATTING · dark / balanced", "INVALID UTF-8 · light / compact", "PROJECT CHANGED · high contrast / compact", "CREATE FAILED · injected definite failure", "ENCODING CORRECTED · high contrast / compact", "DISCARD GUARD · Keep Editing focused", "LOAD REPLACEMENT GUARD · Keep Draft focused", "LONG DRAFT · complete / scrolled", "UNCONFIRMED OUTCOME · mutating retry disabled"]
	var caption := Label.new()
	root.add_child(caption)
	caption.add_theme_font_size_override("font_size", 14)
	caption.add_theme_color_override("font_color", Color.WHITE)
	for state in 12:
		dialog.hide()
		dialog.apply_theme("light" if state in [2, 4] else ("high-contrast" if state in [5, 7, 11] else "dark"), "compact" if state in [2, 4, 5, 7, 11] else "balanced")
		assert(dialog.open_new(_bridge).ok)
		if state > 0:
			dialog.get_node("%TextName").text = "Arrival at the old bridge"
			dialog.get_node("%Number").text = "205"
			dialog.get_node("%Draft").text = PROSE
			dialog.draft_changed()
		match state:
			1: dialog.get_node("%Number").text = "101"; dialog.draft_changed()
			2: dialog.get_node("%Draft").text = "The old bridge rises from the mist.\n\nA lantern glows 🧭 beyond the ruined arches."; dialog.draft_changed()
			3: dialog.get_node("%Number").text = "400"; dialog.draft_changed()
			4:
				var file := FileAccess.open(_work.path_join("invalid.txt"), FileAccess.WRITE)
				file.store_buffer(PackedByteArray([255, 254, 65, 0]))
				file.close()
				await dialog.load_file(_work.path_join("invalid.txt"))
			5:
				var response: Dictionary = _bridge.request("text-resource.create", {"expectedRevision": dialog._revision, "resourceId": 204, "label": "Concurrent sample change", "text": "An independent fixture command."})
				assert(response.ok)
			10: dialog.get_node("%Draft").text = PROSE.repeat(1000); dialog.draft_changed()
		await dialog.validate_now()
		match state:
			2: dialog.get_node("%SelectCharacter").pressed.emit()
			6, 11:
				_bridge.fail_create = true
				_bridge.uncertain_create = state == 11
				await dialog.create_text()
				_bridge.fail_create = false
				_bridge.uncertain_create = false
			8: dialog.request_cancel()
			9: dialog.request_load()
			10:
				dialog.get_node("%Draft").set_caret_line(160)
				dialog.get_node("%Draft").scroll_vertical = 140
		caption.text = labels[state]
		caption.position = Vector2(dialog.position.x, dialog.position.y - 56)
		for frame in 6: await process_frame
		await RenderingServer.frame_post_draw
		_sheet.blit_rect(root.get_texture().get_image(), Rect2i(dialog.position - Vector2i(8, 60), Vector2i(780, 760)), Vector2i((state % 4) * 880, 1080 + int(state / 4) * 780))
		dialog.get_node("%Discard").hide()
		dialog.get_node("%ReplaceDraft").hide()
	caption.queue_free()
