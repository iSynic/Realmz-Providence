extends SceneTree

var _bridge: ProvidenceNativeBridge
var _preview: ProvidenceRebuiltPreviewController
var _ready: Dictionary = {}
var _failure: Dictionary = {}
var _output := ""


func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 2: quit(1); return
	_output = args[1]
	DirAccess.make_dir_recursive_absolute(_output)
	ProjectSettings.set_setting("providence/rebuilt_preview_headless", true)
	_bridge = ProvidenceNativeBridge.new(_output.path_join("settings.cfg"))
	var opened := _bridge.start_project(args[0])
	if not opened.get("ok", false): _finish(false, opened); return
	var document: Dictionary = _bridge.request("item.open", {"identity": "classic.item.800"})
	if not document.get("ok", false): _finish(false, document); return
	var revision := int(document.result.revision)
	_preview = ProvidenceRebuiltPreviewController.new(); root.add_child(_preview)
	_preview.preview_ready.connect(func(result: Dictionary): _ready = result)
	_preview.preview_failed.connect(func(error: Dictionary): _failure = error)
	var started := await _preview.start_preview(_bridge, {"kind": "treasure", "id": 22}, revision)
	if not started.get("ok", false): _finish(false, started); return
	var deadline := Time.get_ticks_msec() + 45000
	while _ready.is_empty() and _failure.is_empty() and Time.get_ticks_msec() < deadline:
		await process_frame
	var pid: int = _preview._process_id
	var valid: bool = _ready.get("status") == "ready" and _ready.get("targetKind") == "treasure" and int(_ready.get("targetId", -1)) == 22
	valid = valid and _ready.get("pendingInteractionKind") == "treasure_distribution" and pid > 0 and pid != OS.get_process_id() and OS.is_process_running(pid)
	var current: Dictionary = _bridge.request("item.open", {"identity": "classic.item.800"})
	valid = valid and current.get("ok", false) and int(current.result.revision) == revision and current.result.item == document.result.item
	_finish(valid, {"ready": _ready, "failure": _failure, "runtimeProcessId": pid, "editorProcessId": OS.get_process_id(),
		"item": document.result.item, "projectRevisionUnchanged": valid,
		"adapter": _bridge.request("build.identity").get("result", {}),
		"scope": "Real separate Rebuilt process reaches Treasure 22 with the edited Bywater item catalog; no complete treasure resolution or item-ability gameplay claim."})


func _finish(passed: bool, details: Dictionary) -> void:
	if _preview != null: _preview.cancel_preview("Bounded Items runtime check finished."); _preview.queue_free()
	if _bridge != null: _bridge.stop()
	var file := FileAccess.open(_output.path_join("receipt.json"), FileAccess.WRITE)
	file.store_string(JSON.stringify({"status": "passed" if passed else "failed", "details": details,
		"retention": "One bounded receipt/log; the preview controller removes its path-owned temporary package and request/result files."}, "\t")); file.close()
	if passed: print("PROVIDENCE_ITEM_REBUILT_PREVIEW_OK separate-process Treasure-22 treasure_distribution unchanged-editor edited-item-catalog")
	else: push_error("PROVIDENCE_ITEM_REBUILT_PREVIEW_FAILED: " + str(details))
	quit(0 if passed else 1)
