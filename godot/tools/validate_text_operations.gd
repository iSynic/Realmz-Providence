extends SceneTree

class Bridge extends "res://src/native_bridge.gd":
	var editing := preload("res://tools/validate_text_resource_dialog.gd").TextBridge.new()
	var creating := preload("res://tools/validate_new_text_dialog.gd").DraftBridge.new()
	var unknown := false
	func is_project_backed() -> bool: return true
	func _request(method: String, params: Dictionary) -> Dictionary:
		OS.delay_msec(25)
		if method in ["text-resource.open", "text-resource.apply-styles", "text-resource.inspect-styles"]:
			if unknown and method == "text-resource.apply-styles":
				editing.requests.append({"method": method, "params": params})
				return {"ok": false, "outcomeUnknown": true, "error": "Controlled missing response"}
			return editing.request(method, params)
		return creating.request(method, params)

var _bridge := Bridge.new()
var _operations := ProvidenceEditorOperation.new()
var _edit: Window
var _new: Window
var _frames := 0
var _applied: Array = []
var _created: Array = []


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	root.gui_embed_subwindows = true
	root.size=Vector2i(1600,900)
	root.add_child(_operations)
	_edit = load("res://src/text_resource_dialog.tscn").instantiate()
	_new = load("res://src/new_text_dialog.tscn").instantiate()
	for dialog in [_edit, _new]:
		root.add_child(dialog)
		dialog.configure_operations(_operations)
	_edit.applied.connect(func(projection, identity): _applied.append([projection, identity]))
	_new.created.connect(func(projection, identity): _created.append([projection, identity]))
	process_frame.connect(func(): _frames += 1)
	await _check_edit()
	await _check_creation()
	await _check_unknown_and_teardown()
	_bridge.stop()
	_edit.free()
	_new.free()
	_operations.free()
	print("PROVIDENCE_TEXT_OPERATIONS_OK responsive-worker single-apply exact-revision draft-retention latest-validation create unknown-no-retry teardown")
	quit()


func _check_edit() -> void:
	_edit.open_text(_bridge, "text:-202")
	assert(_operations.busy and not _edit.visible)
	await _idle()
	assert(_edit.visible)
	var draft: TextEdit = _edit.editor
	draft.text = "Changed text\n".repeat(80)
	_edit.editor.text_changed.emit()
	await _edit.get_node("%StyleWorkbench")._inspect()
	_edit._draft_changed()
	draft.select(2, 0, 2, 7)
	var retained := draft.text
	_bridge.editing.failure = "Controlled durable checkpoint rejection"
	var frames := _frames
	_edit.apply_text()
	assert(_operations.busy and not draft.editable)
	_edit.apply_text()
	_edit.request_cancel()
	assert(not _edit.get_node("%Discard").visible)
	await _idle()
	assert(_frames - frames >= 2 and _bridge.editing.requests.filter(func(call): return call.method=="text-resource.apply-styles").size() == 1)
	assert(draft.text == retained and draft.get_selected_text() == "Changed" and draft.editable)
	assert(_applied.is_empty() and not _edit.get_node("%Apply").disabled)
	_bridge.editing.failure = ""
	await _edit.apply_text()
	assert(_applied.size() == 1 and not _edit.visible and _bridge.editing.revision == 8)
	assert(_bridge.editing.requests[-1].params.expectedRevision == 7)


func _check_creation() -> void:
	assert((await _new.open_new(_bridge)).ok)
	_new.get_node("%Number").text = "203"
	_new.editor.text = "Retained creation draft"
	_new.draft_changed()
	_new.validate_now()
	assert(_operations.busy)
	_new.get_node("%Number").text = "204"
	_new.draft_changed()
	await _idle()
	await _new.validate_now()
	assert(_new.get_node("%Availability").text.contains("204"))
	assert(_bridge.creating.calls[-1].params.resourceId == 204)
	_new.create_text()
	_new.create_text()
	await process_frame
	await _idle()
	assert(_created.size() == 1 and _created[0][1] == "text:204")
	var mutations: Array = _bridge.creating.calls.filter(func(call): return call.method == "text-resource.create")
	assert(mutations.size() == 1 and mutations[0].params.expectedRevision == 7)
	assert(mutations[0].params.text == "Retained creation draft")


func _check_unknown_and_teardown() -> void:
	assert((await _edit.open_text(_bridge, "text:-202")).ok)
	_edit.editor.text = "Unknown outcome draft"
	_edit.editor.text_changed.emit()
	await _edit.get_node("%StyleWorkbench")._inspect()
	_edit._draft_changed()
	_bridge.unknown = true
	await _edit.apply_text()
	assert(_edit.visible and _operations.requires_reopen and _edit.get_node("%Apply").disabled)
	assert(_edit.get_node("%Outcome").text.contains("could not be confirmed"))
	var count := _bridge.editing.requests.size()
	await _edit.apply_text()
	await _edit.review_current()
	assert(_bridge.editing.requests.size() == count)
	_edit.discard_draft()
	_bridge.stop()
	_operations.reset_session()
	_bridge.unknown = false
	_edit.open_text(_bridge, "text:-202")
	assert(_operations.busy)
	_edit.discard_draft()
	await _idle()
	assert(not _edit.visible and _applied.size() == 1)
	_new.open_new(_bridge)
	assert(_operations.busy)
	_new.discard_draft()
	await _idle()
	assert(not _new.visible and _created.size() == 1)


func _idle() -> void:
	while _operations.busy: await process_frame
	await process_frame
