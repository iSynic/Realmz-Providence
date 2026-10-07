extends RefCounted

signal projection_applied(projection: Dictionary)
signal failed(message: String)
signal submission_finished(response: Dictionary)

var view: Window
var _map: ProvidenceMapDocumentController
var _land: ProvidenceLandEditor
var _dock
var _operations: ProvidenceEditorOperation
var _read_context: Callable
var _accept: Callable
var _guard: Callable
var _bridge: RefCounted
var _generation := 0
var _origin: Dictionary = {}
var _submitted: Dictionary = {}
var _pending: Dictionary = {}
var _waiting := false
var _tile_field := ""
var _tile_origin: Dictionary = {}
var _sound_link := preload("res://src/tile_behavior_sound.gd").new()
var _reference_suspended := false


func initialize(owner: Node, map: ProvidenceMapDocumentController, land: ProvidenceLandEditor, dock, operations: ProvidenceEditorOperation, read_context: Callable, accept: Callable, guard: Callable, open_target: Callable) -> void:
	_map = map; _land = land; _dock = dock; _operations = operations; _read_context = read_context; _accept = accept; _guard = guard
	view = preload("res://src/tile_behavior_window.tscn").instantiate(); owner.add_child(view)
	view.review_requested.connect(review); view.apply_requested.connect(apply_review); view.recovery_requested.connect(check_original)
	view.sound_requested.connect(_choose_sound); view.tile_requested.connect(_choose_tile)
	view.canceled.connect(_canceled)
	view.combat_artwork_requested.connect(_retry_combat_artwork)
	view.get_node("%BehaviorSoundPicker").search_requested.connect(_search_sound)
	view.get_node("%BehaviorSoundPicker").accepted.connect(_accept_sound)
	view.get_node("%BehaviorTilePicker").tile_selected.connect(_accept_tile)
	_sound_link.initialize(view,land,operations,_matches,_suspend_reference,_resume_reference,open_target)
	_sound_link.failed.connect(_failure)
	dock.behavior_requested.connect(_open_from_dock)
	map.document_opened.connect(_document_opened); map.document_cleared.connect(_clear)


func attach_session(bridge: RefCounted) -> void:
	_generation += 1; _bridge = bridge; _pending.clear(); _clear()
	_sound_link.attach_session(bridge)


func _canceled() -> void:
	_submitted.clear()
	if _waiting: submission_finished.emit({"ok":false,"canceled":true})


func _open_from_dock(tile: int) -> void:
	_guard.call(open.bind(tile), "opening tile behavior")


func _document_opened(_data: Dictionary, reset: bool) -> void:
	if _reference_suspended: return
	if reset: _generation += 1; _clear()


func _clear() -> void:
	_reference_suspended = false
	_origin.clear(); _submitted.clear(); _tile_origin.clear()
	if is_instance_valid(view): view.dismiss()
	if _waiting: submission_finished.emit(_stale())


func _matches(origin: Dictionary) -> bool:
	return _bridge != null and not origin.is_empty() and int(origin.generation) == _generation and str(origin.identity) == _map.identity and not _map.is_dungeon and is_instance_valid(view)


func _params() -> Dictionary:
	return {"identity":_origin.identity,"tile":int(_origin.tile),"expectedRevision":int(view.context.revision)}


func open(tile: int) -> Dictionary:
	if _bridge == null or _map.identity.is_empty() or _map.is_dungeon: return _stale()
	if view.visible and view.context.get("identity", "") == _map.identity and int(view.context.get("tile", -1)) == tile: return {"ok":true}
	var origin := {"identity":_map.identity,"tile":tile,"generation":_generation}
	var params := {"identity":_map.identity,"tile":tile,"expectedRevision":int(_read_context.call().revision)}
	var response := await _operations.run_workflow(_bridge, "Open tile behavior", _request.bind("tile-behavior.open", params), null, true)
	if not _matches(origin): return _stale()
	if not response.get("ok", false): failed.emit(str(response.get("error", "Tile behavior could not be opened."))); return response
	_origin = origin; _submitted.clear(); view.open(response.result, _land.atlas_projection, _dock.ui.behavior)
	await _load_combat_artwork(origin)
	return response


func _load_combat_artwork(origin: Dictionary) -> void:
	var response := await _operations.run_workflow(_bridge, "Read combat tile artwork", _request.bind("tile-behavior.combat-artwork", _params()), null, true)
	if _matches(origin) and view.visible:
		view.set_combat_artwork(response.result if response.get("ok", false) else {"reason":str(response.get("error", "Combat artwork could not be read."))})
		if not response.get("ok", false): _failure(response)


func _retry_combat_artwork() -> void:
	if _operations.busy or not _pending.is_empty() or not _matches(_origin): return
	await _load_combat_artwork(_origin.duplicate(true))


func _request(operation: ProvidenceEditorOperation, method: String, params: Dictionary) -> Dictionary:
	return await operation.request(method, params)


func has_unapplied_changes() -> bool:
	return not _pending.is_empty() or not _reference_suspended and view.has_unapplied_changes()


func discard_draft() -> void:
	if not _pending.is_empty() or _operations.busy: return
	view.dismiss(); _submitted.clear()


func review() -> Dictionary:
	if not _matches(_origin) or not _pending.is_empty(): return _stale()
	view.set_busy(true); _submitted = _params(); _submitted.edit = view.draft()
	var origin := _origin.duplicate(true)
	var response := await _operations.run_workflow(_bridge, "Review tile behavior", _prepare.bind(origin), null, true)
	if not _matches(origin): return _stale()
	view.set_busy(false)
	if not response.get("ok", false): _failure(response)
	return response


func _prepare(operation: ProvidenceEditorOperation, origin: Dictionary) -> Dictionary:
	var affected: Array = []; var total := -1
	while true:
		var params := _submitted.duplicate(true); params.offset = affected.size()
		var response := await operation.request("tile-behavior.preview", params)
		if not _matches(origin): return _stale()
		if not response.get("ok", false): return response
		var page: Dictionary = response.result
		if total < 0: total = int(page.total)
		if int(page.total) != total or int(page.offset) != affected.size() or page.affectedMaps.size() > 128 or affected.size() + page.affectedMaps.size() > total or page.affectedMaps.is_empty() and affected.size() < total:
			return {"ok":false,"error":"The tile impact list is incomplete."}
		affected.append_array(page.affectedMaps)
		if affected.size() == total:
			page.affectedMaps = affected; view.present_review(page); return response
	return _stale()


func apply_review() -> Dictionary:
	if not _matches(_origin) or not view.review_is_current() or _submitted.is_empty() or not _pending.is_empty(): return _stale()
	var origin := _origin.duplicate(true); view.set_busy(true)
	var response := await _operations.run_workflow(_bridge, "Apply tile behavior", _commit.bind(origin), null, true)
	if not _matches(origin): return _stale()
	view.set_busy(false)
	if not response.get("ok", false): _failure(response)
	if _waiting: submission_finished.emit(response)
	else: _accept.call(response)
	return response


func _commit(operation: ProvidenceEditorOperation, origin: Dictionary) -> Dictionary:
	var params := _submitted.duplicate(true); params.operationId = Crypto.new().generate_random_bytes(32).hex_encode()
	_pending = {"origin":origin,"params":params}
	var response := await operation.request("tile-behavior.apply", params)
	if not _matches(origin): return _stale()
	if response.get("outcomeUnknown", false): return response
	_pending.clear()
	if not response.get("ok", false): return response
	projection_applied.emit(response.result)
	var refreshed := await _map.refresh_history(operation, response.result)
	if not refreshed.get("ok", false): _pending = {"origin":origin,"readOnly":true,"committed":true}; return refreshed
	view.dismiss(); _submitted.clear()
	return response


func commit_selected() -> Dictionary:
	if not has_unapplied_changes(): return {"ok":true}
	_waiting = true; var response := await review()
	if response.get("ok", false): response = await submission_finished
	_waiting = false; _accept.call(response); return response


func _failure(response: Dictionary) -> void:
	if response.get("outcomeUnknown", false):
		if _pending.is_empty(): _pending = {"origin":_origin.duplicate(true),"readOnly":true}
	if not _pending.is_empty(): view.set_busy(true, true)
	view.show_failure(str(response.get("error", "Tile behavior could not be applied.")))
	failed.emit(str(response.get("error", "Your tile behavior draft is kept.")))


func check_original() -> void:
	if _pending.is_empty() or _operations.busy: return
	var pending := _pending.duplicate(true); var lookup := {}
	if not pending.get("readOnly", false): lookup = {"domain":"project","operationId":pending.params.operationId,"expectedIntent":{"method":"tile-behavior.apply","params":pending.params}}
	var response := await _operations.recover_world(_bridge, lookup)
	if not _matches(pending.origin): return
	if not response.get("worldRecoveryConfirmed", false): response.outcomeUnknown = true; _failure(response); return
	var committed: bool = pending.get("committed", false) or not pending.get("readOnly", false) and response.result.outcome == "committed"
	var kept: Dictionary = view.draft(); _pending.clear()
	response = await _operations.run_workflow(_bridge, "Read original tile behavior result", _reconcile.bind(committed, kept), null, true)
	if not response.get("ok", false): _pending = {"origin":_origin.duplicate(true),"readOnly":true,"committed":committed}; _failure(response)


func _reconcile(operation: ProvidenceEditorOperation, committed: bool, kept: Dictionary) -> Dictionary:
	var response := await operation.request("session.describe", {})
	if not response.get("ok", false): return response
	projection_applied.emit(response.result)
	var refreshed := await _map.refresh_history(operation, response.result)
	if not refreshed.get("ok", false): return refreshed
	var params := _params(); params.expectedRevision = int(_read_context.call().revision)
	response = await operation.request("tile-behavior.open", params)
	if not response.get("ok", false): return response
	view.open(response.result, _land.atlas_projection, _dock.ui.behavior)
	if not committed:
		view.restore_draft(kept)
		var artwork := await operation.request("tile-behavior.combat-artwork", params)
		if not artwork.get("ok", false): return artwork
		view.set_combat_artwork(artwork.result if artwork.get("ok", false) else {"reason":str(artwork.get("error", "Combat artwork could not be read."))})
	else: view.dismiss()
	_submitted.clear(); return response


func _choose_sound() -> void:
	if not _matches(_origin): return
	var context := _origin.duplicate(true); context.merge({"field":"soundId","currentValue":int(view.draft().movementSound),"label":"movement sound","destination":"%s · Tile %d · Movement sound" % [_map.identity,int(_origin.tile)],"allowNone":true,"soundPreview":true})
	view.get_node("%BehaviorSoundPicker").begin(context, view.get_node("%ChooseMovementSound"))


func _search_sound(query: Dictionary, generation: int) -> void:
	if _operations.busy: view.get_node("%BehaviorSoundPicker").retry_search(query,generation); return
	var origin := _origin.duplicate(true); var params := _params(); params.query = query
	var response := await _operations.run_workflow(_bridge, "Find movement sound", _request.bind("tile-behavior.reference.list", params), null, true)
	if _matches(origin): view.get_node("%BehaviorSoundPicker").receive_page(response, generation)


func _accept_sound(choice: Dictionary, context: Dictionary) -> void:
	if _matches(context) and int(context.tile) == int(_origin.tile) and view.visible: view.stage_reference("soundId", int(choice.value))


func _suspend_reference() -> void:
	_reference_suspended = true


func _resume_reference(kept: Dictionary) -> void:
	_reference_suspended = false
	if not _matches(kept.origin): view.dismiss(); return
	var response := await open(int(kept.origin.tile))
	if not response.get("ok",false): return
	var merged: Dictionary = view.baseline(); var conflicts: PackedStringArray = []
	for field in kept.draft:
		if kept.draft[field] == kept.baseline[field]: continue
		if merged[field] != kept.baseline[field] and merged[field] != kept.draft[field]: conflicts.append(field)
		merged[field] = kept.draft[field]
	view.restore_draft(merged); view.get_node("%ChooseMovementSound").grab_focus()
	if not conflicts.is_empty(): view.show_failure("These fields also changed while editing the sound: " + ", ".join(conflicts) + ". Review their values before Apply.")


func _choose_tile(field: String) -> void:
	_tile_field = field
	_tile_origin = _origin.duplicate(true)
	var combat := field.begins_with("combat:"); var index := field.trim_prefix("combat:").to_int()
	var draft: Dictionary = view.draft()
	var tile: int = int(draft.combatBuild[index / 3][index % 3]) if combat else int(draft.clearTile)
	var button: Control = view.get_node("%ChooseCombat" + str(index)) if combat else view.get_node("%ChooseClearTile")
	view.get_node("%BehaviorTilePicker").open_picker(view.combat_artwork() if combat else _land.atlas_projection, tile, "%s · Tile %d" % [_map.identity,int(_origin.tile)], button, "Combat row %d, column %d" % [index / 3 + 1,index % 3 + 1] if combat else "Tile Clear To", true, 400 if combat else 200)


func _accept_tile(tile: int) -> void:
	if _matches(_tile_origin) and _tile_origin == _origin and view.visible: view.stage_reference(_tile_field, tile)


func _stale() -> Dictionary:
	return {"ok":false,"stale":true,"error":"The tile behavior destination changed. Reopen it before applying."}


func dispose() -> void:
	attach_session(null)
	_sound_link.dispose()
	if _map != null: _map.document_opened.disconnect(_document_opened); _map.document_cleared.disconnect(_clear)
	if is_instance_valid(_dock):
		_dock.behavior_requested.disconnect(_open_from_dock)
	_read_context = Callable(); _accept = Callable(); _guard = Callable(); _map = null; _land = null; _dock = null
	for relay in [projection_applied, failed, submission_finished]:
		for connection in relay.get_connections(): relay.disconnect(connection.callable)
