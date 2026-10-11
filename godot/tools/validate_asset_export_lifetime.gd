extends SceneTree

class Bridge extends "res://src/native_bridge.gd":
	var calls: Array = []
	var uncertain := false
	var write_failed := false
	func _request(method: String, params: Dictionary) -> Dictionary:
		OS.delay_msec(45)
		calls.append({"method":method, "params":params.duplicate(true)})
		if method == "asset-export.describe":
			var categories: Array = []
			for id in ["pictures","icons","portraits","monster-artwork","tilesets","special-land","sounds","music","text","other"]:
				categories.append({"id":id,"label":id,"counts":[{"scope":"scenario","count":1 if id == "pictures" else 0}]})
			return {"ok":true, "result":{"scopes":[{"id":"scenario","total":1,"configured":true},{"id":"library","total":0,"configured":false},{"id":"stock","total":0,"configured":false}],"categories":categories}}
		if method == "asset-export.plan":
			return {"ok":true, "result":{"reviewHash":"controlled","selectionLabel":"Controlled picture","assets":1,"convertible":1,"unsupportedConversions":0}}
		if uncertain: return {"ok":false,"error":"Controlled lost reply","outcomeUnknown":true}
		if write_failed: return {"ok":false,"error":"Controlled destination failure"}
		return {"ok":true,"result":{"directory":"C:/controlled export","files":1,"assets":1,"issueCount":1,
			"issues":[{"label":"Controlled picture","format":"converted","reason":"No supported conversion. Original file exported."}]}}

var bridge := Bridge.new()
var operations := ProvidenceEditorOperation.new()
var dialog: Window


func _initialize() -> void: call_deferred("_run")


func _run() -> void:
	create_timer(25).timeout.connect(func(): push_error("Asset export lifetime deadline"); quit(1))
	root.gui_embed_subwindows = true; root.size = Vector2i(1600, 900)
	root.add_child(operations)
	dialog = load("res://src/asset_export_dialog.tscn").instantiate(); root.add_child(dialog)
	dialog.get_node("Inset").theme = preload("res://src/media_theme.gd").new()
	await _stale_reads()
	await _write_states()
	await _unknown_outcome()
	bridge.stop(); dialog.queue_free(); operations.queue_free(); await process_frame
	print("PROVIDENCE_ASSET_EXPORT_LIFETIME_OK cancel stale single-flight locked-submit failure-report unknown-no-retry")
	quit()


func _stale_reads() -> void:
	dialog.open_export(bridge, operations, "scenario")
	assert(operations.busy and dialog.visible)
	dialog._close()
	while operations.busy: await process_frame
	await process_frame
	assert(not dialog.visible and dialog._prepared.is_empty())
	await dialog.open_export(bridge, operations, "scenario")
	dialog._prepare()
	assert(operations.busy)
	dialog.get_node("%Originals").set_pressed_no_signal(false); dialog._changed()
	dialog.get_node("%PrepareDelay").stop()
	while operations.busy: await process_frame
	await process_frame
	assert(dialog._prepared.is_empty() and dialog.get_node("%Export").disabled)
	await dialog._prepare()
	assert(not dialog.get_node("%Export").disabled)
	assert(operations.last_metrics.maxFrameGapMs < 150)


func _write_states() -> void:
	var calls := bridge.calls.size()
	dialog.export_to("C:/controlled")
	assert(dialog._writing and dialog.get_node("%Cancel").disabled and dialog.get_node("%Originals").disabled)
	dialog._close(); await dialog.export_to("C:/second")
	assert(dialog.visible)
	while operations.busy: await process_frame
	await process_frame
	assert(bridge.calls.size() == calls + 1 and dialog.get_node("%Issues").visible)
	assert(dialog.get_node("%OpenFolder").visible and not dialog.get_node("%CategorySection").visible)
	assert(dialog.get_node("%Cancel").get_global_rect().end.y < dialog.size.y)
	await _capture_report()
	dialog._close(); await dialog.open_export(bridge, operations, "scenario")
	bridge.write_failed = true
	await dialog.export_to("C:/controlled")
	assert(dialog._prepared.is_empty() and dialog.get_node("%Export").disabled)
	assert(not dialog.get_node("%Cancel").disabled and not dialog.get_node("%Refresh").disabled)
	assert(dialog.get_node("%Summary").text == "Controlled destination failure")
	bridge.write_failed = false; await dialog._describe()
	assert(not dialog.get_node("%Export").disabled)


func _unknown_outcome() -> void:
	bridge.uncertain = true
	var calls := bridge.calls.size()
	await dialog.export_to("C:/controlled")
	assert(operations.requires_reopen and dialog.get_node("%Summary").text.contains("reply was lost"))
	await dialog.export_to("C:/again"); await dialog._describe()
	assert(bridge.calls.size() == calls + 1)
	assert(dialog._prepared.is_empty())
	dialog.detach_session()
	assert(not dialog.visible)


func _capture_report() -> void:
	var args := OS.get_cmdline_user_args()
	if args.is_empty(): return
	for viewport in [Vector2i(1600, 900), Vector2i(1920, 1080)]:
		root.size = viewport; dialog.popup_centered(dialog.size)
		for frame in 8: await process_frame
		await RenderingServer.frame_post_draw
		root.get_texture().get_image().save_png(args[0].path_join("controlled-issue-completion-%dx%d.png" % [viewport.x, viewport.y]))
