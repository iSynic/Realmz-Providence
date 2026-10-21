extends SceneTree

var _reader: Window
var _menu: ProvidenceApplicationMenu
var _capture := ""


func _initialize() -> void: _run.call_deferred()


func _run() -> void:
	root.gui_embed_subwindows = true
	root.size = Vector2i(1600, 900)
	root.content_scale_size = root.size
	var args := OS.get_cmdline_user_args()
	if args.size() == 1: _capture = args[0]
	_menu = load("res://src/application_menu.tscn").instantiate()
	root.add_child(_menu)
	_reader = load("res://src/offline_help_reader.tscn").instantiate()
	root.add_child(_reader)
	_reader.command_provider = _menu.command_catalog
	_reader.open_topic("scripts")
	await _settle()
	await _content()
	await _navigation()
	await _commands()
	await _themes()
	await _route_captures()
	_reader.close_reader()
	_reader.queue_free()
	_menu.queue_free()
	await process_frame
	print("PROVIDENCE_OFFLINE_HELP_OK chapters=13 entries=25 search links anchors positions images shortcuts themes viewports")
	quit()


func _content() -> void:
	assert(_reader.catalog.error.is_empty(), _reader.catalog.error)
	assert(_reader.catalog.entries.size() == 25)
	assert(_reader.catalog.entries.filter(func(row): return row.group == "chapters").size() == 13)
	var images := {}
	for row: Dictionary in _reader.catalog.entries:
		assert(not row.title.is_empty() and not row.summary.is_empty())
		for image: Dictionary in row.images:
			assert(load(image.path) is Texture2D, "Missing bundled screenshot: " + image.path)
			images[image.path] = true
	assert(images.size() == 20)
	var scripts: Dictionary = _reader.catalog.entry("scripts")
	assert(scripts.sections.any(func(section): return section.title == "Choose a resource and its behavior"))
	assert(_reader.catalog.matching("Wait for sound to finish").any(func(row): return row.id == "scripts"))
	assert(_reader.get_node("%OpenTool").disabled)
	assert(_reader.catalog.matching("precedence").any(func(row): return row.id == "scripts"))
	var evidence: Dictionary = _reader.catalog.entry("evidence")
	var body := "\n".join(evidence.sections.map(func(section): return section.body))
	assert(body.contains("[b]What it can establish:[/b]") and body.contains("[b]What it does not establish:[/b]"))
	await _save("documents-1600.png")


func _navigation() -> void:
	var search: LineEdit = _reader.get_node("%Search")
	search.text = "no-chapter-123456"
	search.text_changed.emit(search.text)
	await _settle()
	assert(not _reader.get_node("%Article").visible)
	assert(_reader.topic == "scripts" and _reader.get_node("%ClearSearch").visible)
	await _save("no-matches-1600.png")
	_reader.get_node("%ClearSearch").pressed.emit()
	await _settle()
	assert(_reader.topic == "scripts" and _reader.get_node("%Article").visible)
	var article = _reader.get_node("%Article")
	var anchor: String = article.anchors.keys()[-1]
	_reader.jump_to(anchor)
	await _settle()
	var saved: int = _reader.get_node("%ArticleScroll").scroll_vertical
	assert(saved > 0)
	_reader.select_topic("maps")
	await _settle()
	_reader.select_topic("scripts")
	await _settle()
	assert(absi(_reader.get_node("%ArticleScroll").scroll_vertical - saved) <= 2)
	_reader._follow_link("chapter:glossary")
	await _settle()
	assert(_reader.topic == "glossary" and search.text.is_empty())
	await _save("glossary-1600.png")
	_reader.select_topic("scripts")
	await _settle()
	var card: Control = article.anchors.gallery.control
	var origin: Button = card.get_node("Body/Content").get_child(0).get_node("Open")
	origin.pressed.emit()
	await _settle()
	var peek: Window = _reader.get_node("%ImagePeek")
	assert(peek.visible)
	var image: TextureRect = peek.get_node("Inset/Body/ImageScroll/Center/Image")
	for entry in [["One", 1], ["Two", 2], ["Four", 4]]:
		peek.get_node("Inset/Body/Footer/" + entry[0]).pressed.emit()
		await _settle()
		assert(image.custom_minimum_size == image.texture.get_size() * entry[1])
	await _save("image-4x-1600.png")
	peek.cancel()
	await _settle()
	assert(not peek.visible and origin.has_focus())
	var key := InputEventKey.new()
	key.pressed = true
	key.keycode = KEY_F
	key.ctrl_pressed = true
	_reader._input(key)
	assert(search.has_focus())
	key.ctrl_pressed = false
	key.keycode = KEY_DOWN
	_reader._chapter_key(key, "scripts")
	await _settle()
	assert(_reader.topic == "text")


func _commands() -> void:
	_menu.update_command_state({"busy": true, "sessionConnected": false})
	for row: Dictionary in _menu.command_catalog():
		if row.command.begins_with("help."): assert(row.enabled)
	_reader.select_topic("shortcuts")
	await _settle()
	var article = _reader.get_node("%Article")
	var groups := {}
	for row: Dictionary in _menu.command_catalog(): groups[row.group] = true
	assert(article.anchors.keys() == groups.keys().map(func(group): return group.to_lower()))
	var count := 0
	for anchor: Dictionary in article.anchors.values():
		var rows: VBoxContainer = anchor.control.get_node("Body/Content")
		count += rows.get_child_count() - 1
		for row in rows.get_children():
			assert(row.get_child(0).size.x >= 240 and row.get_child(1).size.x >= 150)
			assert(row.get_child(2).get_rect().end.x <= row.size.x + 1)
	assert(count == _menu.command_catalog().size())
	await _save("shortcuts-1600.png")
	_reader.jump_to("help")
	await _settle()
	var saved: int = _reader.get_node("%ArticleScroll").scroll_vertical
	var jump: Button = _reader.get_node("%Anchors").get_child(0)
	jump.grab_focus()
	_menu.update_command_state({"sessionConnected": true})
	await create_timer(0.3).timeout
	await _settle()
	assert(article._commands.filter(func(row): return row.command == "file.save")[0].enabled)
	for row: Dictionary in article._commands: assert(row.enabled or not row.unavailableReason.is_empty())
	var scroll: ScrollContainer = _reader.get_node("%ArticleScroll")
	var maximum := int(scroll.get_v_scroll_bar().max_value - scroll.get_v_scroll_bar().page)
	assert(jump.has_focus() and absi(scroll.scroll_vertical - mini(saved, maximum)) <= 2, str([jump.has_focus(), saved, scroll.scroll_vertical, maximum]))
	_reader.select_topic("about")
	await _settle()
	assert(article.anchors.version.control.get_node("Body/Text").text.contains(str(ProjectSettings.get_setting("application/config/version"))))
	await _save("about-1600.png")
	_reader.select_topic("licenses")
	await _settle()
	assert(article.anchors.has("copyingconverter") and article.anchors.has("godot"))
	_reader.select_topic("evidence")
	await _settle()
	await _save("evidence-1600.png")
	var palette = load("res://src/command_palette.tscn").instantiate()
	root.add_child(palette)
	palette.popup_palette({})
	for command: String in ["help.documents", "help.shortcuts", "help.compatibility", "help.source-evidence", "help.about"]:
		assert(palette.command_enabled(command))
	palette.hide()
	palette.queue_free()


func _themes() -> void:
	for viewport in [Vector2i(1600, 900), Vector2i(1920, 1080)]:
		root.size = viewport
		root.content_scale_size = viewport
		for mode in ["dark", "light", "high-contrast"]:
			for density in ["balanced", "compact"]:
				_reader.apply_theme(mode, density)
				_reader.popup_centered(Vector2i(1560, 840))
				_reader.select_topic("scripts")
				await _settle()
				if DisplayServer.get_name() != "headless": assert(_reader.size == Vector2i(1560, 840), "Help content exceeded certified geometry: " + str(_reader.size))
				assert(_reader.get_node("Surface/Layout/Columns/Navigation").size.x == 270)
				assert(_reader.get_node("Surface/Layout/Columns/Index").size.x == 280)
				if density == "compact" and viewport.x == 1600: await _save("documents-%s-%s-%d.png" % [mode, density, viewport.x])


func _route_captures() -> void:
	for viewport in [Vector2i(1600, 900), Vector2i(1920, 1080)]:
		root.size = viewport
		root.content_scale_size = viewport
		_reader.popup_centered(Vector2i(1560, 840))
		for topic in ["scripts", "shortcuts", "glossary", "evidence", "about"]:
			_reader.apply_theme("light" if topic == "glossary" else "high-contrast" if topic == "shortcuts" else "dark", "balanced")
			_reader.select_topic(topic)
			await _settle()
			await _save("route-%s-%d.png" % [topic, viewport.x])
		_reader.select_topic("scripts")
		await _settle()
		var article = _reader.get_node("%Article")
		var origin: Button = article.anchors.gallery.control.get_node("Body/Content").get_child(0).get_node("Open")
		origin.pressed.emit()
		await _settle()
		await _save("route-image-%d.png" % viewport.x)
		var key := InputEventKey.new()
		key.keycode = KEY_ESCAPE
		key.pressed = true
		_reader.get_node("%ImagePeek")._input(key)
		await _settle()
		assert(not _reader.get_node("%ImagePeek").visible and origin.has_focus())


func _settle() -> void:
	for frame in 5: await process_frame
	if DisplayServer.get_name() != "headless": await RenderingServer.frame_post_draw


func _save(name: String) -> void:
	if _capture.is_empty() or DisplayServer.get_name() == "headless": return
	assert(root.get_texture().get_image().save_png(_capture.path_join(name)) == OK)
