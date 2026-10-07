extends SceneTree

var _bridge: ProvidenceNativeBridge
var _operations: ProvidenceEditorOperation
var _view: ProvidenceSpellEditor
var _controller := preload("res://src/spell_workbench_controller.gd").new()
var _revision := 0
var _started := 0
var _feedback := -1.0
var _samples: Array[Dictionary] = []


func _initialize() -> void: _run.call_deferred()


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 1: quit(1); return
	root.size = Vector2i(1600, 900); root.gui_embed_subwindows = true
	_bridge = ProvidenceNativeBridge.new(args[0].path_join("settings.cfg"))
	var opened := _bridge.start_project(args[0])
	if not opened.get("ok", false): push_error(str(opened)); quit(1); return
	_revision = int(_bridge.request("session.describe").result.revision)
	_operations = ProvidenceEditorOperation.new(); root.add_child(_operations)
	_view = load("res://src/spell_editor.tscn").instantiate(); root.add_child(_view); _view.size = Vector2(1600, 900)
	_controller.initialize(_view, _operations, func(): return {"revision": _revision}, func(): return _bridge, func(response): return response.get("ok", false))
	_controller.projection_applied.connect(func(change): _revision = int(change.revision))
	_operations.busy_changed.connect(func(busy, label):
		if busy and label == "Apply Spell": _feedback = float(Time.get_ticks_usec() - _started) / 1000.0)
	_controller.attach_session(_bridge)
	await _controller.open_spell("classic.spell.5101"); await _idle()
	for index in 30:
		_view.form.control_for("cost").value = 20 + index
		_feedback = -1; _started = Time.get_ticks_usec()
		var result := await _view.commit_selected()
		if not result.get("ok", false): push_error(str(result)); quit(1); return
		var metrics := _operations.last_metrics.duplicate(true)
		_samples.append({"inputToAcknowledgedMs": float(Time.get_ticks_usec() - _started) / 1000.0, "busyFeedbackMs": _feedback, "maxFrameGapMs": metrics.maxFrameGapMs})
		await _idle()
	var values := _samples.map(func(sample): return sample.inputToAcknowledgedMs)
	values.sort()
	var median: float = (values[14] + values[15]) / 2.0
	var p95: float = values[28]
	var passed := median <= 500 and p95 <= 1000 and _samples.all(func(sample): return sample.busyFeedbackMs >= 0 and sample.busyFeedbackMs <= 100 and sample.maxFrameGapMs <= 100)
	print("PROVIDENCE_SPELL_PROFILE " + JSON.stringify({"scenario": "Disposable City of Bywater import", "operations": 30, "samples": _samples, "medianMs": median, "p95Ms": p95, "passed": passed, "budgetSource": "docs/architecture/maintainability-acceptance.md", "build": _bridge.request("build.identity").result}))
	_controller.dispose(); _bridge.stop(); _view.queue_free(); _operations.queue_free(); await process_frame
	quit(0 if passed else 1)


func _idle() -> void:
	var stable := 0
	for frame in 900:
		await process_frame
		stable = stable + 1 if not _operations.busy and not _bridge.operation_busy() else 0
		if stable >= 12: return
	push_error("Spell profile exceeded its bounded wait"); quit(1)
