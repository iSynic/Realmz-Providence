extends "res://tools/validate_assets_corpus.gd"


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if not _check(args.size() == 3 and FileAccess.file_exists(args[0].path_join("assets-corpus-disposable.marker")), "Expected marked disposable project, stock library and supplied catalog."):
		return
	var catalog_path := args[2].path_join("reference-catalog.providence.json")
	var catalog_hash := FileAccess.get_sha256(catalog_path)
	_bridge = CorpusBridge.new(args[0].path_join("test-settings.cfg"))
	if not _check(bool(_bridge.start_project(args[0], args[1], args[2]).get("ok", false)), "Disposable project could not open."):
		return
	var before := _call("project-asset.list", {"limit": 1})
	var original := _call("item.list", {"scope": "scenario", "limit": 1})
	var available := _call("artwork.check-copy-number", {"resourceId": 32002, "expectedRevision": _revision()})
	if not _check(bool(available.get("available", false)) and not original.get("items", []).is_empty(), "Test needs an item and unused picture 32002; no existing data will be overwritten."):
		return
	var workbench = load("res://src/unified_assets_editor.tscn").instantiate()
	root.add_child(workbench)
	_operations = ProvidenceEditorOperation.new()
	root.add_child(_operations)
	workbench.configure_operations(_operations)
	workbench.size = Vector2(1512, 772)
	await workbench.reload(_bridge)
	var copied: Array = []
	var applied: Array = []
	workbench.scenario_changed.connect(func(projection): copied.append(projection))
	workbench.artwork_applied.connect(func(projection, index): applied.append([projection, index]))
	await _copy_from_bag(workbench, copied)
	if _failed: return
	await _assign_copied_artwork(workbench, applied, original)
	if _failed: return
	_verify_history(args, before, original, catalog_path, catalog_hash)
	if _failed: return
	_bridge.stop()
	workbench.queue_free()
	print("PROVIDENCE_BAG_AUTHORING_OK real-search button-copy scenario-search item-picker-apply undo-two redo-two save-reopen catalog-unchanged")
	quit()



func _copy_from_bag(workbench: Control, copied: Array) -> void:
	workbench.get_node("%Bag").pressed.emit()
	await _settle_operations()
	var supplied = workbench.get_node("%Supplied")
	var search: LineEdit = supplied.get_node("%VaultSearch")
	search.text = "-18"
	search.text_changed.emit(search.text)
	await _settle_operations()
	var gallery: ItemList = supplied.get_node("%ArtworkGallery")
	if not _check(gallery.item_count == 10, "Real Bag search did not return ten expected records."):
		return
	gallery.select(0)
	gallery.item_selected.emit(0)
	await _settle_operations()
	if not _check(not supplied.get_node("%CopyToScenario").disabled, "Real selected artwork cannot be copied."):
		return
	supplied.get_node("%CopyToScenario").pressed.emit()
	await _settle_operations()
	var dialog = supplied.get_node("%CopyDialog")
	if not _check(dialog.visible, "Copy dialog did not open from the button."):
		return
	dialog.get_node("%CopyNumber").value = 32002
	if not _check(await dialog.check_number(), "Copy number check failed."):
		return
	dialog.confirmed.emit()
	dialog.hide()
	await _settle_operations()
	if not _check(copied.size() == 1, "Copy did not return exactly one scenario change."):
		return


func _assign_copied_artwork(workbench: Control, applied: Array, original: Dictionary) -> void:
	workbench.get_node("%Scenario").pressed.emit()
	await _settle_operations()
	var scenario = workbench.get_node("%Gallery")
	scenario.get_node("%Search").text = "32002"
	scenario.get_node("%Search").text_submitted.emit("32002")
	await _settle_operations()
	var owned: ItemList = scenario.get_node("%Gallery")
	if not _check(owned.item_count == 1, "Copied Bag artwork is not uniquely discoverable in Scenario Assets."):
		return
	owned.select(0)
	owned.item_selected.emit(0)
	await _settle_operations()
	if not _check(not scenario.get_node("%UseStock").disabled, "Copied artwork cannot be assigned."):
		return
	scenario.get_node("%UseStock").pressed.emit()
	await _settle_operations()
	var picker = scenario.get_node("%StockPicker")
	if not _check(scenario.get_node("%StockPickerWindow").visible, "Item picker did not open."):
		return
	picker.get_node("%DestinationItems").select(0)
	picker.get_node("%DestinationItems").item_selected.emit(0)
	await _settle_operations()
	if not _check(not picker.get_node("%ApplyArtwork").disabled, "Item assignment remains disabled."):
		return
	picker.get_node("%ApplyArtwork").pressed.emit()
	await _settle_operations()
	if not _check(applied.size() == 1 and int(applied[0][1]) == int(original.items[0].recordIndex), "The selected item was not assigned exactly once."):
		return


func _verify_history(args: PackedStringArray, before: Dictionary, original: Dictionary, catalog_path: String, catalog_hash: String) -> void:
	var changed := _call("item.list", {"scope": "scenario", "limit": 1})
	if not _check(int(changed.items[0].iconId) == 32002, "Item projection lost the selected picture."):
		return
	_call("history.undo", {"expectedRevision": _revision()})
	var undone := _call("item.list", {"scope": "scenario", "limit": 1})
	if not _check(int(undone.items[0].iconId) == int(original.items[0].iconId), "Undo did not restore the previous item picture."):
		return
	_call("history.undo", {"expectedRevision": _revision()})
	var removed := _call("project-asset.list", {"limit": 1})
	if not _check(int(removed.total) == int(before.total), "Undo did not remove only the copied artwork."):
		return
	_call("history.redo", {"expectedRevision": _revision()})
	_call("history.redo", {"expectedRevision": _revision()})
	_call("project.save")
	if _failed:
		return
	_bridge.stop()
	if not _check(bool(_bridge.start_project(args[0], args[1], args[2]).get("ok", false)), "Saved project could not reopen."):
		return
	var reopened := _call("item.list", {"scope": "scenario", "limit": 1})
	var assets := _call("project-asset.list", {"limit": 1})
	var preview := _call("icon.preview", {"identity": "item-artwork:32002"})
	if not _check(int(reopened.items[0].iconId) == 32002 and int(assets.total) == int(before.total) + 1 and not str(preview.get("base64", "")).is_empty(), "Reopen lost the picture, assignment or independent asset."):
		return
	if not _check(FileAccess.get_sha256(catalog_path) == catalog_hash, "Supplied catalog changed."):
		return
