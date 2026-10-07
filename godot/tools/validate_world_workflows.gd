extends SceneTree

class CheckedShell extends "res://src/editor_shell.gd":
	var reported_errors: Array[String] = []
	func _show_error(message: String) -> void:
		reported_errors.append(message)
		_status.text = message
		_status.add_theme_color_override("font_color", Color("f09a82"))
		if not message in ["Controlled transport refusal before submission", "Test transport dropped the original reply",
			"The connection was lost while reading. Your feature draft is kept; Apply was not submitted. Reconcile to continue.",
			"Apply is confirmed. Reconcile to refresh the view; the write will not be repeated.",
			"Layout Apply is confirmed. Reconcile to refresh the view; the write will not be repeated.",
			"Level settings Apply is confirmed. Reconcile to refresh the view; the write will not be repeated."]: push_error(message)

class Bridge extends "res://src/native_bridge.gd":
	var calls: Array = []
	var last_feature_apply: Dictionary = {}
	var drop_method := ""
	var reject_method := ""
	var advance_before_apply := false
	var feature_writes := 0
	var layout_writes := 0
	var settings_writes := 0
	var region_writes := 0
	func _request(method: String, params: Dictionary) -> Dictionary:
		calls.append(method)
		if method == "dungeon-cell.apply-features": last_feature_apply = params.duplicate(true)
		if method == reject_method:
			reject_method = ""
			return {"ok": false, "error": "Controlled transport refusal before submission"}
		if method in ["dungeon-cell.apply-features", "land-layout.apply-cell", "level-settings.apply", "random-region.apply"] and advance_before_apply:
			advance_before_apply = false
			var other: Dictionary = super._request("map.update-cell", {"identity": "land:0", "expectedRevision": params.expectedRevision, "x": 88, "y": 88, "tile": 14})
			assert(other.ok)
		var response: Dictionary = super._request(method, params)
		if method == "dungeon-cell.apply-features" and response.get("ok", false): feature_writes += 1
		if method == "land-layout.apply-cell" and response.get("ok", false): layout_writes += 1
		if method == "level-settings.apply" and response.get("ok", false): settings_writes += 1
		if method in ["random-region.apply", "random-region.clear"] and response.get("ok", false): region_writes += 1
		if method == drop_method:
			drop_method = ""
			return {"ok": false, "outcomeUnknown": true, "error": "Test transport dropped the original reply"}
		return response

var _shell: Control
var _stage := "startup"
var _stage_path := ""


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	assert(args.size() == 1 and args[0].get_file().begins_with("providence-ui-world-"))
	_stage_path = args[0].path_join("workflow-stage.log")
	# The connected journey includes adapter-backed map previews alongside writes.
	create_timer(90).timeout.connect(func():
		push_error("World workflow timed out at " + _stage)
		if is_instance_valid(_shell): _shell.free()
		quit(1))
	var previous := OS.get_environment("PROVIDENCE_PROJECT_PATH")
	root.size=Vector2i(1600,900); root.content_scale_size=root.size; root.gui_embed_subwindows=true
	OS.set_environment("PROVIDENCE_PROJECT_PATH", "")
	_shell = load("res://src/editor_shell.tscn").instantiate()
	_shell.set_script(CheckedShell)
	root.add_child(_shell)
	await process_frame
	_shell._bridge.stop()
	_shell._bridge = Bridge.new(args[0].path_join("settings.cfg"))
	_checkpoint("create project")
	await _shell._project_session.create_project("world-workflows", args[0].path_join("project"))
	for path in ["MapSectionTabs/RandomEncountersSection", "MapViewFilters/MapOverlayButton", "PaintTools/SmartTerrain", "PaintSelectionContext/CellDetails"]:
		assert(_shell._workbenches.land.get_node(path).disabled)
	assert(_shell._maps.paint.workspace.tiles_dock.ui.customization.disabled and _shell._maps.paint.workspace.tiles_dock.ui.special.disabled)
	_checkpoint("map lifecycle")
	await _map_lifecycle()
	_checkpoint("layout")
	await _land_layout()
	_checkpoint("layout recovery")
	await _layout_recovery()
	_checkpoint("level settings")
	await _level_settings()
	_checkpoint("level settings recovery")
	await _level_settings_recovery()
	_checkpoint("Dungeon feature draft")
	await _dungeon_cells()
	_checkpoint("Dungeon drawing")
	await _dungeon_drawing()
	_checkpoint("Dungeon region selection")
	await _dungeon_region_selection()
	_checkpoint("Dungeon retained drafts and recovery")
	await _dungeon_recovery()
	assert(_shell.reported_errors.size() == 14)
	_checkpoint("encounter regions")
	await preload("res://tools/world_region_journey.gd").new().run(_shell)
	assert(_shell.reported_errors.size() == 17)
	_checkpoint("Player Map anchor")
	await _player_maps(args[0])
	_checkpoint("Save/reopen")
	await _save_and_reopen(args[0].path_join("project"))
	await preload("res://tools/world_region_journey.gd").new().verify_reopened(_shell)
	_shell.free()
	OS.set_environment("PROVIDENCE_PROJECT_PATH", previous)
	await process_frame
	print("PROVIDENCE_WORLD_WORKFLOWS_OK native-map-create-duplicate draft-guard layout-reviewed-relocation layout-recovery level-settings local-preview random-regions spatial-draft contextual-pickers region-recovery dungeon-atomic-feature-draft dungeon-drawing mixed-region preserved-untouched-features operation-receipt rejected-write dropped-ack no-replay rebase-read-only player-map-atomic apply undo redo clear selection-pan-zoom visible-before-release bounded-requests save-reopen")
	quit()


func _save_and_reopen(project_path: String) -> void:
	await _shell._project_session.save()
	await _shell._project_session.open_project(project_path)
	await _shell._navigation.select_route("player-maps.map-records")
	assert(_shell._workbenches.player_maps.current_player_map().note == "The bridge is open.")
	assert(_shell._workbenches.player_maps.get_node("%AvailableName").text == "North Bridge")
	await _shell._navigation.select_route("maps.layout")
	assert(_cell(19).identity == "land:1")
	await _shell._navigation.open_map("land:0")
	await _shell._maps.settings.open()
	assert(_shell._maps.settings.view.get_node("%SettingsName").text == "North Bridge" and _shell._maps.settings.view.get_node("%SettingsDark").button_pressed)
	_shell._maps.settings.view.close()
	await _shell._navigation.open_map("dungeon:0")
	_checkpoint("reopened Dungeon")
	await _shell._workbenches.dungeon_cells.open_cell(3, 4)
	assert(_shell._workbenches.dungeon.draft.features.wall == false)
	assert(_shell._workbenches.dungeon.draft.features.stairs == true)


func _cell(index: int) -> Dictionary:
	return _shell._workbenches.land_layout.get_node("%LayoutGrid").cells[index]


func _map_lifecycle() -> void:
	await _shell._navigation.create_map("land")
	assert(_shell._maps.lifecycle.view.visible and _shell._maps.document.maps.is_empty())
	_shell._maps.lifecycle.view.cancel()
	assert(_shell._maps.document.maps.is_empty())
	await _shell._navigation.create_map("land")
	assert((await _shell._maps.lifecycle.apply_review()).ok)
	assert(_shell._maps.document.identity == "land:0" and not _shell._operations.busy)
	assert(not _shell._workbenches.land.get_node("MapSectionTabs/RandomEncountersSection").disabled)
	assert(not _shell._maps.paint.workspace.tiles_dock.ui.customization.disabled and not _shell._maps.paint.workspace.tiles_dock.ui.special.disabled)
	_shell._workbenches.land.select_cell(3,4)
	assert(not _shell._workbenches.land.get_node("PaintSelectionContext/CellDetails").disabled)
	_shell._maps.document.select_cell(3, 4, 156, {})
	_shell._map_inspector.set_tile_value(9)
	await _shell._maps.paint.commit_cell()
	assert(_shell._maps.document.original_tile == 9)
	_shell._map_inspector.set_tile_value(10)
	var revision: int = _shell._session_view.revision
	await _shell._navigation.duplicate_map("land:0")
	assert(_shell._unapplied_dialog.visible and _shell._session_view.revision == revision)
	_shell._draft_navigation.discard_and_continue(&"discard")
	while _shell._operations.busy: await process_frame
	assert(_shell._maps.lifecycle.view.visible and _shell._session_view.revision == revision)
	assert((await _shell._maps.lifecycle.apply_review()).ok)
	assert(_shell._maps.document.identity == "land:1" and _shell._session_view.revision == revision + 1)
	await _shell._undo()
	assert(_shell._maps.document.identity == "land:0" and _shell._maps.document.maps.size() == 1)
	await _shell._redo()
	assert(_shell._maps.document.maps.size() == 2)


func _land_layout() -> void:
	await _shell._navigation.select_route("maps.layout")
	var view: Control = _shell._workbenches.land_layout
	var commands: RefCounted = _shell._workbenches.layout_commands
	var review: Window = view.get_node("%LayoutPlacementReview")
	view.get_node("%LandMapPalette").select(1)
	_shell._workbenches.land_layout.get_node("%LayoutGrid").cell_selected.emit(1,3)
	var revision: int = _shell._session_view.revision
	await commands.set_cell(1, 3, "land:1")
	assert(review.visible and _cell(19).identity.is_empty() and _shell._session_view.revision == revision)
	review.cancel()
	assert(not view.has_unapplied_changes() and _shell._session_view.revision == revision)
	await commands.set_cell(1, 3, "land:1")
	assert((await commands.apply_review()).ok)
	assert(_cell(19).identity == "land:1")
	await _shell._undo()
	assert(_cell(19).identity.is_empty())
	await _shell._redo()
	assert(_cell(19).identity == "land:1")
	assert(view.get_node("%LandMapPalette").get_selected_items()[0] == 1)
	await commands.set_cell(1, 3, "land:1")
	assert(review.get_node("%AcceptPlacement").disabled and not view.has_unapplied_changes())
	review.cancel()
	await commands.set_cell(2, 4, "land:1")
	assert(review.get_node("%ChangedLocations").item_count == 2 and _cell(19).identity == "land:1" and _cell(36).identity.is_empty())
	review.cancel()
	assert(_cell(19).identity == "land:1")
	await commands.set_cell(2, 4, "land:1")
	assert((await commands.apply_review()).ok)
	assert(_cell(19).identity.is_empty() and _cell(36).identity == "land:1")
	await _shell._undo()
	assert(_cell(19).identity == "land:1" and _cell(36).identity.is_empty())
	await commands.remove()
	assert(_cell(19).identity.is_empty())
	_shell._bridge.calls.clear()
	await _shell._undo()
	assert(_cell(19).identity == "land:1" and not _shell._operations.busy)
	assert(_shell._bridge.calls.slice(0,2) == ["history.undo", "land-layout.open"])
	assert(_shell._bridge.calls.slice(2).all(func(method): return method == "map.thumbnail"))


func _layout_recovery() -> void:
	var view: Control = _shell._workbenches.land_layout
	var commands: RefCounted = _shell._workbenches.layout_commands
	var writes: int = _shell._bridge.layout_writes
	await commands.set_cell(2, 4, "land:1")
	_shell._bridge.reject_method = "land-layout.apply-cell"
	assert(not (await commands.apply_review()).ok)
	assert(view.has_unapplied_changes() and _cell(19).identity == "land:1" and _shell._bridge.layout_writes == writes)
	view.discard_draft()
	assert(not view.has_unapplied_changes())
	await commands.set_cell(2, 4, "land:1")
	_shell._bridge.drop_method = "land-layout.apply-cell"
	assert((await commands.apply_review()).outcomeUnknown)
	assert(view.recovery_button().visible and view.get_node("%PlaceCurrentLand").disabled and _shell._operations.requires_reopen)
	await commands.apply_review()
	assert(_shell._bridge.layout_writes == writes + 1)
	await commands.check_original()
	assert(not view.has_unapplied_changes() and not _shell._operations.requires_reopen and _cell(19).identity.is_empty() and _cell(36).identity == "land:1")
	assert(_shell._bridge.layout_writes == writes + 1)
	await _layout_uncommitted_recovery(view, commands)
	await _layout_read_recovery(view, commands)


func _layout_uncommitted_recovery(view: Control, commands: RefCounted) -> void:
	var writes: int = _shell._bridge.layout_writes
	await commands.set_cell(1, 3, "land:1")
	_shell._bridge.advance_before_apply = true
	_shell._bridge.drop_method = "land-layout.apply-cell"
	assert((await commands.apply_review()).outcomeUnknown)
	assert(_shell._bridge.layout_writes == writes)
	await commands.check_original()
	assert(view.has_unapplied_changes() and not _shell._operations.requires_reopen)
	assert(view.get_node("%LayoutPlacementReview").visible and not view.get_node("%LayoutPlacementReview").get_node("%AcceptPlacement").disabled)
	assert(_cell(36).identity == "land:1" and _shell._bridge.layout_writes == writes)
	assert((await commands.apply_review()).ok)
	assert(_cell(19).identity == "land:1" and _cell(36).identity.is_empty() and _shell._bridge.layout_writes == writes + 1)


func _layout_read_recovery(view: Control, commands: RefCounted) -> void:
	var writes: int = _shell._bridge.layout_writes
	_shell._bridge.drop_method = "land-layout.preview-cell"
	await commands.set_cell(2, 4, "land:1")
	assert(view.recovery_button().visible and _shell._bridge.layout_writes == writes)
	await commands.check_original()
	assert(view.has_unapplied_changes() and view.get_node("%LayoutPlacementReview").visible and _shell._bridge.layout_writes == writes)
	view.discard_draft()
	await commands.set_cell(2, 4, "land:1")
	_shell._bridge.reject_method = "land-layout.open"
	var failed_read: Dictionary = await commands.apply_review()
	assert(not failed_read.ok and failed_read.viewRefreshPending and view.recovery_button().visible)
	assert(_shell._bridge.layout_writes == writes + 1)
	await commands.check_original()
	assert(not view.has_unapplied_changes() and _cell(36).identity == "land:1" and _shell._bridge.layout_writes == writes + 1)
	await _shell._undo()
	assert(_cell(19).identity == "land:1")


func _level_settings() -> void:
	await _shell._navigation.open_map("land:0")
	_shell._documents.view("maps.land").select_cell(3, 4)
	await _shell._maps.settings.open()
	var view: Window = _shell._maps.settings.view
	var revision: int = _shell._session_view.revision
	assert(view.visible and not view.get_node("%SharedEraseTile").editable)
	view.get_node("%SettingsName").text = "North Bridge"
	view.get_node("%SettingsDark").button_pressed = true
	view.get_node("%SettingsLos").button_pressed = true
	assert(view.has_unapplied_changes() and _shell._draft_apply.has_draft() and _shell._session_view.revision == revision)
	view.close()
	await _shell._navigation.select_route("maps.layout")
	assert(_shell._unapplied_dialog.visible and _shell._maps.document.identity == "land:0")
	_shell._unapplied_dialog.canceled.emit()
	_shell._unapplied_dialog.hide()
	await _shell._maps.settings.open()
	assert(view.get_node("%SettingsName").text == "North Bridge")
	view.get_node("%PreviewMode").select(3)
	view.get_node("%PreviewMode").item_selected.emit(3)
	view.get_node("%UseCurrentFocal").pressed.emit()
	assert(_shell._maps.document.preview_control().mode == "both" and _shell._maps.document.preview_control().focal == Vector2i(3, 4))
	assert(_shell._session_view.revision == revision)
	await _level_landlook_picker(view)
	assert((await _shell._maps.settings.review()).ok)
	assert(view.get_node("%SettingsImpact").visible and _shell._session_view.revision == revision)
	view.get_node("%SettingsImpact").cancel()
	assert(view.has_unapplied_changes() and _shell._session_view.revision == revision)
	assert((await _shell._maps.settings.review()).ok)
	assert((await _shell._maps.settings.apply_review()).ok)
	assert(not view.has_unapplied_changes() and _shell._session_view.revision == revision + 1)
	view.close()
	await _shell._undo()
	await _shell._maps.settings.open()
	assert(view.get_node("%SettingsName").text == "Land level 0" and not view.get_node("%SettingsDark").button_pressed)
	view.close()
	await _shell._redo()
	await _shell._maps.settings.open()
	assert(view.get_node("%SettingsName").text == "North Bridge" and view.get_node("%SettingsDark").button_pressed)


func _level_landlook_picker(view: Window) -> void:
	view.get_node("%ChooseLandlook").pressed.emit()
	var picker: Window = view.get_node("%LandlookPicker")
	while _shell._operations.busy: await process_frame
	assert(picker.visible)
	var original: Variant = view.submitted().edit.landlook
	picker.get_node("%LandlookSearch").text = "no such Landlook"
	picker.get_node("%LandlookSearch").text_changed.emit("no such Landlook")
	assert(picker.get_node("%LandlookChoices").item_count == 0 and picker.get_node("%LandlookPreview").texture == null and picker.get_node("%UseLandlook").disabled)
	picker.cancel()
	assert(view.submitted().edit.landlook == original and view.get_node("%SettingsName").text == "North Bridge")
	view.get_node("%ChooseLandlook").pressed.emit()
	while _shell._operations.busy: await process_frame
	if not picker.get_node("%UseLandlook").disabled:
		var enter := InputEventKey.new()
		enter.keycode = KEY_ENTER
		enter.pressed = true
		picker._input(enter)
		assert(not picker.visible and view.submitted().edit.landlook == original)
	else: picker.cancel()


func _level_settings_recovery() -> void:
	var controller: RefCounted = _shell._maps.settings
	var view: Window = controller.view
	var writes: int = _shell._bridge.settings_writes
	view.get_node("%SettingsName").text = "Kept settings draft"
	assert((await controller.review()).ok)
	_shell._bridge.reject_method = "level-settings.apply"
	assert(not (await controller.apply_review()).ok and view.has_unapplied_changes() and _shell._bridge.settings_writes == writes)
	view.get_node("%SettingsImpact").cancel()
	view.discard_draft()
	view.get_node("%SettingsLos").button_pressed = false
	assert((await controller.review()).ok)
	_shell._bridge.drop_method = "level-settings.apply"
	assert((await controller.apply_review()).outcomeUnknown)
	assert(view.get_node("%ReconcileSettings").visible and not view.get_node("%SettingsName").editable)
	view.get_node("%SettingsImpact").cancel()
	view.close()
	assert(_shell._map_context_sidebar.get_node("%ReconcileLevelSettings").visible and controller.has_unapplied_changes())
	await controller.apply_review()
	assert(_shell._bridge.settings_writes == writes + 1)
	await controller.check_original()
	assert(not controller.has_unapplied_changes() and not _shell._operations.requires_reopen and not view.get_node("%SettingsLos").button_pressed)
	assert(_shell._bridge.settings_writes == writes + 1)
	await _level_settings_remaining_recovery(controller, view)
	view.close()


func _level_settings_remaining_recovery(controller: RefCounted, view: Window) -> void:
	var writes: int = _shell._bridge.settings_writes
	view.get_node("%SettingsLos").button_pressed = true
	assert((await controller.review()).ok)
	_shell._bridge.advance_before_apply = true
	_shell._bridge.drop_method = "level-settings.apply"
	assert((await controller.apply_review()).outcomeUnknown and _shell._bridge.settings_writes == writes)
	await controller.check_original()
	assert(controller.has_unapplied_changes() and view.get_node("%SettingsLos").button_pressed and view.get_node("%SettingsName").editable)
	assert((await controller.review()).ok)
	assert((await controller.apply_review()).ok and _shell._bridge.settings_writes == writes + 1)
	view.get_node("%SettingsLos").button_pressed = false
	assert((await controller.review()).ok)
	_shell._bridge.reject_method = "map.open"
	var failed_read: Dictionary = await controller.apply_review()
	assert(failed_read.viewRefreshPending and view.get_node("%ReconcileSettings").visible and _shell._bridge.settings_writes == writes + 2)
	await controller.check_original()
	assert(not controller.has_unapplied_changes() and _shell._bridge.settings_writes == writes + 2)


func _dungeon_cells() -> void:
	await _shell._navigation.create_map("dungeon")
	assert((await _shell._maps.lifecycle.apply_review()).ok)
	assert(_shell._maps.document.identity == "dungeon:0")
	await _shell._workbenches.dungeon_cells.open_cell(3, 4)
	var view: ProvidenceDungeonEditor = _shell._workbenches.dungeon
	var canvas: ProvidenceMapCanvas = view.get_node("%DungeonMapCanvas")
	canvas.zoom_in()
	canvas.reveal_cell(3, 4)
	var zoom := canvas.zoom_percent()
	var pan := canvas.pan_offset()
	var dock: Control = view.get_node("%DungeonFeatureDock")
	var initial_wall: bool = view.draft.features.wall
	var revision: int = _shell._session_view.revision
	dock.field("wall").button_pressed = not initial_wall
	dock.field("stairs").button_pressed = true
	assert(view.has_unapplied_changes() and _shell._session_view.revision == revision)
	assert(_shell._draft_apply.has_draft())
	_checkpoint("Dungeon atomic Apply")
	await view.commit_selected()
	assert(_shell._session_view.revision == revision + 1)
	assert(not view.has_unapplied_changes())
	assert(view.selected_coordinate() == Vector2i(3, 4) and canvas.zoom_percent() == zoom and canvas.pan_offset() == pan)
	assert(view.draft.features.wall != initial_wall and view.draft.features.stairs)
	var receipt: Dictionary = await _shell._operations.run_workflow(_shell._bridge, "Read World operation receipt", func(operation):
		return await operation.request("world.operation.status", {"domain": "project", "operationId": _shell._bridge.last_feature_apply.operationId,
			"expectedIntent": {"method": "dungeon-cell.apply-features", "params": _shell._bridge.last_feature_apply}}))
	assert(receipt.ok and receipt.result.outcome == "committed")
	_checkpoint("Dungeon history")
	await _shell._undo()
	assert(view.draft.features.wall == initial_wall and not view.draft.features.stairs)
	await _shell._redo()
	assert(view.draft.features.wall != initial_wall and view.draft.features.stairs)
	assert(view.selected_coordinate() == Vector2i(3, 4) and canvas.zoom_percent() == zoom and canvas.pan_offset() == pan)


func _player_maps(fixture_root: String) -> void:
	var source := fixture_root.path_join("player-map-source")
	assert(DirAccess.make_dir_recursive_absolute(source) == OK)
	# One controlled Data MD2 row; geometry is owned by classic_player_maps.rs.
	var bytes := PackedByteArray()
	bytes.resize(340)
	var file := FileAccess.open(source.path_join("Data MD2"), FileAccess.WRITE)
	assert(file != null)
	file.store_buffer(bytes)
	file.close()
	assert(_shell._operations.begin(_shell._bridge, "Prepare Player Map fixture"))
	var imported: Dictionary = await _shell._operations.request("project.import-classic-player-maps", {"expectedRevision": _shell._session_view.revision, "directory": source})
	assert(imported.ok)
	_shell._session_view.apply(imported.result)
	_shell._operations.finish(imported)
	await _shell._navigation.select_route("player-maps.map-records")
	var view: ProvidencePlayerMapsEditor = _shell._workbenches.player_maps
	var previous_name: String = view.get_node("%AvailableName").text
	view.get_node("%PlayerMapNote").text = "The bridge is open."
	view.get_node("%AvailableName").text = "North Bridge"
	await view.controller.validate_and_preview()
	assert(not view.get_node("%ApplyPlayerMap").disabled)
	var revision: int = _shell._session_view.revision
	var applied: Dictionary = await _shell._draft_apply.commit()
	assert(applied.ok, JSON.stringify(applied))
	assert(_shell._session_view.revision == revision + 1 and not view.has_unapplied_changes())
	_shell._bridge.calls.clear()
	await _shell._undo()
	assert(view.current_player_map().note == "")
	assert(view.get_node("%AvailableName").text == previous_name)
	for method in ["history.undo", "player-map.list", "player-map.open", "reference.used-by", "player-map.validate"]:
		assert(_shell._bridge.calls.count(method) == 1)
	assert(_shell._bridge.calls.count("player-map.preview") <= 1 and not _shell._bridge.calls.has("player-map.apply-draft"))
	await _shell._redo()
	assert(view.current_player_map().note == "The bridge is open." and view.get_node("%AvailableName").text == "North Bridge")


func _dungeon_drawing() -> void:
	await _shell._navigation.select_route("maps.dungeon")
	await process_frame
	var view: ProvidenceDungeonEditor = _shell._workbenches.dungeon
	var canvas: ProvidenceMapCanvas = view.get_node("%DungeonMapCanvas")
	var preview: Control = view.get_node("%DungeonFeaturePreview")
	var dock: Control = view.get_node("%DungeonFeatureDock")
	view.get_node("%DrawTool").pressed.emit()
	dock.field("wall").button_pressed = false
	dock.field("column").button_pressed = true
	await process_frame
	await process_frame
	var revision: int = _shell._session_view.revision
	_stroke_button(canvas, Vector2i(8, 4), true)
	var motion := InputEventMouseMotion.new()
	motion.position = canvas.cell_rect(Vector2i(10, 4)).get_center()
	motion.button_mask = MOUSE_BUTTON_MASK_LEFT
	canvas._gui_input(motion)
	for _frame in 120:
		if preview.cells.size() == 3: break
		await process_frame
	assert(preview.cells.size() == 3)
	assert(_shell._session_view.revision == revision and not view.has_unapplied_changes())
	_stroke_button(canvas, Vector2i(10, 4), false)
	while _shell._session_view.revision == revision or _shell._operations.busy: await process_frame
	assert(_shell._session_view.revision == revision + 1 and not view.has_unapplied_changes())
	assert(_shell._bridge.last_feature_apply.edit.cells.size() == 3)
	assert(view.draft.features.column and not view.draft.features.wall)
	await _shell._undo()
	assert(not view.draft.features.column and view.draft.features.wall)
	await _shell._redo()
	assert(view.draft.features.column and not view.draft.features.wall)
	revision = _shell._session_view.revision
	await process_frame
	await process_frame
	_stroke_button(canvas, Vector2i(11, 4), true)
	var escape := InputEventKey.new()
	escape.keycode = KEY_ESCAPE
	escape.pressed = true
	canvas._gui_input(escape)
	while _shell._operations.busy: await process_frame
	assert(_shell._session_view.revision == revision and preview.cells.is_empty() and not view.has_unapplied_changes())
	view.get_node("%SelectTool").pressed.emit()


func _stroke_button(canvas: ProvidenceMapCanvas, coordinate: Vector2i, pressed: bool) -> void:
	var event := InputEventMouseButton.new()
	event.button_index = MOUSE_BUTTON_LEFT
	event.pressed = pressed
	event.position = canvas.cell_rect(coordinate).get_center()
	canvas._gui_input(event)


func _dungeon_region_selection() -> void:
	var view: ProvidenceDungeonEditor = _shell._workbenches.dungeon
	var canvas: ProvidenceMapCanvas = view.get_node("%DungeonMapCanvas")
	var dock: Control = view.get_node("%DungeonFeatureDock")
	view.get_node("%SelectionShape").item_selected.emit(1)
	await process_frame
	await process_frame
	var revision: int = _shell._session_view.revision
	_stroke_button(canvas, Vector2i(10, 4), true)
	var motion := InputEventMouseMotion.new()
	motion.position = canvas.cell_rect(Vector2i(12, 6)).get_center()
	motion.button_mask = MOUSE_BUTTON_MASK_LEFT
	canvas._gui_input(motion)
	_stroke_button(canvas, Vector2i(12, 6), false)
	for _frame in 180:
		if view.draft.cells.size() == 9 and not _shell._operations.busy: break
		await process_frame
	assert(view.draft.cells.size() == 9 and view.draft.features.wall == null and view.draft.features.column == null)
	assert(_shell._session_view.revision == revision and not view.has_unapplied_changes())
	dock.field("stairs").button_pressed = true
	await view.commit_selected()
	assert(_shell._session_view.revision == revision + 1 and view.draft.cells.size() == 9)
	assert(view.draft.features.stairs and view.draft.features.wall == null and view.draft.features.column == null)
	await _shell._undo()
	assert(not view.draft.features.stairs and view.draft.features.wall == null and view.draft.cells.size() == 9)
	await _shell._redo()
	assert(view.draft.features.stairs and view.draft.features.wall == null)
	dock.field("no-wall-in-battle").button_pressed = true
	view.get_node("%SelectionShape").item_selected.emit(2)
	assert(view.get_node("%DungeonDraftGuard").visible and view.has_unapplied_changes())
	view.get_node("%DungeonDraftGuard").canceled.emit()
	view.get_node("%DungeonDraftGuard").hide()
	assert(view.draft.cells.size() == 9 and view.get_node("%SelectionShape").selected == 1)
	view.discard_draft()
	assert(not view.has_unapplied_changes() and not view.draft.features["no-wall-in-battle"])


func _dungeon_recovery() -> void:
	var view: ProvidenceDungeonEditor = _shell._workbenches.dungeon
	var field: CheckBox = view.get_node("%DungeonFeatureDock").field("no-wall-in-battle")
	var writes: int = _shell._bridge.feature_writes
	field.button_pressed = true
	_shell._bridge.reject_method = "dungeon-cell.apply-features"
	var rejected: Dictionary = await view.commit_selected()
	assert(not rejected.ok and view.has_unapplied_changes() and not view.recovery_button().visible)
	assert(_shell._bridge.feature_writes == writes)
	view.discard_draft()
	assert(not field.button_pressed and not view.has_unapplied_changes())
	field.button_pressed = true
	_shell._bridge.drop_method = "dungeon-cell.apply-features"
	var unknown: Dictionary = await view.commit_selected()
	assert(unknown.outcomeUnknown and field.disabled and view.recovery_button().visible)
	assert(_shell._operations.requires_reopen and _shell._bridge.feature_writes == writes + 1)
	await view.commit_selected()
	assert(_shell._bridge.feature_writes == writes + 1)
	await _shell._workbenches.dungeon_cells.check_original()
	assert(not view.has_unapplied_changes() and field.button_pressed and not _shell._operations.requires_reopen)
	assert(_shell._bridge.feature_writes == writes + 1)
	await _dungeon_uncommitted_recovery(view, field)
	await _dungeon_read_recovery(view, field)


func _dungeon_uncommitted_recovery(view: ProvidenceDungeonEditor, field: CheckBox) -> void:
	var writes: int = _shell._bridge.feature_writes
	field.button_pressed = false
	_shell._bridge.advance_before_apply = true
	_shell._bridge.drop_method = "dungeon-cell.apply-features"
	var unknown: Dictionary = await view.commit_selected()
	assert(unknown.outcomeUnknown and _shell._bridge.feature_writes == writes)
	await _shell._workbenches.dungeon_cells.check_original()
	assert(view.has_unapplied_changes() and not field.button_pressed and not field.disabled)
	assert(not _shell._operations.requires_reopen and _shell._bridge.feature_writes == writes)
	var accepted: Dictionary = await view.commit_selected()
	assert(accepted.ok and not view.has_unapplied_changes() and _shell._bridge.feature_writes == writes + 1)


func _dungeon_read_recovery(view: ProvidenceDungeonEditor, field: CheckBox) -> void:
	var writes: int = _shell._bridge.feature_writes
	field.button_pressed = true
	_shell._bridge.drop_method = "dungeon-cell.preview-features"
	var unknown: Dictionary = await view.commit_selected()
	assert(unknown.outcomeUnknown and view.recovery_button().visible and _shell._bridge.feature_writes == writes)
	await _shell._workbenches.dungeon_cells.check_original()
	assert(view.has_unapplied_changes() and not field.disabled and _shell._bridge.feature_writes == writes)
	view.discard_draft()
	assert(not field.button_pressed)
	field.button_pressed = true
	_shell._bridge.reject_method = "dungeon-cell.selection"
	var failed_read: Dictionary = await view.commit_selected()
	assert(not failed_read.ok and failed_read.viewRefreshPending and view.recovery_button().visible)
	assert(field.disabled and _shell._bridge.feature_writes == writes + 1)
	await _shell._workbenches.dungeon_cells.check_original()
	assert(not view.has_unapplied_changes() and field.button_pressed and _shell._bridge.feature_writes == writes + 1)


func _checkpoint(value: String) -> void:
	_stage = value
	print("WORLD_STAGE ", value, " elapsedMs=", Time.get_ticks_msec())
	var output := FileAccess.open(_stage_path, FileAccess.WRITE)
	if output != null: output.store_string(value)
