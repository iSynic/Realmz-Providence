extends RefCounted

const SettingsReview = preload("res://src/script_settings_review.gd")

signal projection_applied(projection: Dictionary)

var _view: Control
var _methods: Dictionary
var _operations: ProvidenceEditorOperation
var _read_context: Callable
var _accept_read: Callable
var _accept_draft: Callable
var _bridge: RefCounted
var _generation := 0
var _navigation: Callable
var _draft_control_lock: Callable


func initialize(view: Control, methods: Dictionary, operations: ProvidenceEditorOperation, read_context: Callable, accept_read: Callable, accept_draft: Callable, navigation: Callable = Callable()) -> void:
	_view = view
	_methods = methods
	_operations = operations
	_read_context = read_context
	_accept_read = accept_read
	_accept_draft = accept_draft
	_view.commit_handler = commit
	_navigation = navigation
	if navigation.is_valid() and view.has_signal("navigation_requested"): view.navigation_requested.connect(navigation)
	if view.has_method("set_draft_controls_locked"):
		_draft_control_lock = func(busy: bool, _label: String): view.set_draft_controls_locked(busy or _operations.requires_reopen)
		_operations.busy_changed.connect(_draft_control_lock)


func attach_session(bridge: RefCounted) -> void:
	_generation += 1
	_bridge = bridge
	_view.set_document({})
	_set_catalog({"items": [], "total": 0}, "")


func teardown() -> void:
	attach_session(null)


func dispose() -> void:
	_generation += 1
	_view.commit_handler = Callable()
	if _navigation.is_valid() and _view.has_signal("navigation_requested"): _view.navigation_requested.disconnect(_navigation)
	if _draft_control_lock.is_valid(): _operations.busy_changed.disconnect(_draft_control_lock)
	_draft_control_lock = Callable()
	for connection in projection_applied.get_connections(): projection_applied.disconnect(connection.callable)


func reload(preferred: String = "", operation: ProvidenceEditorOperation = null, map_identity: String = "", exact_identity := false) -> Dictionary:
	var response := _read_allowed()
	if response.ok:
		var guard := _guard()
		guard["requestedMap"] = map_identity
		guard["exactIdentity"] = exact_identity
		response = await _operations.run_workflow(_bridge, "Load script records", _reload.bind(preferred, guard), operation)
	_view.restore_catalog_selection()
	return response


func open_record(identity: String) -> Dictionary:
	var response := _read_allowed()
	if response.ok:
		response = await _operations.run_workflow(_bridge, "Open script record", _open.bind(identity, _guard()))
	_view.restore_catalog_selection()
	return response


func selected_identity() -> String:
	return str(_view.read_state().get("identity", ""))


func commit(document: Dictionary) -> Dictionary:
	var key := str(_methods.get("commitKey", _methods.record))
	return await submit(_methods.update, {key: document}, true)


func submit(method: String, payload: Dictionary, draft: bool = false) -> Dictionary:
	var response := {"ok": true}
	if not draft: response = _read_allowed()
	if _bridge == null: response = {"ok": false, "error": "Open a project before editing script records."}
	if response.ok:
		var params := payload.duplicate(true)
		params["expectedRevision"] = int(_read_context.call().revision)
		response = await _operations.run_workflow(_bridge, "Apply script change", _mutate.bind(method, params, draft, _guard()))
	(_accept_draft if draft else _accept_read).call(response)
	return response


func _mutate(operation: ProvidenceEditorOperation, method: String, params: Dictionary, draft: bool, guard: Dictionary) -> Dictionary:
	var commit_key := str(_methods.get("commitKey", _methods.record))
	var submitted: Dictionary = params.get(commit_key, {}).duplicate(true)
	if method in ["action-point.apply-draft", "extra-action-point.apply-draft", "encounter.apply-simple-draft", "encounter.apply-complex-draft"]:
		var reviewed: Dictionary = await SettingsReview.new().review(operation, submitted,
			int(params.expectedRevision), _check_guard.bind(guard), _view.review_settings_change)
		if not reviewed.get("ok", false): return reviewed
		params[commit_key] = reviewed.draft
	var response := await operation.request(method, params)
	if not response.get("ok", false): return response
	if guard.generation != _generation:
		response["viewRefreshError"] = "The script document session changed."
		return response
	# Acknowledgement advances only the submitted baseline. Later typing remains
	# a draft even if the following read fails or the author changes the search.
	if draft and params.has(commit_key):
		if _view.has_method("accept_saved_draft"):
			_view.accept_saved_draft(submitted)
		else:
			_view.accept_saved_document(submitted)
	projection_applied.emit(_change_projection(response.result))
	guard["retainDocument"] = draft
	var refreshed := await _reload(operation, str(guard.state.identity), guard)
	if not refreshed.get("ok", false):
		response["viewRefreshError"] = str(refreshed.get("error", "Reload the script record."))
		if refreshed.get("outcomeUnknown", false): response["outcomeUnknown"] = true
	return response


func _change_projection(result: Dictionary) -> Dictionary:
	# Step commands also return the reopened record, keeping the mutation delta
	# explicitly nested so the shell never mistakes document data for session state.
	return result.get("change", result) as Dictionary


func _reload(operation: ProvidenceEditorOperation, preferred: String, guard: Dictionary) -> Dictionary:
	var params: Dictionary = _view.list_query() if _view.has_method("list_query") else {"offset": 0, "limit": int(_methods.limit)}
	if _methods.record == "actionPoint":
		params["mapIdentity"] = str(guard.get("requestedMap", ""))
		if str(params.mapIdentity).is_empty(): params["mapIdentity"] = str(guard.state.mapIdentity)
		if str(params.mapIdentity).is_empty():
			_set_catalog({"items": [], "total": 0}, "")
			return {"ok": true}
	var response := await operation.request(_methods.list, params)
	if not response.get("ok", false): return response
	var checked := _check_guard(guard)
	if not checked.ok: return checked
	var identity: String = _view.catalog_identity(response.result.get("items", []), preferred)
	# History destinations are exact even when the restored search/page excludes them.
	if (bool(guard.get("retainDocument", false)) or bool(guard.get("exactIdentity", false))) and not preferred.is_empty(): identity = preferred
	var opened := {"ok": true}
	if not identity.is_empty():
		opened = await operation.request(_methods.open, {"identity": identity})
		if not opened.get("ok", false): return opened
	checked = _check_guard(guard)
	if not checked.ok: return checked
	_set_catalog(response.result, identity)
	if opened.has("result"): _view.set_document(opened.result)
	if bool(guard.get("retainDocument", false)) and _view.has_method("restore_navigation_state"):
		_view.restore_navigation_state(guard.state)
	return response


func _open(operation: ProvidenceEditorOperation, identity: String, guard: Dictionary) -> Dictionary:
	if identity.is_empty(): return {"ok": false, "error": "Choose a script record to open."}
	var response := await operation.request(_methods.open, {"identity": identity})
	if not response.get("ok", false): return response
	var checked := _check_guard(guard)
	if not checked.ok: return checked
	var catalog := await _opened_map_catalog(operation,response.result,identity,guard)
	if not catalog.get("ok",false): return catalog
	_view.set_document(response.result)
	return response


func _opened_map_catalog(operation: ProvidenceEditorOperation, document: Dictionary, identity: String, guard: Dictionary) -> Dictionary:
	if _methods.record != "actionPoint": return {"ok":true}
	var map_identity := str(document.get("map",{}).get("identity",""))
	if map_identity.is_empty() or map_identity == str(guard.state.get("mapIdentity","")): return {"ok":true}
	var query: Dictionary = _view.list_query(); query.mapIdentity = map_identity; query.offset = 0
	var response := await operation.request(_methods.list,query)
	if not response.get("ok",false): return response
	var checked := _check_guard(guard)
	if not checked.ok: return checked
	_set_catalog(response.result,identity)
	return response


func _set_catalog(page: Dictionary, preferred: String) -> void:
	var blocked := _view.is_blocking_signals()
	_view.set_block_signals(true)
	_view.set_summaries(page, int(_read_context.call().revision), preferred)
	_view.set_block_signals(blocked)


func _read_allowed() -> Dictionary:
	if _bridge == null: return {"ok": false, "error": "Open a project before loading script records."}
	if _view.has_unapplied_changes():
		return {"ok": false, "draftKept": true, "error": "Apply or discard the script draft before refreshing or changing selection."}
	return {"ok": true}


func _guard() -> Dictionary:
	return {"generation": _generation, "state": _view.read_state()}


func _check_guard(guard: Dictionary) -> Dictionary:
	if guard.generation != _generation or not is_instance_valid(_view) or not _view.is_inside_tree():
		return {"ok": false, "connectionChanged": true, "error": "The script document session changed before loading finished."}
	if guard.state != _view.read_state():
		return {"ok": false, "draftKept": true, "error": "The script draft or search changed while loading. Your changes are kept."}
	return {"ok": true}
