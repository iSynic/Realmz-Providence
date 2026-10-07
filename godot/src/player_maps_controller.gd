extends RefCounted

signal projection_applied(projection: Dictionary)
signal selection_changed
signal status_changed(message: String)

var _view: ProvidencePlayerMapsEditor
var _preview: ProvidenceRebuiltPreviewSelection
var _operations: ProvidenceEditorOperation
var _context: Callable
var _accept_read: Callable
var _accept_draft: Callable
var _bridge: RefCounted
var _generation := 0
var _pending: Dictionary = {}
var _refresh_identity := ""
var _preview_key: Dictionary = {}
var _preview_response: Dictionary = {}


func initialize(view: ProvidencePlayerMapsEditor, preview: ProvidenceRebuiltPreviewSelection, operations: ProvidenceEditorOperation, context: Callable, accept_read: Callable, accept_draft: Callable) -> void:
	_view = view; _preview = preview; _operations = operations; _context = context
	_accept_read = accept_read; _accept_draft = accept_draft
	_view.commit_handler = commit; _view.controller = self
	_view.uses_page_requested.connect(load_uses)


func attach_session(bridge: RefCounted) -> void:
	_generation += 1; _bridge = bridge; _pending.clear(); _preview_key.clear(); _refresh_identity = ""
	_view.set_catalog({}); _view.set_document({})


func teardown() -> void: attach_session(null)


func dispose() -> void:
	_generation += 1
	_view.commit_handler = Callable(); _view.controller = null


func is_busy() -> bool: return _operations.busy


func reload(operation: ProvidenceEditorOperation = null, preferred := "") -> Dictionary:
	var response := _read_allowed()
	if not response.ok: return response
	_view.set_interaction(true)
	response = await _operations.run_workflow(_bridge, "Load Player Maps", _reload.bind(preferred, _guard()), operation)
	_view.set_interaction(false); _view.restore_catalog_selection()
	if not response.get("ok", false): _view.show_result(response)
	return response


func open_record(identity: String) -> Dictionary:
	var response := _read_allowed()
	if not response.ok: _view.restore_catalog_selection(); return response
	_view.set_interaction(true)
	response = await _operations.run_workflow(_bridge, "Open Player Map", _open.bind(identity, _guard()))
	_view.set_interaction(false); _view.restore_catalog_selection(); _accept_read.call(response)
	if not response.get("ok", false): _view.show_result(response)
	return response


func open_media_source(identity: String, field: String) -> Dictionary:
	var response := await open_record(identity)
	if response.get("ok", false): _view.focus_media_field(field)
	return response


func create_record() -> Dictionary:
	var allowed := _read_allowed()
	if not allowed.ok: return allowed
	_view.set_interaction(true)
	var response := await _operations.run_workflow(_bridge, "Create Player Map", _create.bind(_guard()))
	_view.set_interaction(false); _view.show_result(response); _accept_draft.call(response)
	return response


func _create(operation: ProvidenceEditorOperation, guard: Dictionary) -> Dictionary:
	if guard.generation != _generation: return _stale()
	var catalog := await operation.request("player-map.list", {"limit": 1})
	if not catalog.get("ok", false): return catalog
	if not catalog.result.get("canCreate", false): return {"ok": false, "error": "All twenty Player Map slots are occupied."}
	_refresh_identity = "player-map:%d" % int(catalog.result.nextFreeNativeId)
	return await _write(operation, "player-map.create", {"expectedRevision": guard.revision}, {}, guard)


func commit(record: Dictionary, names: Dictionary) -> Dictionary:
	if _bridge == null or not _view.can_edit(): return _read_allowed()
	var params := {"expectedRevision": _view.applied_revision(), "playerMap": record.duplicate(true)}
	if int(record.nativeId) < 20: params["names"] = names.duplicate(true)
	var token := _view.draft_token(); var guard := _guard()
	_view.set_interaction(true)
	_refresh_identity = str(record.identity)
	var response := await _operations.run_workflow(_bridge, "Apply Player Map", _write.bind("player-map.apply-draft", params, token, guard))
	_view.set_interaction(false); _view.show_result(response); _accept_draft.call(response)
	return response


func _write(operation: ProvidenceEditorOperation, method: String, params: Dictionary, token: Dictionary, guard: Dictionary) -> Dictionary:
	if guard.generation != _generation or (not token.is_empty() and token != _view.draft_token()): return _stale()
	params["operationId"] = Crypto.new().generate_random_bytes(32).hex_encode()
	_pending = {"method": method, "params": params.duplicate(true), "token": token.duplicate(true), "generation": _generation, "identity": _refresh_identity}
	var response := await operation.request(method, params)
	if guard.generation != _generation: return _stale()
	if not response.get("outcomeUnknown", false): _pending.clear()
	if not response.get("ok", false): return response
	if method == "player-map.apply-draft": _view.acknowledge_saved(params.playerMap, params.get("names", {}), int(response.result.revision))
	projection_applied.emit(response.result)
	var refreshed := await _reload(operation, _refresh_identity, {"generation": _generation})
	if not refreshed.get("ok", false): response["viewRefreshError"] = "Saved. Refresh the Player Map presentation; Apply will not be retried."
	else: status_changed.emit("Player Map saved · revision %d" % int(response.result.revision))
	return response


func _read_catalog(operation: ProvidenceEditorOperation, guard: Dictionary) -> Dictionary:
	var records: Array = []; var catalog: Dictionary = {}
	while true:
		var page := await operation.request("player-map.list", {"offset": records.size(), "limit": 128})
		if not page.get("ok", false): return page
		if guard.generation != _generation: return _stale()
		catalog = page.result
		var rows: Array = catalog.get("records", [])
		records.append_array(rows)
		if not catalog.get("truncated", false): break
		if rows.is_empty(): return {"ok": false, "error": "Player Map catalog made no progress."}
	catalog["records"] = records
	return {"ok": true, "result": catalog}


func _reload(operation: ProvidenceEditorOperation, preferred: String, guard: Dictionary) -> Dictionary:
	var catalog := await _read_catalog(operation, guard)
	if not catalog.get("ok", false): return catalog
	var identity := _view.catalog_identity(catalog.result.records, preferred)
	var response := await _open(operation, identity, guard)
	if response.get("ok", false): _view.set_catalog(catalog.result)
	return response


func _open(operation: ProvidenceEditorOperation, identity: String, guard: Dictionary) -> Dictionary:
	var response := await _read_document(operation, identity)
	if guard.generation != _generation: return _stale()
	if guard.has("state") and guard.state != _view.read_state(): return _stale()
	if not response.get("ok", false): return response
	_view.set_document(response.result); _preview_key.clear(); _preview.clear_scrolling_text()
	if response.has("textResolution"): _preview.apply_scrolling_text_resolution(_view.applied_scrolling_text_resource_id(), response.textResolution)
	selection_changed.emit()
	if not identity.is_empty():
		await _validate_preview(operation, _view.draft_token(), _generation)
	return response


func _read_document(operation: ProvidenceEditorOperation, identity: String) -> Dictionary:
	if identity.is_empty(): return {"ok": true, "result": {}}
	var response := await operation.request("player-map.open", {"identity": identity})
	if not response.get("ok", false): return response
	var uses := await operation.request("reference.used-by", {"targetKind": "player-map", "targetId": identity, "limit": 64})
	if uses.get("ok", false): response.result["usedBy"] = uses.result
	elif uses.get("outcomeUnknown", false): return uses
	else: response.result["usedBy"] = {"unavailableReason": uses.get("error", "Caller lookup unavailable.")}
	if int(response.result.playerMap.show) < 0:
		var text := await operation.request("text-resource.resolve-exact", {"resourceId": int(response.result.playerMap.show)})
		if text.get("outcomeUnknown", false): return text
		response["textResolution"] = text
	return response


func validate_and_preview() -> void:
	if _bridge == null or not _view.can_edit(): return
	if _operations.busy: _view.get_node("DraftDelay").start(); return
	await _operations.run_workflow(_bridge, "Validate Player Map draft", _validate_preview.bind(_view.draft_token(), _generation))


func _validate_preview(operation: ProvidenceEditorOperation, token: Dictionary, generation: int) -> Dictionary:
	var response := await operation.request("player-map.validate", _view.draft_params())
	if generation != _generation or token != _view.draft_token(): return _stale()
	if response.get("ok", false): _view.accept_validation(response.result)
	else: _view.accept_validation({"valid": false, "error": response.get("error", "Validation unavailable.")})
	if not response.get("ok", false) or not response.result.get("valid", false): return response
	return await _preview_draft(operation, token, generation)


func refresh_preview() -> void:
	_preview_key.clear()
	await validate_and_preview()


func load_uses(offset: int) -> void:
	var token := _view.draft_token()
	var response := await query("reference.used-by", {"targetKind": "player-map", "targetId": str(token.identity), "offset": offset, "limit": 64})
	if token == _view.draft_token() and response.get("ok", false): _view.set_uses(response.result)


func _preview_draft(operation: ProvidenceEditorOperation, token: Dictionary, generation: int) -> Dictionary:
	var key: Dictionary = token.record.duplicate(true)
	key.erase("note"); key["revision"] = token.revision
	if key == _preview_key:
		_view.accept_preview(_preview_response)
		return {"ok": true}
	var response := await operation.request("player-map.preview", {"expectedRevision": token.revision, "playerMap": token.record})
	if generation != _generation or token != _view.draft_token(): return _stale()
	_view.accept_preview(response)
	_preview_response = response.duplicate(true)
	_preview_key = key if response.get("ok", false) else {}
	return {"ok": true}


func query(method: String, params: Dictionary) -> Dictionary:
	if _bridge == null: return _read_allowed()
	return await _operations.run_workflow(_bridge, "Read Player Map references", _query.bind(method, params, _generation))


func _query(operation: ProvidenceEditorOperation, method: String, params: Dictionary, generation: int) -> Dictionary:
	var response := await operation.request(method, params)
	return response if generation == _generation else _stale()


func resolve_original_result() -> void:
	if _bridge == null or _operations.busy: return
	var pending := _pending.duplicate(true)
	_view.set_interaction(true)
	var lookup := {} if pending.is_empty() else {"operationId": pending.params.operationId, "domain": "project", "expectedIntent": {"method": pending.method, "params": pending.params}}
	var resolved := await _operations.recover_world(_bridge, lookup)
	_view.set_interaction(false)
	if not resolved.get("worldRecoveryConfirmed", false): _view.show_result(resolved); return
	if not pending.is_empty() and pending.generation != _generation: return
	var original: Dictionary = resolved.result.get("response", {})
	var committed: bool = pending.is_empty() or resolved.result.get("outcome") == "committed" and original.get("ok", false)
	_view.unlock_recovery()
	_view.set_interaction(true)
	var response := await _operations.run_workflow(_bridge, "Read resolved Player Map", _reload.bind(_refresh_identity, {"generation": _generation}), null, true)
	_view.set_interaction(false)
	if not response.get("ok", false): response["viewRefreshError"] = "Original result resolved, but saved presentation is unavailable. Refresh again."; _view.show_result(response); return
	if not committed and not pending.get("token", {}).is_empty(): _view.restore_draft_token(pending.token)
	if committed and not original.is_empty(): projection_applied.emit(original.result); _accept_draft.call(original)
	_pending.clear()
	_view.show_result({"ok": true, "error": "Original result resolved; no mutation was retried. Saved view restored." if committed else "The original Apply did not commit. Review the retained draft before an explicit Apply."})


func _read_allowed() -> Dictionary:
	if _bridge == null: return {"ok": false, "error": "Open a project before loading Player Maps."}
	if _view.has_unapplied_changes(): return {"ok": false, "draftPreserved": true, "error": "Apply or discard Player Map changes before loading another record."}
	return {"ok": true}


func _guard() -> Dictionary: return {"generation": _generation, "state": _view.read_state(), "revision": int(_context.call().revision)}
func _stale() -> Dictionary: return {"ok": false, "stale": true, "error": "The Player Map destination changed. The previous result cannot affect this view."}
