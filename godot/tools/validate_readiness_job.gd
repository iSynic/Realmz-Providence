extends SceneTree

const Bridge = preload("res://tools/readiness_job/bridge.gd")

var _operations := ProvidenceEditorOperation.new()
var _bridge := Bridge.new()
var _job := ProvidenceReadinessJob.new()
var _result: Dictionary = {}
var _current := true
var _frames := 0


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	root.add_child(_operations)
	_job.operations = _operations
	process_frame.connect(func(): _frames += 1)
	print("Readiness: pending input")
	await _pending_input()
	print("Readiness: late poll")
	await _late_poll()
	print("Readiness: cancelled begin")
	await _cancel_begin()
	print("Readiness: replacement connection")
	await _replace_connection()
	print("Readiness: connection epoch")
	await _change_epoch()
	print("Readiness: replacement check")
	await _replace_check()
	print("Readiness: malformed replies")
	await _malformed_responses()
	print("Readiness: borrowed operation")
	await _borrowed_operation()
	print("Readiness: legacy fallback")
	await _legacy_fallback()
	_bridge.stop()
	_operations.free()
	print("PROVIDENCE_READINESS_JOB_OK pending input late-result cancel connection ticket revision borrowed fallback")
	quit(0)


func _reset() -> void:
	assert(not _operations.busy)
	_operations.reset_session()
	_bridge.stop()
	_bridge = Bridge.new()
	_job.bridge = _bridge
	_result.clear()
	_current = true


func _pending_input() -> void:
	_reset()
	_start()
	await _wait()
	assert(_result.get("ok", false) and _bridge.polls == 3 and _frames > 3)


func _late_poll() -> void:
	_reset()
	_bridge.poll_delay = 100
	_start()
	while _bridge.polls < 1:
		await process_frame
	_current = false
	await _wait()
	assert(not _result.get("ok", true) and _result.get("stale", false))
	assert(_bridge.cancelled == [1] and not _operations.busy)


func _cancel_begin() -> void:
	_reset()
	_bridge.begin_delay = 100
	_start()
	while _bridge.begins == 0:
		await process_frame
	await _job.cancel()
	await _wait()
	assert(not _result.get("ok", true) and _result.get("stale", false))
	assert(_bridge.cancelled == [1] and _bridge.polls == 0)


func _replace_connection() -> void:
	_reset()
	_bridge.begin_delay = 100
	var original = _bridge
	_start()
	while original.begins == 0:
		await process_frame
	var replacement := Bridge.new()
	assert(original.connection_epoch() == replacement.connection_epoch())
	_job.bridge = replacement
	await _wait()
	assert(_result.get("stale", false) and original.cancelled == [1])
	assert(replacement.calls.is_empty())


func _change_epoch() -> void:
	_reset()
	_bridge.poll_delay = 100
	_start()
	while _bridge.polls == 0:
		await process_frame
	_bridge.change_epoch()
	await _wait()
	assert(_result.get("stale", false) and _bridge.cancelled.is_empty())


func _replace_check() -> void:
	_reset()
	_bridge.ready_after = 100
	_start()
	while _bridge.polls < 1 or _operations.busy:
		await process_frame
	_bridge.begin_delay = 100
	var replacement_result: Dictionary = {}
	var launch := func(): replacement_result.merge(await _job.run({"target": "classic"}))
	launch.call()
	await _wait()
	assert(_result.get("stale", false))
	while _operations.busy:
		await process_frame
	await _job.cancel()
	var deadline := Time.get_ticks_msec() + 5000
	while replacement_result.is_empty():
		assert(Time.get_ticks_msec() < deadline)
		await process_frame
	assert(replacement_result.get("stale", false) and 2 in _bridge.cancelled)


func _malformed_responses() -> void:
	for ticket in ["invalid", {"jobId": 0, "revision": 7, "status": "pending"},
		{"jobId": 1.5, "revision": 7, "status": "pending"},
		{"jobId": 1, "revision": -1, "status": "pending"},
		{"jobId": 1, "revision": 7, "status": "ready"}]:
		_reset()
		_bridge.ticket_override = ticket
		var response := await _job.run({"target": "classic"})
		assert(not response.get("ok", true) and _bridge.polls == 0)
	for result in ["invalid", {"jobId": 2, "revision": 7, "status": "pending"},
		{"jobId": 1, "revision": 8, "status": "pending"},
		{"jobId": 1, "revision": 7, "status": "ready", "page": "invalid"},
		{"jobId": 1, "revision": 7, "status": "ready", "page": {"revision": 8}},
		{"jobId": 1, "revision": 7, "status": "ready", "page": {"revision": 7, "status": "invalid"}}]:
		_reset()
		_bridge.poll_override = result
		var response := await _job.run({"target": "classic"})
		assert(not response.get("ok", true) and _bridge.cancelled == [1])
	for status in ["outdated", "superseded", "failed"]:
		_reset()
		_bridge.poll_override = {"jobId": 1, "revision": 7, "status": status, "error": "Source failure"}
		var response := await _job.run({"target": "classic"})
		assert(not response.get("ok", true) and _bridge.cancelled == [1])
		if status == "failed":
			assert(response.error == "Source failure")
	_reset()
	_job.bridge = null
	var unavailable := await _job.run({"target": "classic"})
	assert(not unavailable.get("ok", true) and _bridge.calls.is_empty())


func _borrowed_operation() -> void:
	_reset()
	assert(_operations.begin(_bridge, "Readiness fixture"))
	var response := await _job.run({"target": "rebuilt"}, Callable(), _operations)
	assert(response.get("ok", false) and _operations.busy)
	_operations.finish(response)
	assert(not _operations.busy)


func _legacy_fallback() -> void:
	_reset()
	_bridge.jobs_supported = false
	var response := await _job.run({"target": "rebuilt", "offset": 8})
	assert(response.get("ok", false) and _bridge.calls.size() == 1)
	assert(_bridge.calls[0].method == "project.inspect-rebuilt-readiness")
	assert(_bridge.calls[0].params == {"offset": 8})
	_bridge.begin_delay = 100
	_start()
	while not _operations.busy:
		await process_frame
	await _job.cancel()
	await _wait()
	assert(_result.get("stale", false) and _bridge.cancelled.is_empty())


func _start() -> void:
	_result = await _job.run({"target":"classic"}, func(): return _current)


func _wait() -> void:
	var deadline := Time.get_ticks_msec() + 5000
	while _result.is_empty():
		assert(Time.get_ticks_msec() < deadline)
		await process_frame
