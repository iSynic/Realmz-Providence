extends SceneTree

const Catalog = preload("res://src/record_catalog_reader.gd")


func _initialize() -> void: _run.call_deferred()


func _run() -> void:
	await _reader_boundaries()
	for viewport_size in [Vector2i(1600, 900), Vector2i(1920, 1080), Vector2i(3440, 1392)]:
		root.size = viewport_size
		await _item_viewport()
	print("PROVIDENCE_RECORD_BROWSING_OK bounded-pages cancellation revision viewport-selection")
	quit()


func _reader_boundaries() -> void:
	var calls: Array = []
	var response := await Catalog.load_all(func(_method, params):
		assert(params.limit == 128 and params.query == "retained filter")
		calls.append(params.offset)
		var items: Array = []
		for id in range(params.offset, mini(999, params.offset + params.limit)): items.append({"identity": "item:%d" % id})
		return {"ok": true, "result": {"items": items, "offset": params.offset, "total": 999, "revision": 4}},
		"item.catalog", func(): return true, {"query": "retained filter", "offset": 8, "limit": 8})
	assert(response.ok and response.result.items.size() == 999 and calls == [0,128,256,384,512,640,768,896])
	var state := {"current": true, "calls": 0}
	response = await Catalog.load_all(func(_method, params):
		state.calls += 1; state.current = false
		return {"ok": true, "result": {"items": [1], "total": 2, "offset": params.offset}},
		"item.catalog", func(): return state.current)
	assert(not response.ok and response.connectionChanged and state.calls == 1)
	for failure in ["revision", "empty", "offset", "overflow"]:
		response = await Catalog.load_all(func(_method, params):
			var items: Array = [] if failure == "empty" and params.offset > 0 else [1]
			return {"ok": true, "result": {"items": items,
				"revision": params.offset if failure == "revision" else 4,
				"offset": 99 if failure == "offset" else params.offset,
				"total": 70000 if failure == "overflow" else 2}}, "battle.list", func(): return true)
		assert(not response.ok)


func _item_viewport() -> void:
	var view = load("res://src/item_editor.tscn").instantiate()
	root.add_child(view); view.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var rows: Array = []
	for id in range(1, 1000): rows.append({"identity": "item:%d" % id, "classicId": id, "name": "Item %d" % id, "scope": "stock"})
	view.show_catalog({"items": rows, "total": 999, "revision": 4})
	await process_frame; await process_frame; await process_frame
	var collection = view.get_node("%ItemCollection")
	assert(collection.item_count == 999 and collection.get_child_count() < 30)
	assert(collection.get_child_count() > 8)
	collection.select(998); collection.ensure_current_is_visible()
	await process_frame; await process_frame
	assert(collection.get_selected_items() == PackedInt32Array([998]))
	assert(collection._active.has(998) and collection._active[998].get_meta("identity") == "item:999")
	var selected: Array = []
	collection.item_selected.connect(func(index): selected.append(index))
	collection._active[998].pressed.emit()
	assert(selected == [998] and collection.get_child_count() < 30)
	view.show_catalog({"items": rows.slice(0, 2), "total": 2, "revision": 4})
	await process_frame; await process_frame
	assert(collection.item_count == 2 and collection.get_child_count() == 2)
	view.free(); await process_frame
