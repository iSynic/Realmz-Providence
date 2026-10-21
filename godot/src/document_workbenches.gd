extends RefCounted

signal projection_applied(projection: Dictionary)
signal failed(message: String)
signal status_changed(message: String)
signal selection_changed
signal artwork_applied(projection: Dictionary, record_index: int)
signal land_cell_selected(x: int, y: int, tile: int, action_point: Dictionary)
signal dungeon_cell_selected(x: int, y: int, tile: int, action_point: Dictionary)
signal action_point_activated(identity: String)
signal scrolling_text_requested(resource_id: int)
signal picture_preview_requested(resource_id: int)
signal publish_recovery_requested(action: String)

const Workbench = preload("res://src/workbench_controller.gd")
const ReadonlyEditors = preload("res://src/readonly_editor_registry.gd")

const RULE_ROUTES := ["rules.spells", "rules.races", "rules.castes"]
const SCENARIO_ROUTES := ["scenario.startup", "scenario.restrictions", "scenario.contact", "scenario.registration"]
const ENCOUNTER_ROUTES := ["encounters.rogue", "encounters.timed"]
const ECONOMY_ROUTES := ["economy.treasure", "economy.shops"]
const MONSTER_ROUTES := ["combat.monsters", "combat.scrapbook"]
const DIAGNOSTIC_ROUTES := ["records.decoded-records", "records.evidence"]
const PUBLISH_ROUTES := ["linter.readiness", "export.export-plan", "export.benchmark"]

var land: Control
var dungeon: Control
# Lazy pages: reading one of these realizes its page group (see lazy-workbench-pages.md).
var land_layout: Control:
	get: return _registry.view("maps.layout")
var player_maps: Control:
	get: return _registry.view("player-maps.map-records")
var story_flags: Control:
	get: return _registry.view("scripts.quests")
var reference_strings: Control:
	get: return _registry.view("text.text-resources")
var text_export: Control:
	get: return _registry.view("text.spell-check")
var rogue_encounter: Control:
	get: return _registry.view("encounters.rogue")
var timed_encounter: Control:
	get: return _registry.view("encounters.timed")
var battle: Control:
	get: return _registry.view("combat.battles")
var treasure: Control:
	get: return _registry.view("economy.treasure")
var shop: Control:
	get: return _registry.view("economy.shops")
var vault: Control:
	get: return _registry.view("economy.vault")
var rules: Array[Control]:
	get: return _registry.views_for_routes(RULE_ROUTES)
var scenario_sections: Array[Control]:
	get: return _registry.views_for_routes(SCENARIO_ROUTES)
var monsters: Array[Control]:
	get: return _registry.views_for_routes(MONSTER_ROUTES)
var publish: Array[Control]:
	get: return _registry.views_for_routes(PUBLISH_ROUTES)
var publish_commands: Array[ProvidencePublishWorkbenchController] = []
var encounter_commands: Array[ProvidenceEncounterAuthoringController] = []
var dungeon_cells := preload("res://src/dungeon_cell_controller.gd").new()
var layout_commands := preload("res://src/land_layout_controller.gd").new()
var player_map_commands := preload("res://src/player_maps_controller.gd").new()
var reference_commands := preload("res://src/reference_strings_controller.gd").new()
var quest_commands := preload("res://src/quest_controller.gd").new()
var treasure_commands := preload("res://src/economy_record_controller.gd").new()
var shop_commands := preload("res://src/economy_record_controller.gd").new()
var battle_commands := preload("res://src/battle_authoring_controller.gd").new()
var spell_commands := preload("res://src/spell_workbench_controller.gd").new()
var rule_commands := preload("res://src/rule_workbenches.gd").new()
var _publish_recovery := preload("res://src/publish_recovery_router.gd").new()
var _economy_navigation := preload("res://src/economy_navigation_controller.gd").new()

var _registry
var _operations: ProvidenceEditorOperation
var _navigation
var _inspector
var _read_context: Callable
var _read_bridge: Callable
var _accept: Callable
var _accept_draft: Callable
var _diagnostic_commands: Callable
var _preview: ProvidenceRebuiltPreviewSelection
var _project_backed := false
var _bridge: RefCounted


func initialize(registry, operations: ProvidenceEditorOperation, navigation, inspector) -> void:
	_registry = registry
	_operations = operations
	_navigation = navigation
	_inspector = inspector


func configure_session_access(read_context: Callable, read_bridge: Callable, accept_response: Callable, accept_draft: Callable, diagnostic_commands := Callable()) -> void:
	_diagnostic_commands = diagnostic_commands
	_read_context = read_context
	_read_bridge = read_bridge
	_accept = accept_response
	_accept_draft = accept_draft


func bind_documents(map: ProvidenceMapDocumentController, preview: ProvidenceRebuiltPreviewSelection) -> void:
	_preview = preview
	_bind_world(map)
	_bind_diagnostics()
	_bind_catalog()
	_bind_libraries()
	_bind_compile_capabilities()


func _bind_world(map: ProvidenceMapDocumentController) -> void:
	land = _registry.view("maps.land")
	land.cell_selected.connect(land_cell_selected.emit)
	land.action_point_activated.connect(action_point_activated.emit)
	dungeon = _registry.view("maps.dungeon")
	dungeon_cells.initialize(dungeon, map, _operations, _read_context, _accept_draft)
	dungeon_cells.projection_applied.connect(projection_applied.emit)
	dungeon_cells.failed.connect(failed.emit)
	dungeon_cells.status_changed.connect(status_changed.emit)
	dungeon.cell_selected.connect(dungeon_cell_selected.emit)
	dungeon.action_point_activated.connect(action_point_activated.emit)
	_registry.on_realize("maps.layout", _bind_layout)
	_registry.on_realize("player-maps.map-records", _bind_player_maps)


func _bind_layout(page: Control) -> void:
	layout_commands.initialize(page, _operations, _read_context, _accept_draft)
	layout_commands.projection_applied.connect(projection_applied.emit)
	layout_commands.failed.connect(failed.emit)
	layout_commands.status_changed.connect(status_changed.emit)
	if _bridge != null: layout_commands.attach_session(_bridge)
	_registry.register_controller("maps.layout", Workbench.new("maps.layout", page, layout_commands.reload, layout_commands.teardown))
	page.cell_update_requested.connect(layout_commands.set_cell)
	page.layout_remove_requested.connect(layout_commands.remove)
	page.map_open_requested.connect(_navigation.open_map)


func _bind_player_maps(page: Control) -> void:
	player_map_commands.initialize(page, _preview, _operations, _read_context, _accept, _accept_draft)
	player_map_commands.projection_applied.connect(projection_applied.emit)
	player_map_commands.selection_changed.connect(selection_changed.emit)
	player_map_commands.status_changed.connect(status_changed.emit)
	if _bridge != null: player_map_commands.attach_session(_bridge)
	_registry.register_controller("player-maps.map-records", Workbench.new("player-maps.map-records", page, player_map_commands.reload, player_map_commands.teardown))
	page.record_open_requested.connect(func(identity: String):
		page.restore_catalog_selection()
		await _navigation.request_authoring_navigation(player_map_commands.open_record.bind(identity), "opening Player Map " + identity))
	page.map_open_requested.connect(_navigation.open_map)
	page.text_open_requested.connect(scrolling_text_requested.emit)
	page.picture_preview_requested.connect(picture_preview_requested.emit)
	page.source_open_requested.connect(_navigation.open_script_source)
	page.resource_open_requested.connect(_navigation.open_discovery_catalog)


func _bind_catalog() -> void:
	_registry.on_realize("text.messages", _bind_strings)
	_registry.on_realize("scripts.quests", _bind_quests)
	_registry.on_realize("text.text-resources", _bind_reference_strings)
	_registry.on_realize("text.spell-check", _bind_text_export)
	_registry.on_realize_group(RULE_ROUTES, _bind_rules)
	_registry.on_realize_group(SCENARIO_ROUTES, _bind_scenario_sections)
	_registry.on_realize_group(ENCOUNTER_ROUTES, _bind_encounter_authoring)
	_registry.on_realize("combat.battles", _bind_battle)
	_registry.on_realize_group(ECONOMY_ROUTES, _bind_economy)
	_registry.on_realize_group(PUBLISH_ROUTES, _bind_publish_workbenches)


func _bind_strings(page: ProvidenceStringEditor) -> void:
	page.selection_changed.connect(_show_message.bind(page))
	page.projection_applied.connect(projection_applied.emit)
	page.configure_navigation(_navigation.select_route, _navigation.open_script_source, _navigation.request_authoring_navigation)
	page.failed.connect(failed.emit)
	_registry.register_controller("text.messages", Workbench.new("text.messages", page, page.refresh_workbench, page.teardown))
	if _bridge != null: _attach_strings(page)


func _attach_strings(page: ProvidenceStringEditor) -> void:
	page.attach_session(_bridge, _read_context, _accept, _accept_draft, 0, _operations)


func _show_message(message: Dictionary, page: ProvidenceStringEditor) -> void:
	if str(message.get("identity", "")).begins_with("option-label:"): _inspector.show_option_label(message, page.used_by())
	else: _inspector.show_message(message, page.used_by())


func _bind_quests(page: Control) -> void:
	quest_commands.initialize(page, _operations, _read_context, _read_bridge, _accept_draft)
	quest_commands.projection_applied.connect(projection_applied.emit)
	quest_commands.status_changed.connect(status_changed.emit)
	quest_commands.failed.connect(failed.emit)
	page.source_requested.connect(_navigation.open_script_source)
	page.selection_changed.connect(func(quest: Dictionary): _inspector.show_quest(quest, page.used_by()))
	_registry.register_controller("scripts.quests", Workbench.new("scripts.quests", page, quest_commands.reload, quest_commands.teardown))


func _bind_reference_strings(page: Control) -> void:
	reference_commands.initialize(page, _preview, _operations, _read_bridge)
	reference_commands.selection_changed.connect(selection_changed.emit)
	_registry.register_controller("text.text-resources", Workbench.new("text.text-resources", page, reference_commands.reload, reference_commands.teardown))


func _bind_text_export(page: Control) -> void:
	page.configure_navigation(_navigation, _accept_draft, projection_applied.emit)
	ReadonlyEditors.bind_workbenches([page], _registry, _operations, _read_bridge)


func _bind_scenario_sections(pages: Array[Control]) -> void:
	for editor in pages:
		editor.configure_authoring(_accept_draft)
		editor.projection_applied.connect(projection_applied.emit)
		editor.route_requested.connect(_navigation.select_tab)
		editor.map_open_requested.connect(_navigation.open_map)
		editor.document_applied.connect(_inspector.show_scenario_section.bind(editor.route_identity()))
	ReadonlyEditors.bind_workbenches(pages, _registry, _operations, _read_bridge)


func _bind_rules(pages: Array[Control]) -> void:
	for editor in pages: editor.route_requested.connect(_navigation.select_tab)
	rule_commands.bind(_registry, _operations, _navigation, _read_context, _read_bridge, _accept_draft, projection_applied.emit)
	var spells: ProvidenceSpellEditor = pages[0]
	spell_commands.initialize(spells, _operations, _read_context, _read_bridge, _accept_draft)
	spell_commands.configure_navigation(_navigation.open_script_source, _navigation.open_script_target)
	spell_commands.projection_applied.connect(projection_applied.emit)
	spells.navigation_requested.connect(func(action: Callable): await _navigation.request_authoring_navigation(action, "opening a linked Spell destination"))
	_registry.register_controller("rules.spells", Workbench.new("rules.spells", spells, spell_commands.reload, spell_commands.teardown))


func _bind_battle(page: Control) -> void:
	battle_commands.initialize(page, _operations, _read_context, _read_bridge, _accept_draft)
	battle_commands.open_target = _navigation.open_script_target
	battle_commands.projection_applied.connect(projection_applied.emit)
	battle_commands.failed.connect(failed.emit)
	page.get_node("BattleUses").configure(page, _operations, _read_bridge, _navigation.open_script_source)
	page.route_requested.connect(_navigation.select_route)
	page.monster_open_requested.connect(func(id, set_id):
		await _navigation.open_script_target("monster", id, "monster:%d:%d" % [set_id, id], {}))
	_registry.register_controller("combat.battles", Workbench.new("combat.battles", page, battle_commands.reload, page.teardown_session))


func _bind_encounter_authoring(pages: Array[Control]) -> void:
	for view in pages:
		var controller := ProvidenceEncounterAuthoringController.new()
		controller.initialize(view, _operations, _read_context, _read_bridge, _accept_draft, _navigation)
		controller.projection_applied.connect(projection_applied.emit)
		controller.failed.connect(failed.emit)
		view.selection_changed.connect(func(_record, _references): selection_changed.emit())
		encounter_commands.append(controller)
		_registry.register_controller(view.route_identity(), Workbench.new(view.route_identity(), view, controller.reload, controller.teardown))


func _bind_publish_workbenches(pages: Array[Control]) -> void:
	for view: ProvidencePublishWorkbench in pages:
		var controller := ProvidencePublishWorkbenchController.new()
		controller.initialize(view, _operations, _read_context, _read_bridge)
		controller.status_changed.connect(status_changed.emit)
		controller.failed.connect(failed.emit)
		view.route_requested.connect(_navigation.select_route)
		view.recovery_requested.connect(publish_recovery_requested.emit)
		# A page realized after startup is already in the tree and takes the
		# session-open step it missed; startup pages get it when a session opens.
		if view.is_inside_tree(): controller.attach_session()
		publish_commands.append(controller)
		_registry.register_controller(view.route_identity(), Workbench.new(view.route_identity(), view, controller.reload, controller.teardown))


func configure_publish_recovery(current_view: Callable, open_project: Callable, import_scenario: Callable, save_as: Callable, status: Callable) -> void:
	_publish_recovery.initialize(current_view, open_project, import_scenario, save_as, status)
	publish_recovery_requested.connect(_publish_recovery.request)


func _bind_economy(pages: Array[Control]) -> void:
	_bind_economy_editor(pages[0], treasure_commands)
	_bind_economy_editor(pages[1], shop_commands)
	_economy_navigation.initialize([pages[0], _registry.view("economy.items"), pages[1]], _operations, _read_bridge, _navigation.select_route)


func _bind_economy_editor(editor: ProvidenceEconomyRecordEditor, controller: ProvidenceEconomyRecordController) -> void:
	controller.initialize(editor, _operations, _read_context, _read_bridge, _accept_draft)
	controller.projection_applied.connect(projection_applied.emit)
	controller.failed.connect(failed.emit)
	controller.status_changed.connect(status_changed.emit)
	editor.route_requested.connect(_navigation.select_route)
	editor.item_open_requested.connect(_open_economy_item)
	_registry.register_controller(editor.route_identity(), Workbench.new(editor.route_identity(), editor, controller.reload, controller.teardown))


func _open_economy_item(identity: String) -> void:
	await _navigation.select_route("economy.items")
	var item_editor: Control = _registry.view("economy.items")
	if item_editor.is_visible_in_tree(): await item_editor.open_item(identity)


func _bind_libraries() -> void:
	_registry.on_realize_group(MONSTER_ROUTES, _bind_monsters)
	_registry.on_realize("economy.vault", _bind_vault)


func _bind_monsters(pages: Array[Control]) -> void:
	for editor in pages:
		editor.configure_operations(_operations, _read_bridge)
		editor.configure_authoring(_accept_draft)
		editor.configure_reference_navigation(_navigation.open_script_target, _navigation.open_script_source)
		editor.projection_applied.connect(projection_applied.emit)
		_registry.register_controller(editor.route_identity(), Workbench.new(editor.route_identity(), editor, editor.refresh_workbench, editor.clear_selection))
		editor.route_requested.connect(_navigation.select_tab)
		editor.document_applied.connect(_inspector.show_monster_context)


func _bind_vault(page: Control) -> void:
	page.configure_operations(_operations, _read_bridge)
	_registry.register_controller("economy.vault", Workbench.new("economy.vault", page, page.refresh_workbench, page.teardown_session))
	page.artwork_applied.connect(artwork_applied.emit)


func open_reference_string(identity: String) -> Dictionary:
	_registry.view("text.text-resources")
	return await reference_commands.open_group(identity)


func open_quest(id: int) -> Dictionary:
	_registry.view("scripts.quests")
	return await quest_commands.open_id(id)


func restore_reference_location(state: Dictionary) -> bool:
	var identity := str(state.get("identity", ""))
	if identity.is_empty(): return false
	reference_strings.prime_navigation_state(state)
	var response: Dictionary = await reference_commands.open_group(identity)
	if not bool(response.get("ok", false)): return false
	return reference_strings.restore_navigation_state(state)


# A page realized during a session attaches when it binds; see _bind_strings.
func attach_session(bridge: RefCounted) -> void:
	_bridge = bridge
	var strings: Control = _registry.peek("text.messages")
	if strings != null: _attach_strings(strings)
	if _registry.peek("player-maps.map-records") != null: player_map_commands.attach_session(bridge)
	dungeon_cells.attach_session(bridge)
	if _registry.peek("maps.layout") != null: layout_commands.attach_session(bridge)
	for controller in publish_commands: controller.attach_session()


func teardown() -> void:
	_bridge = null
	if _registry.peek("player-maps.map-records") != null: player_map_commands.teardown()
	dungeon_cells.teardown()


# Session fan-out visits realized pages only; an unrealized page has no state to clear
# and its controllers are not yet initialized.
func clear_readonly() -> void:
	if _registry.peek("rules.spells") != null:
		spell_commands.teardown()
		rule_commands.teardown()
	for controller in encounter_commands: controller.teardown()
	for editor in _realized(DIAGNOSTIC_ROUTES) + _realized(SCENARIO_ROUTES) + _realized(MONSTER_ROUTES):
		if editor.has_method("teardown_session"): editor.teardown_session()
		else: editor.clear_selection()
	if _registry.peek("economy.treasure") != null:
		treasure_commands.teardown()
		shop_commands.teardown()
	for controller in publish_commands: controller.teardown()


func reset_projection() -> void:
	var layout: Control = _registry.peek("maps.layout")
	if layout != null: layout.clear()
	var players: Control = _registry.peek("player-maps.map-records")
	if players != null:
		players.set_catalog({"records": [], "total": 0})
		players.set_document({})
	var references: Control = _registry.peek("text.text-resources")
	if references != null: references.clear()
	var quests: Control = _registry.peek("scripts.quests")
	if quests != null: quests.clear()
	clear_readonly()


func clear_vault() -> void:
	var page: Control = _registry.peek("economy.vault")
	if page != null: page.clear()


func _realized(routes: Array) -> Array[Control]:
	var pages: Array[Control] = []
	for route in routes:
		var page: Control = _registry.peek(route)
		if page != null: pages.append(page)
	return pages


const COMPILE_CONTRACTS := {
	"economy.items": "Open a persistent Providence project to compile compatibility-backed Data NI output.",
	"encounters.simple": "Open a persistent imported project to compile compatibility-backed Data ED output.",
	"scripts.macros": "Open a persistent imported project to compile compatibility-backed Data ED3 output.",
	"scripts.global-macros": "Open a persistent imported project to compile compatibility-backed Global output.",
	"scripts.action-points": "Open a persistent imported project to compile compatibility-backed Data DD output.",
	"assets.pictures": "Open a persistent Providence project to compile Scenario.rsrc.",
	"assets.sounds": "Open a persistent Providence project to compile Scenario.rsrc.",
	"assets.icons": "Open a persistent Providence project to compile Scenario.rsrc.",
	"maps.special-land": "Open a persistent Providence project to compile Data LD and Scenario.rsrc.",
}


# Applies to realized pages now; a page realized later takes the current state when it binds.
func configure_compile_capabilities(project_backed: bool) -> void:
	_project_backed = project_backed
	for route in COMPILE_CONTRACTS:
		var page: Control = _registry.peek(route)
		if page != null: page.set_compile_available(project_backed, COMPILE_CONTRACTS[route])


# Startup pages are not in the tree yet; they take the state from the first configure call.
func _bind_compile_capabilities() -> void:
	for route in COMPILE_CONTRACTS:
		if _registry.peek(route) == null: _registry.on_realize(route, _apply_compile_capability.bind(route))


func _apply_compile_capability(page: Control, route: String) -> void:
	page.set_compile_available(_project_backed, COMPILE_CONTRACTS[route])


func dispose() -> void:
	_economy_navigation.dispose()
	if _registry.peek("rules.spells") != null: spell_commands.dispose()
	rule_commands.dispose()
	if _registry.peek("maps.layout") != null: layout_commands.dispose()
	for controller in encounter_commands: controller.teardown()
	if _registry.peek("player-maps.map-records") != null: player_map_commands.dispose()
	if _registry.peek("text.text-resources") != null: reference_commands.dispose()
	if _registry.peek("scripts.quests") != null: quest_commands.dispose()
	for controller in publish_commands: controller.teardown()


# Issues, Decoded Records and Evidence link to each other by route, so each binds on its own.
func _bind_diagnostics() -> void:
	_registry.on_realize("records.decoded-records", _bind_decoded_records)
	_registry.on_realize("records.evidence", _bind_evidence)
	_registry.on_realize("linter.issues", _bind_issues)


func _bind_decoded_records(records: Control) -> void:
	ReadonlyEditors.bind_workbenches([records], _registry, _operations, _read_bridge)
	records.status_changed.connect(status_changed.emit)
	records.configure_navigation(_navigation)
	records.route_requested.connect(_navigation.select_route)
	records.find_uses_requested.connect(_find_uses)
	records.finding_requested.connect(_open_finding)
	records.evidence_requested.connect(_open_evidence)


func _bind_evidence(evidence: Control) -> void:
	ReadonlyEditors.bind_workbenches([evidence], _registry, _operations, _read_bridge)
	evidence.status_changed.connect(status_changed.emit)
	evidence.route_requested.connect(_navigation.select_route)
	evidence.records_requested.connect(_open_records.bind("filter_source"))
	evidence.assets_requested.connect(_navigation.select_route.bind("assets.project-assets"))


func _bind_issues(issues: Control) -> void:
	issues.configure_diagnostics(_operations, _read_bridge)
	issues.route_requested.connect(_navigation.select_route)
	issues.find_uses_requested.connect(_find_uses)
	issues.evidence_requested.connect(_open_evidence)
	issues.records_requested.connect(_open_records.bind("filter_identity"))


func _find_uses() -> void:
	if _diagnostic_commands.is_valid(): _diagnostic_commands.call(&"navigate.used-by")


func _open_finding(finding: Dictionary) -> void:
	await _navigation.select_route("linter.issues")
	var issues: Control = _registry.view("linter.issues")
	if issues.is_visible_in_tree(): issues.focus_finding(finding)


func _open_evidence(path: String) -> void:
	await _navigation.select_route("records.evidence")
	var evidence: Control = _registry.view("records.evidence")
	if evidence.is_visible_in_tree(): await evidence.open_source(path)


func _open_records(value: String, method: String) -> void:
	await _navigation.select_route("records.decoded-records")
	var records: Control = _registry.view("records.decoded-records")
	if records.is_visible_in_tree(): await records.call(method, value)
