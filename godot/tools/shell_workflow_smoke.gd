extends RefCounted

const Fixture = preload("res://tools/native_workflow_fixtures.gd")
const RouteCatalog = preload("res://src/route_catalog.gd")
const DOMAIN_ROUTES := RouteCatalog.ROUTES

static func _run_smoke(shell: Control) -> void:
	# Headless Godot otherwise inherits the host display size, which can hide
	# minimum-width regressions that only occur at the certified compact viewport.
	shell.get_window().size = Vector2i(1600, 900)
	await shell.get_tree().process_frame
	await shell.get_tree().process_frame
	while shell._operations.busy: await shell.get_tree().process_frame
	await shell._navigation.select_route("scripts.macros")
	if not _verify_commands(shell): return
	if not await _verify_land_workspace(shell): return
	if not await _verify_story_workspace(shell): return
	var viewport_width: float = shell.get_viewport_rect().size.x
	await shell._navigation.select_tab(1)
	await shell.get_tree().process_frame
	var route_total = await _verify_domain_rail_smoke(shell)
	if route_total < 0:
		return
	if not await _verify_string_navigation(shell): return
	if not await _verify_inspector_repair(shell): return
	if not await _verify_terrain_paint(shell): return
	if not _verify_item_update(shell): return
	print("PROVIDENCE_UI_SMOKE_OK revision=%d viewportWidth=%d mapHeight=%d explorerHeight=%d domains=%d retainedRoutes=%d\nPROVIDENCE_ROUTE_DESTINATIONS %s" % [
		shell._session_view.revision,
		int(viewport_width),
		int(shell._workbenches.land.canvas_height()),
		int(shell._explorer_panel.size.y),
		shell._domain_navigation.domain_buttons.size(),
		route_total, JSON.stringify(RouteCatalog.destination_summary(shell._document_tabs.get_tab_count())),
	])
	shell.get_tree().quit(0)


static func _verify_commands(shell: Control) -> bool:
	shell._commands.refresh()
	if (
		shell._application_menu.is_command_enabled(&"file.save-as")
		or shell._application_menu.is_command_enabled(&"edit.cut")
		or not shell._application_menu.is_command_enabled(&"view.problems")
		or shell._application_menu.is_command_enabled(&"navigate.open-to-side")
		or shell._application_menu.is_command_enabled(&"help.about")
	):
		Fixture._smoke_fail(shell, "approved native menus exposed an unowned command or disabled a working command")
		return false
	shell._palette.popup_palette({"hasMap": true, "landEditable": true})
	if (
		not shell._palette.command_enabled("map.fit")
		or not shell._palette.command_enabled("map.paint-selected-tile")
		or shell._palette.command_enabled("map.stamp-selection")
		or shell._palette.command_enabled("map.reveal-explorer")
	):
		Fixture._smoke_fail(shell, "command palette lost bounded command-state truth")
		return false
	shell._palette.hide()
	if shell._document_toolbar == null or shell._document_toolbar.size.x > 1600.0:
		Fixture._smoke_fail(shell, "document toolbar exceeded the certified compact viewport")
		return false
	if not shell._commit_edit_button.visible or shell._commit_edit_button.text != "Apply Extra AP":
		Fixture._smoke_fail(shell, "compact Extra Action Point route lost its primary Apply command")
		return false
	var toolbar_first = shell._document_toolbar.get_child(0) as Control
	var toolbar_last = shell._document_toolbar.get_child(shell._document_toolbar.get_child_count() - 1) as Control
	if (
		toolbar_first == null
		or toolbar_last == null
		or toolbar_first.global_position.x < -1.0
		or toolbar_last.global_position.x + toolbar_last.size.x > 1601.0
	):
		Fixture._smoke_fail(shell, "document toolbar escaped the compact viewport")
		return false
	return true


static func _verify_land_workspace(shell: Control) -> bool:
	await shell._navigation.select_tab(1)
	await shell._maps.chrome.request_tool("paint")
	while shell._operations.busy: await shell.get_tree().process_frame
	await shell.get_tree().process_frame
	if shell._primary_workspace.size.y < 700 or shell._explorer_panel.size.y < 700 or int(shell._workbenches.land.canvas_height()) < 526:
		Fixture._smoke_fail(shell, "scene hosts compressed the workspace (primary=%d explorer=%d map=%d)" % [
			int(shell._primary_workspace.size.y),
			int(shell._explorer_panel.size.y),
			int(shell._workbenches.land.canvas_height()),
		])
		return false
	if not shell.get_node("%InspectorHost").visible or absf(shell.get_node("%InspectorHost").size.x - 352.0) > 16.0:
		Fixture._smoke_fail(shell, "Land Editor did not retain the approved 352 px Tiles dock (visible=%s width=%d)" % [
			str(shell.get_node("%InspectorHost").visible),
			int(shell.get_node("%InspectorHost").size.x),
		])
		return false
	if not shell._maps.paint.workspace.tiles_dock.visible or shell._map_inspector.visible or shell._inspector_panel.visible:
		Fixture._smoke_fail(shell, "Land Editor did not keep the visual tile dock beside the map canvas (tiles=%s selection=%s links=%s)" % [
			str(shell._maps.paint.workspace.tiles_dock.visible), str(shell._map_inspector.visible), str(shell._inspector_panel.visible),
		])
		return false
	if not await _verify_map_selection(shell): return false
	if shell._problem_dock == null or bool(shell._problem_dock.is_expanded()):
		Fixture._smoke_fail(shell, "Problems and output must start collapsed below the Land Editor")
		return false
	if absf(shell._explorer_panel.size.x - 300.0) > 4.0:
		Fixture._smoke_fail(shell, "persistent rail and contextual map browser did not retain their 300 px compact width (actual=%d)" % int(shell._explorer_panel.size.x))
		return false
	if not shell._map_context_sidebar.visible or int(shell._map_context_sidebar.visible_map_count()) != shell._maps.document.maps.size():
		Fixture._smoke_fail(shell, "Maps domain did not expose the bounded Scenario Maps browser (visible=%s shown=%d maps=%d)" % [
			str(shell._map_context_sidebar.visible),
			int(shell._map_context_sidebar.visible_map_count()),
			shell._maps.document.maps.size(),
		])
		return false
	return true


static func _verify_map_selection(shell: Control) -> bool:
	while shell._operations.busy: await shell.get_tree().process_frame
	await shell._maps.chrome.request_tool("select")
	shell._workbenches.land.select_cell(18, 23)
	while shell._operations.busy: await shell.get_tree().process_frame
	await shell.get_tree().process_frame
	var map_preview_target = shell._preview_workspace.current_target()
	if (
		str((shell._map_inspector.find_child("SelectedCoordinate", true, false) as Label).text) != "CELL 18, 23"
		or not bool((shell._map_inspector.find_child("SelectedActionPointPanel", true, false) as PanelContainer).visible)
		or map_preview_target != {"kind": "map-location", "id": "land:0", "mapId": "land:0", "x": 18, "y": 23}
	):
		Fixture._smoke_fail(shell, "map selection did not populate its Inspector and exact preview target")
		return false
	return true


static func _verify_story_workspace(shell: Control) -> bool:
	while shell._operations.busy: await shell.get_tree().process_frame
	await shell._navigation.select_tab(3)
	await shell.get_tree().process_frame
	var viewport_width: float = shell.get_viewport_rect().size.x
	var inspector_right: float = shell.get_node("%InspectorHost").global_position.x + shell.get_node("%InspectorHost").size.x
	if shell._explorer_panel.global_position.x < -1.0 or inspector_right > viewport_width + 1.0:
		Fixture._smoke_fail(shell, "wide record workbench escaped its viewport (explorerLeft=%d inspectorRight=%d viewport=%d)" % [
			int(shell._explorer_panel.global_position.x),
			int(inspector_right),
			int(viewport_width),
		])
		return false
	if absf(shell._explorer_panel.size.x - 92.0) > 4.0 or shell._domain_sidebar.visible:
		Fixture._smoke_fail(shell, "Story authoring did not retain its compact activity rail without a contextual project sidebar (actual=%d sidebar=%s)" % [
			int(shell._explorer_panel.size.x), str(shell._domain_sidebar.visible),
		])
		return false
	if shell._map_context_sidebar.visible:
		Fixture._smoke_fail(shell, "Map-specific tools remained visible after navigating to a Story workbench")
		return false
	if not shell._command_title.text.contains("EXTRA ACTION POINTS"):
		Fixture._smoke_fail(shell, "initial document title did not follow the visible Extra Action Point workbench")
		return false
	return true


static func _verify_string_navigation(shell: Control) -> bool:
	await shell._navigation.activate_domain("maps", false)
	shell._strings.set_query("reliquary")
	await shell._strings.reload("", 0, false)
	if shell._strings._message_list.item_count != 1 or shell._strings.used_by().size() != 2:
		Fixture._smoke_fail(shell, "String Editor search or bounded Used By projection did not bind (rows=%d uses=%d)" % [
			shell._strings._message_list.item_count,
			shell._strings.used_by().size(),
		])
		return false
	if not shell._strings._message_meta.text.contains("2 uses"):
		Fixture._smoke_fail(shell, "String Editor did not expose the selected string usage count")
		return false
	await shell._open_message_use(0)
	if shell._document_tabs.current_tab not in [2, 3, 5]:
		Fixture._smoke_fail(shell, "String Editor Used By navigation did not open the source document")
		return false
	await shell._navigation.select_tab(0)
	while shell._operations.busy: await shell.get_tree().process_frame
	shell._strings.set_query("")
	await shell._strings.reload("", 0, false)
	return true


static func _verify_inspector_repair(shell: Control) -> bool:
	var update = shell._bridge.request("message.update", {
		"expectedRevision": shell._session_view.revision,
		"identity": "message:12",
		"text": "The western gate opens at moonrise.",
	})
	if not bool(update.get("ok", false)):
		Fixture._smoke_fail(shell, str(update.get("error", "update failed")))
		return false
	shell._session_view.apply(update.result as Dictionary)
	shell._inspector_panel.show_reference({
		"source": "action-point:land:0:17",
		"field": "actions[0].target",
		"targetKind": "message",
		"targetId": "message:999",
		"resolution": "missing",
	})
	if int(shell._inspector_panel._repair_target.value) != 999 or not shell._inspector_panel._repair_target.editable or shell._inspector_panel._repair.disabled:
		Fixture._smoke_fail(shell, "Inspector did not expose the selected missing target for repair")
		return false
	var revision_before_repair = shell._session_view.revision
	shell._inspector_panel._repair_target.value = 47
	await shell._repair_reference()
	if shell._session_view.revision != revision_before_repair + 1:
		Fixture._smoke_fail(shell, "Inspector repair did not advance the expected revision")
		return false
	var repaired_action_point = shell._bridge.request("action-point.open", {"identity": "action-point:land:0:17"})
	if not bool(repaired_action_point.get("ok", false)):
		Fixture._smoke_fail(shell, str(repaired_action_point.get("error", "repaired Action Point did not reopen")))
		return false
	var repaired_actions := (((repaired_action_point.result as Dictionary).get("actionPoint", {}) as Dictionary).get("actions", []) as Array)
	if repaired_actions.is_empty() or int((repaired_actions[0] as Dictionary).get("targetNativeId", 0)) != 47:
		Fixture._smoke_fail(shell, "Inspector repair did not commit entered Message 47")
		return false
	var undo = shell._bridge.request("history.undo", {"expectedRevision": shell._session_view.revision})
	if not bool(undo.get("ok", false)):
		Fixture._smoke_fail(shell, str(undo.get("error", "undo failed")))
		return false
	shell._session_view.apply(undo.result as Dictionary)
	return true


static func _verify_terrain_paint(shell: Control) -> bool:
	await shell._navigation.select_tab(1)
	shell._maps.set_tool_mode("paint")
	shell._map_inspector.set_paint_tile_value(42)
	var revision_before_paint = shell._session_view.revision
	await shell._maps.paint.paint_cell(30, 30)
	var painted_map = shell._bridge.request("map.open", {"identity": "land:0"})
	var painted_tiles := (((painted_map.get("result", {}) as Dictionary).get("map", {}) as Dictionary).get("tiles", []) as Array)
	if (
		shell._session_view.revision != revision_before_paint + 1
		or not bool(painted_map.get("ok", false))
		or painted_tiles.size() != 8100
		or int(painted_tiles[30 * 90 + 30]) != 42
		or not (shell._map_inspector.find_child("PaintInspectorPanel", true, false) as PanelContainer).visible
	):
		Fixture._smoke_fail(shell, "native Paint mode did not commit tile 42 through its bounded Inspector workflow")
		return false
	shell._maps.set_tool_mode("select")
	return true


static func _verify_item_update(shell: Control) -> bool:
	var items = shell._bridge.request("scenario-item-rules.list")
	if not bool(items.get("ok", false)) or (items.get("result", []) as Array).size() != 200:
		Fixture._smoke_fail(shell, str(items.get("error", "scenario item list did not contain 200 rows")))
		return false
	var item_definition := ((items.result as Array)[101] as Dictionary).duplicate(true)
	item_definition["name"] = "Moonsteel Signet Edited"
	item_definition["cost"] = 1350
	var item_update = shell._bridge.request("scenario-item.update", {
		"expectedRevision": shell._session_view.revision,
		"recordIndex": 101,
		"definition": item_definition,
	})
	if not bool(item_update.get("ok", false)):
		Fixture._smoke_fail(shell, str(item_update.get("error", "scenario item update failed")))
		return false
	var item_projection := item_update.result as Dictionary
	if item_projection.get("changedEntities", []) != ["classic.item.901"]:
		Fixture._smoke_fail(shell, "scenario item update returned an invalid bounded projection")
		return false
	shell._session_view.apply(item_projection)
	return true


static func _verify_domain_rail_smoke(shell: Control) -> int:
	var route_total := 0
	var displayed_total := 0
	var route_identities := {}
	var route_appearances := {}
	for domain_id in ["maps", "player-maps", "scripts", "text", "encounters", "scenario", "rules", "combat", "economy", "assets", "linter", "export"]:
		await shell._navigation.activate_domain(domain_id, false)
		var configuration := DOMAIN_ROUTES[domain_id] as Dictionary
		var expected_routes := (configuration.get("sidebarRoutes", configuration.routes) as Array).size()
		route_total += (configuration.routes as Array).size()
		displayed_total += expected_routes
		if shell._domain_navigation.buttons().size() != expected_routes:
			Fixture._smoke_fail(shell, "%s domain exposed %d of %d retained tool routes" % [domain_id, shell._domain_navigation.buttons().size(), expected_routes])
			return -1
		for route_button_value in shell._domain_navigation.buttons():
			var route_button := route_button_value as Button
			var route_id := str(route_button.get_meta("route_id", ""))
			if route_id.is_empty():
				Fixture._smoke_fail(shell, "domain navigation exposed a missing route identity")
				return -1
			route_identities[route_id] = true
			route_appearances[route_id] = int(route_appearances.get(route_id, 0)) + 1
	if route_total != 44 or displayed_total != 50 or route_identities.size() != 44:
		Fixture._smoke_fail(shell, "domain rail retained %d routes, displayed %d entries, and exposed %d stable identities" % [route_total, displayed_total, route_identities.size()])
		return -1
	var shared_routes := ProvidenceRouteCatalog.VALIDATE_PUBLISH_ROUTES.map(func(route): return str(route[3]))
	for identity in route_appearances:
		var expected_appearances := 2 if identity in shared_routes else 1
		if int(route_appearances[identity]) != expected_appearances:
			Fixture._smoke_fail(shell, "%s appeared %d times instead of %d" % [identity, route_appearances[identity], expected_appearances])
			return -1
	for legacy_route in ["economy.bag", "economy.vault"]:
		if route_identities.has(legacy_route) or not ProvidenceRouteCatalog.LEGACY_ROUTE_DESTINATIONS.has(legacy_route):
			Fixture._smoke_fail(shell, "%s must remain a hidden compatibility route, not Economy navigation" % legacy_route)
			return -1
	if shell._domain_navigation.domain_buttons.size() != 12:
		Fixture._smoke_fail(shell, "domain rail exposed %d of 12 persistent domains" % shell._domain_navigation.domain_buttons.size())
		return -1
	var domain_rail := shell._domain_navigation.find_child("DomainRail", true, false) as VBoxContainer
	var maps_domain := shell._domain_navigation.domain_buttons["maps"] as ProvidenceDomainToolButton
	var left_gutter := maps_domain.global_position.x - domain_rail.global_position.x
	var right_gutter := domain_rail.size.x - left_gutter - maps_domain.size.x
	if left_gutter < 4.0 or right_gutter < 4.0 or absf(left_gutter - right_gutter) > 1.0:
		Fixture._smoke_fail(shell, "domain tool was not centered in its rail (left=%.1f right=%.1f)" % [left_gutter, right_gutter])
		return -1
	var domain_accents := {}
	for domain_button in shell._domain_navigation.domain_buttons.values():
		if not domain_button is ProvidenceDomainToolButton:
			Fixture._smoke_fail(shell, "domain rail contains a non-shared tool button")
			return -1
		domain_accents[(domain_button as ProvidenceDomainToolButton).accent.to_html()] = true
	if domain_accents.size() < 8:
		Fixture._smoke_fail(shell, "domain rail lost color definition across its twelve tools")
		return -1
	return route_total
