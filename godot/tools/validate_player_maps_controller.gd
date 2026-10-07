extends SceneTree

class Bridge extends "res://src/native_bridge.gd":
	var calls: Array = []
	var revision := 0
	var failure := ""
	var unknown := false
	var fail_refresh := false
	var record := {"identity": "player-map:0", "nativeId": 0, "note": "Applied note", "show": -201, "authored": true,
		"startX": 0, "startY": 0, "level": 0, "pictureId": 0, "iconSize": 16, "isDungeon": false,
		"pictureRect": {"top": 0, "left": 0, "bottom": 0, "right": 0}, "markers": []}
	var names := {"availableName": "North", "unavailableName": "Unknown North"}
	func _request(method: String, params: Dictionary) -> Dictionary:
		OS.delay_msec(20)
		calls.append(method)
		if method == failure or method == "player-map.open" and fail_refresh: return {"ok": false, "outcomeUnknown": unknown, "error": "Controlled Player Map failure"}
		match method:
			"player-map.list": return {"ok": true, "result": {"records": [{"identity": record.identity}], "total": 1, "canCreate": false}}
			"player-map.open": return JSON.parse_string(JSON.stringify({"ok": true, "result": {"revision": revision, "playerMap": record, "names": names}}))
			"reference.used-by": return {"ok": true, "result": {"items": [], "total": 0}}
			"player-map.validate": return {"ok": true, "result": {"valid": true, "noteBytes": 12, "availableNameBytes": 5, "unavailableNameBytes": 13}}
			"player-map.preview": return {"ok": true, "result": {"mode": "scrolling-text", "resource": {"text": "Exact signed TEXT preview"}}}
			"text-resource.resolve-exact": return {"ok": true, "result": {"ownership": "scenario", "resource": {"resourceType": "TEXT", "resourceId": -201, "identity": "resource:text"}}}
			"player-map.apply-draft":
				assert(params.playerMap.nativeId is int and params.playerMap.show is int)
				assert(params.expectedRevision == revision)
				record = params.playerMap.duplicate(true); names = params.names.duplicate(true)
				revision += 1
				return {"ok": true, "result": {"revision": revision}}
			_: return {"ok": false, "error": "Unexpected method " + method}

var _bridge := Bridge.new()
var _operations := ProvidenceEditorOperation.new()
var _controller := preload("res://src/player_maps_controller.gd").new()
var _preview := ProvidenceRebuiltPreviewSelection.new()
var _view: ProvidencePlayerMapsEditor
var _applied := 0
var _responses: Array = []


func _initialize() -> void: call_deferred("_run")


func _run() -> void:
	create_timer(30).timeout.connect(func(): push_error("Player Map controller check timed out"); quit(1))
	for _index in 10: _bridge.record.markers.append({"iconId": 0, "x": 0, "y": 0})
	root.gui_embed_subwindows = true
	root.add_child(_operations)
	_view = load("res://src/player_maps_editor.tscn").instantiate(); root.add_child(_view)
	_view.size = Vector2(1400, 780)
	_controller.initialize(_view, _preview, _operations, func(): return {"revision": _bridge.revision}, _accept, _accept)
	_controller.projection_applied.connect(func(_projection): _applied += 1)
	_controller.attach_session(_bridge)
	if not check((await _controller.reload()).ok, "initial paged read"): return
	if not check(not _view.has_unapplied_changes(), "clean typed record"): return
	if not await _check_caller_failure(): return
	_view.get_node("%PlayerMapNote").text = "Edited note"; _view.draft_changed()
	_view.get_node("%AvailableName").text = "Edited North"; _view.draft_changed()
	await _controller.validate_and_preview()
	await _view.commit_selected()
	if not check(_applied == 1 and _bridge.revision == 1 and not _view.has_unapplied_changes(), "one atomic body/names acknowledgement"): return
	if not check(_bridge.calls.count("player-map.apply-draft") == 1 and not _bridge.calls.has("player-map.names.update"), "no split mutation"): return
	_view._select_marker(9); _view.get_node("%MarkerIcon").value = -91
	_view.get_node("%MarkerX").value = 3; _view.get_node("%MarkerY").value = 4
	if not check(_view.draft_record().markers[9] == {"iconId": -91, "x": 3, "y": 4}, "tenth slot signed identity and coordinates"): return
	if not await _check_picker_lifetime(): return
	var token := _view.draft_token()
	_view._select_marker(0)
	_view._selectors._accept_resource({"value": 137, "available": true}, {"field": "marker", "currentValue": 0, "token": token})
	if not check(_view.draft_record().markers[0].iconId == 0, "stale marker destination rejected"): return
	_view._select_marker(9); _view._clear_marker()
	if not check(_view.draft_record().markers[9] == {"iconId": 0, "x": 0, "y": 0}, "clear only exact slot"): return
	_view.discard_draft()
	_view.get_node("%PlayerMapNote").text = "Rejected draft"; _view.draft_changed()
	await _controller.validate_and_preview()
	_bridge.failure = "player-map.apply-draft"
	await _view.commit_selected()
	if not check(_bridge.revision == 1 and _view.has_unapplied_changes() and _view.can_edit(), "known failure preserves both local payloads"): return
	_bridge.failure = ""
	_bridge.fail_refresh = true
	await _view.commit_selected()
	if not check(_bridge.revision == 2 and _responses.back().has("viewRefreshError") and not _view.can_edit(), "acknowledged write and failed refresh lock stale presentation"): return
	var writes := _bridge.calls.count("player-map.apply-draft")
	_view.discard_draft(); await _view.commit_selected()
	if not check(_bridge.calls.count("player-map.apply-draft") == writes, "saved failure cannot repeat mutation"): return
	_bridge.fail_refresh = false
	_controller.attach_session(_bridge); await _controller.reload()
	_view.get_node("%PlayerMapNote").text = "Unknown draft"; _view.draft_changed(); await _controller.validate_and_preview()
	_bridge.failure = "player-map.apply-draft"; _bridge.unknown = true
	await _view.commit_selected()
	if not check(_operations.requires_reopen and _view.has_unapplied_changes() and not _view.can_edit(), "uncertain outcome retains and locks draft"): return
	writes = _bridge.calls.count("player-map.apply-draft"); await _view.commit_selected()
	if not check(_bridge.calls.count("player-map.apply-draft") == writes, "uncertain mutation is never automatically retried"): return
	_controller.teardown()
	if not check(_view.current_player_map().is_empty(), "session teardown clears picker destination"): return
	_controller.dispose(); _bridge.stop(); _view.free(); _operations.free()
	print("PROVIDENCE_PLAYER_MAPS_CONTROLLER_OK atomic-body-names ten-slots signed-identity stale-slot known-failure saved-refresh-lock unknown-no-retry teardown")
	quit()


func _accept(response: Dictionary) -> bool:
	_responses.append(response); return response.get("ok", false)


func check(condition: bool, label: String) -> bool:
	if condition: return true
	push_error(label); quit(1); return false


func _check_picker_lifetime() -> bool:
	var before := _view.draft_record()
	_view.draft_changed()
	_view._place_marker(Vector2i(7, 8))
	if not check(_view.draft_record() == before, "stale terrain preview cannot place markers"): return false
	var picker: Window = load("res://src/player_map_resource_picker.tscn").instantiate()
	_view.add_child(picker)
	picker.accepted.connect(_view._selectors._accept_resource)
	var focus: Control = _view.get_node("%ChooseMarker")
	var destination := {"field": "marker", "currentValue": -91, "allowNone": true,
		"token": _view.draft_token(), "destination": "Player Map 0 · Marker slot 10"}
	picker.begin(destination, focus)
	picker.cancel()
	await process_frame
	if not check(_view.draft_record() == before and root.gui_get_focus_owner() == focus, "Cancel restores draft and origin focus"): return false
	picker.begin(destination, focus)
	picker.get_node("%None").pressed.emit()
	await process_frame
	if not check(not picker.visible and int(_view.draft_record().markers[9].iconId) == 0 and root.gui_get_focus_owner() == focus, "None accepts into exact slot and restores focus once"): return false
	picker.free()
	_view.get_node("%MarkerIcon").value = -91
	_controller.validate_and_preview()
	await process_frame
	_view._select_marker(8)
	while _operations.busy: await _operations.completed
	for _frame in 45: await process_frame
	if not check(_view.get_node("DraftDelay").is_stopped() or _operations.busy, "slot navigation schedules replacement validation"): return false
	_view._select_marker(9)
	return true


func _check_caller_failure() -> bool:
	_bridge.failure = "reference.used-by"
	if not check((await _controller.reload()).ok, "caller failure preserves editable record"): return false
	var links: RichTextLabel = _view.get_node("%Links")
	if not check(links.get_parsed_text().contains("Used By unavailable") and not links.get_parsed_text().contains("0 callers") and links.get_parsed_text().contains("Retry caller lookup"), "failed caller lookup cannot claim zero callers"): return false
	_bridge.failure = ""
	links.meta_clicked.emit("retry-uses")
	while _operations.busy: await _operations.completed
	await process_frame
	return check(links.get_parsed_text().contains("0 callers") and not links.get_parsed_text().contains("unavailable"), "explicit caller retry restores canonical empty result")
