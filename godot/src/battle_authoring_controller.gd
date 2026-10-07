extends RefCounted

signal projection_applied(projection: Dictionary)
signal failed(message: String)

var _view: ProvidenceBattleEditor
var _operations: ProvidenceEditorOperation
var _context: Callable
var _bridge: Callable
var _accept: Callable
var _generation := 0
var _palette_generation := 0
var _pending: Dictionary = {}
var _art := preload("res://src/battle_art_loader.gd").new()


func initialize(view: ProvidenceBattleEditor, operations: ProvidenceEditorOperation, context: Callable, read_bridge: Callable, accept_draft: Callable) -> void:
	_view = view
	_operations = operations
	_context = context
	_bridge = read_bridge
	_accept = accept_draft
	view.controller = self
	view.commit_handler = commit
	view.commit_requested.connect(commit)
	view.recovery_requested.connect(check_original)
	view.comparison_requested.connect(compare_current)
	view.record_requested.connect(func(id): view.guard_navigation(open_record.bind(id)))
	view.inventory_requested.connect(inventory)
	view.palette_requested.connect(palette)
	view.operation_requested.connect(func(kind):
		if kind == "clear":
			review(kind)
		else:
			view.guard_navigation(review.bind(kind)))
	view.reference_requested.connect(func(field):
		var destination := view.reference_context(field)
		if not destination.is_empty():
			view.picker.begin(destination, view.get_viewport().gui_get_focus_owner()))
	view.picker.search_requested.connect(search_references)
	view.picker.accepted.connect(accept_reference)
	view.reference_open_requested.connect(open_reference)
	view.picker.open_requested.connect(func(choice, destination):
		view.picker.cancel()
		navigate_reference(choice, destination))


func teardown() -> void:
	_generation += 1
	_palette_generation += 1
	_pending.clear()
	_art.clear()


func reload(operation: ProvidenceEditorOperation = null, preferred := -1) -> Dictionary:
	if _bridge.call() == null:
		return _failure("Open a project before loading Battles.")
	var id := _view.current_selection() if preferred < 0 else preferred
	var response := await _operations.run_workflow(_bridge.call(), "Load Battles", _reload.bind(id), operation)
	if response.get("outcomeUnknown", false):
		report_read_failure(response)
	return response


func _reload(operation: ProvidenceEditorOperation, preferred: int) -> Dictionary:
	_view.set_loading(true, "Loading Battles…")
	var generation := _generation
	var response := await _inventory(operation, preferred)
	if generation != _generation:
		return _stale()
	if not response.get("ok", false):
		_view.set_loading(false)
		return response
	var rows: Array = response.result.items
	if rows.is_empty():
		_view.bind_document({"revision": response.result.revision})
		return await _load_palette(operation)
	var ids: Array = rows.map(func(row): return int(row.nativeId))
	return await _open(operation, preferred if preferred in ids else ids[0])


func inventory() -> void:
	var response := await _operations.run_workflow(_bridge.call(), "Find Battles", _inventory.bind(-1))
	if response.get("outcomeUnknown", false):
		report_read_failure(response)
	elif not response.get("ok", false) and not response.get("busy", false):
		failed.emit(str(response.get("error", "Battle search failed.")))


func _inventory(operation: ProvidenceEditorOperation, preferred: int) -> Dictionary:
	var state := _view.read_state()
	var params := {"offset": state.offset, "limit": 16, "search": state.search}
	if preferred >= 0:
		params["seekNativeId"] = preferred
	var generation := _generation
	var response := await operation.request("battle.list", params)
	if generation != _generation:
		return _stale()
	if response.get("ok", false):
		_view.set_inventory(response.result)
	return response


func open_record(native_id: int) -> Dictionary:
	return await _operations.run_workflow(_bridge.call(), "Open Battle", _open.bind(native_id))


func _open(operation: ProvidenceEditorOperation, native_id: int) -> Dictionary:
	var generation := _generation
	_view.set_loading(true, "Opening Battle %d…" % native_id)
	var response := await operation.request("battle.open", {"nativeId": native_id})
	if generation != _generation:
		return _stale()
	if not response.get("ok", false):
		_view.set_loading(false)
		response = _keep_read_failure(response)
		_view.show_submission_failure(response)
		return response
	if int(response.result.get("battle", {}).get("nativeId", -1)) != native_id:
		_view.set_loading(false)
		return _failure("The returned Battle does not match the selected record. Your draft is kept.")
	_view.bind_document(response.result)
	_view.set_loading(true)
	var references := await _load_references(operation)
	if not references.get("ok", false):
		report_read_failure(references)
		return references
	var palette_result := await _load_palette(operation)
	if not palette_result.get("ok", false):
		report_read_failure(palette_result)
		return palette_result
	_view.set_loading(false)
	return response


func review(kind: String) -> void:
	if not _pending.is_empty():
		return
	var response := await _operations.run_workflow(_bridge.call(), "Review Battle " + kind, _review.bind(kind))
	if not response.get("ok", false):
		_view.show_submission_failure(response)


func _review(operation: ProvidenceEditorOperation, kind: String) -> Dictionary:
	var origin := _view.authoring_generation()
	var revision: int = _context.call().revision
	var params := {"expectedRevision": revision}
	var method := "battle.allocate"
	if kind == "copy":
		params["sourceId"] = _view.current_selection()
	elif kind == "clear":
		method = "battle.clear.prepare"
		params["nativeId"] = _view.current_selection()
	var response := await operation.request(method, params)
	if origin != _view.authoring_generation():
		return _stale()
	if not response.get("ok", false):
		return response
	if kind == "clear":
		var review_data: Dictionary = response.result.review
		_view.show_review("Clear Battle", "Battle %d keeps its identity and %d incoming uses.\nRemove %d occupants; clear Distance, Strings and Round Macro.\nThis replaces the local draft. Your project changes only on Apply." % [int(review_data.battle.nativeId), int(review_data.incomingUses), int(review_data.occupantsRemoved)], _accept_clear.bind(review_data, origin))
	else:
		var record: Dictionary = response.result.allocation.battle
		_view.show_review("Copy Battle" if kind == "copy" else "New Battle", "Destination: Battle %d · vacant; no existing record will be replaced.\n%s\nCreate draft opens the form. Your project changes only on Apply." % [int(record.nativeId), "Copy the complete source grid, placement signs, Distance, Strings and Round Macro." if kind == "copy" else "13×13 empty grid · Distance 0 (no random spread) · references None."], _accept_allocation.bind(response.result, origin))
	return response


func _accept_clear(review_data: Dictionary, origin: Vector2i) -> void:
	if origin != _view.authoring_generation() or not _pending.is_empty():
		return
	for field in ["grid", "distance", "messageBefore", "messageAfter", "battleMacro"]: _view.draft.edit(field, review_data.battle[field])


func _accept_allocation(result: Dictionary, origin: Vector2i) -> void:
	if origin != _view.authoring_generation() or not _pending.is_empty():
		return
	_view.allocate_document(result)
	await palette()


func commit() -> Dictionary:
	if not _pending.is_empty():
		return _failure("Check the original Apply result before making changes.")
	if not _view.has_unapplied_changes():
		return {"ok": true}
	var submitted: Dictionary = _view.draft.submission()
	_view.set_loading(true)
	var result := await _operations.run_workflow(_bridge.call(), "Apply Battle", _commit.bind(submitted), null, true)
	if result.get("ok", false):
		if _accept.is_valid():
			_accept.call(result)
	else:
		_view.show_submission_failure(result)
	if not result.get("outcomeUnknown", false):
		_view.set_loading(false)
	return result


func _commit(operation: ProvidenceEditorOperation, submitted: Dictionary) -> Dictionary:
	var origin := _view.authoring_generation()
	var prepared := await operation.request("battle.draft.prepare", submitted)
	if not prepared.get("ok", false):
		return _keep_read_failure(prepared)
	if not prepared.result.get("valid", false):
		return _failure("Your draft is kept. " + "\n".join(prepared.result.get("issues", []).map(func(issue): return str(issue.message))))
	if origin != _view.authoring_generation():
		return _stale()
	var params := submitted.duplicate(true)
	params["operationId"] = Crypto.new().generate_random_bytes(32).hex_encode()
	_pending = {"params": params, "origin": origin}
	var response := await operation.request("battle.draft.apply", params)
	if response.get("outcomeUnknown", false):
		return response
	_pending.clear()
	if response.get("ok", false):
		projection_applied.emit(response.result.change)
	if origin != _view.authoring_generation():
		return response
	if response.get("ok", false):
		_view.bind_document(response.result.document)
		_view.set_loading(true)
		var refreshed := await _refresh_after_apply(operation)
		if not refreshed.get("ok", false):
			return _keep_read_failure(refreshed, true)
	return response


func _refresh_after_apply(operation: ProvidenceEditorOperation) -> Dictionary:
	var response := await _inventory(operation, _view.current_selection())
	if not response.get("ok", false):
		return response
	response = await _load_references(operation)
	if not response.get("ok", false):
		return response
	return await _load_palette(operation)


func _keep_read_failure(response: Dictionary, applied := false) -> Dictionary:
	if response.get("outcomeUnknown", false) and _pending.is_empty():
		_pending = {"readOnly": true, "origin": _view.authoring_generation()}
		response["writeSubmitted"] = false
		response["error"] = "Apply is confirmed, but the connection was lost while refreshing. Check status to reopen; Apply will not be repeated." if applied else "The connection was lost while reading. Apply was not submitted. Your draft is kept; Check status to reopen."
	return response


func report_read_failure(response: Dictionary) -> void:
	_view.show_submission_failure(_keep_read_failure(response))


func check_original() -> void:
	if _pending.is_empty():
		return
	_view.set_recovery_checking(true)
	if _pending.get("readOnly", false):
		await _recover_read()
		return
	var generation := _generation
	var params: Dictionary = _pending.params
	var response := await _operations.recover_battle(_bridge.call(), {"operationId": params.operationId, "domain": "project",
		"expectedIntent": {"method": "battle.draft.apply", "params": params}})
	_view.set_recovery_checking(false)
	if generation != _generation or _pending.is_empty():
		return
	if not response.get("battleRecoveryConfirmed", false):
		_view.show_submission_failure({"outcomeUnknown": true, "error": "The original Apply result is still uncertain. Your draft is kept and changes remain locked."})
		return
	var original: Dictionary = response.result.get("response", {})
	if _pending.origin != _view.authoring_generation():
		_pending.clear()
		return
	_pending.clear()
	if response.result.outcome == "committed" and original.get("ok", false):
		var confirmed := await _operations.run_workflow(_bridge.call(), "Read confirmed Battle", _confirmed.bind(original))
		if not confirmed.get("ok", false):
			_view.show_submission_failure(_keep_read_failure(confirmed, true))
	else:
		var reconciled := await _operations.run_workflow(_bridge.call(), "Read rejected Battle status", _rejected_context.bind(original))
		_view.show_submission_failure(_keep_read_failure(reconciled))


func _recover_read() -> void:
	var origin: Vector2i = _pending.origin
	var response := await _operations.recover_battle(_bridge.call(), {})
	_view.set_recovery_checking(false)
	if _pending.is_empty() or origin != _view.authoring_generation():
		return
	if not response.get("battleRecoveryConfirmed", false):
		_view.show_submission_failure({"outcomeUnknown": true, "writeSubmitted": false, "error": "The connection could not be reopened. Your draft is kept. Check status remains available."})
		return
	_pending.clear()
	projection_applied.emit({"revision": response.result.revision, "canUndo": response.result.canUndo, "canRedo": response.result.canRedo, "truncated": true})
	_view.finish_read_recovery()


func _confirmed(operation: ProvidenceEditorOperation, original: Dictionary) -> Dictionary:
	var result := await _open(operation, int(original.result.document.battle.nativeId))
	if not result.get("ok", false):
		return result
	var current := await operation.request("session.describe", {})
	if not current.get("ok", false):
		return current
	var change: Dictionary = original.result.change.duplicate(true)
	change.merge({"revision": current.result.revision, "canUndo": current.result.canUndo, "canRedo": current.result.canRedo, "truncated": true}, true)
	projection_applied.emit(change)
	return original


func _rejected_context(operation: ProvidenceEditorOperation, original: Dictionary) -> Dictionary:
	var current := await operation.request("session.describe", {})
	if not current.get("ok", false):
		return current
	projection_applied.emit({"revision": current.result.revision, "canUndo": current.result.canUndo,
		"canRedo": current.result.canRedo, "truncated": true})
	return original


func compare_current() -> void:
	var response := await _operations.run_workflow(_bridge.call(), "Compare current Battle", _read_current)
	if response.get("ok", false):
		_view.show_review("Compare current Battle", "Your draft remains kept.\nCurrent Distance: %s · Draft Distance: %s\nReload deliberately discards the draft and reads the current Battle." % [str(response.result.battle.distance), str(_view.draft.record.distance)], _view.bind_document.bind(response.result))
	else:
		_view.show_submission_failure(response)


func _read_current(operation: ProvidenceEditorOperation) -> Dictionary:
	return await operation.request("battle.open", {"nativeId": _view.current_selection()})


func palette() -> void:
	_palette_generation += 1
	var request_generation := _palette_generation
	while is_instance_valid(_view) and _view.is_inside_tree():
		var response := await _operations.run_workflow(_bridge.call(), "Browse Battle monsters", _load_palette.bind(request_generation))
		if request_generation != _palette_generation:
			return
		if not response.get("busy", false):
			if not response.get("ok", false):
				_view.show_palette_failure(_keep_read_failure(response))
			return
		await _view.get_tree().process_frame


func _load_palette(operation: ProvidenceEditorOperation, request_generation := -1) -> Dictionary:
	var origin := _view.authoring_generation()
	var state := _view.read_state()
	var ids: Array = []
	for value in _view.draft.record.get("grid", []):
		if int(value) != 0 and not absi(int(value)) in ids:
			ids.append(absi(int(value)))
	var query := {"setId": state.setId, "currentId": state.brush, "retainedIds": ids, "search": "",
		"showUnavailable": true, "offset": 0, "limit": 128, "onlyRetained": true}
	var response := await operation.request("battle-monster.list", {"expectedRevision": _view.draft.revision, "query": query})
	if not _current(origin, request_generation):
		return _stale()
	if response.get("ok", false):
		var rows: Array = response.result.page.items
		if int(response.result.page.total) > rows.size():
			query["offset"] = 128
			var remainder := await operation.request("battle-monster.list", {"expectedRevision": _view.draft.revision, "query": query})
			if not _current(origin, request_generation):
				return _stale()
			if not remainder.get("ok", false):
				return remainder
			rows.append_array(remainder.result.page.items)
		_view.set_monsters(rows, true)
	query.merge({"search": state.paletteSearch, "showUnavailable": state.showUnavailable, "offset": state.paletteOffset, "limit": 32, "onlyRetained": false}, true)
	response = await operation.request("battle-monster.list", {"expectedRevision": _view.draft.revision, "query": query})
	if not _current(origin, request_generation):
		return _stale()
	if response.get("ok", false):
		_view.set_palette(response.result)
		var art_result := await _art.load(operation, _view, _current.bind(origin, request_generation))
		if not art_result.get("ok", false):
			return art_result
	return response


func _load_references(operation: ProvidenceEditorOperation) -> Dictionary:
	var origin := _view.authoring_generation()
	for field in ["messageBefore", "messageAfter", "battleMacro"]:
		var value := int(_view.draft.record.get(field, 0))
		var response := await operation.request("battle-reference.list", {"expectedRevision": _view.draft.revision, "query": _reference_query(field, value, str(value))})
		if origin != _view.authoring_generation():
			return _stale()
		if not response.get("ok", false):
			return response
		if response.get("ok", false):
			for row in response.result.page.items:
				if int(row.value) == value:
					_view.set_reference(field, row)
					break
	return {"ok": true}


func search_references(query: Dictionary, generation: int) -> void:
	var destination: Dictionary = _view.picker.context.duplicate(true)
	var response := await _operations.run_workflow(_bridge.call(), "Find Battle reference", _reference_read.bind(query, destination))
	if response.get("busy", false):
		_view.picker.retry_search(query, generation)
		return
	if response.get("outcomeUnknown", false):
		_view.picker.cancel()
		report_read_failure(response)
		return
	if _view.reference_context_matches(destination):
		_view.picker.receive_page(response, generation)
	else:
		_view.picker.cancel()


func _reference_read(operation: ProvidenceEditorOperation, query: Dictionary, destination: Dictionary) -> Dictionary:
	return await operation.request("battle-reference.list", {"expectedRevision": destination.projectRevision, "query": query})


func accept_reference(choice: Dictionary, destination: Dictionary) -> void:
	if not _view.reference_context_matches(destination) or not choice.get("available", false):
		return
	_view.draft.edit(str(destination.field), int(choice.value))
	_view.set_reference(str(destination.field), choice)


func open_reference(field: String) -> void:
	var destination := _view.reference_context(field)
	if destination.is_empty():
		return
	var response := await _operations.run_workflow(_bridge.call(), "Resolve Battle reference", _reference_read.bind(_reference_query(field, destination.currentValue, str(destination.currentValue)), destination))
	if not response.get("ok", false):
		report_read_failure(response)
		return
	if not _view.reference_context_matches(destination):
		return
	for choice in response.result.page.items:
		if choice.value == destination.currentValue and choice.get("targetIdentity") != null:
			navigate_reference(choice, destination)
			return


var open_target: Callable

func navigate_reference(choice: Dictionary, destination: Dictionary) -> void:
	if not _view.reference_context_matches(destination) or not open_target.is_valid():
		return
	await open_target.call("extra-action-point" if destination.field == "battleMacro" else "message", absi(int(choice.value)), str(choice.targetIdentity), {})


func _reference_query(field: String, value: int, search := "") -> Dictionary:
	return {"field": field, "currentValue": value, "search": search, "ownership": "all", "showUnavailable": true, "offset": 0, "seekCurrent": false, "limit": 64}


func _current(origin: Vector2i, request_generation: int) -> bool:
	return origin == _view.authoring_generation() and (request_generation < 0 or request_generation == _palette_generation)


func _failure(message: String) -> Dictionary: return {"ok": false, "error": message}
func _stale() -> Dictionary: return {"ok": false, "stale": true, "error": "The originating Battle document changed. No mutation was repeated."}
