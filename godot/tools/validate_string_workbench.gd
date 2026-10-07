extends SceneTree

const Drafts = preload("res://src/editor_draft_apply.gd")

class Bridge extends "res://src/native_bridge.gd":
	var revision := 5
	var text := "Original message"
	var fail_method := ""
	var unknown := false
	var calls: Array = []
	func _request(method: String, params: Dictionary) -> Dictionary:
		OS.delay_msec(20)
		calls.append({"method": method, "params": params.duplicate(true)})
		if method == fail_method: return {"ok": false, "outcomeUnknown": unknown, "error": "Controlled rejection"}
		var message := {"identity": "message:7", "nativeId": 7, "text": text}
		match method:
			"text.find-long":
				return {"ok":true,"result":{"total":1,"nativeId":8}}
			"message.list":
				return {"ok": true, "result": {"items": [message], "offset": params.offset, "total": 129}}
			"message.open":
				return {"ok": true, "result": {"message": message, "index": 128, "usedByCount": 1}}
			"text.inspect-draft":
				return {"ok":true,"result":{"feedback":{"valid":true,"encodedBytes":str(params.text).length(),"issues":[]}}}
			"reference.used-by":
				return {"ok": true, "result": {"items": [{"source": "simple-encounter:4", "field": "prompt"}], "total": 1}}
			"text.apply-draft":
				assert(params.expectedRevision == revision and params.draft.nativeId == 7)
				revision += 1
				text = params.draft.text
				return {"ok": true, "result": {"revision": revision}}
		return {"ok": false, "error": "Unexpected test request"}
	func change_epoch() -> void:
		_connection_epoch += 1

var _bridge := Bridge.new()
var _drafts := Drafts.new()
var _view: ProvidenceStringEditor
var _errors: Array = []
var _routes: Array = []
var _operations := ProvidenceEditorOperation.new()
var _pending: Dictionary = {}
var _frames := 0


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var tabs := TabContainer.new()
	_view = preload("res://src/string_editor.tscn").instantiate()
	tabs.add_child(_view)
	root.add_child(tabs)
	root.add_child(_operations)
	process_frame.connect(func(): _frames += 1)
	_drafts.initialize(tabs, _accept, func(): return null)
	_view.attach_session(_bridge, func(): return {"revision": _bridge.revision}, _accept, _drafts.accept, 129, _operations)
	_view.route_requested.connect(func(identity): _routes.append(identity))
	assert(await _view.reload())
	assert(_view.selected_identity() == "message:7" and _view.used_by().size() == 1)
	assert(_view._message_meta.text == "16 characters · 1 use")
	await _check_drafts()
	await _check_failed_refresh()
	await _view.open_native(7)
	assert(_routes == [] and _view.selected_identity() == "message:7")
	assert(_bridge.calls.any(func(call): return call.method == "message.list" and call.params.limit == 128))
	await _check_borrowed_refresh()
	await _check_typing_during_reads()
	await _check_typing_during_apply()
	await _check_stale_long_search()
	await _check_unknown_and_session_change()
	_view.teardown()
	assert(_view.selected_identity().is_empty() and not _view.has_unapplied_changes())
	assert(_view.total_messages() == 0 and not (await _view.reload()))
	_bridge.stop()
	_operations.free()
	tabs.free()
	print("PROVIDENCE_STRING_WORKBENCH_OK bounded-pages owned-drafts rejected-commit failed-refresh borrowed-history responsive single-flight late-draft unknown epoch teardown")
	quit()


func _check_drafts() -> void:
	_view._message_editor.text = "Unapplied draft"
	assert(_drafts.has_draft())
	var count := _bridge.calls.size()
	_view.activate()
	assert(_bridge.calls.size() == count and _view._message_editor.text == "Unapplied draft")
	_bridge.fail_method = "text.apply-draft"
	assert(not (await _drafts.commit()).ok and _drafts.has_draft())
	assert(_bridge.revision == 5 and _view._message_editor.text == "Unapplied draft")
	_bridge.fail_method = ""
	assert((await _drafts.commit()).ok and not _drafts.has_draft())
	assert(_bridge.revision == 6 and _bridge.text == "Unapplied draft")
	_view._message_editor.text = "Discard this"
	_drafts.discard()
	assert(_view._message_editor.text == "Unapplied draft" and not _drafts.has_draft())


func _check_failed_refresh() -> void:
	_bridge.fail_method = "message.list"
	assert(not (await _view.reload()))
	assert(_view.selected_identity().is_empty() and _view._message_editor.text.is_empty())
	assert(_view.get_node("%NewString").disabled and _view.get_node("%ImportText").disabled,"Failed catalog falsely enabled allocation")
	_bridge.fail_method = "reference.used-by"
	assert(not (await _view.reload()))
	assert(_errors.size() == 2)
	_bridge.fail_method = ""
	assert(await _view.reload())
	assert(not _view.get_node("%NewString").disabled,"Successful retry did not restore authoring")


func _accept(response: Dictionary) -> bool:
	if not response.get("ok", false): _errors.append(response.get("error", ""))
	return response.get("ok", false)


func _check_borrowed_refresh() -> void:
	var changes := ProvidenceDocumentChanges.new()
	changes.register_document("text.messages", ["message"])
	var owner := preload("res://src/workbench_controller.gd").new("text.messages", _view, _view.refresh_workbench)
	assert(_operations.begin(_bridge, "Undo"))
	var before := _frames
	_view._message_editor.set_caret_column(4)
	var response: Dictionary = await owner.activate(changes, _operations)
	assert(response.ok and not changes.needs_refresh("text.messages"))
	assert(_operations.busy and _bridge.operation_busy() and _frames > before + 1)
	assert(_view._message_editor.get_caret_column() == 4 and _view.selected_identity() == "message:7")
	_operations.finish(response)
	_view._message_editor.text = "Keep my draft"
	changes.invalidate({"changedEntities": ["message:7"]}, "project:1")
	var count := _bridge.calls.size()
	response = await owner.activate(changes)
	assert(response.get("draftKept", false) and changes.needs_refresh("text.messages"))
	assert(_bridge.calls.size() == count)
	_view.discard_draft()


func _check_typing_during_reads() -> void:
	var before := _frames
	call("_start_refresh")
	assert(_operations.busy)
	assert(not (await _view.reload()))
	_view._message_editor.text = "Typed during loading"
	await _operations.completed
	await process_frame
	assert(_pending.get("draftKept", false) and _frames > before + 1)
	assert(_view.has_unapplied_changes() and _view._message_editor.text == "Typed during loading")
	_view.discard_draft()
	call("_start_refresh")
	_view._message_search.text = "New query"
	await _operations.completed
	await process_frame
	assert(_pending.get("draftKept", false) and _view._message_search.text == "New query")
	_view._message_search.text = ""
	assert(await _view.reload())


func _start_refresh() -> void:
	_pending = await _view.refresh_workbench()


func _check_typing_during_apply() -> void:
	_view._message_editor.text = "Submitted change"
	var revision := _bridge.revision
	call("_start_apply")
	assert(_operations.busy)
	_view._message_editor.text = "New typing after submission"
	await _operations.completed
	await process_frame
	assert(_pending.get("partlyApplied", false) and _bridge.revision == revision + 1)
	assert(_bridge.text == "Submitted change" and _view._message_editor.text == "New typing after submission")
	assert(_view.has_unapplied_changes())
	_view.discard_draft()
	assert(_view._message_editor.text == "Submitted change")


func _start_apply() -> void:
	_pending = await _drafts.commit()


func _check_unknown_and_session_change() -> void:
	_bridge.fail_method = "text.apply-draft"
	_bridge.unknown = true
	_view._message_editor.text = "Unconfirmed change"
	assert(not (await _drafts.commit()).ok and _operations.requires_reopen)
	var count := _bridge.calls.size()
	assert(not (await _drafts.commit()).ok and _bridge.calls.size() == count)
	assert(_view._message_editor.text == "Unconfirmed change")
	assert(not _view._message_editor.editable,"Unknown write left the submitted String editable")
	assert("reopen" in _view.get_node("%DocumentStatus").text.to_lower(),"Known failure text overwrote uncertain recovery instructions")
	_bridge.stop()
	_operations.reset_session()
	_bridge.fail_method = ""
	_bridge.unknown = false
	_view.attach_session(_bridge, func(): return {"revision":_bridge.revision},_accept,_drafts.accept,129,_operations)
	assert(await _view.reload())
	call("_start_refresh")
	_bridge.change_epoch()
	await _operations.completed
	await process_frame
	assert(_pending.get("connectionChanged", false) and _operations.requires_reopen)
	assert(_view._message_editor.text == "Submitted change")
	_bridge.stop()
	_operations.reset_session()
	call("_start_refresh")
	_view.teardown()
	await _operations.completed
	await process_frame
	assert(_pending.get("connectionChanged", false) and _view.selected_identity().is_empty())


func _check_stale_long_search() -> void:
	_view._navigation.find_long.call_deferred()
	await process_frame
	_view.begin_new(8,"Local unsaved")
	await create_timer(0.1).timeout
	assert(_view.selected_identity()=="message:8" and _view.is_new(),"Delayed long search replaced a newer local draft")
	assert(_view._message_list.get_selected_items().is_empty(),"New draft retained an unrelated saved row")
	assert(_view.get_node("%AllCallers").disabled,"Unsaved identity exposed graph navigation")
	_view.discard_draft()
	await create_timer(0.2).timeout
	assert(_view.selected_identity()=="message:7","Discard did not restore the originating String")
