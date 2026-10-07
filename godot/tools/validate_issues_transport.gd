extends SceneTree

class SlowBridge extends "res://src/native_bridge.gd":
	var server = preload("res://tools/validate_issues_async.gd").DelayedBridge.new()
	var synchronous_calls := 0
	func supports_validation_jobs() -> bool: return true
	func request(_method: String, _params: Dictionary = {}) -> Dictionary:
		synchronous_calls += 1
		return {"ok": false, "error": "Unexpected main-thread transport"}
	func _request(method: String, params: Dictionary) -> Dictionary:
		OS.delay_msec(80)
		return server.request(method, params)

var _operations = preload("res://src/editor_operation.gd").new()
var _bridge := SlowBridge.new()
var _view: Control
var _failed := false
var _frames := 0


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	root.add_child(_operations)
	process_frame.connect(func(): _frames += 1)
	_view = load("res://src/issues_workbench.tscn").instantiate()
	root.add_child(_view)
	_view.state.configure_operations(_operations)
	_bridge.server.released = true
	_view.attach(_bridge, 18)
	await _coalesced_filters()
	await _cancel_before_ticket()
	await _cancel_poll()
	await _replaced_session()
	await _completed_reply_delivery()
	_check(_bridge.synchronous_calls == 0, "Issues called synchronous transport")
	_view.free()
	await _drain()
	_bridge.stop()
	_operations.free()
	if not _failed: print("PROVIDENCE_ISSUES_TRANSPORT_OK worker-reads coalesced-filters late-ticket-cancel session-isolated input-live")
	quit(1 if _failed else 0)


func _coalesced_filters() -> void:
	await _busy()
	var before := _frames
	_view.state.set_filters("obsolete")
	_view.state.set_filters("extra-action-point:499")
	var search: LineEdit = _view.get_node("%SearchProblems")
	search.grab_focus()
	search.text = "local draft"
	await _settled()
	_check(_frames > before + 2, "Slow validation blocked frame processing")
	_check(_view.state.selected_finding().get("entity") == "extra-action-point:499", "Late begin replaced the current filter")
	_check(search.text == "local draft" and search.has_focus(), "Validation replaced local input or focus")
	_check(_bridge.server.calls.filter(func(call): return call.method == "validation.begin").size() == 2, "Obsolete filters were queued")


func _cancel_before_ticket() -> void:
	_view.state.refresh()
	await _busy()
	_view.state.cancel_refresh()
	await _drain()
	for _frame in 80: await process_frame
	await _drain()
	_check(not _view.state.has_pending_refresh() and _view.state.page.is_empty(), "Cancelled begin restored findings")
	_check(_bridge.server.latest_id == -1, "Late begin ticket was not cancelled")


func _cancel_poll() -> void:
	_view.state.refresh()
	await _busy()
	await _drain()
	await _busy()
	_view.state.cancel_refresh()
	await _drain()
	for _frame in 80: await process_frame
	await _drain()
	_check(_view.state.page.is_empty() and _bridge.server.latest_id == -1, "Cancelled poll restored a page or retained its job")


func _replaced_session() -> void:
	_view.state.refresh()
	await _busy()
	_view.attach(null)
	await _drain()
	for _frame in 80: await process_frame
	_check(_view.state.status == "no-project" and _view.state.page.is_empty(), "Late response entered a closed session")
	_view.attach(_bridge, 18)
	await _settled()
	_check(_view.state.status == "ready", "Replacement session could not validate")


func _busy() -> void:
	var deadline := Time.get_ticks_msec() + 3000
	while not _operations.busy and Time.get_ticks_msec() < deadline: await process_frame
	_check(_operations.busy, "Expected worker request did not start")


func _completed_reply_delivery() -> void:
	_view.set_process(false)
	_view.state.refresh()
	_view.state.poll(1.0)
	await _drain()
	_check(_view.state._job.has_ready_response(), "The completed begin reply was not available")
	_view.state._poll_wait = 60.0
	_view.state.poll(0.0)
	_check(not _view.state._job.has_ready_response(), "A completed begin reply waited for the polling interval")
	_check(_view.state._poll_wait == 60.0, "Consuming a reply restarted the native polling interval")
	_view.state._poll_wait = 0.0
	_view.state.poll(1.0)
	await _drain()
	_check(_view.state._job.has_ready_response(), "The completed page reply was not available")
	_view.state._poll_wait = 60.0
	_view.state.poll(0.0)
	_check(_view.state.status == "ready", "A completed page waited for the polling interval")
	_view.set_process(true)


func _drain() -> void:
	while _operations.busy: await process_frame
	await process_frame


func _settled() -> void:
	var deadline := Time.get_ticks_msec() + 5000
	while _view.state.has_pending_refresh() and Time.get_ticks_msec() < deadline: await process_frame
	_check(not _view.state.has_pending_refresh(), "Validation did not settle")
	await process_frame


func _check(condition: bool, message: String) -> void:
	if not condition:
		_failed = true
		push_error("PROVIDENCE_ISSUES_TRANSPORT_FAILED: " + message)
