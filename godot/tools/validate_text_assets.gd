extends SceneTree

class MediaBridge extends "res://src/native_bridge.gd":
	var text := "The river runs east.\n".repeat(1000)
	var revision := 7
	var pairing := "ready"
	var requests: Array = []
	var paged := false
	var rows: Array = [
		{"identity": "style:-202", "label": "Style -202", "kind": "text-style-resource", "classicResource": {"resourceType": "styl", "resourceId": -202}},
		{"identity": "text:-202", "label": "Text -202", "kind": "text-resource", "classicResource": {"resourceType": "TEXT", "resourceId": -202}, "previewCommand": "text-resource.open"},
	]
	func is_project_backed() -> bool:
		return true
	func _request(method: String, params: Dictionary = {}) -> Dictionary:
		requests.append({"method": method, "params": params.duplicate(true)})
		match method:
			"project-asset.list":
				var found := rows.filter(func(row): return (params.get("kind", "all") == "all" or params.kind == row.kind) and (not params.has("identity") or row.identity == params.identity))
				if paged:
					var offset := int(params.get("offset", 0))
					var limit := int(params.get("limit", 25))
					if params.has("seekIdentity"): offset = int((int(str(params.seekIdentity).trim_prefix("text:")) - 1) / limit) * limit
					return {"ok": true, "result": {"items": found.slice(offset, offset + limit), "offset": offset, "total": found.size(), "revision": revision, "truncated": offset + limit < found.size()}}
				return {"ok": true, "result": {"items": found, "total": found.size(), "revision": revision, "truncated": false}}
			"project-asset.open":
				assert(params.identity == "style:-202")
				return {"ok": true, "result": {"asset": rows[0], "revision": revision, "pairedText": {"status": pairing, "identity": "text:-202" if pairing == "ready" else null}}}
			"text-resource.open":
				assert(params.identity == "text:-202" or paged)
				return {"ok": true, "result": {"resource": {"identity": params.identity, "resourceId": -202}, "text": text, "revision": revision}}
			"text-resource.inspect-styles": return {"ok":true,"result":{"styles":[],"styleEditable":true,"feedback":{"valid":true,"encodedBytes":text.length()}}}
			"text-resource.apply-styles":
				assert(params.identity == "text:-202" and params.expectedRevision == revision)
				for edit in params.get("edits",[]):
					if edit.kind=="replace-text": text = text.left(int(edit.start))+str(edit.text)+text.substr(int(edit.start)+int(edit.removed))
				revision += 1
				return {"ok": true, "result": {"revision": revision, "canUndo": true}}
		return {"ok": false, "error": "Unsupported test request: " + method}


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	root.gui_embed_subwindows = true
	root.size = Vector2i(1600, 900)
	var workbench = load("res://src/unified_assets_editor.tscn").instantiate()
	root.add_child(workbench)
	workbench.size = Vector2(1520, 800)
	var bridge := MediaBridge.new()
	workbench._bridge = bridge
	await workbench.show_scope("scenario")
	var panel = workbench.get_node("%Gallery")
	var applied: Array = []
	workbench.scenario_changed.connect(func(projection): applied.append(projection))
	await _check_text_edit(panel, bridge, applied)
	await _check_style_pairing(panel, bridge)
	workbench.show_save_state("Could not save · destination is full", true, true)
	assert(workbench.get_node("%SaveAssetProject").text == "Retry Save")
	assert(workbench.get_node("%SaveAssetAs").visible)
	workbench.show_save_state("Project saved", false)
	assert(not workbench.get_node("%SaveAssetActions").visible)
	await _check_paging(workbench, panel, bridge)
	workbench.queue_free()
	await process_frame
	print("PROVIDENCE_TEXT_ASSETS_OK full-preview edit-apply-selection paired-exact missing ambiguous save-state")
	quit(0)



func _check_text_edit(panel: Control, bridge: MediaBridge, applied: Array) -> void:
	for _frame in range(8): await process_frame
	await panel._select(1)
	assert(panel.get_node("%TextPreview").text == bridge.text)
	assert(bridge.text.length() > 16000)
	assert(panel.get_node("%Gallery").get_item_icon(1) != panel.UNAVAILABLE)
	assert(not panel.get_node("%UseStock").visible and not panel.get_node("%Copy").visible)
	assert(panel.get_node("%RemoveScenario").visible)
	assert(panel.get_node("%EditResource").text == "Edit Text…" and not panel.get_node("%EditResource").disabled)
	panel.get_node("%EditResource").pressed.emit()
	while panel.get("_operations").busy: await process_frame
	var dialog = panel.get_node("%TextDialog")
	assert(dialog.visible and dialog.editor.text == bridge.text)
	dialog.editor.text = "Changed text\nSecond line"
	dialog.editor.text_changed.emit()
	await dialog.get_node("%StyleWorkbench")._inspect()
	dialog._draft_changed()
	await dialog.apply_text()
	for _frame in range(8): await process_frame
	assert(applied.size() == 1 and applied[0].revision == 8)
	assert(str(panel._rows[panel._selected].identity) == "text:-202")
	assert(panel.get_node("%TextPreview").text == bridge.text)


func _check_style_pairing(panel: Control, bridge: MediaBridge) -> void:
	var dialog: Window = panel.get_node("%TextDialog")
	await panel._select(0)
	assert(not panel.get_node("%EditResource").disabled)
	assert(panel.get_node("%StyleDescription").visible)
	assert(not panel.get_node("%TextPreview").visible)
	bridge.pairing = "ambiguous"
	panel.get_node("%EditResource").pressed.emit()
	while panel.get("_operations").busy: await process_frame
	assert(panel._selected == 0 and panel.get_node("%EditResource").disabled)
	assert(panel.get_node("InspectorInset/Selection/Rights").text.contains("Duplicate-text repair is not available"))
	bridge.pairing = "missing"
	await panel._select(0)
	assert(panel.get_node("%EditResource").disabled)
	assert(panel.get_node("InspectorInset/Selection/Rights").text.contains("New Text"))
	bridge.pairing = "ready"
	await panel._select(0)
	panel.get_node("%EditResource").pressed.emit()
	while panel.get("_operations").busy: await process_frame
	assert(panel._rows.size() == 1 and panel._rows[0].identity == "text:-202")
	assert(panel._selected == 0 and not dialog.visible)
	assert(panel.get_node("%TextPreview").text == bridge.text)
	assert(bridge.revision == 8 and not bridge.requests.any(func(entry): return entry.method == "project.save"))


func _check_paging(workbench: Control, panel: Control, bridge: MediaBridge) -> void:
	bridge.paged = true
	bridge.rows.clear()
	for number in range(1, 81):
		bridge.rows.append({"identity": "text:%d" % number, "label": "Text %d" % number, "kind": "text-resource", "classicResource": {"resourceType": "TEXT", "resourceId": number}, "previewCommand": "text-resource.open"})
	await workbench.show_scope("scenario")
	await panel.select_created_text("text:62")
	assert(panel._page_start == 50 and panel._rows.size() == 25 and panel._rows[panel._selected].identity == "text:62")
	panel.get_node("%Paging").get_node("Next").pressed.emit()
	while panel.get("_operations").busy: await process_frame
	assert(panel._page_start == 75 and panel._rows.size() == 5 and panel._rows[-1].identity == "text:80")
	assert(panel.get_node("%Paging").get_node("Next").disabled)
	panel.get_node("%Search").text_submitted.emit("")
	while panel.get("_operations").busy: await process_frame
	assert(panel._page_start == 0 and panel._rows[0].identity == "text:1")
