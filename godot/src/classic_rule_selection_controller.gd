extends RefCounted

var _owner: ProvidenceScenarioSectionEditor
var _dialog: Window
var _operations: ProvidenceEditorOperation
var _read_bridge: Callable
var _accept: Callable
var _saved: Dictionary = {}
var _generation := 0
var _preview_generation := 0
var _pending_preview: Dictionary = {}
var _previewing := false
var _writing := false
var _opening := false
var _receipt_epoch := -1
var _receipt_bridge_id := 0


func initialize(owner: ProvidenceScenarioSectionEditor, dialog: Window, operations: ProvidenceEditorOperation, read_bridge: Callable) -> void:
	_owner = owner
	_dialog = dialog
	_operations = operations
	_read_bridge = read_bridge
	if _dialog.choice_changed.is_connected(preview): return
	_dialog.choice_changed.connect(preview)
	_dialog.apply_requested.connect(apply)
	_dialog.reload_requested.connect(reload_saved)
	_dialog.dismissed.connect(func(): _preview_generation += 1; _pending_preview.clear())


func configure_authoring(accept: Callable) -> void:
	_accept = accept


func teardown() -> void:
	_generation += 1
	_preview_generation += 1
	_saved.clear()
	_pending_preview.clear()
	if is_instance_valid(_dialog):
		_dialog.reset(has_receipt())


func has_receipt() -> bool:
	if not is_instance_valid(_dialog) or not _dialog.has_receipt(): return false
	var bridge = _read_bridge.call() if _read_bridge.is_valid() else null
	if bridge != null and bridge.get_instance_id() == _receipt_bridge_id and bridge.connection_epoch() == _receipt_epoch:
		return true
	_dialog.reset()
	return false


func open() -> void:
	if _opening or _writing: return
	has_receipt()
	var focus := _owner.find_child("ClassicRuleSource", true, false) as Control
	if _dialog.reopen_receipt(focus): return
	if not _owner.can_edit() or _owner.has_unapplied_changes(): return
	_opening = true
	var generation := _generation
	var response := await _request("classic-rule-selection.open", {}, "Read Classic rule choice")
	_opening = false
	if generation != _generation: return
	if not response.get("ok", false): _owner.status(str(response.get("error", "Classic rule choice unavailable."))); return
	if not _owner.can_edit() or _owner.has_unapplied_changes() or int(response.result.revision) != _owner.applied_revision(): return
	_saved = response.result.duplicate(true)
	_dialog.begin(_saved, focus)


func _guards() -> Dictionary:
	return {"expectedRevision": int(_saved.get("revision", -1)), "expectedProjectId": _saved.get("projectId"),
		"expectedPreviousIdentity": _saved.get("contextIdentity"), "expectedSourceSetSha256": _saved.get("sourceSetSha256")}


func preview() -> void:
	if _saved.is_empty() or _writing or not _dialog.visible: return
	_preview_generation += 1
	if not _dialog.choice_is_valid():
		_pending_preview.clear()
		return
	_pending_preview = {"slot": _dialog.choice(), "generation": _preview_generation, "session": _generation}
	if _previewing: return
	_previewing = true
	while not _pending_preview.is_empty():
		var pending := _pending_preview.duplicate(true)
		_pending_preview.clear()
		var params := _guards()
		params["nativeMenuSelection"] = pending.slot
		var bridge = _read_bridge.call()
		var support := ProvidenceRebuiltPackageContext.resolve(bridge.current_application_library_root())
		if support.get("ok", false): params.merge(support.parameters)
		var response := await _request("classic-rule-selection.preview", params, "Preview Classic rules")
		if pending.session != _generation: break
		if response.get("busy", false):
			if _pending_preview.is_empty(): _pending_preview = pending
			await _owner.get_tree().process_frame
			continue
		if pending.generation == _preview_generation and _dialog.visible: _dialog.present_preview(response)
	_previewing = false


func apply() -> void:
	if _writing or _saved.is_empty() or not _dialog.can_apply(): return
	var params := _guards()
	params["nativeMenuSelection"] = _dialog.choice()
	params["operationId"] = Crypto.new().generate_random_bytes(32).hex_encode()
	var method := "classic-rule-selection.clear" if params.nativeMenuSelection == null else "classic-rule-selection.set"
	_writing = true
	_preview_generation += 1
	_pending_preview.clear()
	var generation := _generation
	_dialog.writing(params)
	_owner.set_interaction(true)
	var response := await _request(method, params, "Save Classic rule choice")
	_writing = false
	if generation != _generation: return
	_owner.set_interaction(false)
	if _accept.is_valid(): _accept.call(response)
	if not response.get("ok", false):
		if response.get("outcomeUnknown", false):
			var bridge = _read_bridge.call()
			_receipt_epoch = bridge.connection_epoch()
			_receipt_bridge_id = bridge.get_instance_id()
		_dialog.present_failure(response)
		return
	_owner.projection_applied.emit(response.result)
	_dialog.reset()
	var project_id: Variant = _saved.get("projectId")
	var refreshed := await _owner.controller.reload()
	if not is_instance_valid(_owner) or not _owner.visible: return
	var current := await _request("classic-rule-selection.open", {}, "Confirm Classic rule destination")
	if not current.get("ok", false) or current.result.get("projectId") != project_id: return
	if not refreshed.get("ok", false): _owner.status("Classic rule choice saved. Refresh Startup before editing it.")
	var focus := _owner.find_child("ClassicRuleSource", true, false) as Control
	if is_instance_valid(focus): focus.grab_focus()


func reload_saved() -> void:
	if _writing: return
	var generation := _generation
	var response := await _request("classic-rule-selection.open", {}, "Reload Classic rule choice")
	if generation != _generation or not _dialog.visible: return
	if not response.get("ok", false): _dialog.present_failure(response); return
	_saved = response.result.duplicate(true)
	_dialog.begin(_saved, _owner.find_child("ClassicRuleSource", true, false), true)


func _request(method: String, params: Dictionary, label: String) -> Dictionary:
	var bridge = _read_bridge.call()
	if bridge == null: return {"ok": false, "error": "Open a project first."}
	return await _operations.run_workflow(bridge, label, _dispatch.bind(method, params, _generation))


func _dispatch(operation: ProvidenceEditorOperation, method: String, params: Dictionary, generation: int) -> Dictionary:
	if generation != _generation: return {"ok": false, "stale": true}
	var response := await operation.request(method, params)
	return response if generation == _generation else {"ok": false, "stale": true}
