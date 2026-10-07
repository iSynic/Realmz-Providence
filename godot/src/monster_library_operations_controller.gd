extends RefCounted

const TRANSFERS := [["transfer-auto", "Allocate empty scenario IDs"], ["transfer-normal", "Copy to a chosen Normal ID"],
	["transfer-all", "Copy unchanged to all sets"], ["transfer-generate", "Copy and generate variants"], ["transfer-replace", "Replace a chosen Normal record"]]
const BULK_TRANSFERS := [["transfer-auto", "Normal · allocate empty IDs"], ["transfer-all-auto", "All sets · unchanged copies"], ["transfer-generate-auto", "All sets · generate variants"]]
var _view
var _dialog
var _authoring
var _operations: ProvidenceEditorOperation
var _read_bridge: Callable
var _reload: Callable
var _context: Dictionary = {}
var _review: Dictionary = {}
var _generation := 0
var _input_revision := -1
var _destinations: Dictionary = {}


func initialize(view, dialog, authoring, operations: ProvidenceEditorOperation, read_bridge: Callable, reload_view: Callable) -> void:
	_view = view
	_dialog = dialog
	_authoring = authoring
	_operations = operations
	_read_bridge = read_bridge
	_reload = reload_view
	view.record_operation_requested.connect(open_review)
	view.library_operation_requested.connect(open_review)
	dialog.review_requested.connect(prepare)
	dialog.commit_requested.connect(commit)
	dialog.membership_removed.connect(_remove_member)
	dialog.destination_changed.connect(_change_destination)


func open_review(action: String) -> void:
	var dropped := action == "DropTransfer"
	if dropped: action = "Transfer"
	var membership_only := action == "ReviewMembership"
	if membership_only: action = "CopySelected"
	if action in ["UndoLibrary", "RedoLibrary"]: await _history(action); return
	var options: Array = []
	if action == "CopyToLibrary": options = [["copy-library", "Create a custom Library entry from this set record"]]
	elif action == "NewLibrary": options = [["create-library", "Create a custom Library entry"]]
	elif action in ["Transfer", "CopySelected", "CopyStock", "CopyVisible", "CopyCustom"]:
		options = TRANSFERS if action == "Transfer" and _view.library.selected_identities().size() == 1 else BULK_TRANSFERS
	elif _view.draft_domain() == "library":
		options = {"Duplicate": [["duplicate-library", "Duplicate as a custom entry"]], "ClearSelection": [["delete-library", "Remove this custom Library entry"]],
			"Customize": [["customize", "Customize the protected source"]], "Restore": [["restore-library", "Remove its override and restore the protected source"]]}.get(action, [])
	if options.is_empty() or _read_bridge.call() == null: return
	if action in ["Transfer", "CopySelected", "CopyStock", "CopyVisible", "CopyCustom", "CopyToLibrary"] and not _view.has_scenario_destination(): return
	if not await _view.request_draft_navigation("reviewing this Library operation"): return
	_context = _view.library_operation_context(action)
	if _context.is_empty(): return
	_generation += 1
	_review.clear()
	_destinations.clear()
	_dialog.set_meta("owner", "library")
	_dialog.begin_options(options, _context.destination, int(_context.get("preferredId", -1)), str(_context.get("label", "")), _view.get_viewport().gui_get_focus_owner())
	_dialog.set_transfer_mode(action in ["Transfer", "CopySelected", "CopyStock", "CopyVisible", "CopyCustom"])
	if membership_only:
		await prepare(_dialog.selected_kind(), -1)
		_dialog.get_node("%Sections").current_tab = 2
	elif dropped:
		await prepare(_dialog.selected_kind(), -1)


func prepare(kind: String, target: Variant) -> void:
	if _dialog.get_meta("owner", "") != "library": return
	_generation += 1
	var generation := _generation
	_input_revision = _dialog.input_revision
	_review.clear()
	var params := _params(kind, target)
	var response: Dictionary = await _operations.run_workflow(_read_bridge.call(), "Review Library operation", _prepare.bind(params, kind.begins_with("transfer"), generation))
	if generation != _generation or not _dialog.visible or _input_revision != _dialog.input_revision: return
	_dialog.receive_review(response, response.get("sections", {}))


func _params(kind: String, target: Variant) -> Dictionary:
	var params := {"action": kind, "expectedRevision": _context.libraryRevision, "label": _dialog.get_node("%Label").text}
	if _context.has("identity"): params["identity"] = _context.identity
	if kind == "create-library": params["preferredScenarioMonsterId"] = target
	if kind == "copy-library": params.merge({"expectedProjectRevision": _context.projectRevision, "setId": _context.setId, "nativeId": _context.nativeId})
	if kind.begins_with("transfer"):
		params = {"expectedRevision": _context.projectRevision, "expectedLibraryRevision": _context.libraryRevision,
			"mode": {"transfer-all": "exact-all-sets", "transfer-all-auto": "exact-all-sets", "transfer-generate": "generate-variants", "transfer-generate-auto": "generate-variants"}.get(kind, "normal"), "replace": kind == "transfer-replace"}
		for key in ["entryIds", "ownership", "query"]:
			if _context.has(key): params[key] = _context[key]
		if kind in ["transfer-normal", "transfer-all", "transfer-generate", "transfer-replace"]: params["targetNativeId"] = target
		elif not _destinations.is_empty(): params["destinationIds"] = _destinations.values().duplicate(true)
	return params


func _prepare(operation: ProvidenceEditorOperation, params: Dictionary, transfer: bool, generation: int) -> Dictionary:
	var sections := {"changes": [], "uses": [], "excluded": [], "comparison": []}
	var prefix := "monster-library.transfer" if transfer else "monster-library.operation"
	var hash := ""
	for section in (["changes", "uses", "allocations", "comparison"] if transfer else ["changes"]):
		var offset := 0
		while true:
			if not _matches() or generation != _generation: return _stale()
			var page_params := params.duplicate(true)
			page_params.merge({"section": section, "offset": offset, "limit": 128})
			var response := await operation.request(prefix + ".prepare", page_params)
			if not response.get("ok", false): return response
			var page: Dictionary = response.result
			if hash.is_empty(): hash = page.reviewHash
			if hash != page.reviewHash or int(page.offset) != offset: return _stale()
			sections["excluded" if section == "allocations" else section].append_array(page.items)
			offset += page.items.size()
			if offset == int(page.total): break
			if page.items.is_empty(): return _stale()
			await _view.get_tree().process_frame
	if transfer:
		_context["entryIds"] = sections.excluded.map(func(row): return row.identity)
		params["entryIds"] = _context.entryIds.duplicate()
		for key in ["ownership", "query"]: params.erase(key); _context.erase(key)
	params["reviewHash"] = hash
	_review = {"method": prefix + ".commit", "params": params, "domain": "project" if transfer else "library"}
	return {"ok": true, "sections": sections}


func _remove_member(identity: String) -> void:
	if _context.get("entryIds", []).is_empty(): return
	_context.entryIds.erase(identity)
	_destinations.erase(identity)
	_review.clear()
	_dialog.remove_transfer_member(identity)


func _change_destination(identity: String, value: Variant) -> void:
	if identity not in _context.get("entryIds", []): return
	_destinations[identity] = {"identity": identity, "targetId": value}
	_review.clear()
	_dialog.invalidate(false)


func commit() -> void:
	if _dialog.get_meta("owner", "") != "library" or _input_revision != _dialog.input_revision: return
	if _review.is_empty() or not _matches(): _dialog.receive_review(_stale()); return
	_dialog.set_committing()
	var response: Dictionary = await _operations.run_workflow(_read_bridge.call(), "Commit Library operation", _commit)
	_dialog.cancel()
	if not response.get("ok", false): _view.show_submission_failure(response)


func _history(action: String) -> void:
	if _read_bridge.call() == null or not await _view.request_draft_navigation("changing Library history"): return
	var direction := "undo" if action == "UndoLibrary" else "redo"
	var response: Dictionary = await _operations.run_workflow(_read_bridge.call(), "Library " + direction, _execute_history.bind(direction), null, true)
	if not response.get("ok", false): _view.show_submission_failure(response)


func _execute_history(operation: ProvidenceEditorOperation, direction: String) -> Dictionary:
	return await _authoring.submit_reviewed(operation, "monster-library." + direction,
		{"expectedRevision": _view.library.revision}, "library", _acknowledge)


func _commit(operation: ProvidenceEditorOperation) -> Dictionary:
	if not _matches(): return _stale()
	return await _authoring.submit_reviewed(operation, _review.method, _review.params, _review.domain, _acknowledge)


func _acknowledge(operation: ProvidenceEditorOperation, response: Dictionary, _recovered: bool) -> void:
	var selection: Dictionary = _view.selection_snapshot()
	var identity: Variant = response.result.get("selectedIdentity")
	if identity != null: selection.merge({"active": "library", "libraryIdentity": identity}, true)
	elif selection.get("active") == "library" and not str(selection.get("libraryIdentity", "")).is_empty():
		var retained := await operation.request("monster-library.open", {"identity": selection.libraryIdentity})
		if not retained.get("ok", false):
			if retained.get("outcomeUnknown", false): _view.show_submission_failure(retained); return
			if not str(retained.get("error", "")).contains("was not found"):
				_view.show_submission_failure(retained); return
			selection.merge({"active": "", "libraryIdentity": ""}, true)
			selection.libraryPage.merge({"selected": [], "entry": "", "anchor": "", "anchorIndex": -1, "active": false}, true)
	var refreshed: Dictionary = await _reload.call(selection, operation)
	if not refreshed.get("ok", false):
		_view.show_submission_failure({"ok": false, "error": "The Library operation committed, but the selected document could not refresh. " + str(refreshed.get("error", "Reload the view."))})


func _matches() -> bool:
	return not _context.is_empty() and _view.authoring_generation() == _context.origin and _view.browser.revision == _context.projectRevision and _view.library.revision == _context.libraryRevision


func _stale() -> Dictionary:
	return {"ok": false, "stale": true, "error": "The Library selection, source project or destination changed. Review the operation again."}
