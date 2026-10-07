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

var land: Control
var dungeon: Control
var land_layout: Control
var player_maps: Control
var reference_strings: Control
var story_flags: Control
var text_export: Control
var complex_encounter: Control
var rogue_encounter: Control
var timed_encounter: Control
var battle: Control
var treasure: Control
var shop: Control
var vault: Control
var rules: Array[Control] = []
var scenario_sections: Array[Control] = []
var bounded_readonly: Array[Control] = []
var monsters: Array[Control] = []
var publish: Array[Control] = []
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
	_bind_world(map, preview)
	_bind_diagnostics()
	_bind_catalog(preview)
	_bind_libraries()


func _bind_world(map: ProvidenceMapDocumentController, preview: ProvidenceRebuiltPreviewSelection) -> void:
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
	land_layout = _registry.view("maps.layout")
	layout_commands.initialize(land_layout, _operations, _read_context, _accept_draft)
	layout_commands.projection_applied.connect(projection_applied.emit)
	layout_commands.failed.connect(failed.emit)
	layout_commands.status_changed.connect(status_changed.emit)
	_registry.register_controller("maps.layout", Workbench.new("maps.layout", land_layout, layout_commands.reload, layout_commands.teardown))
	land_layout.cell_update_requested.connect(layout_commands.set_cell)
	land_layout.layout_remove_requested.connect(layout_commands.remove)
	land_layout.map_open_requested.connect(_navigation.open_map)
	player_maps = _registry.view("player-maps.map-records")
	player_map_commands.initialize(player_maps, preview, _operations, _read_context, _accept, _accept_draft)
	player_map_commands.projection_applied.connect(projection_applied.emit)
	player_map_commands.selection_changed.connect(selection_changed.emit)
	player_map_commands.status_changed.connect(status_changed.emit)
	_registry.register_controller("player-maps.map-records", Workbench.new("player-maps.map-records", player_maps, player_map_commands.reload, player_map_commands.teardown))
	player_maps.record_open_requested.connect(func(identity: String):
		player_maps.restore_catalog_selection()
		await _navigation.request_authoring_navigation(player_map_commands.open_record.bind(identity), "opening Player Map " + identity))
	player_maps.map_open_requested.connect(_navigation.open_map)
	player_maps.text_open_requested.connect(scrolling_text_requested.emit)
	player_maps.picture_preview_requested.connect(picture_preview_requested.emit)
	player_maps.source_open_requested.connect(_navigation.open_script_source)
	player_maps.resource_open_requested.connect(_navigation.open_discovery_catalog)


func _bind_catalog(preview: ProvidenceRebuiltPreviewSelection) -> void:
	story_flags = _registry.view("scripts.quests")
	quest_commands.initialize(story_flags, _operations, _read_context, _read_bridge, _accept_draft)
	quest_commands.projection_applied.connect(projection_applied.emit)
	quest_commands.status_changed.connect(status_changed.emit)
	quest_commands.failed.connect(failed.emit)
	story_flags.source_requested.connect(_navigation.open_script_source)
	story_flags.selection_changed.connect(func(quest: Dictionary): _inspector.show_quest(quest, story_flags.used_by()))
	_registry.register_controller("scripts.quests", Workbench.new("scripts.quests", story_flags, quest_commands.reload, quest_commands.teardown))
	reference_strings = _registry.view("text.text-resources")
	reference_commands.initialize(reference_strings, preview, _operations, _read_bridge)
	reference_commands.selection_changed.connect(selection_changed.emit)
	_registry.register_controller("text.text-resources", Workbench.new("text.text-resources", reference_strings, reference_commands.reload, reference_commands.teardown))
	text_export = _registry.view("text.spell-check").configure_navigation(_navigation, _accept_draft, projection_applied.emit)
	complex_encounter = _registry.view("encounters.complex")
	rogue_encounter = _registry.view("encounters.rogue")
	timed_encounter = _registry.view("encounters.timed")
	battle = _registry.view("combat.battles")
	treasure = _registry.view("economy.treasure")
	shop = _registry.view("economy.shops")
	rules = _registry.views_for_routes(["rules.spells", "rules.races", "rules.castes"])
	for editor in rules: editor.route_requested.connect(_navigation.select_tab)
	scenario_sections = _registry.views_for_routes(["scenario.startup", "scenario.restrictions", "scenario.contact", "scenario.registration"])
	for editor in scenario_sections:
		editor.configure_authoring(_accept_draft)
		editor.projection_applied.connect(projection_applied.emit)
		editor.route_requested.connect(_navigation.select_tab)
		editor.map_open_requested.connect(_navigation.open_map)
		editor.document_applied.connect(_inspector.show_scenario_section.bind(editor.route_identity()))
	rule_commands.bind(_registry, _operations, _navigation, _read_context, _read_bridge, _accept_draft, projection_applied.emit)
	ReadonlyEditors.bind_workbenches(bounded_readonly + scenario_sections + [text_export], _registry, _operations, _read_bridge)
	_bind_spells()
	_bind_encounter_authoring()
	_bind_battle()
	_bind_economy()
	_bind_publish_workbenches()


func _bind_spells() -> void:
	var spells: ProvidenceSpellEditor = _registry.view("rules.spells")
	spell_commands.initialize(spells, _operations, _read_context, _read_bridge, _accept_draft)
	spell_commands.configure_navigation(_navigation.open_script_source, _navigation.open_script_target)
	spell_commands.projection_applied.connect(projection_applied.emit)
	spells.navigation_requested.connect(func(action: Callable): await _navigation.request_authoring_navigation(action, "opening a linked Spell destination"))
	_registry.register_controller("rules.spells", Workbench.new("rules.spells", spells, spell_commands.reload, spell_commands.teardown))


func _bind_battle() -> void:
	battle_commands.initialize(battle, _operations, _read_context, _read_bridge, _accept_draft)
	battle_commands.open_target = _navigation.open_script_target
	battle_commands.projection_applied.connect(projection_applied.emit)
	battle_commands.failed.connect(failed.emit)
	battle.get_node("BattleUses").configure(battle, _operations, _read_bridge, _navigation.open_script_source)
	battle.route_requested.connect(_navigation.select_route)
	battle.monster_open_requested.connect(func(id, set_id):
		await _navigation.open_script_target("monster", id, "monster:%d:%d" % [set_id, id], {}))
	_registry.register_controller("combat.battles", Workbench.new("combat.battles", battle, battle_commands.reload, battle.teardown_session))


func _bind_encounter_authoring() -> void:
	for view in [rogue_encounter, timed_encounter]:
		var controller := ProvidenceEncounterAuthoringController.new()
		controller.initialize(view, _operations, _read_context, _read_bridge, _accept_draft, _navigation)
		controller.projection_applied.connect(projection_applied.emit)
		controller.failed.connect(failed.emit)
		view.selection_changed.connect(func(_record, _references): selection_changed.emit())
		encounter_commands.append(controller)
		_registry.register_controller(view.route_identity(), Workbench.new(view.route_identity(), view, controller.reload, controller.teardown))


func _bind_publish_workbenches() -> void:
	publish = _registry.views_for_routes(["linter.readiness", "export.export-plan", "export.benchmark"])
	for view: ProvidencePublishWorkbench in publish:
		var controller := ProvidencePublishWorkbenchController.new()
		controller.initialize(view, _operations, _read_context, _read_bridge)
		controller.status_changed.connect(status_changed.emit)
		controller.failed.connect(failed.emit)
		view.route_requested.connect(_navigation.select_route)
		view.recovery_requested.connect(publish_recovery_requested.emit)
		publish_commands.append(controller)
		_registry.register_controller(view.route_identity(), Workbench.new(view.route_identity(), view, controller.reload, controller.teardown))


func configure_publish_recovery(current_view: Callable, open_project: Callable, import_scenario: Callable, save_as: Callable, status: Callable) -> void:
	_publish_recovery.initialize(current_view, open_project, import_scenario, save_as, status)
	publish_recovery_requested.connect(_publish_recovery.request)


func _bind_economy() -> void:
	_bind_economy_editor(treasure, treasure_commands)
	_bind_economy_editor(shop, shop_commands)
	_economy_navigation.initialize([treasure, _registry.view("economy.items"), shop], _operations, _read_bridge, _navigation.select_route)


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
	monsters = _registry.views_for_routes(["combat.monsters", "combat.scrapbook"])
	for editor in monsters:
		editor.configure_operations(_operations, _read_bridge)
		editor.configure_authoring(_accept_draft)
		editor.configure_reference_navigation(_navigation.open_script_target, _navigation.open_script_source)
		editor.projection_applied.connect(projection_applied.emit)
		_registry.register_controller(editor.route_identity(), Workbench.new(editor.route_identity(), editor, editor.refresh_workbench, editor.clear_selection))
		editor.route_requested.connect(_navigation.select_tab)
		editor.document_applied.connect(_inspector.show_monster_context)
	vault = _registry.view("economy.vault")
	vault.configure_operations(_operations, _read_bridge)
	_registry.register_controller("economy.vault", Workbench.new("economy.vault", vault, vault.refresh_workbench, vault.teardown_session))
	vault.artwork_applied.connect(artwork_applied.emit)


func open_reference_string(identity: String) -> Dictionary:
	return await reference_commands.open_group(identity)


func open_quest(id: int) -> Dictionary:
	return await quest_commands.open_id(id)


func restore_reference_location(state: Dictionary) -> bool:
	var identity := str(state.get("identity", ""))
	if identity.is_empty(): return false
	reference_strings.prime_navigation_state(state)
	var response: Dictionary = await reference_commands.open_group(identity)
	if not bool(response.get("ok", false)): return false
	return reference_strings.restore_navigation_state(state)


func attach_session(bridge: RefCounted) -> void:
	player_map_commands.attach_session(bridge)
	dungeon_cells.attach_session(bridge)
	layout_commands.attach_session(bridge)
	for controller in publish_commands: controller.attach_session()


func clear_readonly() -> void:
	spell_commands.teardown()
	rule_commands.teardown()
	for controller in encounter_commands: controller.teardown()
	for editor in bounded_readonly + scenario_sections + monsters:
		if editor.has_method("teardown_session"): editor.teardown_session()
		else: editor.clear_selection()
	treasure_commands.teardown()
	shop_commands.teardown()
	for controller in publish_commands: controller.teardown()


func reset_projection() -> void:
	land_layout.clear()
	player_maps.set_catalog({"records": [], "total": 0})
	player_maps.set_document({})
	reference_strings.clear()
	story_flags.clear()
	clear_readonly()


func configure_compile_capabilities(project_backed: bool) -> void:
	for contract in [
		["economy.items", "Open a persistent Providence project to compile compatibility-backed Data NI output."],
		["encounters.simple", "Open a persistent imported project to compile compatibility-backed Data ED output."],
		["scripts.macros", "Open a persistent imported project to compile compatibility-backed Data ED3 output."],
		["scripts.global-macros", "Open a persistent imported project to compile compatibility-backed Global output."],
		["scripts.action-points", "Open a persistent imported project to compile compatibility-backed Data DD output."],
		["assets.pictures", "Open a persistent Providence project to compile Scenario.rsrc."],
		["assets.sounds", "Open a persistent Providence project to compile Scenario.rsrc."],
		["assets.icons", "Open a persistent Providence project to compile Scenario.rsrc."],
		["maps.special-land", "Open a persistent Providence project to compile Data LD and Scenario.rsrc."],
	]:
		_registry.view(contract[0]).set_compile_available(project_backed, contract[1])


func dispose() -> void:
	_economy_navigation.dispose()
	spell_commands.dispose()
	rule_commands.dispose()
	layout_commands.dispose()
	for controller in encounter_commands: controller.teardown()
	player_map_commands.dispose()
	reference_commands.dispose()
	quest_commands.dispose()
	for controller in publish_commands: controller.teardown()


func _bind_diagnostics() -> void:
	var records: Control = _registry.view("records.decoded-records")
	var evidence: Control = _registry.view("records.evidence")
	var issues: Control = _registry.view("linter.issues")
	bounded_readonly.assign([records, evidence])
	for view in [records,evidence]: view.status_changed.connect(status_changed.emit)
	records.configure_navigation(_navigation)
	issues.configure_diagnostics(_operations, _read_bridge)
	for view in [records, evidence, issues]: view.route_requested.connect(_navigation.select_route)
	for view in [records, issues]: view.find_uses_requested.connect(func():
		if _diagnostic_commands.is_valid(): _diagnostic_commands.call(&"navigate.used-by"))
	records.finding_requested.connect(func(finding):
		await _navigation.select_route("linter.issues")
		if issues.is_visible_in_tree(): issues.focus_finding(finding))
	for view in [records, issues]: view.evidence_requested.connect(func(path):
		await _navigation.select_route("records.evidence")
		if evidence.is_visible_in_tree(): await evidence.open_source(path))
	evidence.records_requested.connect(func(path):
		await _navigation.select_route("records.decoded-records")
		if records.is_visible_in_tree(): await records.filter_source(path))
	issues.records_requested.connect(func(identity):
		await _navigation.select_route("records.decoded-records")
		if records.is_visible_in_tree(): await records.filter_identity(identity))
	evidence.assets_requested.connect(_navigation.select_route.bind("assets.project-assets"))
