extends RefCounted

signal selection_changed

var _tabs: TabContainer
var _registry
var _changes
var _operations: ProvidenceEditorOperation
var _navigation
var _layout: ProvidenceLayoutCoordinator
var _command_bar: ProvidenceCommandBar
var _encounter_route_tabs: ProvidenceEncounterRouteTabs
var _inspector: Control
var _map_inspector: ProvidenceMapInspector
var _maps
var _issues
var _inspector_host: Control
var _read_context: Callable
var _read_references: Callable
var _viewport_width: Callable


func initialize(tabs: TabContainer, registry, changes, operations: ProvidenceEditorOperation, navigation, layout: ProvidenceLayoutCoordinator, command_bar: ProvidenceCommandBar) -> void:
	_tabs = tabs
	_registry = registry
	_changes = changes
	_operations = operations
	_navigation = navigation
	_layout = layout
	_command_bar = command_bar
	tabs.tab_changed.connect(select_document)
	for route in ["scripts.quests", "scripts.action-points", "scripts.macros"]:
		_registry.view(route).apply_state_changed.connect(_script_apply_state.bind(route))
	_registry.view("text.messages").apply_state_changed.connect(_string_apply_state)
	_registry.view("scripts.global-macros").apply_state_changed.connect(_global_apply_state)

func _global_apply_state() -> void:
	if _registry.identity_for_tab(_tabs.current_tab) == "scripts.global-macros":
		_command_bar.present_document("scripts.global-macros",_registry.view("scripts.global-macros"),false)

func _string_apply_state() -> void:
	if _registry.identity_for_tab(_tabs.current_tab) == "text.messages":
		_command_bar.present_document("text.messages",_registry.view("text.messages"),false)


func configure_inspectors(inspector: Control, map_inspector: ProvidenceMapInspector, inspector_host: Control, maps, issues, read_context: Callable, read_references: Callable, viewport_width: Callable, encounter_route_tabs: ProvidenceEncounterRouteTabs, navigation) -> void:
	_inspector = inspector
	_map_inspector = map_inspector
	_inspector_host = inspector_host
	_maps = maps
	_issues = issues
	_read_context = read_context
	_read_references = read_references
	_viewport_width = viewport_width
	_encounter_route_tabs = encounter_route_tabs
	_encounter_route_tabs.route_requested.connect(navigation.select_route)
	maps.chrome.width_changed.connect(func(width): if _registry.identity_for_tab(_tabs.current_tab) == "maps.land": _layout.set_inspector_width(width))
	_layout.inspector_width_dragged.connect(maps.chrome.remember_width)


func select_document(tab: int) -> void:
	# Tab signals can arrive while the prior document still owns a read lease.
	# Settle only the current destination instead of dropping its chrome update.
	while _operations.busy:
		await _operations.completed
		if tab != _tabs.current_tab: return
	if tab != _tabs.current_tab: return
	var route: String = _registry.identity_for_tab(tab)
	if _encounter_route_tabs != null: _encounter_route_tabs.present_route(route)
	if _issues.tab_changed(tab): return
	var view := _tabs.get_tab_control(tab)
	if view.get_meta("owns_asset_workspace", false):
		await view.activate()
		if tab != _tabs.current_tab: return
		_navigation.activate_domain("assets", false)
		apply_assets_layout()
		_command_bar.set_location("  MEDIA  /  ASSETS")
		_command_bar.commit_button.disabled = true
		_command_bar.set_route_has_commit(false)
		selection_changed.emit()
		return
	var world_special: bool = route in ["maps.special-land","assets.special-land"] and _navigation.special_land_world_context
	if route in ["maps.special-land","assets.special-land"]: view.set_world_context(world_special)
	_command_bar.present_document(route, view, _navigation.special_land_world_context)
	var publish_active := route in ["linter.readiness", "export.export-plan", "export.benchmark"]
	var inspector_suppressed := route in ["records.decoded-records", "records.evidence","scenario.startup", "scenario.restrictions", "scenario.contact", "scenario.registration", "player-maps.map-records"] or world_special or publish_active or route in ["maps.dungeon", "maps.layout", "economy.items", "rules.spells", "combat.battles", "text.messages", "text.spell-check", "scripts.global-macros", "scripts.action-points", "scripts.macros", "scripts.quests", "encounters.simple", "encounters.complex", "encounters.rogue", "encounters.timed"]
	if route in ["maps.dungeon", "maps.layout"]: _inspector.clear_reference("Select a field in this World workbench")
	set_inspector_visible(not inspector_suppressed)
	var map_active := route == "maps.land"
	_inspector.visible = not map_active and not inspector_suppressed
	_map_inspector.visible = map_active
	if not inspector_suppressed:
		_layout.set_inspector_width(_inspector_width_for_route(route, map_active))
	resize_inspector.call_deferred()
	if route in ["maps.special-land", "assets.special-land"]:
		_navigation.activate_domain("maps" if _navigation.special_land_world_context else "assets", false)
	else:
		_navigation.activate_domain(ProvidenceRouteCatalog.domain_for_tab(tab, _navigation.active_domain), false)
	apply_layout(tab)
	_present_selection(route, view)
	if (_read_context.call().connected or route == "combat.scrapbook") and _changes.needs_refresh(route): await refresh_current()
	if tab != _tabs.current_tab: return
	selection_changed.emit()


func _present_selection(route: String, view: Control) -> void:
	var references: Array = _read_references.call()
	match route:
		"records.decoded-records", "records.evidence": view.present_selection()
		"economy.treasure", "economy.shops": view.present_selection()
		"text.messages": view.activate()
		"maps.land":
			if _maps.document.selected_cell.x < 0: _maps.references.show_overview()
		"encounters.simple": _inspector.show_encounter(view.current_encounter(), [], references)
		"scripts.macros": _inspector.show_extra_action_point(view.current_extra_action_point(), [], references)
		"economy.items": set_inspector_visible(false)
		"scripts.action-points": _inspector.show_action_point(view.current_action_point(), [], references)
		"economy.vault": set_inspector_visible(false)
		"assets.pictures", "assets.sounds", "assets.icons": view.present_selection()
		"maps.special-land", "assets.special-land": _inspector.clear_reference("Select a Special Land tile")


func refresh_current(operation: ProvidenceEditorOperation = null) -> Dictionary:
	if _registry.identity_for_tab(_tabs.current_tab) in ["maps.special-land","assets.special-land"] and _navigation.special_land_world_context:
		return {"ok":true}
	var controller = _registry.controller(_registry.identity_for_tab(_tabs.current_tab))
	if controller != null: return await controller.activate(_changes, operation)
	return {"ok": true}


func apply_layout(tab: int = -2) -> void:
	if _tabs == null or _maps == null: return
	_maps.present_paint_workspace()
	if _issues.is_selected():
		_issues.apply_layout()
		return
	if _tabs.get_current_tab_control().get_meta("owns_asset_workspace", false):
		apply_assets_layout()
		return
	if tab < 0: tab = _tabs.current_tab
	var identity: String = _registry.identity_for_tab(tab)
	var profile := "monsters" if identity in ["combat.monsters", "combat.scrapbook", "combat.battles"] else "standard"
	if identity in ["economy.treasure", "economy.shops"]: profile = "economy-authoring"
	if identity in ["economy.items", "rules.spells", "rules.races", "rules.castes"]: profile = "item-authoring"
	if identity in ["scenario.startup", "scenario.restrictions", "scenario.contact", "scenario.registration", "player-maps.map-records"]: profile = "player-scenario"
	if identity in ["encounters.simple", "encounters.complex", "encounters.rogue", "encounters.timed"]: profile = "encounter-authoring"
	if identity in ["scripts.action-points", "scripts.macros", "scripts.global-macros", "text.messages", "text.spell-check"]: profile = "story-authoring"
	if identity in ["scripts.action-points", "scripts.macros", "scripts.quests"]: profile = "script-steps"
	if identity in ["records.decoded-records", "records.evidence"]: profile = "diagnostics"
	if identity in ["linter.readiness", "export.export-plan", "export.benchmark"]: profile = "publish"
	if identity == "maps.land" and not _maps.document.is_dungeon: profile = "land"
	if identity in ["maps.dungeon", "maps.layout"]: profile = "world"
	if identity in ["maps.special-land","assets.special-land"] and _navigation.special_land_world_context: profile = "world"
	_layout.activate(profile, float(_viewport_width.call()))
	if profile == "land": _layout.set_inspector_width(_maps.chrome.preferred_width())


func apply_assets_layout() -> void:
	_layout.activate("assets", float(_viewport_width.call()))


func set_inspector_visible(visible: bool) -> void:
	if _issues.is_selected():
		_layout.set_inspector_visible(false)
		_issues.set_inspector_visible(visible)
		return
	_layout.set_inspector_visible(visible)
	if visible: resize_inspector.call_deferred()


func resize_inspector() -> void:
	if _inspector_host == null or not _inspector_host.visible: return
	if _registry.identity_for_tab(_tabs.current_tab) == "maps.land":
		_layout.set_inspector_width(_maps.chrome.preferred_width())
		return
	if is_instance_valid(_maps.paint.workspace.tiles_dock) and _maps.paint.workspace.tiles_dock.visible:
		_layout.set_inspector_width(352)
		return
	var route: String = _registry.identity_for_tab(_tabs.current_tab)
	_layout.set_inspector_width(_inspector_width_for_route(route, _map_inspector.visible))


func _inspector_width_for_route(route: String, map_active: bool) -> int:
	if map_active: return 340
	if route in ["combat.monsters", "combat.scrapbook"]: return 312
	if route in ["scripts.action-points", "scripts.macros"] and float(_viewport_width.call()) < 1900: return 240
	return 300


func _script_apply_state(can_apply: bool, route: String) -> void:
	if _registry.identity_for_tab(_tabs.current_tab) != route: return
	_command_bar.commit_button.disabled = not can_apply or _operations.busy or _operations.requires_reopen
