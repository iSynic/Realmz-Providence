extends RefCounted


static func run(host: SceneTree, slot: int, xap_identity: String) -> void:
	await host._choose_action(slot, "realmz.action.12")
	await _verify_land_authoring(host, slot, xap_identity)
	await _verify_dungeon_authoring(host, slot, xap_identity)


static func _verify_land_authoring(host: SceneTree, slot: int, xap_identity: String) -> void:
	assert(host._workbench._form_description.action.label == "Change Map Tile")
	assert(host._workbench._field_controls.xOrDungeonY.field.minimum == 0)
	assert(host._workbench._field_controls.xOrDungeonY.field.maximum == 89)
	assert(host._workbench._field_controls.yOrDungeonX.field.minimum == 0)
	assert(host._workbench._field_controls.yOrDungeonX.field.maximum == 89)
	assert(host._choice_labels("isDungeon") == ["Land map", "Dungeon map"])
	await host._select_choice("isDungeon", 0)
	(host._workbench._field_controls.xOrDungeonY.control as SpinBox).value = 89
	(host._workbench._field_controls.yOrDungeonX.control as SpinBox).value = 0
	assert(host._workbench._field_controls.tileValue.field.valuePickerKind == "map-tile")
	host._workbench._field_renderer.accept_target("tileValue", 147)
	await host._settle()
	assert(host._choice_labels("land.markerBand") == ["None", "Action Point", "AP + revealed secret", "AP + hidden secret"])
	await host._select_choice("land.markerBand", 2)
	await host._select_choice("land.note", 0)
	await host._select_choice("land.path", 0)
	await host._view.commit_selected()
	await host._settle()
	assert(not host._view.has_unapplied_changes())
	assert(await host._shell._scripts.open_extra_action_point(xap_identity))
	await host._settle()
	host._workbench.focus_slot(slot)
	await host._settle()
	var step: Dictionary = host._workbench.draft_steps()[slot]
	assert(int(step.settings.values.xOrDungeonY) == 89)
	assert(int(step.settings.values.yOrDungeonX) == 0)
	assert(int(step.settings.values.tileValue) == 2147)
	assert(host._selected_value("land.markerBand") == 2)
	var tile_row := (host._workbench._field_controls.tileValue.control as Control).get_parent()
	var open_map: Button
	for child in tile_row.get_children():
		if child is Button and child.text == "Open destination map": open_map = child
	assert(open_map != null)
	open_map.pressed.emit()
	await host._settle()
	assert(host._shell._documents.identity_for_tab(host._shell._document_tabs.current_tab) == "maps.land")
	assert(host._shell._maps.document.identity == "land:0")
	await host._shell._navigation.navigate_back()
	await host._settle()
	assert(host._shell._documents.identity_for_tab(host._shell._document_tabs.current_tab) == "scripts.macros")
	host._workbench.focus_slot(slot)
	await host._settle()
	await host._select_choice("land.markerBand", 0)
	await _verify_cicn_source_navigation(host, slot, xap_identity)
	host._workbench._field_renderer.accept_target("tileValue", 147)
	await host._settle()
	await host._select_choice("land.markerBand", 0)


static func _verify_dungeon_authoring(host: SceneTree, slot: int, xap_identity: String) -> void:
	await host._select_choice("isDungeon", 1)
	assert(host._workbench._field_controls.has("dungeon.wall"))
	assert(host._workbench._field_controls.has("dungeon.verticalDoor"))
	await host._select_choice("dungeon.wall", 0)
	await host._select_choice("dungeon.verticalDoor", 1)
	await host._view.commit_selected()
	await host._settle()
	assert(await host._shell._scripts.open_extra_action_point(xap_identity))
	await host._settle()
	host._workbench.focus_slot(slot)
	await host._settle()
	var step: Dictionary = host._workbench.draft_steps().filter(func(entry): return int(entry.slot) == slot)[0]
	assert(int(step.settings.values.isDungeon) == 1)
	assert(int(step.settings.values.tileValue) == 150)


static func _verify_cicn_source_navigation(host: SceneTree, slot: int, xap_identity: String) -> void:
	var response: Dictionary = host._shell._bridge.request("action-target.list", {"query": {
		"kind": "map-tile", "search": "cicn", "limit": 100,
		"context": {"mapIdentity": "land:0", "levelType": "land"}}})
	assert(response.get("ok", false))
	var scenario: Dictionary = {}
	var stock: Dictionary = {}
	for value in response.result.get("items", []) as Array:
		var candidate := value as Dictionary
		if candidate.status == "compatibility-resource" and scenario.is_empty(): scenario = candidate
		if candidate.status == "application-resource" and stock.is_empty(): stock = candidate
	assert(not scenario.is_empty() and not stock.is_empty())
	await _open_cicn_source(host, slot, xap_identity, scenario, "scenario", "Open in Scenario Assets")
	await _open_cicn_source(host, slot, xap_identity, stock, "stock", "Open in Stock Assets")


static func _open_cicn_source(host: SceneTree, slot: int, xap_identity: String, target: Dictionary, scope: String, label: String) -> void:
	host._workbench._field_renderer.accept_target("tileValue", int(target.value))
	await host._settle()
	await host._view.commit_selected()
	await host._settle()
	assert(await host._shell._scripts.open_extra_action_point(xap_identity))
	await host._settle()
	host._workbench.focus_slot(slot)
	await host._settle()
	var row := (host._workbench._field_controls.tileValue.control as Control).get_parent()
	var open_source: Button
	for child in row.get_children():
		if child is Button and child.text == label: open_source = child
	assert(open_source != null)
	open_source.pressed.emit()
	await host._settle()
	var assets = host._shell._assets.library_workbench
	assert(is_instance_valid(assets) and assets.current_scope() == scope)
	assert(assets.selected_asset_identity() == str(target.identity))
	await host._shell._navigation.navigate_back()
	await host._settle()
	assert(host._shell._documents.identity_for_tab(host._shell._document_tabs.current_tab) == "scripts.macros")
	host._workbench.focus_slot(slot)
	await host._settle()
