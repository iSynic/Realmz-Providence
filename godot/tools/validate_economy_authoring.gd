extends SceneTree

class Bridge extends "res://src/native_bridge.gd":
	var calls: Array[String] = []
	var revision := 0
	var failure := ""
	var unknown := false
	var treasure := _treasure(0)
	var shop := _shop(0)

	static func _filled(size: int, value: int) -> Array:
		var result: Array = []
		result.resize(size)
		result.fill(value)
		return result

	static func _treasure(id: int) -> Dictionary:
		return {"identity": "treasure:%d" % id, "nativeId": id, "itemIds": _filled(20, 0), "experience": 0, "gold": 125, "gems": 2, "jewelry": 1, "authored": true}

	static func _shop(id: int) -> Dictionary:
		var item_ids := _filled(1000, -1)
		var quantities := _filled(1000, 0)
		item_ids[0] = 7
		item_ids[1] = 0
		item_ids[2] = -1
		item_ids[200] = -1
		item_ids[201] = 91
		item_ids[202] = 92
		item_ids[400] = -1
		item_ids[600] = 0
		item_ids[601] = -1
		item_ids[602] = 77
		item_ids[800] = -1
		quantities[0] = 3
		return {"identity": "shop:%d" % id, "nativeId": id, "itemIds": item_ids, "quantities": quantities, "inflation": 125, "authored": true}

	func _request(method: String, params: Dictionary) -> Dictionary:
		OS.delay_msec(25)
		calls.append(method)
		if method == failure: return {"ok": false, "outcomeUnknown": unknown, "error": "Controlled economy failure"}
		match method:
			"treasure.list": return {"ok": true, "result": {"revision": revision, "items": [{"identity": treasure.identity, "nativeId": treasure.nativeId, "populatedItems": 0, "problems": 0}], "total": 1, "nextNativeId": int(treasure.nativeId) + 1}}
			"treasure.open": return {"ok": true, "result": {"revision": revision, "treasure": treasure.duplicate(true), "references": [], "diagnostics": []}}
			"shop.list": return {"ok": true, "result": {"revision": revision, "items": [{"identity": shop.identity, "nativeId": shop.nativeId, "inflation": shop.inflation, "activeItems": 1, "problems": 0}], "total": 1, "nextNativeId": int(shop.nativeId) + 1}}
			"shop.open": return {"ok": true, "result": {"revision": revision, "shop": shop.duplicate(true), "references": [], "diagnostics": []}}
			"item.list":
				var category := str(params.get("category", "all"))
				var items := [
					{"identity": "classic.item.7", "classicId": 7, "name": "Iron Sword", "iconId": 0},
					{"identity": "classic.item.205", "classicId": 205, "name": "Chain Armor", "iconId": 0},
					{"identity": "classic.item.600", "classicId": 600, "name": "Moon Ring", "iconId": 0},
					{"identity": "classic.item.800", "classicId": 800, "name": "Rations", "iconId": 0},
				]
				if category != "all": items = items.filter(func(item): return _category(int(item.classicId)) == category)
				return {"ok": true, "result": {"revision": revision, "items": items, "total": items.size()}}
			"treasure.update": treasure = _mutate(params, "treasure")
			"shop.update": shop = _mutate(params, "shop")
			"treasure.create": treasure = _treasure(int(params.nativeId))
			"shop.create": shop = _shop(int(params.nativeId))
			"treasure.clear":
				treasure = _treasure(int(params.nativeId))
				treasure.gold = 0
			"shop.clear":
				shop = _shop(int(params.nativeId))
				shop.inflation = 0
			_: return {"ok": false, "error": "Unexpected economy method %s" % method}
		assert(int(params.expectedRevision) == revision)
		revision += 1
		var record := treasure if method.begins_with("treasure") else shop
		return {"ok": true, "result": {"revision": revision, "changedEntities": ["%s:%d" % [method.get_slice(".", 0), int(record.nativeId)]]}}

	func _mutate(params: Dictionary, key: String) -> Dictionary:
		assert(int(params.expectedRevision) == revision)
		return (params[key] as Dictionary).duplicate(true)

	static func _category(item_id: int) -> String:
		if item_id < 200: return "weapon"
		if item_id < 400: return "armor"
		if item_id < 600: return "accessory"
		if item_id < 800: return "magic"
		return "supply"


var _bridge := Bridge.new()
var _operations := ProvidenceEditorOperation.new()
var _treasure_controller := ProvidenceEconomyRecordController.new()
var _shop_controller := ProvidenceEconomyRecordController.new()
var _treasure: ProvidenceTreasureEditor
var _shop: ProvidenceShopEditor
var _responses: Array[Dictionary] = []


func _initialize() -> void: call_deferred("_run")


func _run() -> void:
	root.add_child(_operations)
	_treasure = load("res://src/treasure_editor.tscn").instantiate()
	_shop = load("res://src/shop_editor.tscn").instantiate()
	root.add_child(_treasure)
	root.add_child(_shop)
	_shop.hide()
	_treasure_controller.initialize(_treasure, _operations, func(): return {"revision": _bridge.revision}, func(): return _bridge, _accept)
	_shop_controller.initialize(_shop, _operations, func(): return {"revision": _bridge.revision}, func(): return _bridge, _accept)
	assert((await _treasure_controller.reload()).ok)
	assert(not (_treasure.find_child("NewTreasure", true, false) as Button).disabled)
	var requested_routes: Array[String] = []
	_treasure.route_requested.connect(func(route: String): requested_routes.append(route))
	_treasure.navigation_requested.connect(func(action: Callable, _destination: String): action.call())
	(_treasure.find_child("ItemsTab", true, false) as Button).pressed.emit()
	assert(requested_routes == ["economy.items"])
	assert(_treasure.find_child("BagTab", true, false) == null)
	assert(_treasure.find_child("VaultTab", true, false) == null)
	assert(_shop.find_child("BagTab", true, false) == null)
	assert(_shop.find_child("VaultTab", true, false) == null)
	await _treasure_workflow()
	await _treasure_controller.create_record(1)
	assert(_treasure.current_selection() == 1 and _bridge.treasure.nativeId == 1)
	await _treasure_controller.clear_record(1)
	assert(_treasure.current_selection() == 1 and _bridge.treasure.gold == 0)
	_treasure.hide()
	_shop.show()
	assert((await _shop_controller.reload()).ok)
	assert(not (_shop.find_child("NewShop", true, false) as Button).disabled)
	await _shop_workflow()
	await _unknown_outcome_keeps_draft()
	_treasure_controller.dispose()
	_shop_controller.dispose()
	_bridge.stop()
	_treasure.free()
	_shop.free()
	_operations.free()
	print("PROVIDENCE_ECONOMY_AUTHORING_OK treasure-draft late-typing shop-band-zero terminator-preservation quantity clear-stock unknown-no-retry")
	quit()


func _treasure_workflow() -> void:
	var pool := _treasure.find_child("ItemPool", true, false) as ItemList
	pool.select(0)
	pool.item_selected.emit(0)
	_treasure._add_selected_item()
	assert(int(_treasure.draft_record().itemIds[0]) == 7)
	assert((_treasure.find_child("TreasureItemSlots", true, false) as ItemList).get_item_text(0).contains("Iron Sword"))
	assert(_treasure.has_unapplied_changes() and _treasure.trusted_applied_native_id() == -1)
	(_treasure.find_child("Gold", true, false) as LineEdit).text = "130"
	_start_treasure_commit.call_deferred()
	await _operations.busy_changed
	assert(_operations.busy)
	var gold := _treasure.find_child("Gold", true, false) as LineEdit
	gold.text = "131"
	gold.text_changed.emit("131")
	await _operations.completed
	await process_frame
	assert(_bridge.treasure.gold == 130)
	assert(_treasure.draft_record().gold == 131 and _treasure.has_unapplied_changes())
	_treasure.discard_draft()
	assert(not _treasure.has_unapplied_changes())


func _shop_workflow() -> void:
	var pool := _shop.find_child("ItemPool", true, false) as ItemList
	var magic_row := -1
	for row in pool.item_count:
		if int((pool.get_item_metadata(row) as Dictionary).get("classicId", 0)) == 600: magic_row = row
	assert(magic_row >= 0)
	pool.select(magic_row)
	pool.item_selected.emit(magic_row)
	var before := _shop.draft_record()
	_shop._add_selected_stock()
	var draft := _shop.draft_record()
	assert(draft.itemIds[1] == before.itemIds[1], "global zero outside matching band changed")
	assert(draft.itemIds[600] == 600 and draft.quantities[600] == 1)
	assert((_shop.find_child("ShopStock", true, false) as ItemList).get_item_text(1).contains("Moon Ring"))
	assert(draft.itemIds[601] == -1 and draft.itemIds[602] == 77)
	_shop._select_stock_slot(600)
	(_shop.find_child("Quantity", true, false) as SpinBox).value = 255
	assert(_shop.draft_record().quantities[600] == 255)
	_shop._clear_selected_stock()
	assert(_shop.draft_record().itemIds[600] == 0 and _shop.draft_record().quantities[600] == 0)
	_shop._confirm_clear_stock()
	assert((_shop.draft_record().itemIds as Array).all(func(value): return int(value) == 0))
	await _shop.commit_selected()
	assert(not _shop.has_unapplied_changes() and _bridge.shop.itemIds[602] == 0)


func _unknown_outcome_keeps_draft() -> void:
	_treasure.show()
	_shop.hide()
	assert((await _treasure_controller.reload()).ok)
	(_treasure.find_child("Gold", true, false) as LineEdit).text = "222"
	_bridge.failure = "treasure.update"
	_bridge.unknown = true
	await _treasure.commit_selected()
	assert(_operations.requires_reopen and _treasure.has_unapplied_changes())
	var count := _bridge.calls.size()
	await _treasure.commit_selected()
	assert(_bridge.calls.size() == count)


func _start_treasure_commit() -> void: await _treasure.commit_selected()


func _accept(response: Dictionary) -> bool:
	_responses.append(response)
	return response.get("ok", false)
