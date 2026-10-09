extends RefCounted

signal projection_applied(projection: Dictionary)

var _view: ProvidenceSpellEditor
var _operations: ProvidenceEditorOperation
var _bridge: RefCounted
var _read_context: Callable
var _read_bridge: Callable
var _accept_draft: Callable
var _generation := 0
var _catalog_request := 0
var _pending: Dictionary = {}
var _references = preload("res://src/spell_reference_controller.gd").new()
var _records = preload("res://src/spell_record_operations.gd").new()
var _saved_review

var _validation_timer: Timer


func initialize(view: ProvidenceSpellEditor, operations: ProvidenceEditorOperation, read_context: Callable, read_bridge: Callable, accept_draft: Callable) -> void:
	_view = view
	_operations = operations
	_read_context = read_context
	_read_bridge = read_bridge
	_accept_draft = accept_draft
	view.commit_handler = commit
	view.open_handler = open_spell
	view.selection_changed.connect(_selection_changed)
	view.catalog_requested.connect(load_catalog)
	view.open_requested.connect(open_spell)
	view.recovery_requested.connect(check_original_result)
	_saved_review = preload("res://src/spell_saved_version_review.tscn").instantiate()
	view.add_child(_saved_review)
	view.saved_version_requested.connect(review_saved_version)
	_saved_review.accepted.connect(_accept_saved_version)
	view.uses_page_requested.connect(load_uses)
	_validation_timer = Timer.new()
	_validation_timer.one_shot = true
	_validation_timer.wait_time = 0.22
	view.add_child(_validation_timer)
	view.draft_edited.connect(func(): _validation_timer.start())
	_validation_timer.timeout.connect(validate_draft)
	_references.initialize(view, operations, func(): return _bridge, func(): return _generation)
	_records.initialize(view, operations, func(): return _bridge, func(): return _generation, _read_context)


func configure_navigation(open_source: Callable, open_target: Callable) -> void:
	_references.configure_navigation(open_source, open_target)


func attach_session(bridge: RefCounted) -> void:
	_generation += 1
	_catalog_request += 1
	_pending.clear()
	_bridge = bridge
	_validation_timer.stop()
	_references.close()
	_records.close()
	_saved_review.cancel()
	_view.show_submission({"ok": true})
	_view.bind_document({})
	_view.show_catalog({})


func teardown() -> void:
	attach_session(null)


func dispose() -> void:
	_generation += 1
	_references.dispose()
	_records.dispose()
	_view.commit_handler = Callable()
	_view.open_handler = Callable()
	_validation_timer.queue_free()


func reload(operation: ProvidenceEditorOperation = null) -> Dictionary:
	if _bridge != _read_bridge.call(): attach_session(_read_bridge.call())
	if _bridge == null: return _failure("Open a project before loading spells.")
	if _view.has_unapplied_changes(): return _failure("Apply or discard the spell draft before refreshing.")
	return await _operations.run_workflow(_bridge, "Load Spells", _reload, operation)


func _reload(operation: ProvidenceEditorOperation) -> Dictionary:
	var generation := _generation
	var identity := str(_view.selected_definition().get("id", ""))
	_view.bind_document({})
	_view.show_catalog_loading()
	var response := await _read_catalog(operation, _view.catalog_query(), generation)
	if generation != _generation: return _changed()
	if not response.get("ok", false): _view.show_catalog_failure(response); return response
	_view.show_catalog(response.result)
	if identity.is_empty() and not response.result.items.is_empty(): identity = str(response.result.items[0].identity)
	if not identity.is_empty():
		var opened := await _open(operation, identity, generation)
		if not opened.get("ok", false): _view.show_submission(opened)
		return opened
	return response


func load_catalog(query: Dictionary) -> void:
	_catalog_request += 1
	var request_id := _catalog_request
	var generation := _generation
	while _operations.busy:
		await _view.get_tree().process_frame
		if request_id != _catalog_request or generation != _generation: return
	if _bridge == null: return
	_view.show_catalog_loading()
	var response: Dictionary = await _operations.run_workflow(_bridge, "Browse Spells", _read_catalog.bind(query, generation, request_id))
	if request_id != _catalog_request or generation != _generation or query != _view.catalog_query(): return
	if response.get("ok", false):
		_view.show_catalog(response.result)
		if response.result.items.is_empty() and not _view.has_unapplied_changes(): _view.bind_document({})
	else: _view.show_catalog_failure(response)


func open_spell(identity: String) -> Dictionary:
	if _bridge == null: return _failure("Open a project before opening a spell.")
	if _view.has_unapplied_changes(): return _failure("Apply or discard the spell draft before opening another spell.")
	var generation := _generation
	var document_generation: int = _view.draft.generation
	while _operations.busy:
		await _view.get_tree().process_frame
		if _bridge == null or generation != _generation or document_generation != _view.draft.generation: return _changed()
	var response: Dictionary = await _operations.run_workflow(_bridge, "Open Spell", _open.bind(identity, generation))
	if not response.get("ok", false): _view.show_submission(response)
	return response


func _open(operation: ProvidenceEditorOperation, identity: String, generation: int) -> Dictionary:
	var response := await operation.request("spell.open-authoring", {"identity": identity})
	if generation != _generation or _view.has_unapplied_changes(): return _changed()
	if not response.get("ok", false): return response
	var query := _view.catalog_query()
	var spell_class := int(response.result.definition.classicId) / 1000
	if int(query.get("class", 0)) != 0 and int(query.get("class", 0)) != spell_class:
		query["class"] = spell_class; query.level = 0; query.query = ""
	var page := await _read_catalog(operation, query, generation)
	if not page.get("ok", false): return page
	if generation != _generation or _view.has_unapplied_changes(): return _changed()
	_catalog_request += 1
	_view.set_catalog_query(query)
	_view.bind_document(response.result)
	_view.show_catalog(page.result)
	return response


func _read_catalog(operation: ProvidenceEditorOperation, query: Dictionary, generation: int, request_id := -1) -> Dictionary:
	return await preload("res://src/record_catalog_reader.gd").load_all(operation.request, "spell.catalog",
		func(): return generation == _generation and (request_id < 0 or request_id == _catalog_request), query)


func validate_draft() -> void:
	var state := _view.read_state()
	var generation := _generation
	if _bridge == null or _view.draft.definition.is_empty() or not _view.draft.editable: return
	if _operations.busy: _validation_timer.start(); return
	var params := {"expectedRevision": _view.draft.revision, "draft": _view.draft.submitted()}
	var response: Dictionary = await _operations.run_workflow(_bridge, "Check Spell draft", func(operation): return await operation.request("spell.draft.prepare", params))
	if generation != _generation or state != _view.read_state(): return
	if response.get("ok", false): _view.show_validation(response.result)
	else: _view.show_submission(response)


func load_uses(offset: int) -> void:
	if _bridge == null or _view.draft.definition.is_empty(): return
	var generation := _generation
	var origin: int = _view.draft.generation
	var params := {"targetKind": "spell", "targetId": str(_view.draft.definition.id), "offset": offset, "limit": 64}
	var response: Dictionary = await _operations.run_workflow(_bridge, "Find Spell uses", func(operation): return await operation.request("reference.used-by", params))
	if generation != _generation or origin != _view.draft.generation: return
	if response.get("ok", false) and int(response.result.revision) == _view.draft.revision: _view.show_uses(response.result)
	else: _view.show_submission(response if not response.get("ok", false) else _changed())


func commit() -> Dictionary:
	if _bridge == null: return _failure("Open a project before applying this spell draft.")
	if not _pending.is_empty():
		var failure := _uncertain(); _accept_draft.call(failure); return failure
	if not _view.draft.dirty(): return {"ok": true, "unchanged": true}
	_validation_timer.stop()
	_references.close(); _records.close()
	_view.set_locked(true)
	var response: Dictionary = await _operations.run_workflow(_bridge, "Apply Spell", _commit.bind(_view.read_state(), _generation), null, true)
	if not response.get("outcomeUnknown", false) and not _pending.is_empty():
		var pending := _pending.duplicate(true)
		_pending.clear()
		if response.get("ok", false) and pending.generation == _generation and _same_draft(pending.state):
			_view.bind_document(response.result.document)
			projection_applied.emit(response.result.change)
			load_catalog.call_deferred(_view.catalog_query())
	response["pendingMutation"] = not _pending.is_empty()
	_view.show_submission(response)
	_accept_draft.call(response)
	return response


func _commit(operation: ProvidenceEditorOperation, state: Dictionary, generation: int) -> Dictionary:
	var params := {"expectedRevision": _view.draft.revision, "draft": state.draft}
	var current := await operation.request("session.describe", {})
	if not current.get("ok", false): return current
	if int(current.result.revision) != _view.draft.revision:
		return {"ok": false, "revisionConflict": true, "error": "The project changed after this spell was opened. Your draft is kept; review the saved version before applying."}
	var prepared := await operation.request("spell.draft.prepare", params)
	if not prepared.get("ok", false): return prepared
	_view.show_validation(prepared.result)
	if not prepared.result.valid: return _failure("\n".join(prepared.result.issues))
	if generation != _generation or state != _view.read_state(): return _changed()
	params.operationId = Crypto.new().generate_random_bytes(32).hex_encode()
	_pending = {"operationId": params.operationId, "domain": "project", "method": "spell.draft.apply", "params": params.duplicate(true), "state": state, "generation": generation}
	var response := await operation.request("spell.draft.apply", params)
	return response


func review_saved_version() -> void:
	if _bridge == null or not _pending.is_empty() or _view.draft.definition.is_empty(): return
	var context := {"generation": _generation, "state": _view.read_state()}
	var identity := str(_view.draft.definition.id)
	var response: Dictionary = await _operations.run_workflow(_bridge, "Review saved Spell", func(operation): return await operation.request("spell.open-authoring", {"identity": identity}))
	if context.generation != _generation or context.state != _view.read_state(): return
	if not response.get("ok", false): _view.show_submission(response); return
	_saved_review.begin(_view.selected_definition(), response.result, context, _view.get_viewport().gui_get_focus_owner())


func _accept_saved_version(document: Dictionary, context: Dictionary) -> void:
	if context.generation != _generation or context.state != _view.read_state() or not _pending.is_empty(): return
	_view.bind_document(document)
	_view.show_submission({"ok": true})
	projection_applied.emit({"revision": document.revision, "truncated": true})


func check_original_result() -> void:
	if _bridge == null: return
	if _pending.is_empty(): await _recover_read(); return
	var pending := _pending.duplicate(true)
	var response := await _operations.recover_item(_bridge, {"operationId": pending.operationId, "domain": "project", "expectedIntent": {"method": pending.method, "params": pending.params}})
	if pending.generation != _generation or _pending.is_empty(): return
	if not response.get("itemRecoveryConfirmed", false): _view.show_submission(_uncertain()); return
	var receipt: Dictionary = response.result
	if receipt.get("intent", {}).get("method") != pending.method or not preload("res://src/monster_operation_identity.gd").matches(receipt.get("intent", {}).get("params"), pending.params):
		_operations.requires_reopen = true
		_view.show_submission(_uncertain())
		return
	if not _same_draft(pending.state): _view.show_submission(_uncertain()); return
	var original: Dictionary = receipt.get("response", {})
	if receipt.outcome == "committed" and original.get("ok", false):
		response = await _operations.run_workflow(_bridge, "Read confirmed Spell result", _confirmed.bind(original, pending))
		if not response.get("ok", false): _view.show_submission(_uncertain()); return
		_accept_draft.call(original)
	else:
		_view.show_submission(original)
	_pending.clear()
	_view.show_submission(response if receipt.outcome == "committed" else original)


func _recover_read() -> void:
	var generation := _generation
	var state := _view.read_state()
	var response := await _operations.recover_item(_bridge, {}, true)
	if generation != _generation or not _same_draft(state): return
	if not response.get("itemRecoveryConfirmed", false): _view.show_submission(response); return
	projection_applied.emit({"revision": response.result.revision, "canUndo": response.result.canUndo, "canRedo": response.result.canRedo, "truncated": true})
	_view.show_submission({"ok": true} if int(response.result.revision) == _view.draft.revision else _failure("The project changed while reconnecting. Your local draft is kept. Discard and reopen this spell before applying another change."))


func _same_draft(state: Dictionary) -> bool:
	var current := _view.read_state()
	return state.generation == current.generation and state.editSequence == current.editSequence and preload("res://src/monster_operation_identity.gd").matches(state.draft, current.draft)


func _confirmed(operation: ProvidenceEditorOperation, original: Dictionary, pending: Dictionary) -> Dictionary:
	var current := await operation.request("session.describe", {})
	if not current.get("ok", false): return current
	var document := await operation.request("spell.open-authoring", {"identity": pending.params.draft.definition.id})
	if not document.get("ok", false): return document
	if pending.generation != _generation: return _changed()
	_view.bind_document(document.result)
	var change: Dictionary = original.result.change.duplicate(true)
	change.merge({"revision": current.result.revision, "canUndo": current.result.canUndo, "canRedo": current.result.canRedo, "truncated": true}, true)
	projection_applied.emit(change)
	return {"ok": true}


func _selection_changed(_definition: Dictionary) -> void:
	_references.refresh_presentation()


func _failure(message: String) -> Dictionary:
	return {"ok": false, "error": message}


func _changed() -> Dictionary:
	return _failure("The originating spell document changed. Your draft is kept; no operation was repeated.")


func _uncertain() -> Dictionary:
	return {"ok": false, "outcomeUnknown": true, "pendingMutation": true, "error": "The original Spell result is still uncertain. Your draft is kept and changes remain locked."}
