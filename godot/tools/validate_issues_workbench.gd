extends SceneTree

const Fixture = preload("res://tools/validate_issues_state.gd")
var _failed := false


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	root.size = Vector2i(1600, 900)
	var view = load("res://src/issues_workbench.tscn").instantiate()
	view.position = Vector2(92, 84)
	view.size = Vector2(1500, 752)
	root.add_child(view)
	await _settle()
	var bridge := Fixture.FixtureBridge.new()
	view.destination_resolver = func(finding: Dictionary): return {"editable": true} if finding.get("entity") is String else {}
	var opened: Array = []
	view.source_open_requested.connect(func(finding: Dictionary): opened.append(finding))
	view.attach(bridge, 18)
	await _settle()
	_check(view.state.limit==50 and view._rows.size()==view.state.limit, "Compact capacity does not fit its bounded findings")
	_check(view.get_node("%SelectedProblemInspector").size.x>=480, "Repair pane lost its minimum readable width")
	_check(view.get_node("%CategoryFilter").item_count==6, "All groups and the five core facets are required")
	_check_bounds(view)
	await _check_temporary_filters(view)
	_check_uncalled_filter(view)
	var search: LineEdit = view.get_node("%SearchProblems")
	search.text = "unsubmitted search"
	view._severities[1].pressed.emit()
	_check(view.state.query.is_empty() and search.text == "unsubmitted search", "Severity unexpectedly submitted or erased a draft search")
	search.text = "extra-action-point:499"
	search.text_submitted.emit(search.text)
	await _settle()
	_check(view.state.page.total == 1 and view.state.selected_finding().entity == "extra-action-point:499", "Search control did not query beyond the first page")
	(view.get_node("%OpenFinding") as Button).pressed.emit()
	_check(opened.size() == 1 and opened[0].entity == "extra-action-point:499" and opened[0].field == "actions[4].target", "Open command lost exact source field")
	(view.get_node("%ClearFilters") as Button).pressed.emit()
	await _settle()
	_check(view.state.page.total == 512 and view.state.query.is_empty(), "Clear Filters did not restore findings")
	view.get_node("%CategoryFilter").select(1)
	view.get_node("%CategoryFilter").item_selected.emit(1)
	await _settle()
	_check(view.state.category=="links" and view.state.page.total==501,"Group control did not filter the full catalog")
	view.state.go_to_page(10)
	view.state.select_row(49)
	root.size = Vector2i(1920, 1080)
	view.size = Vector2(1820, 932)
	await _settle()
	_check(view.state.limit==50 and view.state.selected_finding().entity == "extra-action-point:499", "Wide resize lost selection or capacity")
	_check_bounds(view)
	root.size = Vector2i(1600, 900)
	view.size = Vector2(1500, 752)
	await _settle()
	_check(view.state.limit==50 and view.size.y == 752, "Window resize changed the chosen page size")
	for mode in ["dark", "light", "high-contrast"]:
		for density in ["balanced", "compact"]:
			view.set_appearance(mode, density)
			await _settle()
			_check_bounds(view)
			if mode == "high-contrast":
				_check(view.get_theme_color("selected_problem", "Issues").is_equal_approx(Color("ff80ff")), "High contrast lost the approved selected color")
	bridge.rows.append({"code": "extra-code.opcode-92.secondary.missing", "entity": "extra-action-point:158", "field": "actions[4].extraCode", "message": "Random-area settings are incomplete.", "severity": "error"})
	view.state.set_filters("random-area", "error")
	view.state.open_category("action-settings")
	for viewport in [Vector2i(1600, 900), Vector2i(1920, 1080)]:
		root.size = viewport
		view.size = Vector2(viewport) - Vector2(92, 148)
		for mode in ["dark", "light", "high-contrast"]:
			view.set_appearance(mode, "compact" if mode == "high-contrast" else "balanced")
			await _settle()
			_check(view._rows.size() == 1, "The single Action Settings finding was lost")
			var row: Button = view._rows[0]
			_check(absf(row.size.y-59)<=2,"Filtered findings lost the compact two-line row")
			_check(not row.open_button.visible,"Browse must preview before an explicit Open action")
			_check(not view.get_node("%OpenFinding").disabled,"Exact action repair is unavailable")
			_check_bounds(view)
	bridge.rows.clear()
	bridge.rows.append({"code": "reference.message.missing", "entity": null, "field": null, "message": "Untargeted problem", "severity": "error"})
	bridge.revision = 19
	view.state.clear_filters()
	await _settle()
	_check(view.get_node("%OpenFinding").disabled and view._rows[0].open_button.disabled, "Untargeted finding borrowed the previous Open action")
	bridge.rows[0].entity = "monster:0:150"
	bridge.rows[0].preservationReason = "Retained monster record after the bestiary end marker."
	view.state.refresh()
	_check(view.get_node("%OpenFinding").disabled and view.get_node("%FindingGuidance").text.begins_with("Retained monster"), "Preserved tail advertised an unavailable authoring destination")
	bridge.fail = true
	view.state.refresh()
	_check(view.get_node("%OpenFinding").disabled and view._rows.is_empty(), "Failure retained actionable findings")
	view.attach(null)
	_check(view.get_node("%CheckAgain").disabled and view._rows.is_empty(), "No-project state retained previous findings")
	view.free()
	await process_frame
	if not _failed:
		print("PROVIDENCE_ISSUES_WORKBENCH_OK viewports=2 themes=3 densities=2 keyboard=verified source=exact")
	quit(1 if _failed else 0)


func _check_bounds(view: Control) -> void:
	_check(view.get_global_rect().encloses(view.get_node("%FilterBar").get_global_rect()), "Filter bar is clipped")
	_check(view.get_global_rect().encloses(view.get_node("%CategoryFilter").get_global_rect()), "The category filter is clipped")
	for row: Button in view._rows:
		_check(row.size.x <= view.get_node("%Findings").size.x, "A finding row exceeds the scroll area width")
	_check(view.get_global_rect().encloses(view.get_node("%SelectedProblemInspector").get_global_rect()), "Inspector is clipped")


func _check_temporary_filters(view: Control) -> void:
	var bar: Control = view.get_node("%FilterBar")
	view.get_node("%HideFinding").pressed.emit()
	_check(view.state.page.total == 511 and view.state.page.temporaryHiddenCount == 1, "Hide finding did not exclude its exact identity")
	view.get_node("%HideType").pressed.emit()
	_check(view.state.page.total == 11 and view.state.filters.rules.size() == 2, "Hide type did not include unloaded pages")
	_check(view.state.page.unfilteredCounts.errors == 509, "Hiding changed diagnostic severity totals")
	bar.get_node("Temporary/Enabled").toggled.emit(false)
	_check(view.state.page.total == 512, "Disabling filters did not restore all rows")
	bar.get_node("Temporary/Enabled").toggled.emit(true)
	bar.get_node("Temporary/Rules").get_popup().id_pressed.emit(1)
	_check(view.state.page.total == 511, "Individual filter toggle did not restore its type")
	bar.get_node("Types/PageSize").item_selected.emit(3)
	_check(view.state.limit == 128 and view._rows.size() == 128, "Page size control failed")
	bar.get_node("Types/TypeFilter").item_selected.emit(2)
	_check(view.state.code == "reference.picture.missing" and view.state.page.total == 8, "Finding type selector lost unloaded types")
	view.get_node("%ClearFilters").pressed.emit()
	bar.get_node("Types/PageSize").item_selected.emit(1)
	_check(view.state.filters.rules.is_empty() and view.state.page.total == 512, "Clear filters retained exclusions")
	view.state.hide_selected(false)
	view.attach(view.state._bridge, 18)
	_check(view.state.filters.rules.is_empty() and view.state.page.total == 512, "Project attachment retained temporary filters")
	await _settle()


func _key(code: Key) -> void:
	var event := InputEventKey.new()
	event.keycode = code
	event.pressed = true
	Input.parse_input_event(event)
	await process_frame
	event = InputEventKey.new()
	event.keycode = code
	Input.parse_input_event(event)
	await _settle()


func _settle() -> void:
	for _frame in 5:
		await process_frame


func _check(condition: bool, message: String) -> void:
	if not condition:
		_failed = true
		push_error("PROVIDENCE_ISSUES_WORKBENCH_FAILED: " + message)


func _check_uncalled_filter(view: Control) -> void:
	var toggle: CheckButton = view.get_node("%FilterBar/Uncalled")
	_check(not toggle.button_pressed, "Caller filter must start optional and off")
	toggle.toggled.emit(true)
	_check(view.state.page.total == 510 and view.state.page.temporaryHiddenCount == 2, "Caller filter did not hide uncalled warnings across pages")
	_check(view.state.page.unfilteredCounts.errors == 509 and view.state.page.unfilteredCounts.warnings == 3, "Caller filter changed scenario totals")
	_check(view.state.filters_active(), "Caller filter was not marked active")
	toggle.toggled.emit(false)
	_check(view.state.page.total == 512, "Disabling caller filter did not restore rows")
	toggle.toggled.emit(true)
	view.state.clear_filters()
	_check(not toggle.button_pressed and view.state.page.total == 512, "Clear filters retained caller filtering")
	toggle.toggled.emit(true)
	view.attach(view.state._bridge, 18)
	_check(not toggle.button_pressed, "Project attachment retained caller filtering")
