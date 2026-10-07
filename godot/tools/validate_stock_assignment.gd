extends SceneTree

var _bridge
var _passed := false
var _operations: ProvidenceEditorOperation


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 3 or not FileAccess.file_exists(args[0].path_join("assets-corpus-disposable.marker")):
		quit(2)
		return
	_bridge = preload("res://tools/validate_assets_corpus.gd").CorpusBridge.new(args[0].path_join("test-settings.cfg"))
	await _verify(args)
	_bridge.stop()
	quit(0 if _passed else 1)


func _verify(args: PackedStringArray) -> void:
	var catalog_path := args[1].path_join("classic-application-media.json")
	var catalog_hash := FileAccess.get_sha256(catalog_path)
	assert(not catalog_hash.is_empty())
	var opened: Dictionary = _bridge.start_project(args[0], args[1], args[2])
	assert(opened.get("ok", false))
	var workbench = load("res://src/unified_assets_editor.tscn").instantiate()
	root.add_child(workbench)
	_operations = ProvidenceEditorOperation.new()
	root.add_child(_operations)
	workbench.configure_operations(_operations)
	await workbench.reload(_bridge)
	await workbench.show_scope("stock")
	var panel = workbench.get_node("%Gallery")
	await _filter_icons(panel)
	var assigned := await _assign_stock(panel)
	var revision := _verify_history(args, assigned.before, assigned.assets, assigned.number)
	assert(FileAccess.get_sha256(catalog_path) == catalog_hash)
	await _verify_uses(workbench, panel, revision)
	print("PROVIDENCE_STOCK_ASSIGNMENT_OK real-selection picker-apply save-reopen reference-only durable-undo save-reopen-restored stock-catalog-unchanged")
	_passed = true


func _settle_operations() -> void:
	var idle_frames := 0
	while idle_frames < 2:
		await process_frame
		idle_frames = 0 if _operations.busy else idle_frames + 1


func _filter_icons(panel: Control) -> void:
	var selector: OptionButton = panel.get_node("BrowseInset/Browse/FilterInset/Filters/Kind")
	for index in selector.item_count:
		if selector.get_item_metadata(index) == "icon":
			selector.select(index)
			selector.item_selected.emit(index)
			await _settle_operations()
			return
	assert(false, "Icon filter is missing.")



func _assign_stock(panel: Control) -> Dictionary:
	await panel._select(0)
	assert(int(panel._rows[0].classicResource.resourceId) == 0)
	assert(panel.get_node("%UseStock").disabled)
	await panel._select(1)
	assert(not panel.get_node("%UseStock").disabled)
	var picture_number := int(panel._rows[1].classicResource.resourceId)
	var before: Dictionary = _bridge.request("item.list", {"scope": "scenario", "limit": 1})
	assert(before.get("ok", false) and before.result.items.size() == 1)
	var assets_before: Dictionary = _bridge.request("project-asset.list", {"limit": 25})
	assert(assets_before.get("ok", false))
	assert(int(assets_before.result.total) == assets_before.result.items.size())
	assets_before["descriptors"] = _asset_descriptors(assets_before.result.items)
	panel.get_node("%UseStock").pressed.emit()
	await _settle_operations()
	var picker = panel.get_node("%StockPicker")
	picker.get_node("%DestinationItems").select(0)
	picker.get_node("%DestinationItems").item_selected.emit(0)
	await _settle_operations()
	assert(not picker.get_node("%ApplyArtwork").disabled)
	picker.get_node("%ApplyArtwork").pressed.emit()
	await _settle_operations()
	assert(not panel.get_node("%StockPickerWindow").visible)
	var applied: Dictionary = _bridge.request("item.list", {"scope": "scenario", "limit": 1})
	assert(applied.get("ok", false) and int(applied.result.items[0].iconId) == picture_number)
	var assets_after: Dictionary = _bridge.request("project-asset.list", {"limit": 25})
	assert(assets_after.get("ok", false) and assets_before.descriptors == _asset_descriptors(assets_after.result.items))
	assert(assets_before.result.total == assets_after.result.total)
	return {"before": before, "assets": assets_before, "number": picture_number}


func _asset_descriptors(rows: Array) -> Array:
	# Usage and removability are derived from the edited item; the owned payloads
	# and identities must stay exact when assigning a stock resource by reference.
	var descriptors := []
	for row: Dictionary in rows:
		var opened: Dictionary = _bridge.request("project-asset.open", {"identity": row.identity})
		assert(opened.get("ok", false))
		descriptors.append(opened.result.asset)
	return descriptors


func _verify_history(args: PackedStringArray, before: Dictionary, assets_before: Dictionary, picture_number: int) -> int:
	var saved: Dictionary = _bridge.request("project.save")
	assert(saved.get("ok", false))
	_bridge.stop()
	var reopened: Dictionary = _bridge.start_project(args[0], args[1], args[2])
	assert(reopened.get("ok", false))
	var reopened_item: Dictionary = _bridge.request("item.list", {"scope": "scenario", "limit": 1})
	assert(reopened_item.get("ok", false) and reopened_item.result.items[0].identity == before.result.items[0].identity)
	assert(int(reopened_item.result.items[0].iconId) == picture_number)
	var reopened_assets: Dictionary = _bridge.request("project-asset.list", {"limit": 25})
	assert(reopened_assets.get("ok", false) and _asset_descriptors(reopened_assets.result.items) == assets_before.descriptors)
	assert(reopened_assets.result.total == assets_before.result.total)
	var state: Dictionary = _bridge.request("session.describe")
	assert(state.get("ok", false))
	var undone: Dictionary = _bridge.request("history.undo", {"expectedRevision": int(state.result.revision)})
	assert(undone.get("ok", false))
	var restored: Dictionary = _bridge.request("item.list", {"scope": "scenario", "limit": 1})
	assert(restored.get("ok", false) and restored.result.items[0].iconId == before.result.items[0].iconId)
	var restored_save: Dictionary = _bridge.request("project.save")
	assert(restored_save.get("ok", false))
	_bridge.stop()
	var restored_open: Dictionary = _bridge.start_project(args[0], args[1], args[2])
	assert(restored_open.get("ok", false))
	var restored_item: Dictionary = _bridge.request("item.list", {"scope": "scenario", "limit": 1})
	assert(restored_item.get("ok", false) and restored_item.result.items == before.result.items)
	var restored_assets: Dictionary = _bridge.request("project-asset.list", {"limit": 25})
	assert(restored_assets.get("ok", false) and restored_assets.result.items == assets_before.result.items)
	return int(undone.result.revision)


func _verify_uses(workbench: Control, panel: Control, revision: int) -> void:
	var opened_items: Array = []
	workbench.set_item_opener(func(identity): opened_items.append(identity))
	await workbench.show_scope("scenario")
	await _filter_icons(panel)
	assert(not panel._rows.is_empty())
	await panel._select(0)
	assert(not panel.get_node("%FindScenarioUses").disabled)
	panel.get_node("%FindScenarioUses").pressed.emit()
	await _settle_operations()
	var menu = panel.get_node("%ItemUsesMenu")
	var expected_uses: Dictionary = _bridge.request("project-asset.open", {"identity": panel._rows[0].identity, "expectedRevision": revision, "limit": 32})
	assert(expected_uses.get("ok", false) and menu._rows == expected_uses.result.useTargets)
	assert(menu._rows.size() <= 32)
	if not menu._rows.is_empty():
		var expected_identity: String = menu._rows[0].source
		menu.id_pressed.emit(0)
		await _settle_operations()
		assert(opened_items == ([expected_identity] if menu._rows[0].sourceKind == "item" else []))
	else:
		assert(menu.get_item_text(0) == "No known uses" and menu.is_item_disabled(0))
	print("PROVIDENCE_SCENARIO_ITEM_USES_OK real-resource bounded-list rows=%d" % menu._rows.size())
