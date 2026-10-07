class_name ProvidenceEncounterAuthoringController
extends RefCounted

signal projection_applied(projection: Dictionary)
signal failed(message: String)

var _view: ProvidenceEncounterRecordEditor
var _operations: ProvidenceEditorOperation
var _read_context: Callable
var _read_bridge: Callable
var _accept_draft: Callable
var _navigation
var _generation := 0
var _copy_generation := 0
var _uncertain_intent: Dictionary = {}


func initialize(view: ProvidenceEncounterRecordEditor, operations: ProvidenceEditorOperation, context: Callable, bridge: Callable, accept: Callable, navigation) -> void:
	_view = view; _operations = operations; _read_context = context; _read_bridge = bridge; _accept_draft = accept; _navigation = navigation
	operations.busy_changed.connect(view.set_busy)
	view.kind = view.route_identity().trim_prefix("encounters.")
	view.reference_refresh_handler = refresh_references
	view.reference_preview_handler = preview_reference
	view.catalog_handler = refresh_catalog
	view.open_handler = open_record; view.commit_handler = commit
	view.copy_catalog_handler = copy_catalog
	view.create_handler = create; view.copy_handler = copy_source
	if view is ProvidenceRogueEncounterEditor: view.owner_page_handler = owner_page
	if view is ProvidenceTimedEncounterEditor: view.cell_handler = load_cells
	view.target_handler = find_targets; view.message_handler = create_message; view.reconcile_handler = reconcile
	view.reference_open_requested.connect(navigation.open_script_target)
	view.sound_preview_requested.connect(navigation.preview_script_sound)
	view.get_node("FailureDialog/Body/Actions/CloseFailure").pressed.connect(view.close_failure)


func teardown() -> void:
	_generation += 1; _copy_generation += 1; _uncertain_intent.clear(); _view.clear_selection()


func reload(operation: ProvidenceEditorOperation = null) -> Dictionary:
	if _read_bridge.call() == null: teardown(); return {"ok": true}
	if _view.has_unapplied_changes(): return {"ok": false, "error": "Your encounter draft is kept. Apply or discard it before reloading."}
	return await _operations.run_workflow(_read_bridge.call(), "Load encounters", _reload, operation)


func _reload(operation: ProvidenceEditorOperation) -> Dictionary:
	var epoch := _generation
	var page := await operation.request("encounter.list-" + _view.kind, _view.list_query())
	if not page.get("ok", false): return page
	if epoch != _generation: return _changed_session()
	var identity := _view.selected_identity()
	if identity.is_empty() and not page.result.items.is_empty(): identity = str(page.result.items[0].identity)
	_view.session_available = true
	_view.set_summaries(page.result, int(page.result.revision))
	_view.refresh_state()
	if not identity.is_empty(): return await _open(operation, identity)
	return page


func refresh_catalog() -> void:
	var epoch := _generation
	while _operations.busy:
		await _view.get_tree().process_frame
		if epoch != _generation: return
	await _operations.run_workflow(_read_bridge.call(), "Find encounters", _catalog)


func _catalog(operation: ProvidenceEditorOperation) -> Dictionary:
	var epoch := _generation
	var query := _view.list_query()
	var page := await operation.request("encounter.list-" + _view.kind, query)
	if page.get("ok", false) and epoch == _generation and query == _view.list_query(): _view.set_summaries(page.result, int(page.result.revision))
	return page


func open_record(identity: String) -> Dictionary:
	if _view.has_unapplied_changes():
		await _navigation.request_authoring_navigation(_open_guarded.bind(identity), "opening another encounter")
		return {"ok": _view.selected_identity() == identity}
	return await _open_guarded(identity)


func _open_guarded(identity: String) -> Dictionary:
	return await _operations.run_workflow(_read_bridge.call(), "Open encounter", _open.bind(identity))


func _open(operation: ProvidenceEditorOperation, identity: String) -> Dictionary:
	var epoch := _generation
	var response := await operation.request("encounter.open-" + _view.kind, {"identity": identity})
	if not response.get("ok", false): return response
	if epoch != _generation: return _changed_session()
	_view.set_document(response.result)
	await _resolve_references(operation, response.result)
	return response


func commit(submitted: Dictionary) -> void:
	var response := await _operations.run_workflow(_read_bridge.call(), "Apply encounter", _commit.bind(submitted), null, true)
	if not response.get("ok", false): _view.show_failure(response)
	_accept_draft.call(response)


func _commit(operation: ProvidenceEditorOperation, submitted: Dictionary) -> Dictionary:
	var epoch := _generation
	_uncertain_intent = {"kind": _view.kind, "identity": str(submitted.identity), "draft": submitted.duplicate(true), "creating": false}
	var response := await operation.request("encounter.apply-" + _view.kind + "-draft", {"expectedRevision": int(_read_context.call().revision), "draft": submitted})
	if not response.get("ok", false): return response
	if epoch != _generation: return _changed_session()
	_view.accept_saved_document(submitted)
	projection_applied.emit(response.result.change)
	_uncertain_intent.clear()
	# Acknowledgement only advances the submitted baseline. Edits typed during
	# the request survive both success and a failed reference refresh.
	await _resolve_references(operation, response.result.document)
	return response


func create(source: String) -> void:
	if _view.has_unapplied_changes():
		await _navigation.request_authoring_navigation(_create_guarded.bind(source), "creating an encounter")
	else: await _create_guarded(source)


func _create_guarded(source: String) -> void:
	var response := await _operations.run_workflow(_read_bridge.call(), "Create encounter", _create.bind(source), null, true)
	if not response.get("ok", false): _view.show_failure(response)
	_accept_draft.call(response)


func _create(operation: ProvidenceEditorOperation, source: String) -> Dictionary:
	var params := {"kind": _view.kind}
	if not source.is_empty(): params["source"] = source
	var prepared := await operation.request("encounter.prepare-create", params)
	if not prepared.get("ok", false): return prepared
	_uncertain_intent = {"kind": _view.kind, "identity": prepared.result.identity, "draft": prepared.result.encounter, "creating": true}
	params["expectedRevision"] = int(prepared.result.revision)
	var method := "encounter." + ("create-" if source.is_empty() else "copy-") + _view.kind
	var response := await operation.request(method, params)
	if not response.get("ok", false): return response
	projection_applied.emit(response.result.change)
	_uncertain_intent.clear(); _view.set_document(response.result.document)
	return await _reload(operation)


func copy_source(identity: String) -> void:
	_copy_generation += 1
	var request_id := _copy_generation
	var state := _view.read_state()
	while _operations.busy:
		await _view.get_tree().process_frame
		if request_id != _copy_generation or state != _view.read_state(): return
	var response := await _operations.run_workflow(_read_bridge.call(), "Read copy source", _copy_read.bind(identity))
	if response.get("ok", false) and request_id == _copy_generation and state == _view.read_state(): _view.set_copy_source(response.result)


func _copy_read(operation: ProvidenceEditorOperation, identity: String) -> Dictionary:
	return await operation.request("encounter.open-" + _view.kind, {"identity": identity})


func find_targets(field: ProvidenceEncounterReferenceField, search: String, cursor: String, generation: int) -> void:
	var context: Dictionary = _view.target_context(field)
	var query := {"kind": field.target_kind, "search": search, "cursor": cursor if not cursor.is_empty() else "0", "limit": 128, "context": context}
	var identity := _view.selected_identity(); var epoch := _generation
	while _operations.busy:
		await _view.get_tree().process_frame
		if epoch != _generation or identity != _view.selected_identity(): return
	var response := await _operations.run_workflow(_read_bridge.call(), "Find encounter reference", _target_read.bind(query))
	if response.get("ok", false) and epoch == _generation and identity == _view.selected_identity(): _view.set_reference_page(response.result, generation)


func _target_read(operation: ProvidenceEditorOperation, query: Dictionary) -> Dictionary:
	return await operation.request("action-target.list", {"query": query})


func preview_reference(target: Dictionary, generation: int) -> void:
	# Rapid selection can supersede this read; publish only into its original field and session.
	var epoch := _generation; var identity := _view.selected_identity()
	while _operations.busy:
		await _view.get_tree().process_frame
		if epoch != _generation or not _view.reference_preview_is_current(generation): return
	if not _view.reference_preview_is_current(generation): return
	var response := await _operations.run_workflow(_read_bridge.call(), "Read selected string", _message_preview_read.bind(int(target.value)))
	if epoch != _generation or identity != _view.selected_identity() or not response.get("ok", false): return
	var message: Dictionary = response.result.message
	if str(message.identity) == str(target.identity) and int(message.nativeId) == int(target.value): _view.set_reference_text(generation, str(message.text))


func _message_preview_read(operation: ProvidenceEditorOperation, native_id: int) -> Dictionary:
	return await operation.request("message.open", {"nativeId": native_id})


func _resolve_references(operation: ProvidenceEditorOperation, document: Dictionary) -> void:
	var identity := _view.selected_identity(); var epoch := _generation
	if document.has("diagnostics"): _view.set_current_diagnostics(document.diagnostics)
	for field in _view.find_children("*", "HBoxContainer", true, false):
		if not field is ProvidenceEncounterReferenceField or field.value == field.none_value: continue
		var key: String = field.field_key
		var target_id: int = field.value
		var query := {"kind": field.target_kind, "search": str(field.resolved_value()), "limit": 128, "context": _view.target_context(field)}
		var result := await _target_read(operation, query)
		if epoch != _generation or identity != _view.selected_identity(): return
		if not result.get("ok", false): continue
		for target: Dictionary in result.result.get("items", []):
			if int(target.value) == field.resolved_value() and _view.reference_value(key) == target_id and _view.target_context(field) == query.context: _view.set_target(key, target); break
	if _view.kind == "rogue":
		var owners := await operation.request("encounter.rogue-callers", {"identity": identity, "offset": _view.caller_page_offset()})
		if owners.get("ok", false) and epoch == _generation and identity == _view.selected_identity(): _view.set_owners(owners.result.items, int(owners.result.total), int(owners.result.offset))


func create_message(text: String) -> void:
	_view.get_node("%CreateString").disabled = true; _view.get_node("%StringText").editable = false
	var response := await _operations.run_workflow(_read_bridge.call(), "Create scenario string", _create_message.bind(text), null, true)
	_view.get_node("%CreateString").disabled = false; _view.get_node("%StringText").editable = true
	if not response.get("ok", false): _view.show_failure(response)
	_accept_draft.call(response)


func _create_message(operation: ProvidenceEditorOperation, text: String) -> Dictionary:
	var prepared := await operation.request("encounter.prepare-string", {})
	if not prepared.get("ok", false): return prepared
	var id := int(prepared.result.nativeId)
	_uncertain_intent = {"kind": "message", "identity": "message:%d" % id, "text": text}
	var response := await operation.request("message.create", {"expectedRevision": int(prepared.result.revision), "nativeId": id, "text": text})
	if not response.get("ok", false): return response
	projection_applied.emit(response.result)
	_uncertain_intent.clear()
	_view.accept_created_string({"value": id, "identity": "message:%d" % id, "label": text, "detail": text, "preview": text, "status": "resolved"})
	return response


func reconcile() -> void:
	if _uncertain_intent.is_empty(): return
	var response: Dictionary = await _operations.recover_encounter(_read_bridge.call(), _uncertain_intent)
	if not response.get("ok", false): _view.show_failure(response); return
	projection_applied.emit(response.result.projection)
	_view.get_node("FailureDialog").hide()
	_view.uncertain = false; _view.conflicting = false
	if str(_uncertain_intent.kind) == "message":
		_reconcile_message(response)
	else:
		var outcome := str(response.result.outcome)
		if outcome == "matches-draft":
			_view.accept_saved_document(_uncertain_intent.draft)
			if bool(_uncertain_intent.creating): _view.set_document(response.result.document)
		elif outcome == "different":
			var retained: Dictionary = _uncertain_intent.draft if bool(_uncertain_intent.creating) else _view.draft
			_view.show_comparison(response.result.document, retained)
		_view.revision = int(response.result.revision)
		_view.refresh_state()
	_uncertain_intent.clear()
	_accept_draft.call(response)
	await refresh_catalog()


func _reconcile_message(response: Dictionary) -> void:
	var outcome := str(response.result.outcome)
	if outcome == "matches-draft":
		var text := str(_uncertain_intent.text)
		_view.accept_created_string({"value": int(response.result.nativeId), "identity": _uncertain_intent.identity, "label": text, "detail": text, "preview": text, "status": "resolved"})
	else:
		_view.get_node("StringDialog").popup_centered()
		_view.get_node("%StringStatus").text = "Your text is retained. Create and Use will allocate a new string ID." if outcome == "different" else "The string was not created. Your text is retained; Create and Use may be retried."
		_view.get_node("%StringText").grab_focus()
	_view.refresh_state()


func _changed_session() -> Dictionary: return {"ok": false, "error": "The encounter session changed; your draft was not replaced."}


func load_cells(identity: String) -> void:
	var state := _view.read_state(); var epoch := _generation
	while _operations.busy:
		await _view.get_tree().process_frame
		if epoch != _generation or state != _view.read_state(): return
	var response := await _operations.run_workflow(_read_bridge.call(), "Choose map cell", _read_cells.bind(identity))
	if response.get("ok", false) and epoch == _generation and state == _view.read_state(): _view.set_cell_map(response.result)


func _read_cells(operation: ProvidenceEditorOperation, identity: String) -> Dictionary:
	var map := await operation.request("map.open", {"identity": identity})
	if not map.get("ok", false): return map
	var atlas := await operation.request("map.render-atlas", {"identity": identity})
	map.result["atlas"] = atlas.get("result", {})
	return map


func copy_catalog() -> void:
	var identity := _view.selected_identity(); var epoch := _generation
	while _operations.busy:
		await _view.get_tree().process_frame
		if epoch != _generation or identity != _view.selected_identity(): return
	var response := await _operations.run_workflow(_read_bridge.call(), "Choose copy source", _copy_catalog)
	if response.get("ok", false) and epoch == _generation and identity == _view.selected_identity(): _view.set_copy_catalog(response.result.items)


func _copy_catalog(operation: ProvidenceEditorOperation) -> Dictionary:
	var items: Array = []; var cursor := 0
	while true:
		var page := await operation.request("encounter.list-" + _view.kind, {"offset": cursor, "limit": 128})
		if not page.get("ok", false): return page
		items.append_array(page.result.items)
		if not page.result.truncated: return {"ok": true, "result": {"items": items}}
		if items.size() >= 256: return {"ok": false, "error": "The encounter catalog exceeds its native ID range."}
		cursor += 128
	return {"ok": false}


func refresh_references() -> void:
	var epoch := _generation; var identity := _view.selected_identity()
	while _operations.busy:
		await _view.get_tree().process_frame
		if epoch != _generation or identity != _view.selected_identity(): return
	await _operations.run_workflow(_read_bridge.call(), "Resolve encounter references", _refresh_references)


func _refresh_references(operation: ProvidenceEditorOperation) -> Dictionary:
	await _resolve_references(operation, {})
	return {"ok": true}


func owner_page(offset: int) -> void:
	var identity := _view.selected_identity(); var epoch := _generation
	var response := await _operations.run_workflow(_read_bridge.call(), "Find calling encounter", _read_owners.bind(identity, offset))
	if response.get("ok", false) and epoch == _generation and identity == _view.selected_identity(): _view.set_owners(response.result.items, int(response.result.total), int(response.result.offset))


func _read_owners(operation: ProvidenceEditorOperation, identity: String, offset: int) -> Dictionary:
	return await operation.request("encounter.rogue-callers", {"identity": identity, "offset": offset})
