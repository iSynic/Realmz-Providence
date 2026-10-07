extends RefCounted

var _view: ProvidenceStringEditor
var _bridge: RefCounted
var _operations: ProvidenceEditorOperation
var _context: Callable
var _accept_read: Callable
var _accept_mutation: Callable
var _generation := 0

func initialize(view: ProvidenceStringEditor) -> void:
	_view = view

func attach(bridge: RefCounted, context: Callable, accept_read: Callable, accept_mutation: Callable, operations: ProvidenceEditorOperation) -> void:
	if _operations != null:
		_operations.busy_changed.disconnect(_busy_changed)
		_operations.completed.disconnect(_completed)
	_generation += 1
	_bridge = bridge
	_context = context
	_accept_read = accept_read
	_accept_mutation = accept_mutation
	_operations = operations
	_operations.busy_changed.connect(_busy_changed)
	_operations.completed.connect(_completed)
	_view.reset_document()
	_completed({})

func teardown() -> void:
	_generation += 1
	_bridge = null
	_view.reset_document()

func _guard() -> Dictionary:
	return {"generation":_generation, "state":_view.read_state()}

func _check(guard: Dictionary) -> Dictionary:
	if guard.generation != _generation:
		return {"ok":false,"connectionChanged":true,"error":"The Strings session changed before loading finished."}
	if guard.state != _view.read_state():
		return {"ok":false,"draftKept":true,"error":"Your draft or search changed while loading. Your changes are kept."}
	return {"ok":true}

func _draft_guard() -> Dictionary:
	return {"ok":false,"draftKept":true,"error":"Apply or discard this draft before changing the selection."} if _view.has_unapplied_changes() else {"ok":true}

func reload(identity := "", offset := -1, focus_editor := false, borrowed: ProvidenceEditorOperation = null) -> Dictionary:
	if _bridge == null: return {"ok":false,"error":"Open a project before loading Strings."}
	var response := _draft_guard()
	if not response.ok: return response
	var guard := _guard()
	_view.show_loading()
	response = await _operations.run_workflow(_bridge, "Load Strings", _load.bind(identity if not identity.is_empty() else _view.selected_identity(), _view.page_offset() if offset < 0 else offset, _view.query(), focus_editor, guard), borrowed)
	_settle_read(response, guard)
	return response

func _read_record(operation: ProvidenceEditorOperation, native_id: int) -> Dictionary:
	var family := _view.family()
	var opened := await operation.request("option-label.open" if family == "option-label" else "message.open", {"nativeId":native_id})
	if not opened.get("ok", false): return opened
	var uses := await operation.request("reference.used-by", {"targetKind":family,"targetId":str(native_id),"offset":0,"limit":128})
	if not uses.get("ok", false): return uses
	return {"ok":true,"record":opened.result.get("optionLabel" if family == "option-label" else "message", {}),"feedback":opened.result.get("feedback", {}),"uses":uses.result,"linkedSounds":opened.result.get("linkedSounds",{}),"index":opened.result.get("index",0)}

func _load(operation: ProvidenceEditorOperation, identity: String, offset: int, query: String, focus_editor: bool, guard: Dictionary) -> Dictionary:
	var page := await operation.request("option-label.list" if _view.family() == "option-label" else "message.list", {"offset":offset,"limit":128,"query":query})
	if not page.get("ok", false): return page
	var rows: Array = page.result.get("items", [])
	var selected := rows.find_custom(func(row): return str(row.identity) == identity)
	if selected < 0 and not rows.is_empty(): selected = 0
	var opened := await _read_record(operation, int(rows[selected].nativeId)) if selected >= 0 else {"ok":true}
	if not opened.get("ok", false): return opened
	var valid := _check(guard)
	if not valid.ok: return valid
	_view.receive_page(page.result, opened, focus_editor)
	return page

func open_id(native_id: int, announce := true) -> Dictionary:
	if _bridge == null: return {"ok":false,"error":"Open a project before opening a string."}
	if _view.selected_identity() == "%s:%d" % [_view.family(), native_id]: return {"ok":true}
	var response := _draft_guard()
	if not response.ok: return response
	var guard := _guard()
	response = await _operations.run_workflow(_bridge, "Open String", _open.bind(native_id, guard))
	_settle_read(response, guard)
	if response.ok and announce: _view.route_requested.emit("text.messages")
	return response

func _open(operation: ProvidenceEditorOperation, native_id: int, guard: Dictionary) -> Dictionary:
	var opened := await _read_record(operation, native_id)
	if not opened.get("ok",false): return opened
	var page := await operation.request("option-label.list" if _view.family() == "option-label" else "message.list", {"offset":int(int(opened.index) / 128) * 128,"limit":128,"query":""})
	if not page.get("ok",false): return page
	var valid := _check(guard)
	if not valid.ok: return valid
	_view.set_query("")
	_view.receive_page(page.result, opened, true)
	return opened

func select_row(index: int, focus_editor := true) -> bool:
	var row := _view.row_at(index)
	if row.is_empty(): return false
	if str(row.identity) == _view.selected_identity(): return true
	var response := _draft_guard()
	if response.ok:
		var guard := _guard()
		response = await _operations.run_workflow(_bridge, "Open String", _select.bind(int(row.nativeId), focus_editor, guard))
		_settle_read(response, guard)
	_view.restore_list_selection()
	return _accept_read.call(response)

func _select(operation: ProvidenceEditorOperation, native_id: int, focus_editor: bool, guard: Dictionary) -> Dictionary:
	var opened := await _read_record(operation,native_id)
	if not opened.get("ok",false): return opened
	var valid := _check(guard)
	if not valid.ok: return valid
	_view.receive_record(opened,focus_editor)
	return opened

func allocate(duplicate: bool) -> void:
	var guard := _guard()
	var text := _view.draft_text() if duplicate else ""
	var response := await request("text.allocate", {"family":_view.family()})
	if not _check(guard).ok: return
	if not response.get("ok",false): _view.show_failure(response); return
	if not response.result.available: _view.show_failure({"error":response.result.reason}); return
	_view.begin_new(int(response.result.nativeId), text)

func commit() -> Dictionary:
	if _bridge == null: return {"ok":false,"error":"Open a project before applying Strings."}
	if not _view.has_unapplied_changes(): return {"ok":true}
	var draft := _view.submitted_draft()
	var response := await _operations.run_workflow(_bridge,"Apply String",_commit.bind({"expectedRevision":int(_context.call().revision),"draft":draft},_generation))
	if not response.get("ok",false): _view.show_failure(response)
	_accept_mutation.call(response)
	return response

func _commit(operation: ProvidenceEditorOperation, params: Dictionary, generation: int) -> Dictionary:
	var response := await operation.request("text.apply-draft", params)
	if response.get("ok",false) and generation == _generation:
		_view.acknowledge(params.draft)
		_view.projection_applied.emit(response.result)
	return response

func request(method: String, params: Dictionary, borrowed: ProvidenceEditorOperation = null) -> Dictionary:
	if _bridge == null: return {"ok":false,"error":"Open a project before using Strings."}
	return await _operations.run_workflow(_bridge, "Browse Strings", _request.bind(method, params),borrowed)

func _request(operation: ProvidenceEditorOperation, method: String, params: Dictionary) -> Dictionary:
	return await operation.request(method,params)

func inspect_draft(text: String, family: String, generation: int) -> void:
	var session_generation := _generation
	while _operations != null and _operations.busy and _view.is_inside_tree():
		await _view.get_tree().process_frame
		if session_generation != _generation or not _view.feedback_current(text,family,generation): return
	if not _view.is_inside_tree() or _bridge == null or session_generation != _generation or not _view.feedback_current(text,family,generation): return
	var response := await request("text.inspect-draft",{"text":text,"family":family})
	if session_generation == _generation and _view.feedback_current(text,family,generation): _view.receive_feedback(response)

func inspect_uses(offset: int) -> void:
	var guard := _guard()
	var row := _view.selected_record()
	if row.is_empty() or _view.is_new(): return
	var response := await request("reference.used-by",{"targetKind":_view.family(),"targetId":str(row.nativeId),"offset":offset,"limit":128})
	if _check(guard).ok:
		if response.get("ok",false): _view.receive_uses(response.result)
		else: _view.show_failure(response)

func _settle_read(response: Dictionary, guard: Dictionary) -> void:
	if guard.generation != _generation: return
	if not response.get("ok",false) and not response.get("draftKept",false) and not response.get("busy",false) and not response.get("outcomeUnknown",false) and not response.get("connectionChanged",false) and not _view.has_unapplied_changes():
		_view.clear_failed_projection(response)
	elif not response.get("ok",false): _view.show_failure(response)

func accept_read(response: Dictionary) -> bool:
	return _accept_read.call(response)

func revision() -> int:
	return int(_context.call().revision)

func _busy_changed(busy: bool, _label: String) -> void:
	_view.set_operation_state(busy,_operations.requires_reopen)

func _completed(_response: Dictionary) -> void:
	_view.set_operation_state(false,_operations.requires_reopen)

func session_generation() -> int:
	return _generation

func apply_import(params: Dictionary) -> Dictionary:
	var generation := _generation
	var response := await _operations.run_workflow(_bridge,"Import reviewed Strings",_apply_import.bind(params,generation))
	_accept_mutation.call(response)
	return response

func _apply_import(operation: ProvidenceEditorOperation, params: Dictionary, generation: int) -> Dictionary:
	var response := await operation.request("text.import-apply",params)
	if not response.get("ok",false) or generation != _generation: return response
	_view.projection_applied.emit(response.result)
	var refreshed := await reload("",-1,false,operation)
	if not refreshed.get("ok",false): response["viewRefreshError"] = refreshed.get("error","Refresh Strings to see the imported text.")
	return response

func dispose() -> void:
	_generation += 1
	_bridge = null
	if _operations != null:
		_operations.busy_changed.disconnect(_busy_changed)
		_operations.completed.disconnect(_completed)
	_operations = null
