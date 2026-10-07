extends SceneTree

class Bridge extends "res://src/native_bridge.gd":
	var failure := false
	var calls: Array = []
	func _request(method: String, params: Dictionary) -> Dictionary:
		OS.delay_msec(30); calls.append(method)
		if method == "item.list":
			if failure: return {"ok":false,"error":"Controlled item catalog failure"}
			var rows: Array = []
			for id in range(1,71): rows.append({"classicId":id,"identity":"classic.item.%d" % id,"name":"Test item %d" % id,"iconId":6101})
			var query := str(params.get("query",""))
			if not query.is_empty(): rows = rows.filter(func(row): return row.name.contains(query))
			var offset := int(params.get("offset",0)); var limit := int(params.get("limit",64))
			return {"ok":true,"result":{"items":rows.slice(offset,offset+limit),"total":rows.size(),"truncated":offset+limit<rows.size()}}
		if method == "item-artwork.resolve": return {"ok":true,"result":{"choice":{"available":false,"reason":"Exact scenario artwork unavailable; no stock fallback."}}}
		if method == "treasure.list": return {"ok":true,"result":{"items":[{"nativeId":0},{"nativeId":1}],"total":2,"nextNativeId":2}}
		if method == "treasure.open":
			var ids: Array = []; ids.resize(20); ids.fill(1)
			return {"ok":true,"result":{"revision":0,"treasure":{"identity":"treasure:%d" % params.nativeId,"nativeId":params.nativeId,"itemIds":ids,"experience":0,"gold":0,"gems":0,"jewelry":0}}}
		return {"ok":false,"error":"Unexpected read " + method}

var view: ProvidenceTreasureEditor
var bridge := Bridge.new()
var operations := ProvidenceEditorOperation.new()
var controller := ProvidenceEconomyRecordController.new()


func _initialize() -> void: _run.call_deferred()


func _run() -> void:
	create_timer(20).timeout.connect(func(): push_error("Economy pool check timed out"); quit(1))
	root.add_child(operations)
	view = load("res://src/treasure_editor.tscn").instantiate(); root.add_child(view)
	controller.initialize(view,operations,func(): return {"revision":0},func(): return bridge,func(response): return response.ok)
	view.navigation_requested.connect(func(action: Callable,_label: String): action.call())
	assert((await controller.reload()).ok); await settle()
	view._on_record_selected(1); await settle()
	assert(view.current_selection()==1 and view.get_node("%ItemPool").item_count==64)
	assert(view.get_node("%TreasureItemSlots").get_item_icon(0)!=null)
	assert(view.get_node("%TreasureItemSlots").get_item_tooltip(0).contains("no stock fallback"))
	profile_refresh()
	var gold: LineEdit = view.get_node("%Gold")
	bridge.failure = true; controller.request_items(); gold.text="123"; gold.text_changed.emit(gold.text); await settle()
	assert(view.get_node("%ItemPool").is_item_disabled(0) and view.find_child("ItemPoolStatus",true,false).text=="Item pool unavailable")
	assert(view.draft_record().gold==123)
	bridge.failure = false; view.find_child("PoolRetry",true,false).pressed.emit(); await settle()
	assert(view.get_node("%ItemPool").item_count==64 and view.draft_record().gold==123)
	var search: LineEdit = view.find_child("ItemSearch",true,false)
	search.text="Test item 6"; search.text_changed.emit(search.text); await process_frame
	search.text="Test item 7"; search.text_changed.emit(search.text); await settle()
	assert(view.get_node("%ItemPool").get_item_text(0).contains("Test item 7"))
	gold.text="invalid reward"; gold.text_changed.emit(gold.text)
	controller._reference_revision = -1; controller.request_items(); await settle()
	assert(gold.text=="invalid reward" and view.has_unapplied_changes() and not view.draft_error().is_empty())
	assert(not bridge.calls.any(func(method): return str(method).ends_with("update")))
	controller.request_items(); await process_frame; controller.teardown(); await settle()
	assert(view.current_selection()==-1 and view.get_node("%ItemPool").item_count==0)
	controller.dispose(); bridge.stop(); view.free(); operations.free(); await process_frame
	print("PROVIDENCE_ECONOMY_POOL_OK browser-open failure-explicit-retry dirty-edit stale-query unavailable-artwork teardown no-mutation-retry"); quit()


func settle() -> void:
	for _frame in 12: await process_frame
	while operations.busy: await operations.completed
	for _frame in 6: await process_frame
	while operations.busy: await operations.completed


func profile_refresh() -> void:
	var samples: Array[int] = []
	var catalog := {"items":view._catalog_items.duplicate(true),"total":70}
	for _sample in 40:
		var started := Time.get_ticks_usec()
		view.set_item_catalog(catalog); view._refresh_record_items()
		samples.append(Time.get_ticks_usec()-started)
	samples.sort()
	assert(samples[37] < 100000)
	print("TREASURE_POOL_REFRESH_CPU_P95_US ",samples[37]," rows=64 slots=20 budget=100000")
