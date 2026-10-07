extends SceneTree

var _shell: Control
var _output := ""

func _initialize() -> void: call_deferred("_run")

func _run() -> void:
	_output = OS.get_environment("PROVIDENCE_SHELL_CAPTURE_ROOT")
	root.content_scale_size = DisplayServer.window_get_size()
	root.gui_embed_subwindows = true
	_shell = load("res://src/editor_shell.tscn").instantiate()
	root.add_child(_shell)
	await _settle()
	assert(_shell._command_bar.search_button.disabled)
	await _capture("no-project")
	var project := OS.get_environment("PROVIDENCE_DISCOVERY_PROJECT")
	var opened: Dictionary = _shell._bridge.start_project(project)
	assert(opened.get("ok", false), str(opened))
	await _shell._activate_session(opened)
	await _shell._navigation.open_script_target("quest", 9, "quest:9", {})
	await _settle()
	await _geometry()
	await _route_locations()
	await _search_input()
	await _draft_navigation()
	await _states()
	_shell._close_project()
	await _settle()
	assert(_shell._command_bar.search_button.disabled)
	_shell.queue_free()
	await process_frame
	print("PROVIDENCE_SHELL_HEADER_OK mouse=search keyboard=search menu=parity focus=restore draft=preserved busy=disabled recovery=disabled rail=aligned labels=bounded routeTooltips=assets-map-issues-quest")
	quit()

func _geometry() -> void:
	var bar: ProvidenceCommandBar = _shell._command_bar
	assert(absf(bar.size.y - 52) <= 1)
	for profile in ["world", "script-steps", "assets", "monsters", "item-authoring", "standard"]:
		_shell._layout.activate(profile, root.content_scale_size.x)
		await _settle()
		var rail: Control = _shell._domain_navigation.get_node("Layout/DomainRail")
		assert(absf(bar.get_node("RailCap").get_global_rect().get_center().x - rail.get_global_rect().get_center().x) <= 1, "%s cap=%s rail=%s" % [profile, bar.get_node("RailCap").get_global_rect(), rail.get_global_rect()])
		assert(bar.search_button.visible and bar.search_button.get_global_rect().end.x <= _shell.size.x)
	_shell._presentation.apply_layout()
	await _settle()
	var saved_apply := bar.commit_button.text
	bar.commit_button.text = "Apply Complex Encounter"
	await _settle()
	assert(bar.get_node("Commands").get_global_rect().end.x <= _shell.size.x)
	bar.commit_button.text = saved_apply
	await _settle()
	for name in ["Back", "Forward", "Search", "Undo", "Redo", "Validate", "Save", "Compile", "Commands"]:
		var control: Control = bar.get_node(name)
		assert(control.size.y == 34 and control.position.y == 9)
	await _capture("populated")

func _click(control: Control) -> void:
	for pressed in [true, false]:
		var event := InputEventMouseButton.new()
		event.position = control.get_global_rect().get_center()
		event.button_index = MOUSE_BUTTON_LEFT
		event.pressed = pressed
		Input.parse_input_event(event)
		await process_frame

func _route_locations() -> void:
	var bar: ProvidenceCommandBar = _shell._command_bar
	await _shell._assets.open_library("scenario")
	await _settle()
	assert(bar.command_title.text.strip_edges() == "MEDIA  /  ASSETS")
	assert(bar.command_title.tooltip_text == bar.command_title.text.strip_edges())
	await _shell._navigation.open_first_map("land")
	await _settle()
	assert(bar.command_title.text.contains("WORLD"), bar.command_title.text)
	assert(bar.command_title.tooltip_text == bar.command_title.text.strip_edges())
	_shell._issues.request_show()
	await _settle()
	assert(bar.command_title.text.contains("ISSUES"), bar.command_title.text)
	assert(bar.command_title.tooltip_text == bar.command_title.text.strip_edges())
	await _shell._navigation.open_script_target("quest", 9, "quest:9", {})
	await _settle()
	assert(bar.command_title.text.contains("QUEST"), bar.command_title.text)
	assert(bar.command_title.tooltip_text == bar.command_title.text.strip_edges())

func _search_input() -> void:
	var bar: ProvidenceCommandBar = _shell._command_bar
	var view: Window = _shell._commands._discovery._view
	assert(not bar.search_button.disabled)
	await _click(bar.search_button)
	await _settle()
	assert(view.visible and view.get_node("%Query").has_focus())
	await _capture("search-open")
	view.close_view()
	await _settle()
	assert(bar.search_button.has_focus())
	await _key(KEY_ENTER)
	await _settle()
	assert(view.visible)
	await _key(KEY_ESCAPE)
	await _settle()
	assert(not view.visible and bar.search_button.has_focus(), "Escape visible=%s focus=%s" % [view.visible, root.gui_get_focus_owner()])
	var event := InputEventKey.new()
	event.keycode = KEY_F
	event.ctrl_pressed = true
	event.shift_pressed = true
	event.pressed = true
	Input.parse_input_event(event)
	await _settle()
	assert(view.visible)
	view.close_view()
	await _settle()
	var menu: ProvidenceApplicationMenu = _shell._application_menu
	var popup := menu.get_node("Edit") as PopupMenu
	popup.id_pressed.emit(ProvidenceApplicationMenu.CommandId.EDIT_GLOBAL_SEARCH)
	await _settle()
	assert(view.visible)
	view.close_view()
	await _settle()
	bar.search_button.grab_focus()
	await _capture("search-focus")

func _draft_navigation() -> void:
	var quest: ProvidenceQuestEditor = _shell._documents.view("scripts.quests")
	var label := quest.find_child("QuestLabel", true, false) as LineEdit
	var baseline := label.text
	label.text += " — draft retained"
	label.text_changed.emit(label.text)
	await _settle()
	assert(quest.has_unapplied_changes() and not _shell._command_bar.commit_button.disabled)
	await _capture("dirty-apply")
	await _click(_shell._command_bar.search_button)
	await _settle()
	assert(quest.has_unapplied_changes())
	_shell._commands._discovery._view.close_view()
	await _settle()
	await _click(_shell._command_bar.back_button)
	await _settle()
	var dialog: ConfirmationDialog = _shell.get_node("UnappliedChangesDialog")
	assert(dialog.visible)
	dialog.get_cancel_button().pressed.emit()
	await _settle()
	assert(quest.has_unapplied_changes() and label.text.ends_with("draft retained"))
	await _click(_shell._command_bar.commit_button)
	await _settle()
	assert(not quest.has_unapplied_changes() and _shell._command_bar.commit_button.disabled)
	await _click(_shell._command_bar.undo_button)
	await _settle()
	assert(label.text == baseline)
	await _click(_shell._command_bar.redo_button)
	await _settle()
	assert(label.text.ends_with("draft retained"))
	await _click(_shell._command_bar.get_node("Save"))
	await _settle()
	await _settle()

func _states() -> void:
	var bar: ProvidenceCommandBar = _shell._command_bar
	bar.set_project_identity("Trouble in the Sword Lands — extended edition with a deliberately long scenario title", true)
	bar.set_location("STORY / QUESTS / Quest 009 / Eastern gate opened — Author note and scenario flow")
	bar.commit_button.text = "Apply Quest Label"
	await _settle()
	assert(bar.get_node("ProvidenceBrand/ProjectName").tooltip_text.ends_with("scenario title"))
	assert(bar.get_node("ProvidenceBrand").size.x <= 180)
	assert(bar.get_node("Commands").get_global_rect().end.x <= _shell.size.x)
	await _capture("long-identities")
	bar.present_document("scripts.quests", _shell._documents.view("scripts.quests"), false)
	_shell._commands.refresh()
	var menu: ProvidenceApplicationMenu = _shell._application_menu
	menu.set_menu_tooltip(1, "Edit")
	var popup := menu.get_node("Edit") as PopupMenu
	assert(popup.item_count == 12)
	menu.set_menu_disabled(1, false)
	var font := menu.get_theme_font("font")
	var font_size := menu.get_theme_font_size("font_size")
	var padding := menu.get_theme_stylebox("normal").get_minimum_size().x
	var x := font.get_string_size("File", HORIZONTAL_ALIGNMENT_LEFT, -1, font_size).x + padding
	var point := menu.global_position + Vector2(x + 15, menu.size.y / 2)
	for pressed in [true, false]:
		var event := InputEventMouseButton.new()
		event.position = point; event.button_index = MOUSE_BUTTON_LEFT; event.pressed = pressed
		Input.parse_input_event(event)
		await process_frame
	assert(popup.visible)
	await _capture("menu-open")
	popup.hide()
	_shell._operations.busy = true
	_shell._operations.busy_changed.emit(true, "Save")
	await _settle()
	assert(bar.search_button.disabled and bar.back_button.disabled)
	await _click(bar.search_button)
	assert(not _shell._commands._discovery._view.visible)
	await _capture("busy")
	_shell._operations.busy = false
	_shell._operations.requires_reopen = true
	_shell._operations.busy_changed.emit(false, "Save")
	await _settle()
	assert(bar.search_button.disabled)
	await _capture("recovery")
	_shell._operations.requires_reopen = false
	_shell._commands.refresh()
	_shell._command_bar.set_project_identity("discovery-connected", true)
	if not _output.is_empty(): await _measure_response()

func _measure_response() -> void:
	var discovery = _shell._commands._discovery
	discovery.open_search()
	await _settle()
	var samples: Array[float] = []
	for index in 30:
		var started := Time.get_ticks_usec()
		await discovery.search("quest", "scenario", "all", 0)
		await RenderingServer.frame_post_draw
		samples.append(float(Time.get_ticks_usec() - started) / 1000.0)
	samples.sort()
	assert(samples[28] <= 100)
	for mode in ["light", "dark", "high-contrast"]:
		for density in ["balanced", "compact"]:
			discovery._view.apply_theme(mode, density)
			_shell._documents.view("scripts.quests").apply_theme(mode, density)
			await RenderingServer.frame_post_draw
			assert(discovery._view.size.x <= root.content_scale_size.x)
	discovery._view.apply_theme()
	_shell._documents.view("scripts.quests").apply_theme()
	discovery._view.close_view()
	var receipt := {"samples":30, "p95Ms":samples[28], "maxMs":samples.back(), "budgetMs":100, "otherThemesAndDensities":"workbench bounded-layout smoke only; global theme menu remains unavailable"}
	var file := FileAccess.open(_output.path_join("response-%dx%d.json" % [root.content_scale_size.x, root.content_scale_size.y]), FileAccess.WRITE)
	file.store_string(JSON.stringify(receipt, "\t") + "\n")
	print("PROVIDENCE_SHELL_HEADER_RESPONSE ", JSON.stringify(receipt))

func _settle() -> void:
	for frame in 30: await process_frame
	while _shell._bridge.operation_busy(): await process_frame

func _key(code: Key) -> void:
	for pressed in [true, false]:
		var event := InputEventKey.new()
		event.keycode = code; event.pressed = pressed
		var view: Window = _shell._commands._discovery._view
		if view.visible: view.push_input(event)
		else: Input.parse_input_event(event)
		await process_frame

func _capture(state: String) -> void:
	if _output.is_empty(): return
	for frame in 4: await process_frame
	await RenderingServer.frame_post_draw
	var viewport := root.content_scale_size
	var image := root.get_texture().get_image()
	assert(image.save_png(_output.path_join("%s-%dx%d.png" % [state, viewport.x, viewport.y])) == OK)
