extends SceneTree

var _shell
var _view: ProvidenceSpellEditor
var _controller
var _failed := false


func _initialize() -> void: _run.call_deferred()


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 1: quit(1); return
	root.size = Vector2i(1600, 900); root.gui_embed_subwindows = true
	var project := args[0].path_join("project")
	var bridge := ProvidenceNativeBridge.new(args[0].path_join("settings.cfg"))
	if not _check(bridge.create_project("spell-linked-navigation", project).get("ok", false), "Create connected fixture"): return
	var reviewed := bridge.request("spell.allocation.review", {"expectedRevision": 0})
	var draft: Dictionary = reviewed.result.allocation.draft
	draft.definition.merge({"name": "Linked Moon Gate", "lookEnd": 0, "soundStart": 1, "queueIcon": 10}, true)
	if not _check(bridge.request("spell.draft.apply", {"expectedRevision": 0, "draft": draft, "operationId": "a".repeat(64)}).get("ok", false), "Apply connected fixture"): return
	bridge.stop()
	_shell = load("res://src/editor_shell.tscn").instantiate(); root.add_child(_shell); await process_frame
	await _shell._project_session.open_project(project)
	await _shell._navigation.select_route("rules.spells")
	_view = _shell._documents.view("rules.spells")
	_controller = _shell._workbenches.spell_commands
	await _controller.open_spell("classic.spell.5101"); await _idle()
	await _initial_loading()
	await _empty_catalog_return()
	await _media_return("soundStart", 0)
	if not _failed: await _media_return("lookEnd", 3)
	if not _failed: await _media_return("queueIcon", 0)
	if not _failed: await _exact_source_return()
	if not _failed: await _picker_inputs()
	_shell._close_project(); _shell.queue_free(); await process_frame
	if not _failed: print("PROVIDENCE_SPELL_LINKS_OK exact-stock-sound frame queue used-by-source field-focus back-return keyboard double-click unavailable empty-filter animation-play-stop")
	quit(1 if _failed else 0)


func _media_return(field: String, frame: int) -> void:
	var target: LineEdit = _view.form.control_for("toHitBonus").get_line_edit()
	target.grab_focus(); target.caret_column = 1
	var references = _controller._references
	var choice: Dictionary = references._choices[field]
	var resource: Dictionary = choice.resources[frame]
	_view.form.resource_requested.emit(field, frame)
	await _idle()
	var assets = _shell._assets.library_workbench
	_check(is_instance_valid(assets) and assets.current_scope() == "stock", "Exact resource opens its Stock Assets owner: " + field)
	_check(assets.get_node("%Gallery").selected_asset_identity() == str(resource.identity), "Assets selects the resolved resource identity: " + field)
	await _shell._navigation.navigate_back(); await _idle()
	_check(_view.selected_definition().id == "classic.spell.5101" and not _view.has_unapplied_changes(), "Back restores the spell without an authoring mutation")
	_check(root.gui_get_focus_owner() == target and target.caret_column == 1, "Back restores exact field and caret")


func _initial_loading() -> void:
	_controller.reload()
	_check(_view.selected_definition().is_empty() and _view.get_node("%UsedByCount").text == "USED BY", "Initial reload clears prior record and caller count before the read finishes")
	await _idle()
	_check(_view.selected_definition().id == "classic.spell.5101", "Completed reload restores the canonical selection")


func _empty_catalog_return() -> void:
	var search: LineEdit = _view.get_node("%SpellSearch")
	search.text = "unmatched catalog recovery"; search.text_changed.emit(search.text)
	await create_timer(0.3).timeout; await _idle()
	_check(_view.selected_definition().is_empty(), "Unmatched clean search clears the prior record")
	_check((await _controller.reload()).get("ok", false), "An empty Refresh is a successful read")
	_check(search.editable and not _view.get_node("%NewCustomSpell").disabled and not _view.get_node("%SpellClassFilter").disabled, "Empty Refresh finishes with browsing and creation unlocked")
	search.text = ""; search.text_changed.emit(search.text)
	await create_timer(0.3).timeout; await _idle()
	_check(_view.get_node("%SpellRecordList").item_count > 0 and search.editable and not _view.get_node("%NewCustomSpell").disabled, "Returning search matches restore selectable rows and unlocked controls")
	_view.get_node("%SpellRecordList").item_selected.emit(0); await _idle()
	_check(not _view.selected_definition().is_empty(), "A returned catalog row opens normally")
	await _controller.open_spell("classic.spell.5101"); await _idle()


func _exact_source_return() -> void:
	var choice: Dictionary = _controller._references._choices.soundStart
	var params := {"targetKind": "sound", "targetId": str(int(choice.resources[0].resourceId)), "limit": 64}
	var result: Dictionary = _shell._bridge.request("reference.used-by", params)
	_check(result.get("ok", false), "Real typed Used By query")
	var row: Dictionary = {}
	for reference in result.get("result", {}).get("items", []):
		if reference.source == "classic.spell.5101" and reference.field == "soundStart": row = reference
	_check(not row.is_empty(), "Sound Used By includes its exact authored spell field")
	if row.is_empty(): return
	await _shell._navigation.select_route("rules.races"); await _idle()
	await _shell._navigation.open_script_source(row); await _idle()
	_check(_shell._navigation.current_view() == _view and root.gui_get_focus_owner() == _view.form.find_child("ChoosesoundStart", true, false), "Used By returns to exact spell resource field")
	await _shell._navigation.open_script_source({"source": "classic.spell.5101", "field": "lookEnd.frames[3]"}); await _idle()
	_check(root.gui_get_focus_owner() == _view.form.find_child("lookEndFrame3", true, false), "Typed frame link focuses the exact frame")


func _picker_inputs() -> void:
	_controller._references.open_picker("lookEnd"); await _idle()
	var picker = _controller._references._picker
	var key := InputEventKey.new(); key.keycode = KEY_ENTER; key.pressed = true
	picker.push_input(key); await process_frame; key.pressed = false; picker.push_input(key)
	await _idle()
	_check(not picker.visible and not _view.has_unapplied_changes(), "Enter accepts current identity as a no-op")
	_controller._references.open_picker("lookEnd"); await _idle()
	var input: LineEdit = picker.get_node("%Search")
	input.text = "12032"; input.text_changed.emit(input.text)
	await create_timer(0.3).timeout; await _idle()
	picker.get_node("%Choices").item_activated.emit(1); await _idle()
	_check(not picker.visible and _view.selected_definition().lookEnd == 5, "Double-click waits for the exact preview before accepting alias identity five")
	_view.discard_draft(); await _idle()
	_controller._references.open_picker("lookEnd"); await _idle()
	picker.get_node("%Ownership").select(1); picker.get_node("%Ownership").item_selected.emit(1); await _idle()
	_check(picker.selected.is_empty() and picker.get_node("%UseSelection").disabled, "Scenario-only filter clears Stock preview and stale acceptance")
	picker.get_node("%Ownership").select(0); picker.get_node("%Ownership").item_selected.emit(0)
	picker.get_node("%ShowUnavailable").button_pressed = true
	input.text = "32"; input.text_changed.emit(input.text)
	await create_timer(0.3).timeout; await _idle()
	var unavailable: int = picker._rows.find_custom(func(row): return not row.available)
	_check(unavailable >= 0, "The real catalog exposes an unavailable exact resource")
	if unavailable >= 0: picker.get_node("%Choices").item_selected.emit(unavailable)
	await _idle()
	_check(picker.get_node("%UseSelection").disabled and not picker.get_node("%Availability").text.is_empty(), "Unavailable exact choice explains disabled acceptance")
	key.keycode = KEY_ESCAPE; key.pressed = true; picker.push_input(key); await process_frame
	_check(not picker.visible and not _view.has_unapplied_changes(), "Escape cancels unavailable browsing without a draft mutation")
	_view.form.find_child("PlaylookEnd", true, false).pressed.emit(); await create_timer(0.14).timeout
	_check(_view.form._animation_field == "lookEnd", "Inline animation preview starts the exact resource sequence")
	_view.form.find_child("StoplookEnd", true, false).pressed.emit()
	_check(_view.form._animation_field.is_empty() and _view.form.find_child("lookEndFrame3", true, false).modulate == Color.WHITE, "Stop resets exact preview frames")


func _idle() -> void:
	var stable := 0
	for frame in 900:
		await process_frame
		stable = stable + 1 if not _shell._operations.busy and not _shell._bridge.operation_busy() else 0
		if stable >= 12: return
	_check(false, "Connected navigation exceeded its bounded wait")


func _check(value: bool, message: String) -> bool:
	if not value: _failed = true; push_error("PROVIDENCE_SPELL_LINKS_FAILED: " + message)
	return value
