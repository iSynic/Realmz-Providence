extends SceneTree

class Bridge extends "res://src/native_bridge.gd":
	var revision := 0
	var calls: Array = []
	var failure := ""
	var unknown := false
	var fail_refresh := false
	var source := {"nativePath": "Original Marker", "blob": "fixture", "byteLength": 319}
	var projection := {"revision": 0, "sourceSelectionRequired": true, "decodingAvailable": false,
		"segment1": "", "segment2": "", "runtimeTitle": "Renamed display", "sourceCandidates": []}
	func _request(method: String, params: Dictionary) -> Dictionary:
		OS.delay_msec(35); calls.append(method)
		if method == failure or method == "scenario-security.open" and fail_refresh:
			return {"ok": false, "outcomeUnknown": unknown, "error": "Controlled Scenario failure"}
		match method:
			"scenario-security.open": return {"ok": true, "result": projection.duplicate(true)}
			"scenario-security.source-list": return {"ok": true, "result": {"revision": revision, "items": [source], "total": 1, "offset": 0, "limit": 64}}
			"scenario-security.source-preview":
				var preview := projection.duplicate(true)
				preview.merge({"sourceSelectionRequired":false,"decodingAvailable":true,"segment1":"original first","segment2":"original second"},true)
				return {"ok":true,"result":preview}
			"scenario-security.validate": return {"ok":true,"result":{"valid":true}}
			"scenario-security.update":
				assert(params.expectedRevision == revision)
				revision += 1
				projection.merge({"revision":revision,"sourceSelectionRequired":false,"decodingAvailable":true,
					"segment1":params.segment1,"segment2":params.segment2},true)
				return {"ok":true,"result":{"revision":revision}}
			_: return {"ok":false,"error":"Unexpected method " + method}

var _bridge := Bridge.new()
var _operations := ProvidenceEditorOperation.new()
var _view: Control
var _receipts: Array = []


func _initialize() -> void: call_deferred("_run")


func _run() -> void:
	create_timer(25).timeout.connect(func(): push_error("Scenario controller timed out"); quit(1))
	root.add_child(_operations)
	_view = load("res://src/scenario_security_evidence.tscn").instantiate(); root.add_child(_view)
	_view.size = Vector2(1400,780)
	_view.configure_operations(_operations, func(): return _bridge)
	assert((await _view.refresh_workbench()).ok)
	await _source_selection()
	await _failures()
	_view.teardown_session()
	assert(_view.current_selection().is_empty())
	_view.free(); _operations.free(); _bridge.stop()
	print("PROVIDENCE_SCENARIO_AUTHORING_CONTROLLER_OK source-local cancel-focus stale-destination atomic known-failure saved-refresh-lock unknown-no-retry teardown")
	quit()


func _source_selection() -> void:
	var button: Button = _view.find_child("ChooseOriginalSource",true,false)
	var picker: Window = _view.get_node("StartupSourcePicker")
	var before: Dictionary = _view.draft_token()
	button.grab_focus(); picker.begin(_view,button)
	await _wait_idle()
	assert(picker.get_node("%SourceChoices").item_count == 1)
	assert(picker.get_node("%SourcePrevious").disabled and picker.get_node("%SourceNext").disabled)
	picker.get_node("%SourceChoices").select(0); picker._preview(0)
	await _wait_idle()
	assert(not picker.get_ok_button().disabled)
	assert(_view.draft_token() == before and not _view.has_unapplied_changes())
	picker.cancel(); await process_frame
	assert(button.has_focus() and _view.draft_token() == before)
	picker.begin(_view,button); await _wait_idle(); picker._preview(0)
	await _wait_idle(); picker.hide(); picker.confirmed.emit()
	assert(_view.draft_params().startupSource == _bridge.source and _view.has_unapplied_changes())
	assert(_bridge.calls.count("scenario-security.update") == 0)
	_view.find_child("UnlockEditing",true,false).pressed.emit()
	_view.text_field("CodeSegment1").text = "Typed first"; _view.draft_changed()
	var typed: Dictionary = _view.draft_token()
	picker.begin(_view,button); await _wait_idle(); picker._preview(0)
	await _wait_idle(); picker.hide(); picker.confirmed.emit()
	assert(_view.draft_token() == typed)
	_view.accept_original_source({"nativePath":"Other Marker","blob":"other","byteLength":319}, {"decodingAvailable":true,"segment1":"other first","segment2":"other second"})
	assert(_view.text_field("CodeSegment1").text == "Typed first")
	_view.discard_draft(); assert(_view.draft_token() == before)
	picker.begin(_view,button); await _wait_idle(); picker._preview(0)
	_view.clear_selection(); await _wait_idle()
	assert(not picker.visible and _view.current_selection().is_empty())
	assert((await _view.refresh_workbench()).ok)
	picker.begin(_view,button); await _wait_idle(); picker._preview(0)
	await _wait_idle(); picker.hide(); picker.confirmed.emit()
	await _view.controller.validate()
	assert(_view.can_commit())
	assert((await _view.controller.apply()).ok and not _view.has_unapplied_changes())
	assert(_bridge.calls.count("scenario-security.update") == 1)


func _failures() -> void:
	_view.find_child("UnlockEditing",true,false).pressed.emit()
	_view.text_field("CodeSegment1").text = "Retained draft"; _view.draft_changed()
	await _view.controller.validate()
	_bridge.failure = "scenario-security.update"
	await _view.controller.apply()
	assert(_bridge.revision == 1 and _view.has_unapplied_changes() and _view.can_edit())
	_bridge.failure = ""; _bridge.fail_refresh = true
	await _view.controller.apply()
	assert(_bridge.revision == 2 and not _view.can_edit())
	var writes := _bridge.calls.count("scenario-security.update")
	await _view.controller.apply(); assert(_bridge.calls.count("scenario-security.update") == writes)
	_bridge.fail_refresh = false
	await _view.controller.resolve_original_result()
	assert(_view.can_edit() and not _view.has_unapplied_changes())
	_view.find_child("UnlockEditing",true,false).pressed.emit()
	_view.text_field("CodeSegment2").text = "Uncertain draft"; _view.draft_changed()
	await _view.controller.validate()
	_bridge.failure = "scenario-security.update"; _bridge.unknown = true
	await _view.controller.apply()
	assert(_operations.requires_reopen and _view.has_unapplied_changes() and not _view.can_edit())
	writes = _bridge.calls.count("scenario-security.update")
	await _view.controller.apply(); assert(_bridge.calls.count("scenario-security.update") == writes)


func _wait_idle() -> void:
	for _frame in 180:
		await process_frame
		if not _operations.busy: break
	await process_frame
