extends SceneTree

var _manual: ProvidenceDivinityManualReader
var _capture := ""


func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	root.gui_embed_subwindows = true
	root.size = Vector2i(1600, 900)
	root.content_scale_size = root.size
	var args := OS.get_cmdline_user_args()
	if args.size() == 1: _capture = args[0]
	await _dragon_shortcut()
	_manual = load("res://src/divinity_manual_reader.tscn").instantiate()
	root.add_child(_manual)
	await process_frame
	for viewport in [Vector2i(1920, 1080), Vector2i(1600, 900)]:
		root.size = viewport
		root.content_scale_size = viewport
		await _navigation()
		await _links_and_search()
		await _zoom_and_scroll(viewport)
	_manual.close_reader()
	_manual.queue_free()
	await process_frame
	print("PROVIDENCE_DIVINITY_MANUAL_OK chapters history search links zoom bounded-strips dragon focus two-viewports")
	quit()


func _navigation() -> void:
	_manual.open_page(1)
	await _settle()
	assert(_manual.get_node("%PreviousPage").disabled)
	_manual.get_node("%NextPage").pressed.emit()
	assert(_manual.current_page() == 2)
	_manual.get_node("%ManualBack").pressed.emit()
	assert(_manual.current_page() == 1)
	_manual.get_node("%ManualForward").pressed.emit()
	assert(_manual.current_page() == 2)
	_manual.open_page(38)
	assert(_manual.get_node("%NextPage").disabled)
	_manual.get_node("%PreviousPage").pressed.emit()
	assert(_manual.current_page() == 37)
	_manual.get_node("%ManualBack").pressed.emit()
	_manual.open_page(15)
	assert(_manual.get_node("%ManualForward").disabled)
	await _settle()


func _links_and_search() -> void:
	var search: LineEdit = _manual.get_node("%ManualSearch")
	search.text_changed.emit("zx-no-chapter-123")
	assert(_manual.get_node("%ManualContents").item_count == 0)
	assert(_manual.current_page() == 15)
	search.text_changed.emit("shop")
	assert(_manual.get_node("%ManualContents").item_count > 0)
	search.text_changed.emit("")
	assert(_manual.get_node("%ManualContents").item_count == 38)
	var canvas = _manual.get_node("%ManualPage")
	var link: Dictionary = canvas.page.links.filter(func(value): return value.target.begins_with("#page-"))[0]
	var box: Array = link.rects[0]
	var click := InputEventMouseButton.new()
	click.button_index = MOUSE_BUTTON_LEFT
	click.pressed = true
	click.position = Vector2(float(box[0]) + 1, float(box[1]) + 1) * canvas.zoom
	canvas._gui_input(click)
	assert(_manual.current_page() == str(link.target).trim_prefix("#page-").to_int())
	await _settle()


func _zoom_and_scroll(viewport: Vector2i) -> void:
	_manual.open_page(15)
	await _settle()
	var canvas = _manual.get_node("%ManualPage")
	var scroll: ScrollContainer = _manual.get_node("%PageScroll")
	var before: Vector2 = canvas.custom_minimum_size
	_manual.get_node("%ZoomIn").pressed.emit()
	await _settle()
	assert(canvas.custom_minimum_size.x > before.x)
	assert(is_equal_approx(canvas.custom_minimum_size.x / before.x, canvas.custom_minimum_size.y / before.y))
	_manual.get_node("%ZoomOut").pressed.emit()
	_manual.get_node("%ZoomFit").pressed.emit()
	await _settle()
	assert(canvas.custom_minimum_size.x <= scroll.size.x)
	await _save("shop-%sx%s.png" % [viewport.x, viewport.y])
	_manual.open_page(12)
	await _settle()
	await _save("scrapbook-%sx%s.png" % [viewport.x, viewport.y])
	_manual.open_page(37)
	await _settle()
	var start: int = canvas.loaded_strip_count()
	assert(start <= 5)
	scroll.scroll_vertical = int(canvas.custom_minimum_size.y - scroll.size.y)
	await _settle()
	assert(canvas.loaded_strip_count() <= 5)
	assert(scroll.scroll_vertical > 0)
	var bottom := scroll.scroll_vertical
	_manual.open_page(15)
	_manual.get_node("%ManualBack").pressed.emit()
	await _settle()
	assert(absi(scroll.scroll_vertical - bottom) < 2)
	if DisplayServer.get_name() != "headless": assert(start > 0 and canvas.loaded_strip_count() > 0)


func _dragon_shortcut() -> void:
	OS.set_environment("PROVIDENCE_PROJECT_PATH", "")
	var editor = load("res://src/editor_shell.tscn").instantiate()
	root.add_child(editor)
	var deadline := Time.get_ticks_msec() + 45000
	while not editor.startup_presentable and Time.get_ticks_msec() < deadline: await process_frame
	assert(editor.startup_presentable)
	var bar = editor.get_node("%CommandBarHost").get_child(0)
	var mark: Button = bar.get_node("RailCap/ProvidenceMark")
	assert(mark.icon.get_size() == Vector2(64, 64) and mark.tooltip_text == "Divinity Manual")
	mark.grab_focus()
	mark.pressed.emit()
	var reader = editor.get_node("%DivinityManualReader")
	await _settle()
	assert(reader.visible and reader.current_page() == 1)
	reader.close_reader()
	await _settle()
	assert(mark.has_focus())
	await _save("dragon-header.png")
	editor.queue_free()
	await process_frame


func _settle() -> void:
	for frame in 4: await process_frame
	if DisplayServer.get_name() != "headless": await RenderingServer.frame_post_draw


func _save(name: String) -> void:
	if _capture.is_empty() or DisplayServer.get_name() == "headless": return
	assert(root.get_texture().get_image().save_png(_capture.path_join(name)) == OK)
