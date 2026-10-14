extends SceneTree

const Presentation = preload("res://src/action_point_activation_presentation.gd")
var _shell: Control
var _editor: Control
var _checks := 0
var _identity := ""
var _map := "land:0"


func _initialize() -> void:
	create_timer(160).timeout.connect(func(): push_error("AP activation checks timed out"); quit(1))
	call_deferred("_run")


func _run() -> void:
	_shell = preload("res://src/editor_shell.tscn").instantiate(); root.add_child(_shell)
	await _shell.startup_completed
	await _settle()
	await _shell._maps.document.load_map(_map)
	await _shell._navigation.select_route("maps.land")
	await _settle()
	var page := await _request("action-point.list", {"mapIdentity": _map, "filter": "current-map", "limit": 128})
	_expect(page.ok, "Read populated AP catalog")
	var rows: Array = page.result.items
	for row: Dictionary in rows:
		if int(row.recordIndex) == 63: _identity = str(row.identity)
	_expect(not _identity.is_empty(), "Pinned Castle AP 63 exists")
	_editor = _shell._documents.view("scripts.action-points")
	await _shell._scripts.reload_action_points_for_map(_map)
	await _shell._scripts.open_action_point(_identity)
	await _settle()
	_expect(_editor.selected_identity() == _identity, "Open exact AP")
	var original := await _request("action-point.open", {"identity": _identity})
	_expect(original.result.actionPoint.activation.entryMarker == true, "Pinned AP marker is present")
	await _capture_routes("applied")
	await _check_draft_and_history()
	await _check_filter_parity()
	await _check_filters()
	await _check_secret(rows)
	await _check_prepared_presentation()
	await _check_save_reopen()
	_shell._maps.context_tools.windows.dock_all()
	_shell._close_project()
	await _settle()
	_shell.free(); await process_frame
	print("PROVIDENCE_AP_ACTIVATION_OK checks=%d applied-marker chance-preservation atomic-undo-redo filters-hit-testing draft-detach flow secret save-reopen" % _checks)
	quit()


func _settle() -> void:
	for frame in 1800:
		await process_frame
		if not _shell._operations.busy and not _shell._maps.context_tools._reading and not _shell._maps.context_tools._queued:
			for extra in 4: await process_frame
			if not _shell._operations.busy: return
	_expect(false, "Operations settled")


func _expect(value: bool, message: String) -> void:
	_checks += 1
	if not value: push_error(message); quit(1)
	assert(value, message)


func _request(method: String, params: Dictionary) -> Dictionary:
	return await _shell._operations.run_workflow(_shell._bridge, "Check AP activation", func(operation): return await operation.request(method, params))


func _check_draft_and_history() -> void:
	var entry: Control = _editor.get_node("%EntryPanel")
	entry.get_node("%EntryMarker").button_pressed = false
	_editor.get_node("%ActionPointChance").value = 0
	_expect(_editor.has_unapplied_changes(), "Marker and chance share the AP draft")
	_expect(entry.get_node("%EntryState").text.begins_with("Draft:"), "Pending marker is visibly separate from applied state")
	_expect(_editor.get_node("%CatalogStatusFields").get_node("%Chance").disabled, "Catalog filters lock while this AP draft is pending")
	var windows = _shell._maps.context_tools.windows
	windows.detach("ap"); await _settle()
	_expect(_editor.has_unapplied_changes() and not entry.get_node("%EntryMarker").button_pressed, "Detach retains the marker draft")
	await _capture_ap_only("pending-marker")
	await _editor.commit_selected(); await _settle()
	_expect(not _editor.has_unapplied_changes(), "Successful Apply advances the marker baseline")
	var applied := await _request("action-point.open", {"identity": _identity})
	_expect(applied.result.actionPoint.activation.entryMarker == false and int(applied.result.actionPoint.chancePercent) == 0, "One Apply stores both marker and dormant chance")
	await _shell._commands.dispatch(&"edit.undo"); await _settle()
	var undone := await _request("action-point.open", {"identity": _identity})
	_expect(undone.result.actionPoint.activation.entryMarker == true and int(undone.result.actionPoint.chancePercent) == 100, "One Undo restores both fields")
	await _shell._commands.dispatch(&"edit.redo"); await _settle()
	var redone := await _request("action-point.open", {"identity": _identity})
	_expect(redone.result.actionPoint.activation.entryMarker == false and int(redone.result.actionPoint.chancePercent) == 0, "Redo restores both fields")
	await _shell._scripts.open_action_point(_identity); await _settle()
	var visible_row: Array = _editor._summaries.filter(func(row): return row.identity == _identity)
	_expect(visible_row.size() == 1 and int(visible_row[0].chancePercent) == 0, "Reopening after history refreshes the applied catalog chance")
	_expect(_editor.get_node("%ActionPointCollection").get_item_text(_editor.get_node("%ActionPointCollection").get_selected_items()[0]).contains("0% /"), "Selected catalog row agrees with the applied dormant detail")
	await _capture_routes("dormant-unmarked")
	_editor.get_node("%ActionPointChance").value = 75
	await _editor.commit_selected(); await _settle()
	var chance_only := await _request("action-point.open", {"identity": _identity})
	_expect(chance_only.result.actionPoint.activation.entryMarker == false, "Chance-only edits preserve the unmarked tile")
	var x: SpinBox = _editor.get_node("%ActionPointTriggerX")
	var before: float = x.value
	x.value = before - 1
	_expect(entry.get_node("%EntryMarker").disabled and entry.get_node("%EntryState").text.begins_with("Moving"), "Moving a draft does not display the old tile as the destination state")
	_editor.discard_draft()
	_expect(not _editor.has_unapplied_changes(), "Discard restores placement and marker baseline")
	windows.dock("ap"); await _settle()


func _check_filters() -> void:
	var fields: Control = _editor.get_node("%CatalogStatusFields")
	fields.set_filters({"chance": "positive", "marker": "absent"}); fields.changed.emit(fields.filters())
	await _settle()
	_expect(_editor.list_query().filter == "current-map", "Status dimensions preserve catalog scope")
	for row: Dictionary in _editor._summaries:
		_expect(row.activation.chancePositive and row.activation.entryMarker == false, "Catalog intersection agrees with core activation facts")
	await _capture_catalog("status-intersection")
	fields.reset(); await _settle()
	_expect(_editor.selected_identity() == _identity, "Reset retains selected AP when present")
	await _shell._maps.document.load_map(_map); await _settle()
	var canvas: ProvidenceMapCanvas = _shell._workbenches.land.get_node("%LandMapCanvas")
	var filters: Control = _shell._workbenches.land.get_node("%MapViewFilters")
	var row := await _request("action-point.open", {"identity": _identity})
	var coordinate: Dictionary = row.result.actionPoint.coordinate
	var cell := Vector2i(coordinate.x, coordinate.y)
	filters.get_node("%APStatusFields").set_filters({"marker": "present"})
	filters.get_node("%APStatusFields").changed.emit({"marker": "present"})
	_expect(canvas.action_points_at(cell).is_empty(), "Filtered APs are excluded from hit testing")
	var nav: Dictionary = filters.state.read_navigation_state()
	filters.get_node("%APStatusFields").reset()
	_expect(canvas.action_points_at(cell).any(func(ap): return ap.identity == _identity), "Default map filter includes unmarked placed APs")
	filters.state.restore_navigation_state(nav)
	_expect(canvas.action_points_at(cell).is_empty(), "Map navigation restores activation filters")
	filters.get_node("%APStatusFields").set_filters({"marker": "absent", "chance": "positive"})
	filters.get_node("%APStatusFields").changed.emit(filters.get_node("%APStatusFields").filters())
	_expect(filters.get_node("%APVisibleCount").text.contains("APs visible"), "Map exposes filter result counts")
	await _capture_map(filters)
	filters.get_node("%APStatusFields").reset()
	fields.set_filters({"chance": "nonpositive", "marker": "present", "checks": "unknown"}); fields.changed.emit(fields.filters())
	await _settle()
	_expect(fields.active_count() == 3 and fields.get_node("%Reset").visible, "Empty intersection keeps reset reachable")
	await _capture_catalog("empty-intersection")
	fields.reset(); await _settle()


func _check_secret(rows: Array) -> void:
	for row: Dictionary in rows:
		if str(row.activation.secret) == "none": continue
		await _shell._scripts.open_action_point(str(row.identity)); await _settle()
		var panel: Control = _editor.get_node("%EntryPanel")
		_expect(panel.get_node("%EntryMarker").disabled and panel.get_node("%SecretControls").visible, "Land secrets direct editing to map secret controls")
		await _capture_ap_only("secret-disabled")
		panel.get_node("%SecretControls").pressed.emit()
		for frame in 900:
			await process_frame
			if _shell._maps.cell_behavior.view.visible: break
		_expect(_shell._maps.cell_behavior.view.visible, "Secret action opens existing map cell behavior")
		_shell._maps.cell_behavior.view.hide()
		await _shell._scripts.open_action_point(_identity); await _settle()
		return
	_expect(false, "Castle source supplies a secret AP for verification")


func _check_prepared_presentation() -> void:
	var first := {"placed": true, "chancePositive": false, "entryMarker": false, "shadowedBy": null, "checkSlots": [], "unknownSlots": []}
	var later := first.duplicate(true); later.shadowedBy = "action-point:land:0:0"; later.unknownSlots = [2]
	_expect(Presentation.matches(later, {"precedence": "shadowed", "checks": "unknown"}), "Prepared overlapping AP remains visible by its own facts")
	_expect(not Presentation.matches(first, {"precedence": "shadowed"}), "Prepared earlier dormant AP is the native precedence winner")
	_expect(not Presentation.matches({"placed": false}, {"precedence": "first"}), "Unplaced AP is not first at a coordinate")
	_expect(not Presentation.matches({}, {"marker": "absent"}), "Missing projection is not inferred to be an absent marker")
	var panel: Control = preload("res://src/action_point_entry_panel.tscn").instantiate()
	root.add_child(panel)
	var opened: Array = []
	panel.earlier_requested.connect(func(identity): opened.append(identity))
	panel.set_document({"coordinate": {"x": 1, "y": 1}, "activation": later})
	panel.get_node("%EarlierAP").pressed.emit()
	_expect(opened == [later.shadowedBy], "Prepared precedence link preserves the exact AP identity")
	panel.set_document({"coordinate": null, "activation": {"placed": false, "entryMarker": null, "markerEditable": false}})
	_expect(panel.get_node("%EntryMarker").disabled and panel.draft_value() == null, "Prepared unplaced AP cannot author a tile marker")
	panel.free()


func _check_filter_parity() -> void:
	var all := await _request("action-point.list", {"mapIdentity": _map, "filter": "current-map", "limit": 128})
	var choices := {"chance": ["positive", "nonpositive"], "marker": ["present", "absent", "unavailable"], "precedence": ["shadowed", "first"], "checks": ["detected", "unknown"]}
	for key in choices:
		for value in choices[key]:
			var filters := {}; filters[key] = value
			var result := await _request("action-point.list", {"mapIdentity": _map, "filter": "current-map", "limit": 128, "activationFilters": filters})
			var local: Array = all.result.items.filter(func(row): return Presentation.matches(row.activation, filters)).map(func(row): return row.identity)
			_expect(result.ok and local == result.result.items.map(func(row): return row.identity), "Native map predicate agrees with core filter: %s %s" % [key, value])


func _check_save_reopen() -> void:
	var target := OS.get_environment("PROVIDENCE_ACTIVATION_SAVE")
	await _shell._project_session.save_as(target); await _settle()
	await _shell._project_session.open_project(target); await _settle()
	var reopened := await _request("action-point.open", {"identity": _identity})
	_expect(reopened.ok and reopened.result.actionPoint.activation.entryMarker == false and int(reopened.result.actionPoint.chancePercent) == 75, "Saved portable snapshot reopens with authored marker and chance")


func _capture_routes(label: String) -> void:
	var windows = _shell._maps.context_tools.windows
	windows.detach("ap"); await _settle()
	var window: Window = windows._windows.ap.window
	for viewport: Vector2i in [Vector2i(1600, 900), Vector2i(1920, 1080)]:
		root.size = viewport; window.size = viewport
		await _capture("ap-" + label + "-%d" % viewport.x, window)
	var flow = _shell._commands._discovery.flow
	await flow.open({"kind": "action-point", "identity": _identity, "scope": "scenario"}); await _settle()
	for viewport: Vector2i in [Vector2i(1600, 900), Vector2i(1920, 1080)]:
		root.size = viewport; flow.view.size = viewport - Vector2i(48, 48)
		await _capture("flow-" + label + "-%d" % viewport.x, flow.view)
	_expect(flow.view.inspector.get_node("%Activation").text.contains("Entry marker"), "Flow uses applied AP facts")
	flow.view.close_view()


func _capture_ap_only(label: String) -> void:
	if OS.get_environment("PROVIDENCE_CONTEXT_CAPTURE_ROOT").is_empty(): return
	var windows = _shell._maps.context_tools.windows
	windows.detach("ap"); await _settle()
	for viewport: Vector2i in [Vector2i(1600, 900), Vector2i(1920, 1080)]:
		root.size = viewport; windows._windows.ap.window.size = viewport
		await _capture("ap-" + label + "-%d" % viewport.x, windows._windows.ap.window)


func _capture_catalog(label: String) -> void:
	if OS.get_environment("PROVIDENCE_CONTEXT_CAPTURE_ROOT").is_empty(): return
	var windows = _shell._maps.context_tools.windows
	windows.detach("ap"); await _settle()
	for viewport: Vector2i in [Vector2i(1600, 900), Vector2i(1920, 1080)]:
		root.size = viewport; windows._windows.ap.window.size = viewport
		await _settle_window(windows._windows.ap.window)
		_editor.get_node("%ActionPointFilters")._open()
		await _capture("ap-" + label + "-%d" % viewport.x, windows._windows.ap.window)
		_expect(_editor.get_node("%CatalogStatusPopup").visible, "Expanded catalog popup stays visible after final viewport/focus change")
		_editor.get_node("%CatalogStatusPopup").hide()
	windows.dock("ap"); await _settle()


func _capture_map(filters: Control) -> void:
	if OS.get_environment("PROVIDENCE_CONTEXT_CAPTURE_ROOT").is_empty(): return
	await _shell._navigation.select_route("maps.land")
	var target = preload("res://src/map_selection_target.gd")
	_shell._maps.context_tools._choose(target.create(target.Kind.ACTION_POINT, _identity, _map, Vector2i(69,19), "AP 63"))
	await _settle()
	for viewport: Vector2i in [Vector2i(1600, 900), Vector2i(1920, 1080)]:
		root.size = viewport
		await _settle_window(root)
		filters.open_menu()
		await _capture("map-filters-%d" % viewport.x, root)
		_expect(filters.get_node("%MapOverlayPopup").visible, "Expanded map popup stays visible at the reviewed viewport")
		filters.close_menu()


func _settle_window(window: Window) -> void:
	for frame in 12: await process_frame
	window.grab_focus()
	for frame in 8: await process_frame


func _capture(label: String, window: Window) -> void:
	if OS.get_environment("PROVIDENCE_CONTEXT_CAPTURE_ROOT").is_empty(): return
	for frame in 8: await process_frame
	await RenderingServer.frame_post_draw
	var image: Image = window.get_texture().get_image()
	_expect(image.save_png(OS.get_environment("PROVIDENCE_CONTEXT_CAPTURE_ROOT").path_join(label + ".png")) == OK, "Write selected native review capture")
