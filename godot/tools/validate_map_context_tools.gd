extends SceneTree

const Target = preload("res://src/map_selection_target.gd")
const Hits = preload("res://src/map_selection_hits.gd")
var _shell: Control
var _checks := 0


func _initialize() -> void:
	create_timer(100).timeout.connect(func(): push_error("Map context checks timed out"); quit(1))
	call_deferred("_run")


func _run() -> void:
	_shell = preload("res://src/editor_shell.tscn").instantiate(); root.add_child(_shell)
	await _shell.startup_completed
	await _settle()
	await _shell._maps.document.load_first()
	await _shell._navigation.select_route("maps.land")
	await _settle()
	_check_hits()
	await _check_chooser()
	_check_dungeon_context()
	await _check_ap_sidebar()
	await _check_flow_window()
	await _capture_ap()
	await _capture_applied_player()
	await _check_windows()
	await _check_regions_and_player()
	await _check_viewports()
	_shell._maps.context_tools.windows.dock_all()
	await _settle()
	_shell._close_project()
	for frame in 12: await process_frame
	await _settle()
	_shell.free(); await process_frame
	print("PROVIDENCE_MAP_CONTEXT_TOOLS_OK checks=%d overlap filters bounds zoom-pan sidebar-steps pinned-editor draft-preserved stable-routes native-window certified-viewports ultrawide" % _checks)
	quit()


func _settle() -> void:
	for frame in range(1800):
		await process_frame
		if not _shell._operations.busy and not _shell._maps.context_tools._reading and not _shell._maps.context_tools._queued:
			await process_frame
			if not _shell._operations.busy: return
	assert(false, "Editor operations did not settle")


func _expect(value: bool, message: String) -> void:
	_checks += 1
	if not value: push_error(message); quit(1)
	assert(value, message)


func _check_hits() -> void:
	var canvas: ProvidenceMapCanvas = _shell._workbenches.land.get_node("%LandMapCanvas")
	var regions: Control = canvas.get_node("RandomRegionOverlay")
	var overlay: Control = canvas.get_node("MapViewOverlay")
	var old_regions: Array = regions.regions.duplicate(true)
	var old_maps: Array = overlay.footprints.duplicate(true)
	regions.regions = [{"identity": "land:0:rect:3", "left": 12, "top": 18, "right": 24, "bottom": 26}]
	regions.display_enabled = true; regions.filter_active = true; regions.visible_ids = {"land:0:rect:3": true}
	overlay.footprints = [{"identity": "player-map:4", "nativeId": 4, "name": "Area map", "left": 10, "top": 15, "right": 26, "bottom": 28}]
	for zoom in [false, true]:
		if zoom: canvas.zoom_in()
		canvas.select_cell(13, 19, false, false)
		var point := canvas.cell_rect(Vector2i(13, 19)).get_center()
		var hits := Hits.collect(canvas, "land:0", Vector2i(13, 19), point, regions, overlay)
		_expect(hits.size() == 2, "Both overlapping overlays must be selectable")
		_expect(hits[0].slot == 3 and hits[1].identity == "player-map:4", "Hit identities must retain their owning slot")
		_expect(not Hits.contains(canvas, canvas.cell_rect(Vector2i(24, 26)).position, regions.regions[0]), "Right and bottom bounds are exclusive")
	regions.visible_ids.clear()
	_expect(Hits.collect(canvas, "land:0", Vector2i(13, 19), canvas.cell_rect(Vector2i(13, 19)).get_center(), regions, overlay).size() == 1, "Individually hidden rectangles must not be selectable")
	overlay.footprints.clear()
	_expect(Hits.collect(canvas, "land:0", Vector2i(13, 19), canvas.cell_rect(Vector2i(13, 19)).get_center(), regions, overlay).is_empty(), "Hidden footprints must not be selectable")
	regions.regions = old_regions; overlay.footprints = old_maps
	regions.display_enabled = false
	var old_points: Array = canvas._action_points.duplicate(true)
	canvas._markers.set_rows([
		{"identity": "action-point:land:0:1", "recordIndex": 1, "coordinate": {"x": 13, "y": 19}},
		{"identity": "action-point:land:0:2", "recordIndex": 2, "coordinate": {"x": 13, "y": 19}},
		{"identity": "action-point:land:0:3", "coordinate": null}])
	var co_located := Hits.collect(canvas, "land:0", Vector2i(13, 19), canvas.cell_rect(Vector2i(13, 19)).get_center(), regions, overlay)
	_expect(co_located.size() == 2, "Co-located APs must both appear in overlap selection")
	_expect(canvas.action_points_at(Vector2i.ZERO).is_empty(), "Unplaced APs must not become a marker at zero")
	canvas._markers.set_rows(old_points)


func _check_chooser() -> void:
	var chooser := preload("res://src/map_selection_chooser.tscn").instantiate()
	root.add_child(chooser)
	var chosen: Array = []
	chooser.chosen.connect(func(target): chosen.append(target))
	var cell := Target.create(Target.Kind.CELL, "", "land:0", Vector2i(5, 6), "Select cell 5,6")
	chooser.present([Target.create(Target.Kind.PLAYER_MAP, "player-map:0", "land:0", cell.cell, "Player Map 0")], cell, Vector2i(200, 200))
	_expect(chooser.get_node("%Candidates").item_count == 2, "Overlap chooser must retain a cell escape")
	chooser.get_node("%Candidates").item_activated.emit(1)
	_expect(chosen.size() == 1 and chosen[0] == cell, "Keyboard activation must choose the exact cell target")
	chooser.present([], cell, Vector2i(200, 200)); chooser.get_node("%CancelSelection").pressed.emit()
	_expect(chosen.size() == 1 and not chooser.visible, "Cancel must leave selection unchanged")
	for frame in 4: await process_frame
	var many: Array = []
	for index in 12: many.append(Target.create(Target.Kind.PLAYER_MAP, "player-map:%d" % index, "land:0", cell.cell, "Player Map %d\nOverlapping map" % index))
	chooser.present(many, cell, Vector2i(200, 200))
	for frame in 4: await process_frame
	var candidates: Control = chooser.get_node("%Candidates")
	var down := InputEventKey.new(); down.pressed = true; down.keycode = KEY_DOWN
	for index in 10: candidates._input_candidate(down, index)
	for frame in 4: await process_frame
	_expect(candidates.get_selected_items()[0] == 10 and chooser.get_node("%Scroll").scroll_vertical > 0, "Keyboard navigation must scroll hidden overlapping candidates into view")
	var enter := InputEventKey.new(); enter.pressed = true; enter.keycode = KEY_ENTER
	candidates._input_candidate(enter, 10)
	_expect(chosen.size() == 2 and chosen[1] == many[10], "Enter must select the focused record after scrolling: %s" % str(chosen.map(func(target): return target.identity)))
	chooser.free()


func _check_dungeon_context() -> void:
	var panel := preload("res://src/map_record_sidebar.tscn").instantiate(); root.add_child(panel)
	panel.loading("action-point:dungeon:0:1", true)
	panel.present_ap({"actionPoint": {"levelType": "dungeon", "recordIndex": 1, "postActionLevel": 2}, "steps": []}, {})
	_expect(panel.get_node("%RecordDetails").text.begins_with("After script: dungeon 2"), "Dungeon AP destinations must retain their map type")
	panel.free()


func _check_ap_sidebar() -> void:
	var maps = _shell._maps
	var canvas: ProvidenceMapCanvas = _shell._workbenches.land.get_node("%LandMapCanvas")
	var records: Dictionary = await _shell._operations.run_workflow(_shell._bridge, "Read AP fixture", func(operation):
		return await operation.request("action-point.list", {"mapIdentity": maps.document.identity, "limit": 128}))
	var points: Array = records.result.items
	_expect(not points.is_empty(), "Demo must retain an AP fixture")
	var point: Dictionary = points[0]
	for candidate: Dictionary in points:
		if int(candidate.get("recordIndex", -1)) == 63: point = candidate; break
	var coordinate: Dictionary = {"x": 10, "y": 10}
	var target := Target.create(Target.Kind.ACTION_POINT, str(point.identity), maps.document.identity, Vector2i(coordinate.x, coordinate.y), "AP")
	maps.context_tools._choose(target); await _settle()
	var panel: Control = maps.context_tools._panels.ap
	_expect(panel.get_node("%StepList").item_count == 8, "AP sidebar must show all eight ordered slots")
	await maps.context_tools._edit(3, true, "ap"); await _settle()
	var editor: Control = _shell._documents.view("scripts.action-points")
	_expect(int(editor.read_state().step.selectedSlot) == 3, "Edit step must open the exact semantic slot")
	_expect(maps.context_tools.windows.is_detached("ap"), "AP editor must open in a native window")
	_expect(editor.draft_error().is_empty(), "Moving the AP editor must resume its current semantic form")
	var list: ProvidenceActionStepList = editor.get_node("%SemanticActionSteps").get_node("%SemanticStepList")
	var sidebar: ProvidenceActionStepList = panel.get_node("%StepList")
	for slot in range(8):
		_expect(sidebar._items[slot].get_meta("base_text") == list._items[slot].get_meta("base_text"), "Sidebar and Scripts step labels must match")
		_expect(sidebar.item_semantic_color(slot) == list.item_semantic_color(slot), "Sidebar and Scripts step colors must match")
	canvas.set_interaction_mode("pan")
	var mouse := InputEventMouseButton.new(); mouse.pressed = true; mouse.button_index = MOUSE_BUTTON_LEFT
	mouse.position = canvas.cell_rect(Vector2i(13, 19)).get_center(); canvas._gui_input(mouse)
	_expect(maps.context_tools.selected == target, "Pan must not select overlay records")
	canvas.set_interaction_mode("select")


func _check_windows() -> void:
	var windows = _shell._maps.context_tools.windows
	var editor: Control = _shell._documents.view("scripts.action-points")
	var tabs: TabContainer = _shell._document_tabs
	var index: int = _shell._documents.tab_for_route("scripts.action-points")
	var count := tabs.get_tab_count()
	var window: Window = editor.get_window()
	windows.detach("ap")
	_expect(editor.get_window() == window and tabs.get_tab_count() == count, "Repeated detach must reuse one editor window")
	_expect(_shell._documents.tab_for_route("scripts.action-points") == index, "Detached route must retain its tab identity")
	var descriptor := editor.get_node("%ActionPointDescriptor") as LineEdit
	var original := descriptor.text
	descriptor.text = "Retained detached draft"
	_expect(editor.has_unapplied_changes(), "Detached edit must remain a draft")
	_expect(_shell._draft_apply.has_any_draft(), "Global guards must include detached drafts")
	_shell._maps.context_tools._update_draft_status()
	_expect(_shell._maps.context_tools._panels.ap.get_node("%DraftStatus").visible, "The selected sidebar must identify the existing editor draft")
	await _capture("ap-draft-sidebar", root, true)
	var state: Dictionary = editor.read_navigation_state()
	windows.dock("ap"); await process_frame
	_expect(editor.read_navigation_state() == state, "Closing the tool window must preserve its draft and step")
	_expect(editor.get_parent() == tabs and tabs.get_tab_count() == count, "Dock must restore the existing editor to its exact slot")
	descriptor.text = original; editor.discard_draft()
	windows.detach("ap"); await process_frame
	var selected: ProvidenceMapSelectionTarget = _shell._maps.context_tools.selected
	await _shell._maps.context_tools._choose(Target.create(Target.Kind.CELL, "", selected.map_identity, Vector2i(1, 1), "Cell"))
	_expect(str(editor.read_state().identity) == selected.identity, "Ordinary map selection must keep a detached editor pinned")
	windows.dock("ap")


func _check_flow_window() -> void:
	var selected: ProvidenceMapSelectionTarget = _shell._maps.context_tools.selected
	await _shell._commands._open_authoring_links("flow", _shell._documents.view("scripts.action-points"), "scripts.action-points")
	await _settle()
	var view: Window = _shell._commands._discovery.flow.view
	_expect(view.visible and view.force_native and not view.exclusive and not view.transient, "View Flow must be an independent nonmodal native window")
	if DisplayServer.get_name() != "headless":
		_expect(view.get_window_id() != root.get_window_id(), "Flow must own a separate native window handle")
	var location := view.position
	view.present()
	_expect(view.position == location, "Reopening Flow must preserve the existing window position")
	root.grab_focus()
	_expect(view.visible and view.model.root.identity == selected.identity, "Main-window focus must leave the applied Flow view open")
	await _capture("flow-window", view, false)
	view.close_view()
	_expect(not view.visible, "Closing Flow must hide its window without closing the project")


func _check_regions_and_player() -> void:
	var maps = _shell._maps
	var project := OS.get_environment("PROVIDENCE_CONTEXT_TEST_PROJECT")
	_expect(not project.is_empty(), "The runner must supply an owned disposable project root")
	await _shell._project_session.create_project("map-context-check", project); await _settle()
	var existing: Array = maps.document.maps.map(func(row): return str(row.identity))
	var created: Dictionary = await _shell._operations.run_workflow(_shell._bridge, "Create map fixture", func(operation):
		return await operation.request("map.create", {"expectedRevision": _shell._session_view.revision, "levelType": "land"}))
	_expect(created.get("ok", false), "New map fixture must open: " + str(created))
	_shell._session_view.apply(created.result)
	await maps.document.reload_catalog()
	var fresh: Array = maps.document.maps.filter(func(row): return str(row.identity) not in existing)
	_expect(fresh.size() == 1, "Create must yield exactly one new map")
	await maps.document.load_map(str(fresh[0].identity)); await _settle()
	var response: Dictionary = await _shell._operations.run_workflow(_shell._bridge, "Test rectangle", func(operation):
		return await operation.request("random-region.apply", {"mapIdentity": maps.document.identity, "expectedRevision": _shell._session_view.revision,
			"region": {"identity": maps.document.identity + ":rect:3", "left": 12, "top": 18, "right": 24, "bottom": 26,
			"chanceTenThousand": 0, "battleRange": [0, 0], "randomDoors": [0, 0, 0], "randomDoorPercent": [0, 0, 0], "only": false, "option": 0, "soundId": 0, "textId": 0}}))
	_expect(response.get("ok", false), "Rectangle fixture must be accepted by native core: " + str(response))
	_shell._session_view.apply(response.result)
	await _settle()
	var target := Target.create(Target.Kind.RANDOM_RECTANGLE, maps.document.identity + ":rect:3", maps.document.identity, Vector2i(13, 19), "Rectangle 3", 3)
	await maps.context_tools._choose(target); await _settle()
	_expect(maps.regions.active and maps.regions.view.slot == 3, "Overlay selection must activate exact Random Rectangle sidebar slot")
	maps.context_tools._detach_region(); await _settle()
	_expect(maps.context_tools.windows.is_detached("region"), "Random Rectangle editor must detach")
	_expect(maps.regions.view.is_visible_in_tree(), "Changing the main sidebar must not hide the detached region editor")
	await _capture("fresh-region-window", maps.regions.view.get_window(), false)
	await _check_region_ownership()
	maps.context_tools.windows.dock("region")
	_expect(maps.chrome.land_inspector._current == "regions" and maps.regions.view.is_visible_in_tree(), "Docking the selected rectangle must restore its sidebar")
	maps.regions.close()
	var page: Dictionary = await _shell._operations.run_workflow(_shell._bridge, "Read Player Maps", func(operation): return await operation.request("player-map.list", {}))
	_expect(page.get("ok", false), "Player Map catalog must remain available")
	if page.result.records.is_empty():
		_shell._documents.view("player-maps.map-records")  # Its commands bind with the page.
		await _shell._workbenches.player_map_commands.reload()
		await _shell._workbenches.player_map_commands.create_record(); await _settle()
		page = await _shell._operations.run_workflow(_shell._bridge, "Read created Player Map", func(operation): return await operation.request("player-map.list", {}))
	var id := str(page.result.records[0].identity)
	maps.context_tools._choose(Target.create(Target.Kind.PLAYER_MAP, id, maps.document.identity, Vector2i(0, 0), "Player Map")); await _settle()
	_expect(maps.context_tools._panels.player.get_node("%Title").text.begins_with("PLAYER MAP"), "Player Map selection must present its dedicated sidebar")
	await maps.context_tools._edit(0, true, "player"); await _settle()
	_expect(maps.context_tools.windows.is_detached("player"), "Player Map full editor must detach")
	await _capture("player-window", _shell._documents.view("player-maps.map-records").get_window(), false)
	await _capture("player-sidebar", root, true)
	var retained: ProvidenceMapSelectionTarget = maps.context_tools.selected
	maps.context_tools._choose(retained); maps.context_tools.clear(); await _settle()
	_expect(maps.context_tools.selected == null, "A late sidebar response must not restore a cleared selection")
	maps.context_tools.windows.dock("player")


func _check_region_ownership() -> void:
	var maps = _shell._maps
	var regions = maps.regions
	await maps.chrome._accept_pane("Selection Inspector")
	_expect(regions.active and regions.view.is_visible_in_tree(), "Changing inspector must preserve the pinned rectangle editor")
	regions.view.get_node("%RegionLeft").value += 1
	await _settle()
	var draft: Dictionary = regions.view.draft.duplicate(true)
	var identity: String = maps.document.identity
	maps.document.identity = "land:999"
	regions._document_opened({"identity": "land:999"}, false)
	regions.view.set_loading(true); regions.view.set_loading(false)
	_expect(regions.view.get_node("%DrawRegion").disabled and regions.view.get_node("%RevealRegion").disabled, "Pinned rectangle map actions must stay disabled off its owning map")
	_expect(regions._overlay == null and regions.view.draft == draft, "Changing maps must preserve the draft without retaining a stale drawing surface")
	maps.document.identity = identity
	regions._document_opened({"identity": identity}, false)
	_expect(regions._overlay != null and not regions.view.get_node("%DrawRegion").disabled and regions.view.draft == draft, "Returning to the owning map must rebind drawing without replacing its draft")
	regions.discard_draft(); await _settle()


func _check_viewports() -> void:
	for viewport in [Vector2i(1600, 900), Vector2i(1920, 1080), Vector2i(3440, 1392)]:
		root.size = viewport
		await process_frame; await process_frame
		var panel: Control = _shell._maps.context_tools._panels.player
		_expect(panel.size.x >= 320 and panel.size.x < viewport.x, "Sidebar must preserve a readable preview at each supported size")


func _capture_ap() -> void:
	if OS.get_environment("PROVIDENCE_CONTEXT_CAPTURE_ROOT").is_empty(): return
	for viewport in [Vector2i(1600, 900), Vector2i(1920, 1080)]:
		root.size = viewport
		await _capture("ap-sidebar-%dx%d" % [viewport.x, viewport.y], root, true)
	var editor: Control = _shell._documents.view("scripts.action-points")
	var navigation: Dictionary = editor.read_navigation_state()
	editor.restore_navigation_state({"step": {"selectedSlot": 0}}); await _settle()
	await _capture("ap-window", editor.get_window(), false)
	editor.restore_navigation_state(navigation); await _settle()


func _capture_applied_player() -> void:
	if OS.get_environment("PROVIDENCE_CONTEXT_CAPTURE_ROOT").is_empty(): return
	var page: Dictionary = await _shell._operations.run_workflow(_shell._bridge, "Read applied Player Maps", func(operation): return await operation.request("player-map.list", {}))
	if page.result.records.is_empty(): return
	var previous: ProvidenceMapSelectionTarget = _shell._maps.context_tools.selected
	var id := str(page.result.records[0].identity)
	_shell._maps.context_tools._choose(Target.create(Target.Kind.PLAYER_MAP, id, previous.map_identity, Vector2i.ZERO, "Player Map")); await _settle()
	await _capture("applied-player-sidebar", root, true)
	await _capture_overlap_chooser()
	for viewport in [Vector2i(1600, 900), Vector2i(1920, 1080)]:
		root.size = viewport
		await _capture("player-sidebar-%dx%d" % [viewport.x, viewport.y], root, true)
	await _shell._workbenches.player_map_commands.reload(null, id); await _settle()
	await _shell._maps.context_tools._edit(0, true, "player"); await _settle()
	await _capture("applied-player-window", _shell._documents.view("player-maps.map-records").get_window(), false)
	_shell._maps.context_tools.windows.dock("player")
	await _capture_applied_region(previous)
	_shell._maps.context_tools._choose(previous); await _settle()


func _capture_applied_region(previous: ProvidenceMapSelectionTarget) -> void:
	var opened: Dictionary = await _shell._operations.run_workflow(_shell._bridge, "Read applied rectangle", func(operation):
		return await operation.request("random-region.open", {"mapIdentity": previous.map_identity, "slot": 1}))
	if not opened.get("ok", false) or not opened.result.get("region") is Dictionary: return
	var region: Dictionary = opened.result.region
	var target := Target.create(Target.Kind.RANDOM_RECTANGLE, str(region.identity), previous.map_identity, Vector2i(region.left, region.top), "Rectangle 1", 1)
	await _shell._maps.context_tools._choose(target); await _settle()
	await _capture("applied-region-sidebar", root, true)
	for viewport in [Vector2i(1600, 900), Vector2i(1920, 1080)]:
		root.size = viewport
		await _capture("region-sidebar-%dx%d" % [viewport.x, viewport.y], root, true)
	var toggle: Button = _shell._maps.regions.view.get_node("%AdvancedToggle")
	toggle.button_pressed = true
	_expect(_shell._maps.regions.view.get_node("%RegionOption").is_visible_in_tree(), "Rectangle advanced fields must expose the original Option")
	for index in 3:
		_expect(_shell._maps.regions.view.get_node("%Door" + str(index)).is_visible_in_tree(), "All three XAP call fields must remain accessible")
	await _capture("region-advanced-sidebar", root, true)
	toggle.button_pressed = false
	_shell._maps.context_tools._detach_region(); await _settle()
	await _capture("region-window", _shell._maps.regions.view.get_window(), false)
	_shell._maps.context_tools.windows.dock("region"); _shell._maps.regions.close()


func _capture_overlap_chooser() -> void:
	var canvas: ProvidenceMapCanvas = _shell._workbenches.land.get_node("%LandMapCanvas")
	var regions: Control = canvas.get_node("RandomRegionOverlay")
	var overlay: Control = canvas.get_node("MapViewOverlay")
	var panel: Control = _shell._maps.context_tools._panels.player
	var record: Dictionary = panel._document
	var preview: Dictionary = panel.get_node("%PlayerPreview").projection
	if not str(preview.get("mode", "")).ends_with("crop") or int(preview.get("columns", 0)) == 0: return
	var old: Array = overlay.footprints.duplicate(true)
	var enabled: bool = regions.display_enabled
	var filtered: bool = regions.filter_active
	regions.display_enabled = true; regions.filter_active = false
	overlay.footprints = [{"identity": record.identity, "nativeId": record.nativeId, "name": panel._names.get("effectiveName", ""), "left": record.startX, "top": record.startY, "right": int(record.startX) + int(preview.columns), "bottom": int(record.startY) + preview.cells.size() / int(preview.columns)}]
	var cell := Vector2i(52, 64)
	var point := canvas.cell_rect(cell).get_center()
	var hits := Hits.collect(canvas, _shell._maps.document.identity, cell, point, regions, overlay)
	var chooser: PopupPanel = _shell._maps.context_tools._chooser
	chooser.present(hits, Target.create(Target.Kind.CELL, "", _shell._maps.document.identity, cell, "Select cell 52,64"), Vector2i(500, 250))
	await _capture("overlap-chooser", chooser, false)
	chooser.hide(); overlay.footprints = old; regions.display_enabled = enabled; regions.filter_active = filtered


func _capture(label: String, window: Window, sidebar: bool) -> void:
	var directory := OS.get_environment("PROVIDENCE_CONTEXT_CAPTURE_ROOT")
	if directory.is_empty(): return
	for frame in 6: await process_frame
	await RenderingServer.frame_post_draw
	var image: Image = window.get_texture().get_image()
	if sidebar:
		var inspector := _shell._maps.chrome.land_inspector as Control
		var area := Rect2i(inspector.get_global_rect()).intersection(Rect2i(Vector2i.ZERO, image.get_size()))
		if area.size.x > 0 and area.size.y > 0: image = image.get_region(area)
	_expect(image.save_png(directory.path_join(label + ".png")) == OK, "Native review capture must be written")
