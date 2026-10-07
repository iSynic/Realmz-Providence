extends RefCounted

class PagedBridge:
	extends RefCounted
	var calls: Array = []
	var revision := 7
	var change_second_page := false
	func request(method: String, params: Dictionary) -> Dictionary:
		calls.append({"method": method, "params": params.duplicate(true)})
		var offset := int(params.get("offset", 0))
		var observed := revision + 1 if change_second_page and offset >= 128 else revision
		if method == "monster-library.list":
			var items: Array = []
			for index in range(offset, mini(300, offset + int(params.limit))):
				items.append({"identity": "entry:%d" % index, "label": "Fixture %d" % index, "ownership": "built-in", "preferredScenarioMonsterId": index, "hitDice": 1, "armor": 0, "agility": 0, "iconId": 0})
			return {"ok": true, "result": {"revision": observed, "offset": offset, "total": 300, "items": items}}
		if method == "monster-library.open":
			return {"ok": true, "result": {"revision": revision, "protected": true, "entry": {"identity": params.identity, "ownership": "built-in", "template": {}}}}
		if method == "monster-library.population-plan":
			var rows: Array = []
			for index in range(offset, mini(params.entryIds.size(), offset + int(params.limit))):
				rows.append({"identity": params.entryIds[index], "targetId": index + 1, "reason": "next-open-slot"})
			return {"ok": true, "result": {"format": "providence.monster-population-plan.v1", "projectRevision": params.expectedRevision, "libraryRevision": observed, "offset": offset, "total": params.entryIds.size(), "rows": rows}}
		return {"ok": false, "error": "Unexpected mutation"}


static func verify(tree: SceneTree, check: Callable) -> void:
	var bridge := PagedBridge.new()
	var inventory := load("res://src/monster_library_inventory.tscn").instantiate() as Control
	tree.root.add_child(inventory)
	inventory.attach(bridge)
	await inventory.select_entry("entry:0")
	inventory.get_node("Paging/Next").pressed.emit()
	check.call(inventory.selected_identities() == ["entry:0"], "Paging lost offscreen Library selection")
	await inventory.select_entry("entry:130", true)
	check.call(inventory.selected_identities() == ["entry:0", "entry:130"], "Ctrl selection did not span Library pages")
	inventory.get_node("Paging/Previous").pressed.emit()
	inventory.clear_multiple_selection()
	check.call(inventory.selected_identities() == ["entry:130"] and inventory.get_node("InventoryScroll/Rows").get_child(2).has_focus(), "Clear did not reveal and focus the offscreen active reference")
	await inventory.select_entry("entry:130")
	inventory.get_node("Paging/Previous").pressed.emit()
	await inventory.select_entry("entry:0", false, true)
	check.call(inventory.selected_identities().size() == 131 and inventory.selected_identities()[-1] == "entry:130", "Cross-page Shift range did not include exact catalog endpoints")
	var ids: Array = inventory.selected_identities()
	var plan := await preload("res://src/monster_population_plan.gd").load_plan(bridge, ids, 4, 7)
	check.call(plan.ok and plan.rows.size() == 131 and plan.rows["entry:130"].targetId == 131, "Plan paging lost global selection targets")
	var summary := load("res://src/monster_library_selection.tscn").instantiate() as Control
	tree.root.add_child(summary)
	summary.set_items(ids.map(func(identity: String): return {"identity": identity, "label": identity}))
	summary.set_plan(plan)
	check.call(summary.get_node("SelectedRows").get_child_count() == 128, "Selected summary instantiated more than one bounded page")
	var pooled_rows: Array = summary.get_node("SelectedRows").get_children()
	summary.get_node("Paging/Next").pressed.emit()
	check.call(summary.get_node("SelectedRows").get_children() == pooled_rows, "Selection paging recreated bounded row scenes")
	check.call(pooled_rows.filter(func(row): return row.visible).size() == 3 and pooled_rows[2].get_node("Target").text.begins_with("Monster 131"), "Selected summary lost the last plan page")
	check.call(not pooled_rows[3].has_meta("identity") and pooled_rows[3].get_node("Facts/Name").text.is_empty(), "Unused pooled row retained source identity or text")
	summary.clear_items()
	check.call(pooled_rows.all(func(row): return not row.visible and not row.has_meta("identity") and row.get_node("Target").text.is_empty()), "Cleared selection retained pooled source or destination bindings")
	summary.set_items([{"identity": "entry:other", "label": "New selection"}])
	check.call(summary.get_node("SelectedRows").get_children() == pooled_rows and pooled_rows[0].get_meta("identity") == "entry:other" and pooled_rows[0].get_node("Target").text == "Destination plan unavailable", "Reused row retained the previous target")
	bridge.change_second_page = true
	check.call(not (await preload("res://src/monster_population_plan.gd").load_plan(bridge, ids, 4, 7)).ok, "Plan combined different Library revisions across pages")
	bridge.change_second_page = false
	bridge.revision = 8
	inventory.get_node("Paging/Next").pressed.emit()
	check.call(inventory.selected_identities().is_empty(), "Catalog revision change retained old selection")
	inventory.get_node("Paging/Previous").pressed.emit()
	await inventory.select_entry("entry:0")
	inventory.get_node("Paging/Next").pressed.emit()
	bridge.change_second_page = true
	check.call(not (await inventory.select_entry("entry:130", false, true)).ok and inventory.selected_identities().is_empty(), "Cross-page range combined different catalog revisions")
	bridge.change_second_page = false
	inventory.load_page(0)
	await inventory.select_entry("entry:0")
	inventory.load_page(128, true)
	inventory.cancel_pending_selection.call_deferred()
	var cancelled: Dictionary = await inventory.select_entry("entry:130", false, true)
	check.call(cancelled.get("cancelled", false) and inventory.selected_identities() == ["entry:0"], "Cancelled range replaced the existing selection")
	var search := inventory.get_node("%LibrarySearch") as LineEdit
	search.text_changed.emit.call_deferred("changed")
	cancelled = await inventory.select_entry("entry:130", false, true)
	check.call(cancelled.get("cancelled", false) and inventory.selected_identities() == ["entry:0"], "Filter input must cancel the pending range and retain the existing selection until navigation resolves")
	for call in bridge.calls:
		check.call(call.method in ["monster-library.list", "monster-library.open", "monster-library.describe", "monster-library.population-plan"], "Paging invoked a mutation")
		if call.params.has("limit"):
			check.call(int(call.params.limit) <= 128, "Paging exceeded the bounded projection limit")
	check.call(summary.get_node("Header/CopySelected").disabled, "Multi-page plan enabled population")
	inventory.queue_free()
	summary.queue_free()
	await tree.process_frame
