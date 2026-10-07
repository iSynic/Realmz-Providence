extends SceneTree

const BrowserState = preload("res://src/monster_browser_state.gd")
var _failed := false

class LibraryBridge:
	extends RefCounted
	var project_revision := 7
	var calls: Array = []
	var wrong_identity := false
	var row_count := 1
	func request(method: String, params: Dictionary) -> Dictionary:
		calls.append({"method": method, "params": params.duplicate(true)})
		if method == "monster-library.list":
			var custom: bool = params.get("ownership", "all") == "custom"
			var items: Array = []
			for index in mini(row_count, int(params.limit)):
				items.append({
				"identity": ("library:custom:" if custom else "library:stock:") + str(index), "label": "Fixture Monster %d" % index,
				"ownership": "custom" if custom else "built-in", "preferredScenarioMonsterId": 0,
				"hitDice": 3, "armor": 15, "agility": 16, "iconId": 392,
			})
			return {"ok": true, "result": {"revision": 2, "offset": params.offset, "total": 200, "items": items}}
		if method == "monster-library.open":
			return {"ok": true, "result": {"revision": 2, "projectRevision": project_revision, "protected": true, "entry": {
				"identity": "wrong" if wrong_identity else params.identity,
				"ownership": "built-in", "label": "Fixture Monster", "template": {},
			}}}
		return {"ok": false, "error": "Unexpected library mutation"}

class ReadonlyBridge:
	extends RefCounted
	var revision := 7
	var calls: Array = []
	var fail_catalog := false
	var wrong_identity := false

	func request(method: String, params: Dictionary) -> Dictionary:
		calls.append({"method": method, "params": params.duplicate(true)})
		if method == "monster.catalog":
			if fail_catalog:
				return {"ok": false, "error": "Catalog disconnected"}
			return {"ok": true, "result": {"revision": revision, "catalog": {
				"offset": params.offset, "limit": params.limit, "total": 300,
				"items": [{"nativeId": 1, "displayName": "Normal label", "displaySetId": 0,
					"selectedIdentity": null if params.setId == -1 else "monster:0:1", "availableSets": [0]}],
			}}}
		if method == "monster.open":
			if params.setId == -1:
				return {"ok": false, "error": "Mega 1 is missing"}
			return {"ok": true, "result": {"revision": revision, "setId": params.setId,
				"monster": {"nativeId": params.nativeId,
					"identity": "monster:0:999" if wrong_identity else "monster:%d:%d" % [params.setId, params.nativeId]},
				"references": [{"targetId": "message:1"}], "diagnostics": [],
			}}
		return {"ok": false, "error": "Unexpected command"}

class CombinedBridge:
	extends ReadonlyBridge
	var library := LibraryBridge.new()
	func request(method: String, params: Dictionary) -> Dictionary:
		if method.begins_with("monster-library."):
			library.project_revision = revision
			return library.request(method, params)
		return super.request(method, params)


func _initialize() -> void:
	call_deferred("_run")


func _check_library_configuration() -> void:
	var bridge = load("res://src/native_bridge.gd").new()
	var original_env := OS.get_environment("PROVIDENCE_MONSTER_LIBRARY_ROOT")
	var key := "providence/monster_library_root"
	var original_setting: Variant = ProjectSettings.get_setting(key)
	OS.set_environment("PROVIDENCE_MONSTER_LIBRARY_ROOT", "")
	ProjectSettings.set_setting(key, "")
	var args := PackedStringArray(["serve-project", "project"])
	var personal: String = bridge._append_monster_library(args, "")
	_check(personal.ends_with("/monster-library") and args.has("--personal-monster-library-root"), "Fresh native authoring did not provide a personal Monster Library")
	ProjectSettings.set_setting(key, "F:/fixture/settings-library")
	_check(bridge.configured_monster_library_root() == "F:/fixture/settings-library", "Project Monster Library setting was ignored")
	OS.set_environment("PROVIDENCE_MONSTER_LIBRARY_ROOT", " F:/fixture/environment-library ")
	_check(bridge.configured_monster_library_root() == "F:/fixture/environment-library", "Environment Monster Library precedence is wrong")
	args = PackedStringArray(["serve-project", "project"])
	_check(bridge._append_monster_library(args, "F:/fixture/explicit-library") == "F:/fixture/explicit-library", "Explicit Monster Library precedence is wrong")
	_check(args == PackedStringArray(["serve-project", "project", "--monster-library-root", "F:/fixture/explicit-library"]), "Monster Library launch argument was lost")
	bridge._monster_library_root = "F:/fixture/attached"
	bridge.stop()
	_check(bridge.current_monster_library_root().is_empty(), "Stopped bridge retained Monster Library attachment")
	OS.set_environment("PROVIDENCE_MONSTER_LIBRARY_ROOT", original_env)
	ProjectSettings.set_setting(key, original_setting)


func _check_workbench() -> void:
	var workbench = load("res://src/monster_workbench.tscn").instantiate()
	workbench.size = Vector2(1510, 726)
	root.add_child(workbench)
	await process_frame
	var bridge := ReadonlyBridge.new()
	var contexts: Array = []
	workbench.context_changed.connect(func(context: Dictionary): contexts.append(context))
	workbench.attach(bridge)
	_check((await workbench.browser.open_record(1)).ok, "Workbench scenario selection failed")
	_check(workbench.form.visible and not workbench.preview.visible, "Scenario detail did not replace preview")
	_check(contexts[-1].kind == "scenario-monster", "Scenario Inspector context is wrong")
	workbench.form.set_requested.emit(-1)
	_check(workbench.form.visible and workbench.browser.detail.is_empty(), "Missing set did not clear record")
	_check(not workbench.form.get_node("Content/SetPanel/MonsterSetToolbar/Sets/Normal").disabled, "Missing set trapped navigation")
	_check(contexts[-1].is_empty(), "Missing set retained Inspector context")
	workbench.form.set_requested.emit(0)
	_check(not workbench.browser.detail.is_empty(), "Could not recover Normal after missing Mega")
	await workbench._show_library({"projectRevision": 7, "protected": true, "entry": {
		"identity": "library:stock:8", "ownership": "built-in", "label": "Fixture reference",
		"description": "Library text", "template": {},
	}})
	_check(workbench.form.visible and not workbench.preview.visible, "Protected Library selection did not use the complete record form")
	_check(workbench.browser.native_id == 1, "Library selection lost replacement target")
	_check(contexts[-1].kind == "monster-library-entry", "Library Inspector context is wrong")
	await workbench._show_library({"projectRevision": 6, "protected": true, "entry": {"identity": "library:stock:8", "ownership": "built-in"}})
	_check(not workbench.preview.visible and workbench.preview.current_identity().is_empty() and contexts[-1].is_empty(), "Stale project revision retained Library names or Inspector context")
	await workbench._show_library({"protected": true, "entry": {"identity": "library:stock:8", "ownership": "built-in"}})
	_check(not workbench.preview.visible, "Missing project revision was accepted")
	await workbench._show_library({"projectRevision": 7, "protected": false, "entry": {
		"identity": "library:custom:8", "ownership": "custom", "label": "Fixture override",
		"description": "Independent custom text", "template": {"displayName": "Custom frog"},
		"origin": {"kind": "built-in-override"},
	}})
	_check(workbench.form.visible and not workbench.preview.visible, "Custom entry did not use the complete record form")
	_check(workbench.draft.document.entry.identity == "library:custom:8", "Custom identity was replaced by scenario ID")
	_check(workbench.form.get_node("Content/MonsterRecordActions/Restore").visible, "Override restore action is missing")
	_check(not workbench.form.get_node("Content/SetPanel").visible, "Scenario sets leaked into Library template")
	for button in workbench.form.get_node("Content/MonsterRecordActions").get_children():
		if button is Button: _check(button.disabled, "Unconnected Custom Library mutation is enabled")
	_check(workbench.custom_library.set_projection({"protected": false, "entry": {
		"identity": "library:variant:9", "ownership": "custom", "origin": {"kind": "library-variant"},
	}}), "Independent custom variant rejected")
	_check(workbench.custom_library.get_node("Actions/RemoveEntry").text == "Delete Library Entry", "Variant was mislabeled as a stock override")
	_check(not workbench.custom_library.set_projection({"protected": true, "entry": {"ownership": "built-in"}}), "Protected ownership entered custom editor")
	_check(workbench.custom_library.current_identity().is_empty(), "Rejected ownership retained custom identity")
	await workbench.browser.open_record(1)
	_check(not workbench.custom_library.visible, "Scenario navigation retained custom fields")
	var clear_action := workbench.form.get_node("Content/MonsterRecordActions/ClearSelection") as Button
	_check(clear_action.disabled, "Destructive scenario Clear Selection is enabled without a typed repair workflow")
	_check(clear_action.pressed.get_connections().size() == 1, "Scenario Clear must route through its reviewed record operation")
	_check(workbench.form.visible and workbench.browser.native_id == 1, "Disabled scenario clear changed selected record")
	await _check_workbench_multiple(workbench)
	workbench.attach(null)
	_check(not workbench.preview.visible and contexts[-1].is_empty(), "Detach retained detail or Inspector")
	await process_frame
	_check(workbench.get_combined_minimum_size().x <= 1510, "Monster workbench exceeds compact width")
	workbench.queue_free()
	await process_frame
	await _check_route_refresh()


func _check_workbench_multiple(workbench: Control) -> void:
	var library_bridge := LibraryBridge.new()
	library_bridge.row_count = 4
	workbench.library.attach(library_bridge)
	await workbench.library.select_entry("library:stock:0")
	await workbench.library.select_entry("library:stock:1", true)
	_check(workbench.multiple.visible and not workbench.preview.visible and not workbench.form.visible, "Multiple selection retained a single-record editor")
	_check(workbench.multiple.get_node("SelectedRows").get_child_count() == 2, "Selected summary lost source rows")
	_check(workbench.multiple.get_node("Header/CopySelected").disabled, "Multiple selection enabled population")
	await _menu_key(KEY_ESCAPE)
	_check(not workbench.multiple.visible and workbench.form.visible, "Escape did not return to the active reference")
	_check(workbench.library.current_entry().entry.identity == "library:stock:1", "Escape changed active Library identity")


func _check_route_refresh() -> void:
	var route = load("res://src/monster_library_editor.tscn").instantiate()
	root.add_child(route)
	var combined := CombinedBridge.new()
	await route.reload(combined)
	var current = route.get_node("Workbench")
	current.library.open_entry("library:stock:0")
	_check(current.form.visible, "Revision fixture did not select the Library record form")
	combined.revision = 8
	route.refresh_project_revision(combined, 8)
	_check(current.browser.revision == 8 and current.form.visible and current.library.current_entry().projectRevision == 8, "Project edit did not refresh retained Library selection")
	route.hide()
	var hidden_calls := combined.calls.size() + combined.library.calls.size()
	route.refresh_project_revision(combined, 9)
	_check(current.library.current_entry().is_empty() and current.preview.current_identity().is_empty(), "Hidden route retained old project names")
	_check(combined.calls.size() + combined.library.calls.size() == hidden_calls, "Invalidating a hidden Monster route read native projections")
	_check(route.current_selection().libraryIdentity == "library:stock:0", "Hidden invalidation discarded the selected Library identity")
	combined.revision = 9
	await route.reload(combined)
	_check(current.library.current_entry().projectRevision == 9 and current.draft.document.entry.identity == "library:stock:0", "Activation did not restore the selected Library entry at the new revision")
	route.clear_selection()
	await route.reload(CombinedBridge.new())
	_check(current.library.current_entry().is_empty() and current.preview.current_identity().is_empty(), "A replacement project inherited the previous Library selection")
	route.queue_free()
	await process_frame


func _run() -> void:
	root.size = Vector2i(1600, 900)
	root.content_scale_size = Vector2i(1600, 900)
	await preload("res://tools/monster_population_plan_checks.gd").verify(self, _check)
	await preload("res://tools/monster_library_paging_checks.gd").verify(self, _check)
	_check_library_configuration()
	var bridge := ReadonlyBridge.new()
	var state := BrowserState.new()
	state.attach(bridge)
	_check((await state.search("  Guard 299  ")).ok, "Catalog request failed")
	_check(bridge.calls[-1].params.query == "Guard 299", "Search was not sent to the adapter")
	_check(bridge.calls[-1].params.limit == 128, "Catalog request lost its bound")
	_check((await state.load_page(128)).ok and bridge.calls[-1].params.offset == 128, "Page offset was lost")
	_check((await state.open_record(1)).ok and not state.detail.is_empty(), "Exact Normal selection failed")
	_check(not (await state.switch_set(-1)).ok, "Missing Mega unexpectedly opened")
	_check(state.detail.is_empty() and state.native_id == 1, "Missing variant retained old detail or lost identity")
	_check(state.catalog.items[0].selectedIdentity == null, "Display-label fallback became selected detail")
	_check((await state.switch_set(0)).ok, "Returning to Normal did not reopen the exact record")
	bridge.wrong_identity = true
	_check(not (await state.open_record(1)).ok and state.detail.is_empty(), "Mismatched detail was accepted")
	bridge.wrong_identity = false
	await state.open_record(1)
	bridge.fail_catalog = true
	_check(not (await state.search("new query")).ok and state.detail.is_empty() and state.catalog.is_empty(), "Failed search left stale data")
	var before := bridge.calls.size()
	_check(not (await state.switch_set(99)).ok and bridge.calls.size() == before, "Invalid set reached adapter")
	state.attach(null)
	_check(not (await state.open_record(1)).ok and state.detail.is_empty(), "Detached browser retained project data")
	for call in bridge.calls:
		_check(call.method in ["monster.catalog", "monster.open"], "Browser issued a mutation")
	await _check_inventory_scene()
	await _check_library_scene()
	await _check_workbench()
	await _check_route_scenes()
	var pair := load("res://src/monster_inventories.tscn").instantiate() as Control
	pair.size = Vector2(660, 726)
	root.add_child(pair)
	await process_frame
	_check(pair.get_combined_minimum_size().x <= 660, "Paired inventories exceed their approved width")
	_check(pair.get_child(0).name == "MonsterLibraryList" and pair.get_child(1).name == "ScenarioMonsterList", "Donor inventory order changed")
	pair.queue_free()
	await process_frame
	if not _failed:
		print("PROVIDENCE_MONSTER_BROWSER_STATE_OK bounded-search exact-set stale-detail-cleared")
	quit(1 if _failed else 0)


func _check_route_scenes() -> void:
	for path in ["res://src/monster_editor.tscn", "res://src/monster_library_editor.tscn"]:
		var route = load(path).instantiate()
		root.add_child(route)
		await process_frame
		var bridge := ReadonlyBridge.new()
		await route.reload(bridge, {"setId": 0, "nativeId": 1})
		_check(route.current_selection().nativeId == 1, "Monster route reload lost selected identity")
		_check(not route.get_node("Workbench").browser.detail.is_empty(), "Monster route did not reopen exact detail")
		await route.reload(bridge, {"setId": -1, "nativeId": 1})
		_check(route.get_node("Workbench").browser.detail.is_empty(), "Route reload retained old missing-set detail")
		_check(not route.get_node("Workbench").form.get_node("Content/SetPanel/MonsterSetToolbar/Sets/Normal").disabled, "Reload trapped missing-set navigation")
		route.clear_selection()
		_check(route.current_selection().nativeId == -1, "Route detach retained project selection")
		route.queue_free()
		await process_frame


func _check_inventory_scene() -> void:
	var bridge := ReadonlyBridge.new()
	var state := BrowserState.new()
	state.attach(bridge)
	await state.search("")
	var inventory := load("res://src/monster_scenario_inventory.tscn").instantiate() as Control
	inventory.size = Vector2(325, 726)
	root.add_child(inventory)
	await process_frame
	inventory.bind_state(state)
	await process_frame
	_check(inventory.get_combined_minimum_size().x <= 325, "Inventory exceeds its approved column width")
	var rows := inventory.get_node("InventoryScroll/Rows")
	_check(rows.get_child_count() == 1, "Inventory did not render the bounded projection")
	var badges := rows.get_child(0).get_node("Contents/Facts/SetBadges")
	_check(badges.visible and badges.get_child_count() == 3, "Scenario row lost the three set badges")
	_check(badges.get_node("Normal").get_meta("availability") == "available" and badges.get_node("Normal").get_meta("current_set"), "Normal availability/current set did not follow the projection")
	_check(badges.get_node("Mega").get_meta("availability") == "missing" and badges.get_node("Mega").text.contains("—"), "Missing Mega set is indistinguishable without color")
	badges.set_availability([0], -1)
	_check(badges.get_node("Mega").get_meta("current_set") and badges.get_node("Mega").get_meta("availability") == "missing", "Current missing set was fabricated as available")
	badges.set_availability(null, 0)
	_check(badges.get_node("Normal").get_meta("availability") == "unknown", "Unavailable set projection was reported as missing")
	badges.set_availability([0.0, 1.0, -1.0], 1)
	_check(badges.get_children().all(func(badge): return badge.get_meta("availability") == "available"), "JSON numeric set IDs did not match native integer IDs")
	badges.set_availability(["0"], 0)
	_check(badges.get_node("Normal").get_meta("availability") == "unknown", "Malformed set ID was coerced into an available set")
	badges.set_availability([0], 0)
	(rows.get_child(0) as Button).pressed.emit()
	_check(state.native_id == 1 and not state.detail.is_empty(), "Row activation did not open exact detail")
	inventory.set_selection_active(true)
	_check((rows.get_child(0) as Button).button_pressed, "Scenario active selection is not visible")
	inventory.set_selection_active(false)
	_check(not (rows.get_child(0) as Button).button_pressed and state.native_id == 1, "Inactive Scenario selection lost its replacement target")
	var search := inventory.get_node("ScenarioSearch") as LineEdit
	search.text = "Other monster"
	search.text_submitted.emit(search.text)
	_check(bridge.calls[-1].params.query == "Other monster", "Scene search was only filtering loaded rows")
	_check(state.detail.is_empty(), "Scene search left previous Inspector detail")
	(inventory.get_node("Paging/Next") as Button).pressed.emit()
	_check(bridge.calls[-1].params.offset == 128, "Next page did not request a bounded offset")
	_check((inventory.get_node("Header/NewMonster") as Button).disabled, "Disconnected creation is enabled")
	inventory.queue_free()
	await process_frame


func _check(condition: bool, message: String) -> void:
	if not condition:
		_failed = true
		push_error(message)


func _check_library_scene() -> void:
	var bridge := LibraryBridge.new()
	var inventory := load("res://src/monster_library_inventory.tscn").instantiate() as Control
	inventory.size = Vector2(325, 726)
	root.add_child(inventory)
	await process_frame
	_check(inventory.attach(bridge).ok, "Library attachment failed")
	await process_frame
	_check(inventory.get_combined_minimum_size().x <= 325, "Library exceeds approved column width")
	var rows := inventory.get_node("InventoryScroll/Rows")
	_check(rows.get_child_count() == 1, "Library projection did not populate")
	(rows.get_child(0) as Button).pressed.emit()
	_check(inventory.current_entry().entry.identity == "library:stock:0", "Library selected a preferred scenario ID instead of stable entry identity")
	inventory.set_selection_active(true)
	_check((rows.get_child(0) as Button).button_pressed, "Library active selection is not visible")
	inventory.set_selection_active(false)
	_check(not (rows.get_child(0) as Button).button_pressed and not inventory.current_entry().is_empty(), "Inactive Library selection lost its entry")
	(inventory.get_node("OwnershipFilters/Custom") as Button).pressed.emit()
	_check(bridge.calls[-1].params.ownership == "custom" and inventory.current_entry().entry.identity == "library:stock:0", "Ownership filtering changed stable selection membership")
	var search := inventory.get_node("LibrarySearch") as LineEdit
	search.text = "  Distant entry  "
	search.text_submitted.emit(search.text)
	_check(bridge.calls[-1].params.query == "Distant entry" and bridge.calls[-1].params.limit == 128, "Library search lost adapter scope or bound")
	(inventory.get_node("Paging/Next") as Button).pressed.emit()
	_check(bridge.calls[-1].params.offset == 128, "Library next page offset is wrong")
	bridge.wrong_identity = true
	_check(not inventory.open_entry("library:custom:0").ok and inventory.current_entry().is_empty(), "Wrong Library detail was accepted")
	await _check_population_menu(inventory)
	bridge.wrong_identity = false
	bridge.row_count = 4
	inventory.load_page(0)
	await process_frame
	await _check_library_multiple(inventory)
	inventory.attach(null)
	_check(rows.get_child_count() == 0 and inventory.current_entry().is_empty(), "Detached Library retained records")
	for call in bridge.calls:
		_check(call.method in ["monster-library.list", "monster-library.open", "monster-library.describe"], "Inventory issued an authoring command")
	inventory.queue_free()
	await process_frame


func _check_population_menu(inventory: Control) -> void:
	var invoker := inventory.get_node("Header/PopulateScenario") as Button
	var menu := invoker.get_node("Menu") as Control
	_check(not invoker.disabled, "Population options cannot be inspected")
	invoker.grab_focus()
	invoker.pressed.emit()
	await process_frame
	_check(menu.visible and invoker.has_focus(), "All-disabled menu did not retain invoker focus")
	_check(root.get_visible_rect().encloses(menu.get_global_rect()), "Population menu %s extends beyond viewport %s" % [menu.get_global_rect(), root.get_visible_rect()])
	for action in menu.get_node("Actions").get_children():
		if action is Button:
			_check(action.disabled and action.pressed.get_connections().is_empty(), "Population mutation is connected or enabled")
	await _menu_key(KEY_ESCAPE)
	_check(not menu.visible and invoker.has_focus(), "Escape failed to dismiss and restore population invoker")
	invoker.pressed.emit()
	await _menu_key(KEY_TAB)
	_check(not menu.visible and not invoker.has_focus(), "Tab trapped focus inside population options")
	invoker.pressed.emit()
	invoker.disabled = true
	await process_frame
	_check(not menu.visible and inventory.get_node("LibrarySearch").has_focus(), "Unavailable invoker did not fall back to Library Search")
	invoker.disabled = false
	var scenario_search := LineEdit.new()
	inventory.add_child(scenario_search)
	invoker.fallback_controls.append(scenario_search)
	inventory.get_node("LibrarySearch").editable = false
	invoker.pressed.emit()
	invoker.hide()
	await process_frame
	_check(not menu.visible and scenario_search.has_focus(), "Hidden invoker failed to fall back past unavailable Library Search")
	invoker.show()
	inventory.get_node("LibrarySearch").editable = true
	invoker.fallback_controls.erase(scenario_search)
	scenario_search.queue_free()
	await process_frame
	invoker.pressed.emit()
	inventory.load_page(0)
	_check(not menu.visible, "Library reload retained an obsolete population menu")


func _menu_key(key: Key) -> void:
	for down in [true, false]:
		var event := InputEventKey.new()
		event.keycode = key
		event.pressed = down
		root.push_input(event)
		await process_frame


func _check_library_multiple(inventory: Control) -> void:
	root.size = Vector2i(1600, 900)
	root.content_scale_size = Vector2i(1600, 900)
	await process_frame
	var rows := inventory.get_node("InventoryScroll/Rows")
	var ids: Array = rows.get_children().map(func(row: Node): return str(row.get_meta("identity")))
	var groups: Array = []
	inventory.multiple_selected.connect(func(items: Array): groups.append(items))
	await _library_click(rows.get_child(0), false, false)
	_check(inventory.selected_identities() == [ids[0]], "Plain Library click did not select exact identity")
	await _library_click(rows.get_child(2), true, false)
	_check(inventory.selected_identities() == [ids[0], ids[2]], "Ctrl-click lost Library membership")
	_check(groups.size() > 0 and groups[-1].size() == 2 and inventory.get_node("%SelectionCount").visible, "Multiselection lacks source rows or visible count")
	await _library_click(rows.get_child(0), false, true)
	_check(inventory.selected_identities() == [ids[0], ids[1], ids[2]], "Shift-click did not preserve the inclusive anchor range")
	inventory.clear_multiple_selection()
	_check(inventory.selected_identities() == [ids[0]] and not inventory.get_node("%SelectionCount").visible, "Clear multiselection did not return to active reference")
	await _library_click(rows.get_child(3), true, false)
	await _library_click(rows.get_child(3), true, false)
	_check(inventory.selected_identities() == [ids[0]] and inventory.current_entry().entry.identity == ids[0], "Ctrl removal retained a deselected active reference")
	inventory.load_page(128)
	_check(inventory.selected_identities().is_empty(), "Page replacement retained invisible membership")


func _library_click(row: Button, additive: bool, range_selection: bool) -> void:
	for down in [true, false]:
		var event := InputEventMouseButton.new()
		event.button_index = MOUSE_BUTTON_LEFT
		event.pressed = down
		event.position = row.get_global_rect().get_center()
		event.ctrl_pressed = additive
		event.shift_pressed = range_selection
		root.push_input(event)
		await process_frame
