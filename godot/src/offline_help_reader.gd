extends Window

signal tool_requested(route: String, title: String)

const Chapter = preload("res://src/offline_help_chapter.tscn")
var catalog := preload("res://src/offline_help_catalog.gd").new()
var command_provider: Callable
var availability_provider: Callable
var topic := "getting-started"
var _origin: Control
var _positions: Dictionary = {}
var _buttons: Dictionary = {}
var _matches: Array = []
var _loaded := false
var _tick := 0.0
var _generation := 0


func _ready() -> void:
	apply_theme("dark", "balanced")
	close_requested.connect(close_reader)
	%Close.pressed.connect(close_reader)
	%Search.text_changed.connect(_filter)
	%ClearSearch.pressed.connect(clear_search)
	%OpenTool.pressed.connect(func():
		var entry := catalog.entry(topic)
		if not %OpenTool.disabled: tool_requested.emit(entry.route, entry.title))
	%Article.link_requested.connect(_follow_link)
	%Article.image_requested.connect(_show_image)
	visibility_changed.connect(func(): set_process(visible))
	set_process(false)


func open_topic(identity := "getting-started", origin: Control = null) -> void:
	_origin = origin if origin != null else get_parent().get_viewport().gui_get_focus_owner()
	if not _loaded:
		catalog.load_bundled()
		_loaded = true
	if not catalog.error.is_empty():
		%Summary.text = catalog.error
		%OpenTool.hide()
	else:
		%Search.set_text("")
		_filter("", identity)
	popup_centered(Vector2i(1560, 840))
	%Search.grab_focus()


func close_reader() -> void:
	_save_position()
	%ImagePeek.cancel()
	hide()
	if is_instance_valid(_origin) and _origin.is_visible_in_tree():
		_origin.get_window().grab_focus()
		_origin.grab_focus()


func suspend_reader() -> void:
	_save_position()
	hide()


func apply_theme(mode: String, density: String) -> void:
	var next := preload("res://src/offline_help_theme.gd").new()
	next.mode = mode
	next.density = density
	theme = next
	%ImagePeek.theme = next
	%ImagePeek.get_node("Inset").add_theme_stylebox_override("panel", next.get_stylebox("panel", "HelpCard"))


func select_topic(identity: String, anchor := "") -> void:
	_generation += 1
	var generation := _generation
	if identity == "licenses": catalog.load_distribution_notices()
	var entry := catalog.entry(identity)
	if entry.is_empty(): return
	_save_position()
	topic = identity
	%Title.text = entry.title
	%Article.present(entry, _commands(), _availability())
	_render_anchors()
	for key: String in _buttons: _buttons[key].set_pressed_no_signal(key == topic)
	await get_tree().process_frame
	await get_tree().process_frame
	# An older selection must not restore its scroll over a newer chapter.
	if generation != _generation: return
	if _buttons.has(topic): %ChapterScroll.ensure_control_visible(_buttons[topic])
	%ArticleScroll.scroll_vertical = int(_positions.get(topic, 0))
	if not anchor.is_empty(): jump_to(anchor)


func clear_search() -> void:
	%Search.text = ""
	_filter("")
	%Search.grab_focus()


func _filter(query: String, preferred := "") -> void:
	_matches = catalog.matching(query)
	_buttons.clear()
	for child in %Chapters.get_children():
		%Chapters.remove_child(child)
		child.queue_free()
	%ClearSearch.visible = not query.is_empty()
	%SearchStatus.text = "MANUAL CHAPTERS · 13" if query.is_empty() else "%d MATCHING CHAPTERS" % _matches.size()
	var previous := ""
	for entry: Dictionary in _matches:
		if entry.group != previous:
			previous = entry.group
			var heading := Label.new()
			heading.text = "MANUAL CHAPTERS" if previous == "chapters" else "APPENDICES" if previous == "references" else "WORKFLOWS & REFERENCE"
			heading.theme_type_variation = "HelpKicker"
			%Chapters.add_child(heading)
		var button := Chapter.instantiate()
		%Chapters.add_child(button)
		button.get_node("Inset/Text/Title").text = entry.title
		button.get_node("Inset/Text/Summary").text = entry.summary
		button.button_pressed = entry.id == topic
		button.pressed.connect(select_topic.bind(str(entry.id)))
		button.gui_input.connect(_chapter_key.bind(str(entry.id)))
		_buttons[entry.id] = button
	%Article.visible = not _matches.is_empty()
	if _matches.is_empty():
		_generation += 1
		%Title.text = "No manual matches"
		%AnchorStatus.text = "Try a task, field or editor name, then clear the search. Your last chapter stays selected."
		_clear_anchors()
	else:
		var desired := topic if preferred.is_empty() else preferred
		select_topic(desired if _matches.any(func(row): return row.id == desired) else str(_matches[0].id))


func _chapter_key(event: InputEvent, identity: String) -> void:
	if not event.is_pressed() or not (event.is_action("ui_down") or event.is_action("ui_up")): return
	var keys := _buttons.keys()
	var index := clampi(keys.find(identity) + (1 if event.is_action("ui_down") else -1), 0, keys.size() - 1)
	select_topic(keys[index])
	_buttons[keys[index]].grab_focus()
	%ChapterScroll.ensure_control_visible(_buttons[keys[index]])
	set_input_as_handled()


func _save_position() -> void:
	if visible and %Article.visible: _positions[topic] = %ArticleScroll.scroll_vertical


func _clear_anchors() -> void:
	for child in %Anchors.get_children():
		%Anchors.remove_child(child)
		child.queue_free()


func _render_anchors() -> void:
	_clear_anchors()
	for anchor: String in %Article.anchors:
		var button := Button.new()
		button.text = "•  " + str(%Article.anchors[anchor].title)
		button.alignment = HORIZONTAL_ALIGNMENT_LEFT
		button.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		button.pressed.connect(jump_to.bind(anchor))
		%Anchors.add_child(button)
	%AnchorStatus.text = "%d sections · reading is local" % %Article.anchors.size()


func jump_to(anchor: String) -> void:
	if %Article.anchors.has(anchor):
		var card: Control = %Article.anchors[anchor].control
		%ArticleScroll.scroll_vertical += int(card.global_position.y - %ArticleScroll.global_position.y)


func _follow_link(target: String) -> void:
	if target.begins_with("chapter:"):
		var destination := target.trim_prefix("chapter:").split("#", true, 1)
		%Search.text = ""
		_filter("", destination[0])
		if destination.size() > 1: select_topic(destination[0], destination[1])
	elif target.begins_with("#"): jump_to(target.trim_prefix("#"))
	elif target.begins_with("https://") or target.begins_with("http://") or target.begins_with("mailto:"): OS.shell_open(target)
	else:
		var destination := catalog.document_target(target)
		if not destination.is_empty(): select_topic(destination)


func _show_image(row: Dictionary, origin: Control) -> void:
	var texture: Texture2D = load(row.path)
	if texture == null: return
	%ImagePeek.open_preview({"origin": origin, "row": {"name": row.caption}, "preview": {"texture": texture, "width": texture.get_width(), "height": texture.get_height()}})


func _commands() -> Array:
	return command_provider.call() if command_provider.is_valid() else []


func _availability() -> Dictionary:
	return availability_provider.call() if availability_provider.is_valid() else {"allowed": false, "reason": "Open a project to use this editor."}


func _process(delta: float) -> void:
	_tick += delta
	if _tick < 0.25: return
	_tick = 0.0
	%Article.set_availability(_availability())
	if topic == "shortcuts":
		var keys: Array = %Article.anchors.keys()
		if %Article.refresh_commands(_commands()) and keys != %Article.anchors.keys(): _render_anchors()


func _input(event: InputEvent) -> void:
	if not visible or %ImagePeek.visible: return
	if event.is_action_pressed("ui_cancel"):
		close_reader()
		set_input_as_handled()
	elif event is InputEventKey and event.pressed and event.ctrl_pressed and event.keycode == KEY_F:
		%Search.grab_focus()
		%Search.select_all()
		set_input_as_handled()
