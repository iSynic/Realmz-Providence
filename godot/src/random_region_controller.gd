extends RefCounted

signal projection_applied(projection: Dictionary)
signal failed(message: String)
signal active_changed(active: bool)

var view: Control
var active := false
var _map: ProvidenceMapDocumentController
var _operations: ProvidenceEditorOperation
var _bridge: RefCounted
var _generation := 0
var _accept_draft: Callable
var _guard: Callable
var _overlay: Control
var _land_overlay: Control
var _dungeon_overlay: Control
var _preview_queue: Dictionary = {}
var _preview_reading := false
var _pending: Dictionary = {}
var _origin_button: Button
var _opening := 0
var _submitting := false
var _refreshing := false
var _reference_link := preload("res://src/region_reference_navigation.gd").new()


func initialize(host: Node, map: ProvidenceMapDocumentController, operations: ProvidenceEditorOperation, land: Control, dungeon: Control, accept_draft: Callable, guard: Callable, origin: Button, open_target: Callable) -> void:
	_map = map; _operations = operations; _accept_draft = accept_draft; _guard = guard; _origin_button = origin
	view = preload("res://src/random_region_dock.tscn").instantiate()
	host.add_child(view)
	_land_overlay = land.get_node("%RandomRegionOverlay")
	_dungeon_overlay = dungeon.get_node("%RandomRegionOverlay")
	view.apply_requested.connect(commit_selected)
	view.clear_requested.connect(clear_slot)
	view.slot_requested.connect(func(slot): _guard.call(open.bind(slot), "switching encounter region"))
	view.leave_requested.connect(func(): _guard.call(close, "leaving encounter regions"))
	view.draw_requested.connect(func(enabled): if is_instance_valid(_overlay): _overlay.set_drawing(enabled))
	view.reveal_requested.connect(reveal)
	view.draft_changed.connect(_draft_changed)
	view.reference_requested.connect(_choose_reference)
	view.get_node("%RegionReferencePicker").search_requested.connect(_search_references)
	view.get_node("%RegionReferencePicker").accepted.connect(_accept_reference)
	view.get_node("%ReconcileRegion").pressed.connect(check_original)
	_reference_link.initialize(self,operations,land,dungeon,open_target)
	_reference_link.failed.connect(func(response): view.show_failure(_read_failure(response,{"generation":_generation,"identity":_map.identity})))
	for overlay in [_land_overlay, _dungeon_overlay]:
		overlay.bounds_staged.connect(view.stage_bounds)
		overlay.drawing_canceled.connect(func(): view.get_node("%DrawRegion").set_pressed_no_signal(false))
	_map.document_opened.connect(_document_opened)
	_map.document_cleared.connect(close)


func attach_session(bridge: RefCounted) -> void:
	_reference_link.attach_session(bridge)
	_generation += 1; _bridge = bridge
	_opening += 1
	_preview_queue.clear(); _preview_reading = false; _pending.clear()
	_submitting = false; _refreshing = false
	close()
	view.clear_document()


func has_unapplied_changes() -> bool:
	return not _pending.is_empty() or view.has_unapplied_changes()


func discard_draft() -> void:
	if not _pending.is_empty(): return
	view.discard_draft()
	view.close_pickers()
	if is_instance_valid(_overlay): _overlay.cancel_gesture()


func open(slot := 19) -> Dictionary:
	if _bridge == null or _map.identity.is_empty(): return _stale()
	if active and view.identity == _map.identity and int(view.slot) == slot and has_unapplied_changes(): return {"ok": true}
	_opening += 1
	var origin := {"generation": _generation, "identity": _map.identity, "opening": _opening}
	var response := await _operations.run_workflow(_bridge, "Open encounter region", _open.bind(slot, origin), null, true)
	if _matches(origin) and not response.get("ok", false): _read_failure(response, origin); failed.emit(str(response.get("error", "The region could not open.")))
	return response


func _open(operation: ProvidenceEditorOperation, slot: int, origin: Dictionary) -> Dictionary:
	var response := await operation.request("random-region.open", {"mapIdentity": origin.identity, "slot": slot})
	if not _matches(origin): return _stale()
	if not response.get("ok", false): return response
	_overlay = _dungeon_overlay if _map.is_dungeon else _land_overlay
	active = true; view.show(); _overlay.set_display_enabled(true)
	view.set_projection(response.result)
	active_changed.emit(true)
	view.get_node("%RegionSlots").grab_focus()
	return response


func close() -> void:
	_opening += 1
	active = false
	view.close_pickers(); view.hide()
	for overlay in [_land_overlay, _dungeon_overlay]: overlay.clear_draft()
	_preview_queue.clear()
	active_changed.emit(false)


func _document_opened(map: Dictionary, _reset: bool) -> void:
	if view.identity != str(map.identity): close(); return
	if active and not _submitting and not has_unapplied_changes() and not _refreshing: _refresh_clean()


func _refresh_clean() -> void:
	_refreshing = true
	var origin := {"generation": _generation, "identity": view.identity, "slot": view.slot, "editGeneration": view.edit_generation}
	while _operations.busy and _matches(origin): await view.get_tree().process_frame
	if _matches(origin) and active and int(origin.editGeneration) == view.edit_generation:
		await open(int(origin.slot))
	_refreshing = false


func _present_overlay() -> void:
	if not active or _overlay == null: return
	var map_rows: Array = []
	# The region-open projection is bounded to the twenty owning slots.
	var slots: Array = view.get_meta("slots", [])
	for row: Dictionary in slots:
		if row.region is Dictionary: map_rows.append(row.region)
	_overlay.configure(map_rows, view.draft, view.slot)


func _draft_changed() -> void:
	if not active or _bridge == null or not _pending.is_empty(): return
	_present_overlay()
	_preview_queue = {"params": view.submitted(), "generation": _generation, "identity": view.identity, "editGeneration": view.edit_generation}
	if not _preview_reading: _drain_previews()


func _drain_previews() -> void:
	_preview_reading = true
	var generation := _generation
	while generation == _generation and not _preview_queue.is_empty():
		var origin := _preview_queue.duplicate(true); _preview_queue.clear()
		while _operations.busy and _matches(origin): await view.get_tree().process_frame
		if not _matches(origin) or not active: break
		var response := await _operations.run_workflow(_bridge, "Preview encounter region", func(operation):
			return await operation.request("random-region.preview", origin.params), null, true)
		if not _matches(origin): break
		view.set_preview(response, int(origin.editGeneration))
		if response.get("outcomeUnknown", false): _read_failure(response, origin); break
	if generation == _generation: _preview_reading = false


func commit_selected() -> Dictionary:
	return await _submit("random-region.apply", view.submitted())


func clear_slot() -> Dictionary:
	if view.get_node("%ClearConfirmation").visible: view.get_node("%ClearConfirmation").hide()
	return await _submit("random-region.clear", {"mapIdentity": view.identity, "expectedRevision": view.revision, "slot": view.slot})


func _submit(method: String, params: Dictionary) -> Dictionary:
	var origin := {"generation": _generation, "identity": view.identity, "slot": view.slot}
	if not _matches(origin) or not _pending.is_empty(): return _stale()
	_preview_queue.clear()
	_submitting = true
	if is_instance_valid(_overlay): _overlay.set_drawing(false)
	view.set_loading(true)
	var response := await _operations.run_workflow(_bridge, "Apply encounter region", _commit.bind(method, params, origin), null, true)
	if not _matches(origin): return _stale()
	_submitting = false
	if _pending.is_empty(): view.set_loading(false)
	if not response.get("ok", false): view.show_failure(response)
	_accept_draft.call(response)
	return response


func _commit(operation: ProvidenceEditorOperation, method: String, params: Dictionary, origin: Dictionary) -> Dictionary:
	if method == "random-region.apply":
		var preview := await operation.request("random-region.preview", params)
		if not _matches(origin): return _stale()
		if not preview.get("ok", false): return _read_failure(preview, origin)
	params.operationId = Crypto.new().generate_random_bytes(32).hex_encode()
	_pending = {"origin": origin, "method": method, "params": params.duplicate(true)}
	var response := await operation.request(method, params)
	if not _matches(origin): return _stale()
	if response.get("outcomeUnknown", false): return response
	_pending.clear()
	if not response.get("ok", false): return response
	projection_applied.emit(response.result)
	var refreshed := await _open(operation, int(origin.slot), origin)
	if not refreshed.get("ok", false): return _read_failure(refreshed, origin, true)
	refreshed = await _map.refresh_history(operation, response.result)
	if not _matches(origin): return _stale()
	if not refreshed.get("ok", false): return _read_failure(refreshed, origin, true)
	return response


func _read_failure(response: Dictionary, origin: Dictionary, applied := false) -> Dictionary:
	if response.get("outcomeUnknown", false) or applied:
		_pending = {"origin": origin, "readOnly": true, "applied": applied}
		if applied:
			response.viewRefreshPending = true
			response.error = "Region Apply is confirmed. Reconcile to refresh; the write will not be repeated."
		view.show_failure(response)
	return response


func check_original() -> void:
	if _bridge == null or _pending.is_empty() or _operations.busy: return
	var pending := _pending.duplicate(true)
	var lookup: Dictionary = {}
	if not pending.get("readOnly", false): lookup = {"domain": "project", "operationId": pending.params.operationId, "expectedIntent": {"method": pending.method, "params": pending.params}}
	var response := await _operations.recover_world(_bridge, lookup)
	if not _matches(pending.origin): return
	if not response.get("worldRecoveryConfirmed", false): response.outcomeUnknown = true; view.show_failure(response); return
	var committed: bool = pending.get("applied", false) or (not pending.get("readOnly", false) and response.result.outcome == "committed")
	_pending.clear()
	var refreshed := await _operations.run_workflow(_bridge, "Read reconciled region", _reconciled.bind(pending.origin, committed), null, true)
	if not _matches(pending.origin): return
	if not refreshed.get("ok", false): view.show_failure(_read_failure(refreshed, pending.origin, committed))
	else: view.get_node("%ReconcileRegion").hide()


func _reconciled(operation: ProvidenceEditorOperation, origin: Dictionary, committed: bool) -> Dictionary:
	var response := await operation.request("session.describe", {})
	if not _matches(origin): return _stale()
	if not response.get("ok", false): return _read_failure(response, origin, committed)
	projection_applied.emit({"revision": response.result.revision, "canUndo": response.result.canUndo, "canRedo": response.result.canRedo, "truncated": true})
	if committed: response = await _open(operation, int(origin.get("slot", view.slot)), origin)
	else:
		view.revision = int(response.result.revision)
		view.set_loading(false)
	if not response.get("ok", false): return response
	return await _map.refresh_history(operation)


func _choose_reference(field: String, context: Dictionary, focus: Control) -> void:
	if not _pending.is_empty(): return
	context.sessionGeneration = _generation
	var picker: Window = view.get_node("%RegionReferencePicker")
	picker.begin(context, focus)
	picker.get_node("%Ownership").visible = field == "soundId"


func _search_references(query: Dictionary, request_generation: int) -> void:
	var picker: Window = view.get_node("%RegionReferencePicker")
	if _operations.busy: picker.retry_search(query, request_generation); return
	var origin: Dictionary = picker.context.duplicate(true)
	if origin.is_empty(): return
	var response := await _operations.run_workflow(_bridge, "Find region reference", func(operation):
		return await operation.request("random-region.reference.list", {"mapIdentity": origin.mapIdentity, "expectedRevision": origin.revision, "query": query}), null, true)
	if int(origin.sessionGeneration) != _generation or origin.mapIdentity != _map.identity: return
	picker.receive_page(response, request_generation)
	if response.get("outcomeUnknown", false): _read_failure(response, {"generation": _generation, "identity": origin.mapIdentity})


func _accept_reference(choice: Dictionary, context: Dictionary) -> void:
	if int(context.get("sessionGeneration", -1)) != _generation or context.mapIdentity != _map.identity: return
	view.accept_reference(choice, context)


func reference_is_current(context: Dictionary) -> bool:
	return _bridge!=null and active and context.get("sessionGeneration",-1)==_generation and context.get("mapIdentity","")==_map.identity and context.get("slot",-1)==view.slot and context.get("editGeneration",-1)==view.edit_generation


func suspend_reference() -> void:
	close(); view.discard_draft()


func resume_reference(kept: Dictionary) -> bool:
	var origin: Dictionary = kept.origin
	if origin.sessionGeneration!=_generation or origin.mapIdentity!=_map.identity: return false
	var response := await open(int(origin.slot))
	if not response.get("ok",false): return false
	view.restore_kept_draft(kept.draft); view.get_node("%" + view.REFERENCE_FIELDS[origin.field]).grab_focus()
	return true


func reveal() -> void:
	if not active or _overlay == null or view.draft.is_empty(): return
	_overlay.get_parent().reveal_cell(clampi(int(view.draft.left), 0, 89), clampi(int(view.draft.top), 0, 89))


func _matches(origin: Dictionary) -> bool:
	return is_instance_valid(view) and view.is_inside_tree() and int(origin.generation) == _generation and str(origin.identity) == _map.identity and int(origin.get("opening", _opening)) == _opening


func _stale() -> Dictionary:
	return {"ok": false, "stale": true, "error": "The encounter-region destination changed. Your draft was not applied."}


func dispose() -> void:
	_reference_link.dispose()
	_generation += 1
	_bridge = null
	_guard = Callable(); _accept_draft = Callable()
	if _map != null:
		_map.document_opened.disconnect(_document_opened)
		_map.document_cleared.disconnect(close)
	_map = null
	for relay in [projection_applied, failed, active_changed]:
		for connection in relay.get_connections(): relay.disconnect(connection.callable)
