extends Control

signal startup_completed

var startup_presentable := false

const EditorOperation = preload("res://src/editor_operation.gd")
const RouteCatalog = preload("res://src/route_catalog.gd")
const SmokeArgumentRouter = preload("res://tools/editor_shell_smoke_argument_router.gd")
const CommandBarScene = preload("res://src/command_bar.tscn")

var _project_session := preload("res://src/project_session_controller.gd").new()
var _bridge: ProvidenceNativeBridge:
	get: return _project_session.bridge
	set(value): _project_session.bridge = value
var _problem_commands := preload("res://src/problems_controller.gd").new()
var _draft_apply := preload("res://src/editor_draft_apply.gd").new()
var _maps := preload("res://src/map_workspace_controller.gd").new()
var _session_view: Node
var _status: Label
var _undo_button: Button
var _redo_button: Button
var _commit_edit_button: Button
var _document_toolbar: HBoxContainer
var _command_title: Label
var _document_tabs: TabContainer
var _strings: ProvidenceStringEditor
var _documents := preload("res://src/document_registry.gd").new()
var _workbenches := preload("res://src/document_workbenches.gd").new()
var _navigation := preload("res://src/document_navigation.gd").new()
var _presentation := preload("res://src/document_presentation.gd").new()
var _problem_dock: ProvidenceProblemsDock
var _documents_host: VBoxContainer
var _document_inspector_split: HSplitContainer
var _inspector_panel
var _map_inspector: ProvidenceMapInspector
var _palette: ProvidenceCommandPalette
var _preview_workspace := preload("res://src/preview_workspace_controller.gd").new()
var _domain_navigation
var _domain_sidebar: VBoxContainer
var _map_context_sidebar
var _item_editor: Control
var _item_commands := preload("res://src/item_workbench_controller.gd").new()
var _scripts := preload("res://src/script_workspace_controller.gd").new()
var _assets := preload("res://src/assets_workspace_controller.gd").new()
var _media := preload("res://src/media_workspace_controller.gd").new()
var _scenario_items: Array:
	get: return _item_editor.catalog_items() if _item_editor != null else []
var _application_menu
var _command_bar
var _new_project_dialog
var _scenario_import_dialog
var _scenario_import := preload("res://src/scenario_import_controller.gd").new()
var _publish_targets_dialog
var _publishing := preload("res://src/publish_targets_controller.gd").new()
var _rebuilt_preview_controller: ProvidenceRebuiltPreviewController
var _open_project_dialog: FileDialog
var _save_as_project_dialog: FileDialog
var _unapplied_dialog: ConfirmationDialog
var _draft_navigation := preload("res://src/draft_navigation.gd").new()
var _explorer_panel: PanelContainer
var _primary_workspace: HSplitContainer
var _issues
var _operations: EditorOperation
var _history := preload("res://src/history_controller.gd").new()
var _document_changes := preload("res://src/document_changes.gd").new()
var _commands: Node
var _layout := preload("res://src/layout_coordinator.gd").new()


func _ready() -> void:
	await _initialize_startup()
	startup_presentable = true
	startup_completed.emit()


func _initialize_startup() -> void:
	_compose_shell()
	var user_args := OS.get_cmdline_user_args()
	if SmokeArgumentRouter.route_pre_session(self, user_args):
		return
	var demo_requested := user_args.has("--demo")
	for flag in SmokeArgumentRouter.SESSION_SPECS:
		demo_requested = demo_requested or user_args.has(flag)
	if not demo_requested and OS.get_environment("PROVIDENCE_PROJECT_PATH").strip_edges().is_empty():
		_close_project()
		return
	var response := _bridge.start_demo()
	if not bool(response.get("ok", false)):
		_show_error(str(response.get("error", "Native adapter failed to start.")))
		return
	await _activate_session(response)
	SmokeArgumentRouter.route_session(self, user_args)


func _exit_tree() -> void:
	if _rebuilt_preview_controller != null:
		_rebuilt_preview_controller.cancel_preview("Editor closed · Rebuilt preview stopped")
	_bridge.stop()
	_media.dispose()
	_scripts.dispose()
	_workbenches.dispose()
	_item_commands.dispose()
	_maps.dispose()


func _compose_shell() -> void:
	_session_view = preload("res://src/session_projection.gd").new()
	add_child(_session_view)
	_commands = preload("res://src/application_commands.gd").new()
	add_child(_commands)
	_operations = EditorOperation.new()
	add_child(_operations)
	_operations.recovery_required.connect(_operation_requires_reopen)
	_history.operations = _operations
	_history.refresh_visible = _refresh_history_views
	_history.projection_applied.connect(func(projection: Dictionary): _session_view.apply(projection, false))
	_primary_workspace = %PrimaryWorkspace
	_document_inspector_split = %DocumentAndInspector
	resized.connect(_presentation.apply_layout)
	_bind_command_bar()
	_bind_document_workspace()
	_bind_domain_navigation()
	_inspector_panel = %InspectorPanel
	_layout.initialize(_explorer_panel, _domain_sidebar, _primary_workspace, _document_inspector_split, %InspectorHost)
	_documents_host.add_child(_build_document_area())
	_bind_inspector()
	_initialize_map_document()
	_initialize_issues_workspace()
	_initialize_assets_workspace()
	_session_view.initialize(_document_changes, _operations, _problem_commands, _problem_dock, func(): return _bridge.is_project_backed())
	_session_view.history_changed.connect(_commands.set_history)
	_session_view.project_changed.connect(_assets.project_changed)
	_session_view.revision_changed.connect(_issues.project_changed)
	_session_view.authored_change.connect(_project_became_dirty)
	_session_view.reference_changed.connect(_inspector_panel.show_reference)
	_session_view.status_changed.connect(func(message: String): _status.text = message)
	_navigation.initialize(_document_tabs, _documents, _operations, _domain_navigation, _layout)
	_navigation.configure_authoring(_maps.document, _scripts, _maps.lifecycle, _assets, _media, _issues, _workbenches, _strings, _draft_apply.has_draft, _draft_navigation.request)
	_navigation.status_changed.connect(func(message: String): _status.text = message)
	_navigation.layout_requested.connect(_presentation.apply_layout)
	_navigation.history_changed.connect(func(_can_back: bool, _can_forward: bool): _commands.refresh())
	_bind_draft_controller()
	_maps.initialize_paint.call_deferred()
	for tab in _document_tabs.get_tab_count():
		var identity := _documents.identity_for_tab(tab)
		_document_changes.register_document(identity, preload("res://src/document_interests.gd").for_route(identity))
	_document_tabs.current_tab = _documents.tab_for_route("scripts.action-points")
	_navigation.activate_domain("scripts", false)
	_status = %Status
	_presentation.select_document(_document_tabs.current_tab)
	_bind_project_dialogs()
	_palette = %CommandPalette
	_rebuilt_preview_controller = %RebuiltPreviewController
	_preview_workspace.initialize(_documents, _document_tabs, _maps.document, _rebuilt_preview_controller, _operations, _draft_apply, _session_view.context, func(): return _bridge, _workbenches.battle)
	_preview_workspace.status_changed.connect(func(message: String): _status.text = message)
	_preview_workspace.failed.connect(_show_error)
	_preview_workspace.selection_changed.connect(_commands.refresh)
	_bind_application_commands()
	_commands.refresh()


func _bind_project_dialogs() -> void:
	_project_session.initialize(_operations, _activate_session, _session_view.context, _draft_apply.has_draft)
	_project_session.status_changed.connect(func(message: String): _status.text = message)
	_project_session.failed.connect(_show_error)
	_project_session.assets_save_state.connect(_set_assets_save_state)
	_project_session.item_save_state.connect(_item_editor.show_save_state)
	_project_session.project_saved.connect(_issues.project_saved)
	_new_project_dialog = $NewProjectDialog
	_new_project_dialog.project_create_requested.connect(_project_session.create_project)
	_scenario_import_dialog = $ScenarioImportDialog
	_scenario_import.initialize(_scenario_import_dialog, _operations, _session_view.context, _complete_import)
	_scenario_import.projection_applied.connect(_session_view.apply)
	_scenario_import.failed.connect(_show_error)
	_scenario_import.status_changed.connect(func(message: String): _status.text = message)
	_scenario_import_dialog.scenario_item_import_requested.connect(_scenario_import.import_items)
	_scenario_import_dialog.classic_land_import_requested.connect(_scenario_import.import_land)
	_scenario_import_dialog.classic_scenario_inspect_requested.connect(_scenario_import.inspect_scenario)
	_scenario_import_dialog.classic_scenario_import_requested.connect(_scenario_import.import_scenario)
	_publish_targets_dialog = $PublishTargetsDialog
	_publishing.initialize(_publish_targets_dialog, _operations, _project_session, _session_view.context)
	_publishing.status_changed.connect(func(message: String): _status.text = message)
	_publishing.failed.connect(_show_error)

	_open_project_dialog = $OpenProjectDialog
	_open_project_dialog.dir_selected.connect(_project_session.open_project)
	_save_as_project_dialog = $SaveAsProjectDialog
	_save_as_project_dialog.file_selected.connect(_project_session.save_as)
	_workbenches.configure_publish_recovery(_document_tabs.get_current_tab_control, _show_open_project, _show_import_scenario, _show_save_as_project, func(message: String): _status.text = message)

	_unapplied_dialog = $UnappliedChangesDialog
	_draft_navigation.initialize(_unapplied_dialog, _draft_apply, _operations, _active_text_dialog, _issues.guard.prepare_pending_input, _document_tabs.get_current_tab_control)
	_draft_navigation.failed.connect(_show_error)


func _active_text_dialog() -> Window:
	return _issues.active_authoring_dialog() if _issues != null else null


func _set_assets_save_state(message: String, unsaved: bool, failed := false) -> void:
	for document in _document_tabs.get_children():
		if document.get_meta("owns_asset_workspace", false):
			document.show_save_state(message, unsaved, failed)


func _bind_draft_controller() -> void:
	_draft_apply.initialize(_document_tabs, _accept, _active_text_dialog)
	_maps.register_drafts(_draft_apply)
	_draft_apply.register_editor(_item_editor, _item_editor.has_unapplied_changes, _item_editor.discard_draft, _item_editor.commit_selected)
	_workbenches.treasure.navigation_requested.connect(_draft_navigation.request)
	_workbenches.shop.navigation_requested.connect(_draft_navigation.request)


func _show_open_project() -> void:
	var documents := OS.get_system_dir(OS.SYSTEM_DIR_DOCUMENTS)
	if not documents.is_empty():
		_open_project_dialog.current_dir = documents
	_open_project_dialog.popup_centered_ratio(0.72)


func _show_save_as_project() -> void:
	var current_path := _bridge.current_project_path()
	if not current_path.is_empty():
		_save_as_project_dialog.current_dir = current_path.get_base_dir()
		_save_as_project_dialog.current_file = "%s-copy" % _session_view.project_id
	_save_as_project_dialog.popup_centered_ratio(0.72)


func _show_import_scenario() -> void:
	_scenario_import_dialog.popup_import(_bridge.bundled_classic_application_data_root())


func _close_project() -> void:
	if _operations.busy: return
	_draft_navigation.cancel()
	_bridge.stop()
	_session_view.clear()
	_issues.session_changed(null, -1)
	_command_bar.set_project_identity("", false)
	_maps.teardown()
	_workbenches.player_map_commands.teardown()
	_workbenches.dungeon_cells.teardown()
	_documents.teardown()
	_strings.teardown()
	_item_editor.set_items([], 0)
	_assets.teardown()
	_workbenches.configure_compile_capabilities(false)
	_workbenches.vault.clear()
	_scripts.reset_projection(0)
	_workbenches.reset_projection()
	_documents.view("scripts.action-points").set_maps([])
	_documents.view("scripts.action-points").set_summaries({"items": [], "total": 0}, 0)
	_map_context_sidebar.set_editable(false)
	_preview_workspace.selection.clear_scrolling_text()
	_map_inspector.set_overview("", "land", false, "Open or import a map to edit terrain.")
	_render_explorer([])
	_problem_commands.teardown()
	_scenario_import.teardown()
	_set_item_inspector({})
	_commands.refresh()
	_status.text = "No project open"


func _activate_session(response: Dictionary) -> Dictionary:
	_draft_navigation.cancel()
	_workbenches.attach_session(_bridge)
	_scenario_import.attach_session(_bridge)
	_problem_commands.attach_session(_bridge)
	_item_commands.attach_session(_bridge)
	_scripts.attach_session(_bridge)
	_assets.attach_session(_bridge, _session_view.context)
	_maps.attach_session(_bridge)
	_history.reset()
	_document_changes.clear()
	_item_editor.show_save_state("", false)
	_apply_session(response.get("result", {}) as Dictionary)
	var refreshed := await _refresh_session_projections()
	if not refreshed.get("ok", false): return refreshed
	_issues.session_changed(_bridge, _session_view.revision)
	await _presentation.select_document(_document_tabs.current_tab)
	_workbenches.configure_compile_capabilities(_bridge.is_project_backed())
	_map_context_sidebar.set_editable(_bridge.is_project_backed())
	_commands.refresh()
	return _activation_failed() if _operations.requires_reopen else {"ok": true}


func _refresh_session_projections() -> Dictionary:
	if not _operations.begin(_bridge, "Open"): return _activation_failed()
	# Full diagnostics belong to Validate; opening loads only the document view.
	var tokens := {"maps.land":_document_changes.refresh_token("maps.land"), "maps.dungeon":_document_changes.refresh_token("maps.dungeon")}
	var result: Dictionary = await _maps.document.load_first_async(_operations)
	_operations.finish(result, false, false)
	if result.get("ok",false) and not _maps.document.identity.is_empty():
		var route := "maps.dungeon" if _maps.document.is_dungeon else "maps.land"
		_document_changes.refreshed(route, tokens[route])
	if not result.get("ok", false):
		_show_error("The project opened, but a view could not load. " + str(result.get("error", "")))
	return result


func _activation_failed() -> Dictionary:
	return {"ok": false, "outcomeUnknown": _operations.requires_reopen, "error": "A project view could not load. Reopen the project before continuing."}


func _load_first_map() -> void:
	await _maps.document.load_first()
	if not _maps.document.identity.is_empty(): await _scripts.reload_action_points_for_map(_maps.document.identity)


func _reload_map_catalog() -> bool:
	var response: Dictionary = await _maps.document.reload_catalog()
	return response.get("ok", false)


func _bind_command_bar() -> void:
	_command_bar = CommandBarScene.instantiate()
	%CommandBarHost.add_child(_command_bar)
	_document_toolbar = _command_bar
	_application_menu = _command_bar.get_node("ApplicationMenu")
	_command_title = _command_bar.command_title
	_undo_button = _command_bar.undo_button
	_redo_button = _command_bar.redo_button
	_commit_edit_button = _command_bar.commit_button
	_command_bar.validate_requested.connect(_validate)
	_command_bar.save_requested.connect(_project_session.save)
	_command_bar.compile_requested.connect(func(): await _navigation.select_route("export.export-plan"))


func _bind_domain_navigation() -> void:
	_domain_navigation = %DomainNavigation
	_explorer_panel = _domain_navigation as PanelContainer
	_domain_sidebar = _domain_navigation.get_node("Layout/DomainSidebar")
	_map_context_sidebar = _domain_navigation.get_node("%MapContextSidebar")
	_map_context_sidebar.map_selected.connect(_navigation.open_map)
	_map_context_sidebar.create_map_requested.connect(_navigation.create_map)
	_map_context_sidebar.duplicate_map_requested.connect(_navigation.duplicate_map)
	_map_context_sidebar.action_points_requested.connect(_navigation.open_map_action_points)
	_map_context_sidebar.special_tiles_requested.connect(_navigation.open_special_land.bind(true))
	_render_explorer([])


func _render_explorer(maps: Array) -> void:
	if _domain_navigation == null: return
	_domain_navigation.render_project(_session_view.project_id, maps, _strings.total_messages() if _strings != null else 0, _scenario_items.size(), _problem_dock.diagnostic_count())
	_map_context_sidebar.set_maps(maps, _maps.document.identity)


func _build_document_area() -> Control:
	_document_tabs = preload("res://src/document_pages.tscn").instantiate()
	_documents.initialize(_document_tabs)
	_workbenches.initialize(_documents, _operations, _navigation, _inspector_panel)
	_workbenches.configure_session_access(_session_view.context, func(): return _bridge, _accept, _draft_apply.accept, _commands.dispatch)
	_bind_workbench_events()
	_workbenches.bind_documents(_maps.document, _preview_workspace.selection)
	_workbenches.text_export.configure_text_preview(_preview_workspace.preview_scrolling_text)
	_bind_string_workbench()
	_bind_record_workbenches()
	_bind_media_workbenches()
	_issues = preload("res://src/issues_workspace_controller.gd").new()
	_issues.initialize(self, _document_tabs, _documents_host, _draft_apply, _active_text_dialog, _documents.view("linter.issues"), _operations)
	_presentation.initialize(_document_tabs, _documents, _document_changes, _operations, _navigation, _layout, _command_bar)
	_presentation.configure_inspectors(_inspector_panel, %MapInspector, %InspectorHost, _maps, _issues, _session_view.context, func(): return _session_view.references, _layout.workspace_width, %EncounterRouteTabs, _navigation)
	_presentation.selection_changed.connect(_commands.refresh)
	return _document_tabs


func _bind_workbench_events() -> void:
	_workbenches.projection_applied.connect(_session_view.apply)
	_workbenches.failed.connect(_show_error)
	_workbenches.status_changed.connect(func(message: String): _status.text = message)
	_workbenches.selection_changed.connect(_commands.refresh)
	_workbenches.artwork_applied.connect(_on_vault_artwork_applied)
	_workbenches.land_cell_selected.connect(_maps.select_cell)
	_workbenches.dungeon_cell_selected.connect(_maps.select_dungeon_cell)
	_workbenches.action_point_activated.connect(_maps.open_action_point)
	_workbenches.scrolling_text_requested.connect(_preview_workspace.select_scrolling_text)
	_workbenches.picture_preview_requested.connect(_open_player_map_picture)


func _bind_string_workbench() -> void:
	_strings = _documents.view("text.messages")
	_strings.selection_changed.connect(_set_message_inspector)
	_strings.projection_applied.connect(_session_view.apply)
	_strings.configure_navigation(_navigation.select_route, _open_message_source, _draft_navigation.request)
	_strings.failed.connect(_show_error)
	_documents.register_controller("text.messages", preload("res://src/workbench_controller.gd").new("text.messages", _strings, _strings.refresh_workbench))


func _bind_record_workbenches() -> void:
	_scripts.initialize(_documents, _maps.document, _session_view.context, _accept, _draft_apply.accept, _operations, _draft_navigation.request)
	_scripts.projection_applied.connect(_session_view.apply)
	_scripts.message_requested.connect(_strings.open_native)
	_scripts.sound_requested.connect(_open_script_sound)
	_scripts.sound_preview_requested.connect(_preview_script_sound)
	_scripts.sound_stop_requested.connect(func(): _media.sounds.stop_preview())
	_scripts.semantic_target_requested.connect(_navigation.open_script_target)
	EditorHelpBinding.bind_scripts(_scripts, %DivinityCodeHelper, %DivinityManualReader)
	_scripts.map_reveal_requested.connect(_maps.reveal_coordinate)
	_scripts.route_requested.connect(_navigation.select_route)
	_scripts.compile_requested.connect(func(): await _navigation.select_route("export.export-plan"))
	_scripts.failed.connect(_show_error)
	_scripts.inspector_requested.connect(_show_script_inspector)
	_item_editor = _documents.view("economy.items") as Control
	_item_commands.initialize(_item_editor, _operations, _session_view.context, _draft_apply.accept)
	_item_commands.configure_navigation(_navigation.open_script_source, _navigation.open_script_target, _navigation.preview_script_sound)
	_item_commands.projection_applied.connect(_session_view.apply)
	_documents.register_controller("economy.items", preload("res://src/workbench_controller.gd").new("economy.items", _item_editor, _item_commands.reload, _item_commands.teardown))
	_item_editor.item_update_requested.connect(_item_commands.commit)
	_item_editor.compile_requested.connect(_publishing.compile_scenario_items)
	_item_editor.selection_changed.connect(_set_item_inspector)
	_item_editor.navigation_requested.connect(_draft_navigation.request)
	_item_editor.return_to_assets_requested.connect(func(): _draft_navigation.request(_assets.return_to_artwork, "returning to Assets"))
	_item_editor.artwork_choice_requested.connect(func(): _draft_navigation.request(_assets.choose_item_artwork, "choosing library artwork"))
	_item_editor.save_requested.connect(_project_session.save)
	_item_editor.save_as_requested.connect(_show_save_as_project)


func _show_script_inspector(kind: String, document: Dictionary, references: Array) -> void:
	match kind:
		"encounter": _inspector_panel.show_encounter(document, references, _session_view.references)
		"complex-encounter": _inspector_panel.show_encounter(document, references, _session_view.references)
		"extra-action-point": _inspector_panel.show_extra_action_point(document, references, _session_view.references)
		"action-point": _inspector_panel.show_action_point(document, references, _session_view.references)
		"global-macro": _inspector_panel.show_global_macro(document)


func _bind_media_workbenches() -> void:
	_media.initialize(_documents, _operations, _session_view.context, _accept, _draft_apply.accept, _assets.refresh_visible)
	_media.projection_applied.connect(_session_view.apply)
	_media.inspector_requested.connect(_show_media_inspector)
	_media.route_requested.connect(_navigation.select_route)
	_media.special_land_requested.connect(_navigation.open_special_land.bind(false))
	_media.library_requested.connect(func(scope: String): _draft_navigation.request(
		_assets.return_to_scenario if scope == "scenario" else _assets.open_library.bind(scope), "opening the asset library"))
	_media.paint_tile_requested.connect(_maps.select_special_land)
	_media.compile_requested.connect(func(): await _navigation.select_route("export.export-plan"))
	_media.status_changed.connect(func(message: String): _status.text = message)


func _show_media_inspector(kind: String, document: Dictionary) -> void:
	match kind:
		"picture": _inspector_panel.show_picture(document)
		"sound": _inspector_panel.show_sound(document)
		"icon": _inspector_panel.show_icon(document)


func _bind_document_workspace() -> void:
	var workspace := %DocumentWorkspace as VSplitContainer
	_documents_host = workspace.find_child("DocumentsHost", true, false) as VBoxContainer
	_problem_dock = workspace.find_child("ProblemsDock", true, false)
	_problem_commands.initialize(_problem_dock, _operations)
	_problem_commands.failed.connect(_show_error)
	_layout.configure_output_dock(workspace, _problem_dock)


func _bind_inspector() -> void:
	_inspector_panel = %InspectorPanel
	_map_inspector = %MapInspector
	_inspector_panel.repair_requested.connect(_repair_reference)
	_workbenches.battle.document_applied.connect(_inspector_panel.show_read_only_record.bind("battle", "Data BD", 346, "Battle"))
	_workbenches.treasure.document_applied.connect(_inspector_panel.show_read_only_record.bind("treasure", "Data TD", 48, "Treasure"))
	_workbenches.shop.document_applied.connect(_inspector_panel.show_read_only_record.bind("shop", "Data SD", 3002, "Shop"))
	for editor in _workbenches.rules:
		editor.document_applied.connect(_inspector_panel.show_rule_record)


func _apply_session(session: Dictionary) -> void:
	_session_view.attach(session)
	_navigation.clear_history()
	_command_bar.set_project_identity(_session_view.project_id, _bridge.is_project_backed())
	_documents.attach_session()
	_strings.attach_session(_bridge, _session_view.context, _accept, _draft_apply.accept, int(session.get("counts", {}).get("messages", 0)), _operations)
	_preview_workspace.selection.clear_scrolling_text()
	_item_editor.set_items([], _session_view.revision)
	_scripts.reset_projection(_session_view.revision)
	_media.attach_session(_bridge)
	_workbenches.reset_projection()
	_set_item_inspector({})
	_commands.refresh()
	_status.text = "Ready · revision %d · native Rust session" % _session_view.revision


func _open_message_use(index: int) -> void:
	await _open_message_source(_strings.use_reference(index))


func _open_script_sound(native_id: int) -> void: await _navigation.open_script_sound(native_id)


func _preview_script_sound(native_id: int, identity: String, status: String) -> void: await _navigation.preview_script_sound(native_id, identity, status)


func _open_message_source(reference: Dictionary) -> void:
	await _navigation.open_script_source(reference)


func _on_vault_artwork_applied(projection: Dictionary, record_index: int) -> void:
	_session_view.apply(projection)
	await _navigation.select_tab(4)
	await _item_editor.open_item("classic.item.%d" % (800 + record_index))
	_item_editor.show_save_state("Unsaved changes — save this project to keep your edits.", true)
	_status.text = "Item picture updated."


func configure_assets_workbench(workbench: Control) -> void:
	_assets.configure_workbench(workbench)


func _open_artwork_source(reference: Dictionary) -> void:
	await preload("res://src/asset_source_navigation.gd").open(reference, _navigation, _maps.document, _workbenches.player_map_commands)


func _set_message_inspector(message: Dictionary) -> void:
	if str(message.get("identity", "")).begins_with("option-label:"):
		_inspector_panel.show_option_label(message, _strings.used_by())
	else: _inspector_panel.show_message(message, _strings.used_by())


func _set_item_inspector(item: Dictionary) -> void:
	_inspector_panel.show_item(item, _session_view.references)


func _commit_edit() -> void:
	if _operations.busy or _operations.requires_reopen: return
	var result: Dictionary = await _draft_apply.commit()
	if not result.is_empty() and not bool(result.get("ok", false)):
		_show_error(str(result.get("error", "The change could not be applied.")))


func _repair_reference() -> void:
	var request: Dictionary = _inspector_panel.repair_request()
	if not request.is_empty(): await _scripts.repair_reference(request)


func _undo() -> void:
	if not _session_view.connected or _undo_button.disabled or _operations.busy: return
	await _request_history("undo")


func _redo() -> void:
	if not _session_view.connected or _redo_button.disabled or _operations.busy: return
	await _request_history("redo")


func _request_history(direction: String) -> void:
	if _draft_apply.has_draft():
		_draft_navigation.request(_execute_history.bind(direction), direction + "ing")
		return
	await _execute_history(direction)


func _execute_history(direction: String) -> void:
	_workbenches.land.cancel_paint_stroke()
	var response: Dictionary = await _history.execute(_bridge, _session_view.revision, direction)
	if response.get("busy", false): return
	if _history.requires_reopen:
		_session_view.connected = false
		_undo_button.disabled = true
		_redo_button.disabled = true
	if not response.get("ok", false):
		_status.text = str(response.get("error", "History could not be applied."))
	elif response.has("viewRefreshError"):
		_status.text = "%s applied, but the view could not refresh. %s" % [direction.capitalize(), response.viewRefreshError]
	else:
		var document := _document_tabs.get_current_tab_control()
		var asset_catalog: bool = document.get_meta("owns_asset_workspace", false) and document.uses_async_catalog()
		if not asset_catalog and _documents.controller(_documents.identity_for_tab(_document_tabs.current_tab)) == null:
			await _presentation.refresh_current()
			if document.get_meta("owns_asset_workspace", false): document.refresh_after_history(_bridge)
		_issues.project_changed(_session_view.revision)
		_status.text = "%s applied · revision %d" % [direction.capitalize(), _session_view.revision]
	_commands.refresh()


func _refresh_history_views(_projection: Dictionary) -> Dictionary:
	var document := _document_tabs.get_current_tab_control()
	if document.get_meta("owns_asset_workspace", false) and document.uses_async_catalog():
		return await document.refresh_after_history(_bridge, _operations)
	var route := _documents.identity_for_tab(_document_tabs.current_tab)
	var controller := _documents.controller(route)
	if controller != null:
		return await controller.activate(_document_changes, _operations, _projection)
	return {"ok": true}


func _validate() -> void:
	if _issues.is_selected():
		_issues.request_show()
		return
	var response: Dictionary = await _problem_commands.refresh()
	if _accept(response):
		_status.text = "Validation complete · revision %d" % _session_view.revision


func _operation_requires_reopen(message: String) -> void:
	_session_view.connected = false
	_undo_button.disabled = true
	_redo_button.disabled = true
	_commit_edit_button.disabled = true
	_status.text = message
	_commands.refresh()


func _open_player_map_picture(native_id: int) -> void:
	var token := _document_changes.refresh_token("assets.pictures")
	var response: Dictionary = await _media.pictures.reload("picture:%d" % native_id)
	if response.get("ok", false):
		_document_changes.refreshed("assets.pictures", token)
		_navigation.select_route("assets.pictures")


func _reload_scenario_items() -> void:
	_accept(await _item_commands.reload())


func _accept(response: Dictionary) -> bool:
	if bool(response.get("ok", false)):
		return true
	_show_error(str(response.get("error", "Native command failed.")))
	return false


func _show_error(message: String) -> void:
	_status.text = message
	_status.add_theme_color_override("font_color", Color("f09a82"))
	push_error(message)


func _refresh_map_document_after_change(projection: Dictionary) -> void:
	await _maps.document.refresh_after_change(projection, _session_view.project_id)


func _initialize_map_document() -> void:
	_maps.initialize(_documents, _operations, _map_inspector, _map_context_sidebar, %InspectorHost, _inspector_panel, self)
	_maps.configure_commands(_session_view.context, func(): return _session_view.references, _accept, _draft_apply.accept, _navigation, _scripts, _strings)
	_maps.projection_applied.connect(_session_view.apply)
	_maps.status_changed.connect(func(message: String): _status.text = message)
	_maps.failed.connect(_show_error)
	_maps.catalog_changed.connect(_render_explorer)
	_maps.catalog_changed.connect(_documents.view("scripts.action-points").set_maps)
	_maps.selection_changed.connect(_commands.refresh)
	_maps.title_changed.connect(_command_bar.set_location)
	_maps.inspector_visibility_requested.connect(_presentation.set_inspector_visible)
	_maps.assets_requested.connect(func(): _draft_navigation.request(_assets.open_library.bind("scenario"), "opening Scenario Assets"))
	_maps.attach_session(_bridge)


func _initialize_issues_workspace() -> void:
	_layout.configure_issues_chrome(self, _command_bar, _document_tabs, %Status, _problem_dock, _issues.request_show)
	_issues.configure_navigation(_layout, _session_view.context, _navigation.select_tab, _commands.dispatch, _scripts.open_source, _navigation)
	_issues.status_changed.connect(func(message: String):
		if _status != null: _status.text = message)
	_issues.projection_applied.connect(_session_view.apply)
	_issues.domain_requested.connect(func(domain: String): _navigation.activate_domain(domain, false))
	_issues.route_header_requested.connect(_present_issues_header)
	_issues.menu_state_changed.connect(_commands.refresh)
	_issues.restore_domain_requested.connect(func():
		_navigation.activate_domain(RouteCatalog.domain_for_tab(_document_tabs.current_tab, _navigation.active_domain), false))


func _present_issues_header(title: String) -> void:
	_command_bar.set_location(title)
	_command_bar.set_route_has_commit(false)
	_commit_edit_button.disabled = true

func _initialize_assets_workspace() -> void:
	_assets.initialize(self, _document_tabs, _item_editor, _draft_navigation.request, _navigation.select_tab, _operations)
	_assets.configure_resources(
		{"picture": _documents.view("assets.pictures"), "sound": _documents.view("assets.sounds"), "icon": _documents.view("assets.icons"), "special-land-tile": _documents.view("maps.special-land")},
		{"picture": _media.pictures.open_media, "sound": _media.sounds.open_media, "icon": _media.icons.open_media, "special-land-tile": _media.special_land.open_media},
		_navigation.open_special_land.bind(false), _open_artwork_source, _preview_workspace.preview_scrolling_text)
	_assets.attach_session(_bridge, _session_view.context)
	_assets.artwork_applied.connect(_on_vault_artwork_applied)
	_assets.projection_applied.connect(_session_view.apply)
	_assets.save_requested.connect(_project_session.save)
	_assets.save_as_requested.connect(_show_save_as_project)
	_assets.status_changed.connect(func(message: String): _status.text = message)
	_assets.failed.connect(_show_error)


func _complete_import(kind: String, _projection: Dictionary, session: Dictionary) -> Dictionary:
	if kind != "items":
		var activated := await _activate_session(session)
		if not activated.get("ok", false): return activated
	var items: Dictionary = await _item_commands.reload()
	if not items.get("ok", false): return items
	match kind:
		"scenario":
			_render_explorer(_maps.document.maps)
			await _navigation.select_route("maps.land")
		"land":
			if not await _strings.reload(): return _activation_failed()
			if not await _scripts.reload_simple_encounters(): return _activation_failed()
			if not await _scripts.reload_extra_action_points(): return _activation_failed()
			if not await _scripts.reload_global_macros(): return _activation_failed()
			var media: Dictionary = await _media.special_land.reload()
			if not media.get("ok", false): return media
			await _navigation.select_route("maps.land")
		"items":
			await _navigation.select_route("economy.items")
	if _operations.requires_reopen: return _activation_failed()
	return {"ok": true}


func _project_became_dirty() -> void:
	_item_editor.show_save_state("Unsaved changes — save this project to keep your edits.", true)
	_set_assets_save_state("Unsaved changes · Save to keep your edits.", true)


func _bind_application_commands() -> void:
	_commands.initialize(_command_bar, _palette, _operations, _document_tabs, _documents)
	_commands.configure_workspace(_navigation, _presentation, _maps, _issues, _preview_workspace, _layout, %ExplorerHost, %InspectorHost, _problem_dock)
	_commands.configure_session(_session_view, _draft_apply, func(): return _bridge, _draft_navigation.request, {
		&"file.new-project": _new_project_dialog.popup_new, &"file.open-project": _show_open_project, &"file.import-scenario": _show_import_scenario, &"file.save": _project_session.save,
		&"file.save-as": _show_save_as_project, &"file.compile-targets": _publishing.show_targets, &"file.close-project": _close_project, &"file.exit": get_tree().quit})
	EditorHelpBinding.bind_commands(_commands, %DivinityCodeHelper, %DivinityManualReader, _command_bar.get_node("RailCap/ProvidenceMark"))
	_commands.status_changed.connect(func(message: String): _status.text = message)
	_commands.history_requested.connect(func(direction: String):
		if direction == "undo": _undo()
		else: _redo())
	_commands.commit_requested.connect(_commit_edit)
