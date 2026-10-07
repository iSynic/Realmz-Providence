extends SceneTree

class DelayedBridge extends RefCounted:
	const Fixture = preload("res://tools/validate_issues_state.gd")
	var fixture := Fixture.FixtureBridge.new()
	var released := false
	var wrong_id := false
	var fail_poll := false
	var response_override: Dictionary = {}
	var epoch := 1
	var next_id := 0
	var latest_id := -1
	var pages: Dictionary = {}
	var calls: Array = []

	func supports_validation_jobs() -> bool:
		return true

	func connection_epoch() -> int:
		return epoch

	func request(method: String, params: Dictionary = {}) -> Dictionary:
		calls.append({"method": method, "params": params.duplicate(true)})
		if not response_override.is_empty():
			return response_override.duplicate(true)
		if method == "validation.begin":
			next_id += 1
			latest_id = next_id
			pages[latest_id] = fixture.request("validation.list", params)
			return {"ok": true, "result": {"jobId": latest_id, "revision": fixture.revision, "status": "pending"}}
		var id := int(params.get("jobId", -1))
		if method == "validation.cancel":
			if latest_id == id:
				latest_id = -1
			return {"ok": true, "result": {"jobId": id, "cancelled": true}}
		if method != "validation.poll" or fail_poll:
			return {"ok": false, "error": "Controlled checker disconnection"}
		if id != latest_id:
			return {"ok": true, "result": {"jobId": id, "status": "superseded"}}
		var page: Dictionary = pages[id].result
		if int(page.revision) != fixture.revision:
			return {"ok": true, "result": {"jobId": id, "revision": fixture.revision, "status": "outdated"}}
		if not released:
			return {"ok": true, "result": {"jobId": id, "revision": page.revision, "status": "pending"}}
		return {"ok": true, "result": {"jobId": id - 1 if wrong_id else id, "revision": page.revision, "status": "ready", "page": page}}

var _failed := false


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	root.size = Vector2i(1600, 900)
	var view = load("res://src/issues_workbench.tscn").instantiate()
	view.position = Vector2(356, 48)
	view.size = Vector2(1244, 824)
	root.add_child(view)
	await _frames(5)
	var bridge := DelayedBridge.new()
	view.destination_resolver = func(_finding: Dictionary): return {"editable": true}
	view.attach(bridge, 18)
	var search: LineEdit = view.get_node("%SearchProblems")
	_check(view.state.status == "checking" and view.state.has_pending_refresh(), "Starting a check blocked until completion")
	_check(view.get_node("%Counts").text == "Checking scenario…" and view.get_node("%OpenFinding").disabled, "Pending state retained actionable findings")
	await _frames(12)
	_check(view.state.status == "checking" and view.state.page.is_empty(), "A withheld result was published")
	search.grab_focus()
	search.text = "extra-action-point:499"
	await _key(KEY_ENTER)
	_check(view.state.query == "extra-action-point:499" and bridge.latest_id >= 2, "Keyboard submission did not work while checking")
	bridge.released = true
	await _ready(view)
	_check(view.state.page.get("total") == 1 and view.state.selected_finding().get("entity") == "extra-action-point:499", "Old pending results replaced the newest filter")
	_check(search.has_focus(), "Completed validation stole search focus")
	await _paging_focus(view, bridge)
	await _revision_and_failures(view, bridge)
	await _malformed_responses(view, bridge)
	await _session_switch(view, bridge)
	_check(not bridge.calls.any(func(call): return call.method == "validation.list"), "Async Issues used the blocking list command")
	view.free()
	await process_frame
	if not _failed:
		print("PROVIDENCE_ISSUES_ASYNC_OK frames-input-live latest-query-only focus-retained revision-retried session-isolated")
	quit(1 if _failed else 0)


func _paging_focus(view, bridge) -> void:
	view.state.clear_filters()
	await _ready(view)
	var search: LineEdit = view.get_node("%SearchProblems")
	bridge.released = false
	view._page_input.grab_focus()
	view._page_input.text = "2"
	view._go_to_page()
	await _frames(3)
	search.grab_focus()
	search.text = "draft while waiting"
	bridge.released = true
	await _ready(view)
	_check(view.state.page_number() == 2 and search.has_focus() and search.text == "draft while waiting", "Page completion overwrote a new focus or search draft")
	bridge.released = false
	view._page_input.get_parent().get_node("Next").grab_focus()
	await _key(KEY_ENTER)
	_check(view.state.has_pending_refresh(), "Keyboard paging did not start a background check")
	bridge.released = true
	await _ready(view)
	_check(view.state.page_number() == 3 and root.gui_get_focus_owner() == view._page_input.get_parent().get_node("Next"), "Keyboard paging lost its control after completion")


func _revision_and_failures(view, bridge) -> void:
	bridge.released = false
	view.state.refresh()
	var generation: int = view.state.request_generation
	var obsolete: int = bridge.latest_id
	bridge.fixture.revision += 1
	bridge.released = true
	await _ready(view)
	_check(view.state.revision == 19 and bridge.latest_id > obsolete and view.state.request_generation == generation, "Outdated validation did not retry against the current revision")
	bridge.wrong_id = true
	view.state.refresh()
	await _ready(view)
	_check(view.state.status == "failed" and view.state.page.is_empty() and view.state.error.contains("different request"), "Mismatched job identity was accepted")
	bridge.wrong_id = false
	view.state.refresh()
	await _ready(view)
	_check(view.state.status == "ready", "Retry could not recover from a mismatched response")
	bridge.fail_poll = true
	view.state.refresh()
	await _ready(view)
	_check(view.state.status == "failed" and view.state.error == "Controlled checker disconnection" and view.get_node("%OpenFinding").disabled, "Disconnected validation borrowed the prior page or lost its cause")
	bridge.fail_poll = false
	view.state.refresh()
	await _ready(view)
	bridge.released = false
	view.state.refresh()
	var id: int = bridge.latest_id
	view.state.cancel_refresh()
	bridge.released = true
	await _frames(8)
	_check(not view.state.has_pending_refresh() and view.state.page.is_empty(), "Cancelled validation restored late findings")
	_check(bridge.calls.any(func(call): return call.method == "validation.cancel" and int(call.params.jobId) == id), "Cancellation did not target the owned request")


func _session_switch(view, bridge) -> void:
	bridge.released = false
	view.state.refresh()
	var calls_before: int = bridge.calls.size()
	bridge.epoch += 1
	bridge.next_id = 0
	bridge.latest_id = -1
	bridge.pages.clear()
	bridge.fixture.rows = [bridge.fixture.rows[7]]
	bridge.fixture.revision = 0
	await _frames(8)
	_check(view.state.status == "failed" and bridge.calls.size() == calls_before, "An old client polled a replacement connection")
	view.attach(bridge, 0)
	bridge.released = true
	await _ready(view)
	_check(view.state.revision == 0 and view.state.page.get("unfilteredTotal") == 1 and bridge.latest_id == 1, "A new session inherited the prior revision, job or findings")
	bridge.released = false
	view.state.refresh()
	view.attach(null)
	await _frames(8)
	_check(view.state.status == "no-project" and not view.state.has_pending_refresh() and view.state.page.is_empty(), "Closing the project retained an in-flight check")


func _malformed_responses(view, bridge) -> void:
	for invalid: Variant in [[], "unexpected", {"jobId": true, "revision": 19, "status": "pending"}, {"jobId": 1.5, "revision": 19, "status": "pending"}]:
		bridge.response_override = {"ok": true, "result": invalid}
		_check(not view.state.refresh() and view.state.status == "failed", "Malformed begin response did not fail safely")
	bridge.response_override = {}
	for invalid: Variant in [[], "unexpected", {"jobId": "1", "revision": 19, "status": "ready"}]:
		view.state.refresh()
		bridge.response_override = {"ok": true, "result": invalid}
		await _ready(view)
		_check(view.state.status == "failed" and view.state.page.is_empty(), "Malformed poll response did not fail safely")
		bridge.response_override = {}


func _ready(view) -> void:
	var deadline := Time.get_ticks_msec() + 5000
	while view.state.has_pending_refresh():
		if Time.get_ticks_msec() >= deadline:
			_check(false, "The released check did not complete")
			return
		await process_frame
	await _frames(2)


func _key(code: Key) -> void:
	var event := InputEventKey.new()
	event.keycode = code
	event.pressed = true
	Input.parse_input_event(event)
	await process_frame
	event = InputEventKey.new()
	event.keycode = code
	Input.parse_input_event(event)
	await _frames(2)


func _frames(count: int) -> void:
	for _frame in count:
		await process_frame


func _check(condition: bool, message: String) -> void:
	if not condition:
		_failed = true
		push_error("PROVIDENCE_ISSUES_ASYNC_FAILED: " + message)
