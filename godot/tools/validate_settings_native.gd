extends SceneTree

const Controller = preload("res://src/script_record_controller.gd")
const Bridge = preload("res://src/native_bridge.gd")

var _bridge: ProvidenceNativeBridge
var _revision := 0
var _operation: ProvidenceEditorOperation
var _view: Control
var _controller: RefCounted
var _decision := "cancel"
var _review_count := 0
var _dialog: ProvidenceSettingsImpactDialog


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	OS.set_environment("PROVIDENCE_PROJECT_PATH", "")
	root.gui_embed_subwindows = true
	root.size = Vector2i(1600, 900)
	process_frame.connect(_answer_review)
	for family in ["action-point", "extra-action-point"]:
		for decision in ["shared", "independent", "cancel"]:
			await _exercise(family, decision)
	print("PROVIDENCE_SETTINGS_NATIVE_OK ap xap native-adapter shared independent cancel exact-peers unchanged-apply")
	quit()


func _setup_fixture() -> void:
	_bridge = Bridge.new()
	var started := _bridge.start_demo()
	assert(started.get("ok", false), str(started))
	_revision = int(started.result.revision)
	_mutate("extra-code.upsert", {"row": {"nativeId": 23456, "values": [1, 0, 0, 47, 12]}})
	for family in ["action-point", "extra-action-point"]:
		var key := "actionPoint" if family == "action-point" else "extraActionPoint"
		var record: Dictionary = _open(family)[key]
		record.actions = [{"slot": 1, "rawOpcode": 3 if family == "action-point" else 2, "targetNativeId": 23456}]
		_mutate(family + ".update", {key: record})


func _open(family: String) -> Dictionary:
	var identity := "action-point:land:0:17" if family == "action-point" else "extra-action-point:40"
	var response := _bridge.request(family + ".open", {"identity": identity})
	assert(response.get("ok", false), str(response))
	return response.result


func _mutate(method: String, params: Dictionary) -> void:
	params.expectedRevision = _revision
	var response := _bridge.request(method, params)
	assert(response.get("ok", false), str(response))
	_revision = int(response.result.get("change", response.result).revision)


func _setup_view(family: String) -> void:
	_operation = ProvidenceEditorOperation.new()
	root.add_child(_operation)
	_view = load("res://src/%s_editor.tscn" % family.replace("-", "_")).instantiate()
	root.add_child(_view)
	_controller = Controller.new()
	_controller.initialize(_view, {"record": "actionPoint" if family == "action-point" else "extraActionPoint",
		"commitKey": "draft", "update": family + ".apply-draft", "list": family + ".list", "open": family + ".open", "limit": 128},
		_operation, func(): return {"revision": _revision}, func(_response): pass, func(_response): pass)
	_controller.projection_applied.connect(func(result): _revision = int(result.revision))
	_controller.attach_session(_bridge)
	var catalog := _bridge.request("action-definition.list", {"cursor": "0", "limit": 128})
	assert(catalog.get("ok", false))
	_view.set_action_catalog(catalog.result)
	_view.action_form_describe_requested.connect(_describe)
	if family == "action-point": _view.set_maps([{"identity": "land:0", "name": "Land"}])
	_view.set_document(_open(family))
	_dialog = _view.find_child("SemanticSharedImpactDialog", true, false)


func _describe(query: Dictionary, request_id: int, _slot: int) -> void:
	# The production workspace queues descriptions during an operation; this test
	# only needs the selected editable form before committing the record.
	if _operation.busy: return
	var response := _bridge.request("action-form.describe", {"query": query})
	assert(response.get("ok", false), str(response))
	_view.set_action_form_description(response.result, request_id)


func _exercise(family: String, decision: String) -> void:
	_setup_fixture()
	_setup_view(family)
	_decision = decision
	_review_count = 0
	var steps := _view.get_node("%SemanticActionSteps") as ProvidenceActionStepWorkbench
	assert(steps.focus_slot(1))
	var unchanged: Dictionary = await _controller.commit(_view.read_state().draft)
	assert(unchanged.get("ok", false), str(unchanged))
	assert(_review_count == 0 and _open(family).steps[0].targetNativeId == 23456)
	assert(steps.focus_slot(1))
	var field := "promptA" if family == "action-point" else "message"
	# Reload invalidates the form projection; opening outside the operation supplies it again.
	_view.set_document(_open(family))
	assert(steps.focus_slot(1))
	assert(steps._field_controls[field].control is Button)
	steps._field_renderer.accept_target(field, 103)
	assert(_view.has_unapplied_changes())
	var before := _revision
	var response: Dictionary = await _controller.commit(_view.read_state().draft)
	assert(_review_count == 1)
	if decision == "cancel":
		assert(not response.ok and response.cancelled and _revision == before and _view.has_unapplied_changes())
	else:
		assert(response.get("ok", false), str(response))
		assert(not response.has("viewRefreshError"), str(response))
		assert(_revision == before + 1 and not _view.has_unapplied_changes())
	_check_saved_rows(family, decision)
	_controller.dispose()
	_view.action_form_describe_requested.disconnect(_describe)
	_bridge.stop()
	_dialog = null
	_view.queue_free()
	_operation.queue_free()
	await process_frame


func _answer_review() -> void:
	if _dialog == null or not _dialog.visible: return
	_review_count += 1
	var actions := _dialog.get_node("%ImpactActions")
	assert(actions.get_child_count() == 1)
	assert("103" in actions.get_child(0).text and not "23456" in actions.get_child(0).text)
	match _decision:
		"cancel": _dialog.canceled.emit()
		"shared": _dialog.confirmed.emit()
		"independent": _dialog.custom_action.emit("independent")


func _check_saved_rows(family: String, decision: String) -> void:
	var selected: Dictionary = _open(family).steps[0]
	var other := "extra-action-point" if family == "action-point" else "action-point"
	var peer: Dictionary = _open(other).steps[0]
	assert(peer.targetNativeId == 23456)
	assert(int(peer.primarySettings.values[3]) == (103 if decision == "shared" else 47))
	assert(int(selected.primarySettings.values[3]) == (47 if decision == "cancel" else 103))
	assert((int(selected.targetNativeId) != 23456) == (decision == "independent"))
