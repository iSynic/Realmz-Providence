extends RefCounted

signal projection_applied(projection: Dictionary)
var _view: ProvidenceRuleAuthoringEditor
var _operations: ProvidenceEditorOperation
var _bridge: RefCounted
var _read_context: Callable
var _read_bridge: Callable
var _accept_draft: Callable
var _generation := 0
var _catalog_request := 0
var _pending: Dictionary = {}
var _validation_timer: Timer
var _references = preload("res://src/rule_reference_controller.gd").new()
var _records = preload("res://src/rule_record_operations.gd").new()
var _saved_review
var _catalog_portraits = preload("res://src/rule_catalog_portraits.gd").new()

func initialize(view: ProvidenceRuleAuthoringEditor, operations: ProvidenceEditorOperation, read_context: Callable, read_bridge: Callable, accept_draft: Callable) -> void:
	_view = view; _operations = operations; _read_context = read_context; _read_bridge = read_bridge; _accept_draft = accept_draft
	view.commit_handler = commit
	view.open_handler = open_rule
	view.source_handler = select_source
	view.restore_handler = open_rule.bind(true)
	view.catalog_requested.connect(load_catalog)
	view.open_requested.connect(open_rule)
	view.source_requested.connect(select_source)
	view.recovery_requested.connect(check_original_result)
	view.saved_version_requested.connect(review_saved_version)
	_saved_review = preload("res://src/rule_saved_version_review.tscn").instantiate()
	view.add_child(_saved_review)
	_saved_review.accepted.connect(_accept_saved_version)
	_validation_timer = Timer.new()
	_validation_timer.one_shot = true; _validation_timer.wait_time = 0.22
	view.add_child(_validation_timer)
	view.draft_edited.connect(func(): _validation_timer.start())
	_validation_timer.timeout.connect(validate_draft)
	_references.initialize(view, operations, func(): return _bridge, func(): return _generation)
	_records.initialize(view, operations, func(): return _bridge, func(): return _generation, _read_context)
	_catalog_portraits.initialize(view, operations, func(): return _bridge, func(): return _generation)

func configure_navigation(source: Callable, target: Callable) -> void:
	_references.configure_navigation(source, target)

func attach_session(bridge: RefCounted) -> void:
	_generation += 1; _catalog_request += 1
	_pending.clear(); _bridge = bridge
	_validation_timer.stop(); _references.close(); _records.close(); _saved_review.cancel()
	_catalog_portraits.close()
	_view.bind_document({}); _view.show_catalog({}); _view.show_submission({"ok": true})

func teardown() -> void: attach_session(null)

func dispose() -> void:
	_generation += 1
	_references.dispose(); _records.dispose(); _catalog_portraits.dispose()
	_view.commit_handler = Callable(); _view.open_handler = Callable()
	_view.source_handler = Callable()
	_view.restore_handler = Callable()
	_validation_timer.queue_free()

func reload(operation: ProvidenceEditorOperation = null) -> Dictionary:
	if _bridge != _read_bridge.call(): attach_session(_read_bridge.call())
	if _bridge == null: return _failure("Open a project before loading rules.")
	if _view.has_unapplied_changes(): return _failure("Apply or discard the rule draft before refreshing.")
	return await _operations.run_workflow(_bridge, "Load " + _view.rule_kind.capitalize() + "s", _reload, operation)

func _reload(operation: ProvidenceEditorOperation, destination := "") -> Dictionary:
	var generation := _generation
	var query := _view.catalog_query()
	var identity: String = destination if not destination.is_empty() else _view.current_selection()
	_view.show_catalog_loading()
	var response := await operation.request("rule.catalog", query)
	if generation != _generation or query != _view.catalog_query(): return _changed()
	if not response.get("ok", false): _view.show_catalog_failure(response); return response
	var page: Dictionary = response.result
	if identity.is_empty() and not page.items.is_empty(): identity = str(page.items[0].identity)
	if not identity.is_empty():
		response = await _open(operation, identity, generation)
		if not response.get("ok", false): _view.show_submission(response)
		else: _view.show_catalog(page)
		return response
	_view.bind_document({})
	_view.show_catalog(page)
	return response

func select_source(source: String) -> Dictionary:
	if _bridge == null or _view.has_unapplied_changes(): return _failure("Apply or discard the draft before changing rule sources.")
	if source == _view.catalog_query().get("source"): return {"ok": true, "unchanged": true}
	var previous: String = _view.catalog_query().get("source", "selected")
	_view.set_catalog_source(source)
	_references.close(); _catalog_portraits.close()
	_view.set_locked(true)
	var generation := _generation
	var response: Dictionary = await _operations.run_workflow(_bridge, "Load Rule source", _reload)
	if generation != _generation: return _changed()
	_view.set_locked(false)
	if not response.get("ok", false):
		_view.set_catalog_source(previous)
		_view.show_submission(response)
	return response

func load_catalog(query: Dictionary) -> void:
	_catalog_request += 1
	var request_id := _catalog_request
	var generation := _generation
	while _operations.busy:
		await _view.get_tree().process_frame
		if generation != _generation or request_id != _catalog_request: return
	if _bridge == null: return
	_view.show_catalog_loading()
	var response: Dictionary = await _operations.run_workflow(_bridge, "Browse Rules", func(operation): return await operation.request("rule.catalog", query))
	if generation != _generation or request_id != _catalog_request or query != _view.catalog_query(): return
	if response.get("ok", false):
		_view.show_catalog(response.result)
		if response.result.items.is_empty() and not _view.has_unapplied_changes(): _view.bind_document({})
	else: _view.show_catalog_failure(response)

func open_rule(identity: String, refresh_catalog := false) -> Dictionary:
	if _bridge == null: return _failure("Open a project before opening a rule.")
	if _view.has_unapplied_changes(): return _failure("Apply or discard the rule draft before opening another record.")
	var generation := _generation
	var origin: int = _view.draft.generation
	while _operations.busy:
		await _view.get_tree().process_frame
		if generation != _generation or origin != _view.draft.generation: return _changed()
	var workflow: Callable = _reload.bind(identity) if refresh_catalog else _open.bind(identity, generation)
	var response: Dictionary = await _operations.run_workflow(_bridge, "Open Rule", workflow)
	if not response.get("ok", false): _view.show_submission(response)
	return response

func _open(operation: ProvidenceEditorOperation, identity: String, generation: int) -> Dictionary:
	var id := identity.get_slice(".", 2).to_int()
	if identity != "classic.%s.%d" % [_view.rule_kind, id]: return _failure("Choose an exact canonical rule identity.")
	var source: String = _view.catalog_query().get("source", "selected")
	var response := await operation.request("rule.open-authoring", {"kind": _view.rule_kind, "classicId": id, "source":source})
	if generation != _generation or _view.has_unapplied_changes() or source != _view.catalog_query().get("source", "selected"): return _changed()
	if not response.get("ok", false): return response
	_view.bind_document(response.result)
	var opposite := "caste" if _view.rule_kind == "race" else "race"
	var catalog := await operation.request("rule.catalog", {"kind": opposite, "scope": "all", "query": "", "source":source})
	if generation != _generation: return _changed()
	if catalog.get("ok", false): _view.form.set_eligibility_names(catalog.result.items)
	return response

func validate_draft() -> void:
	var state := _view.read_state()
	var generation := _generation
	if _bridge == null or _view.draft.edit.is_empty() or not _view.draft.editable: return
	if _operations.busy: _validation_timer.start(); return
	var params := {"expectedRevision": _view.draft.revision, "draft": state.draft}
	var response: Dictionary = await _operations.run_workflow(_bridge, "Check Rule draft", func(operation): return await operation.request("rule.draft.prepare", params))
	if generation != _generation or state != _view.read_state(): return
	if response.get("ok", false): _view.show_validation(response.result)
	else:
		response.revisionConflict = str(response.get("error", "")).contains("project changed")
		_view.show_submission(response)

func commit() -> Dictionary:
	if _bridge == null or not _pending.is_empty(): return _failure("Check the original result before another rule mutation.")
	_validation_timer.stop(); _references.close(); _records.close()
	_view.set_locked(true)
	var response: Dictionary = await _operations.run_workflow(_bridge, "Apply Rule", _commit.bind(_view.read_state(), _generation), null, true)
	if not response.get("outcomeUnknown", false) and not _pending.is_empty():
		var pending := _pending.duplicate(true); _pending.clear()
		if response.get("ok", false) and pending.generation == _generation and _same_draft(pending.state):
			_view.bind_document(response.result.document)
			projection_applied.emit(response.result.change)
			load_catalog.call_deferred(_view.catalog_query())
	response.pendingMutation = not _pending.is_empty()
	_view.show_submission(response); _accept_draft.call(response)
	return response

func _commit(operation: ProvidenceEditorOperation, state: Dictionary, generation: int) -> Dictionary:
	var params := {"expectedRevision": _view.draft.revision, "draft": state.draft}
	var current := await operation.request("session.describe", {})
	if not current.get("ok", false): return current
	if int(current.result.revision) != _view.draft.revision:
		return {"ok": false, "revisionConflict": true, "error": "The project changed after this rule was opened. Your draft is kept; review the saved version."}
	var prepared := await operation.request("rule.draft.prepare", params)
	if not prepared.get("ok", false): return prepared
	_view.show_validation(prepared.result)
	if not prepared.result.valid: return _failure("\n".join(prepared.result.issues))
	if generation != _generation or state != _view.read_state(): return _changed()
	params.operationId = Crypto.new().generate_random_bytes(32).hex_encode()
	_pending = {"operationId": params.operationId, "domain": "project", "method": "rule.draft.apply", "params": params.duplicate(true), "state": state, "generation": generation}
	return await operation.request("rule.draft.apply", params)

func review_saved_version() -> void:
	if _bridge == null or not _pending.is_empty() or _view.draft.edit.is_empty(): return
	var context := {"generation": _generation, "state": _view.read_state()}
	var params := {"kind": _view.rule_kind, "classicId": int(_view.selected_definition().classicId), "source":_view.catalog_query().get("source", "selected")}
	var response: Dictionary = await _operations.run_workflow(_bridge, "Review saved Rule", func(operation): return await operation.request("rule.open-authoring", params))
	if context.generation != _generation or context.state != _view.read_state(): return
	if not response.get("ok", false): _view.show_submission(response); return
	_saved_review.begin(_view.draft.edit, response.result, context, _view.get_viewport().gui_get_focus_owner())

func _accept_saved_version(document: Dictionary, context: Dictionary) -> void:
	if context.generation != _generation or context.state != _view.read_state() or not _pending.is_empty(): return
	_view.bind_document(document); _view.show_submission({"ok": true})
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
		_operations.requires_reopen = true; _view.show_submission(_uncertain()); return
	if not _same_draft(pending.state): _view.show_submission(_uncertain()); return
	var original: Dictionary = receipt.get("response", {})
	if receipt.outcome == "committed" and original.get("ok", false):
		response = await _operations.run_workflow(_bridge, "Read confirmed Rule", _confirmed.bind(original, pending))
		if not response.get("ok", false): _view.show_submission(_uncertain()); return
		_accept_draft.call(original)
	else: _view.show_submission(original)
	_pending.clear()
	_view.show_submission(response if receipt.outcome == "committed" else original)

func _confirmed(operation: ProvidenceEditorOperation, original: Dictionary, pending: Dictionary) -> Dictionary:
	var current := await operation.request("session.describe", {})
	if not current.get("ok", false): return current
	var definition: Dictionary = pending.params.draft.edit.definition
	var document := await operation.request("rule.open-authoring", {"kind": _view.rule_kind, "classicId": int(definition.classicId)})
	if not document.get("ok", false): return document
	if pending.generation != _generation: return _changed()
	_view.bind_document(document.result)
	var change: Dictionary = original.result.change.duplicate(true)
	change.merge({"revision": current.result.revision, "canUndo": current.result.canUndo, "canRedo": current.result.canRedo, "truncated": true}, true)
	projection_applied.emit(change)
	return {"ok": true}

func _recover_read() -> void:
	var generation := _generation; var state := _view.read_state()
	var response := await _operations.recover_item(_bridge, {}, true)
	if generation != _generation or not _same_draft(state): return
	if not response.get("itemRecoveryConfirmed", false): _view.show_submission(response); return
	projection_applied.emit({"revision": response.result.revision, "canUndo": response.result.canUndo, "canRedo": response.result.canRedo, "truncated": true})
	_view.show_submission({"ok": true} if int(response.result.revision) == _view.draft.revision else {"ok": false, "revisionConflict": true, "error": "The project changed while reconnecting. Your draft is kept; review the saved version."})

func _same_draft(state: Dictionary) -> bool:
	var current := _view.read_state()
	return state.generation == current.generation and state.editSequence == current.editSequence and preload("res://src/monster_operation_identity.gd").matches(state.draft, current.draft)
func _failure(message: String) -> Dictionary: return {"ok": false, "error": message}
func _changed() -> Dictionary: return _failure("The originating rule document changed. No operation was repeated.")
func _uncertain() -> Dictionary: return {"ok": false, "outcomeUnknown": true, "pendingMutation": true, "error": "The original Rule result is still uncertain. Your draft is kept and changes remain locked."}
