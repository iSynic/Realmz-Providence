extends SceneTree

class EconomyBridge:
	extends RefCounted

	var mismatch_method := ""
	var error_method := ""

	func request(method: String, params := {}) -> Dictionary:
		if method == error_method:
			return {"ok": false, "error": "controlled %s failure" % method}
		match method:
			"treasure.list":
				return {"ok": true, "result": {"revision": 4, "items": [
					{"identity": "treasure:1", "nativeId": 1, "populatedItems": 0, "experience": 0, "gold": 0, "gems": 0, "jewelry": 0, "problems": 0},
					{"identity": "treasure:3", "nativeId": 3, "populatedItems": 2, "experience": -50, "gold": 125, "gems": 2, "jewelry": 1, "problems": 1},
				], "offset": 0, "limit": 128, "total": 2, "truncated": false}}
			"treasure.open":
				var requested := int(params.get("nativeId", -1))
				var native_id := requested + 1 if mismatch_method == method else requested
				var item_ids: Array = [7, -8]
				item_ids.resize(20)
				for index in range(2, 20):
					item_ids[index] = 0
				return {"ok": true, "result": {"revision": 4, "treasure": {
					"identity": "treasure:%d" % native_id, "nativeId": native_id, "itemIds": item_ids,
					"experience": -50, "gold": 125, "gems": 2, "jewelry": 1, "authored": false,
				}, "references": [{"source": "treasure:%d" % native_id, "field": "itemIds[0]", "targetKind": "item", "targetId": "7", "resolution": "missing"}], "diagnostics": [{"code": "reference.item.missing"}]}}
			"shop.list":
				return {"ok": true, "result": {"revision": 4, "items": [
					{"identity": "shop:4", "nativeId": 4, "inflation": 125, "activeItems": 2, "problems": 1},
				], "offset": 0, "limit": 128, "total": 1, "truncated": false}}
			"shop.open":
				var requested := int(params.get("nativeId", -1))
				var native_id := requested + 1 if mismatch_method == method else requested
				var item_ids: Array = []
				var quantities: Array = []
				item_ids.resize(1000)
				quantities.resize(1000)
				item_ids.fill(-1)
				quantities.fill(0)
				item_ids[0] = 7
				item_ids[1] = -1
				item_ids[200] = 8
				quantities[0] = 3
				quantities[200] = 255
				return {"ok": true, "result": {"revision": 4, "shop": {
					"identity": "shop:%d" % native_id, "nativeId": native_id, "itemIds": item_ids,
					"quantities": quantities, "inflation": 125, "authored": false,
				}, "references": [{"source": "shop:%d" % native_id, "field": "itemIds[0]", "targetKind": "item", "targetId": "7", "resolution": "missing"}], "diagnostics": [{"code": "reference.item.missing"}]}}
		return {"ok": false, "error": "unexpected Economy bridge method: %s" % method}


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var tabs := TabContainer.new()
	root.add_child(tabs)
	tabs.size = Vector2(1220, 820)
	var treasure: Control = load("res://src/treasure_editor.tscn").instantiate()
	var shop: Control = load("res://src/shop_editor.tscn").instantiate()
	tabs.add_child(treasure)
	tabs.add_child(shop)
	await process_frame
	if not _verify_structure(treasure, shop):
		return
	var bridge := EconomyBridge.new()
	var opened := await treasure.reload(bridge, 3) as Dictionary
	if not bool(opened.get("ok", false)) or treasure.current_applied_native_id() != 3 or str((treasure.current_record() as Dictionary).get("identity", "")) != "treasure:3":
		_fail("exact treasure.open selection was not applied")
		return
	var search := treasure.find_child("RecordSearch", true, false) as LineEdit
	search.text = "does-not-match"
	if treasure.current_applied_native_id() != 3:
		_fail("Treasure filtering changed the applied identity")
		return
	if treasure.has_unapplied_changes() or treasure.trusted_applied_native_id(true) != -1:
		_fail("Treasure draft guard could leak a future consumer selection")
		return
	bridge.mismatch_method = "treasure.open"
	var mismatch := treasure.open_native_id(3) as Dictionary
	if bool(mismatch.get("ok", true)) or treasure.current_applied_native_id() != -1:
		_fail("mismatched treasure.open identity became applied")
		return
	bridge.mismatch_method = ""
	search.text = ""
	treasure.open_native_id(1)
	var selection := ProvidenceRebuiltPreviewSelection.new()
	var treasure_target := selection.current_target("economy.treasure", "", Vector2i(-1, -1), {}, {}, "", -1, treasure.trusted_applied_native_id(), -1) as Dictionary
	var treasure_draft_target := selection.current_target("economy.treasure", "", Vector2i(-1, -1), {}, {}, "", -1, treasure.trusted_applied_native_id(true), -1) as Dictionary
	if str(treasure_target.get("kind", "")) != "treasure" or int(treasure_target.get("id", -1)) != 1 or not treasure_draft_target.is_empty():
		_fail("Treasure preview selection did not require the exact applied non-draft identity")
		return
	var preview: Node = load("res://src/rebuilt_preview_controller.tscn").instantiate()
	root.add_child(preview)
	var treasure_arguments := preview._target_arguments(treasure_target) as Dictionary
	if str(treasure_arguments.get("command", "")) != "prepare-treasure" or (treasure_arguments.get("arguments", PackedStringArray()) as PackedStringArray) != PackedStringArray(["1"]):
		_fail("Treasure F6 selection did not map to the strict Rust producer")
		return
	tabs.current_tab = 1
	await process_frame
	if treasure.current_applied_native_id() != -1:
		_fail("leaving the Treasure route retained its applied identity")
		return
	opened = await shop.reload(bridge, 4) as Dictionary
	if not bool(opened.get("ok", false)) or shop.current_applied_native_id() != 4 or str((shop.current_record() as Dictionary).get("identity", "")) != "shop:4":
		_fail("exact shop.open selection was not applied")
		return
	var stock := shop.find_child("ShopStock", true, false) as ItemList
	if not _shop_stock_is_preserved(shop, stock):
		_fail("Shop did not honor category terminators or preserve the raw quantity byte")
		return
	if shop.has_unapplied_changes() or shop.trusted_applied_native_id(true) != -1:
		_fail("Shop draft guard could leak a future consumer selection")
		return
	bridge.error_method = "shop.open"
	var failed := shop.open_native_id(4) as Dictionary
	if bool(failed.get("ok", true)) or shop.current_applied_native_id() != -1:
		_fail("failed shop.open retained an applied identity")
		return
	bridge.error_method = ""
	shop.open_native_id(4)
	var shop_target := selection.current_target("economy.shops", "", Vector2i(-1, -1), {}, {}, "", -1, -1, shop.trusted_applied_native_id()) as Dictionary
	var shop_draft_target := selection.current_target("economy.shops", "", Vector2i(-1, -1), {}, {}, "", -1, -1, shop.trusted_applied_native_id(true)) as Dictionary
	if str(shop_target.get("kind", "")) != "shop" or int(shop_target.get("id", -1)) != 4 or not shop_draft_target.is_empty():
		_fail("Shop preview selection did not require the exact applied non-draft identity")
		return
	var shop_arguments := preview._target_arguments(shop_target) as Dictionary
	if str(shop_arguments.get("command", "")) != "prepare-shop" or (shop_arguments.get("arguments", PackedStringArray()) as PackedStringArray) != PackedStringArray(["4"]):
		_fail("Shop F6 selection did not map to the strict Rust producer")
		return
	tabs.current_tab = 0
	await process_frame
	if shop.current_applied_native_id() != -1:
		_fail("leaving the Shop route retained its applied identity")
		return
	print("PROVIDENCE_ECONOMY_READONLY_OK treasure=3 shop=4 routesCleared=2 draftGuards=2 preview=lockstep-ready")
	preview.queue_free()
	tabs.queue_free()
	quit(0)


func _verify_structure(treasure: Control, shop: Control) -> bool:
	if treasure.route_identity() != "economy.treasure" or shop.route_identity() != "economy.shops":
		_fail("Economy route identity changed")
		return false
	for pair in [
		[treasure, ["TreasureHeader", "EconomyNavigation", "TreasureRecordBrowser", "RewardFields", "ItemPool", "TreasureItemSlots", "RecordProblems"]],
		[shop, ["ShopHeader", "EconomyNavigation", "ShopRecordBrowser", "ShopSettings", "CategoryFilter", "ItemPool", "ShopStock", "RecordProblems"]],
	]:
		for node_name in pair[1]:
			if (pair[0] as Control).find_child(node_name, true, false) == null:
				_fail("Economy scene is missing required named region %s" % node_name)
				return false
	for control_name in ["NewTreasure", "ClearTreasure", "AddItem", "ReplaceItem", "ClearItem", "ApplyTreasure"]:
		var control := treasure.find_child(control_name, true, false) as BaseButton
		if control == null or not control.disabled:
			_fail("%s must remain visible-disabled" % control_name)
			return false
	for control_name in ["NewShop", "ClearShop", "AddStock", "ClearStock", "ReplaceStock", "ClearSlot", "ApplyShop"]:
		var control := shop.find_child(control_name, true, false) as BaseButton
		if control == null or not control.disabled:
			_fail("%s must remain visible-disabled" % control_name)
			return false
	return true


func _shop_stock_is_preserved(shop: Control, stock: ItemList) -> bool:
	var metadata: Variant = stock.get_item_metadata(1) if stock.item_count > 1 else {}
	var quantities := (shop.current_record() as Dictionary).get("quantities", []) as Array
	return stock.item_count == 2 and metadata is Dictionary and int(metadata.get("slot", -1)) == 200 and quantities.size() > 200 and int(quantities[200]) == 255 and stock.get_item_text(1).contains("QTY 255")


func _fail(message: String) -> void:
	push_error("PROVIDENCE_ECONOMY_READONLY_FAILED: %s" % message)
	quit(1)
