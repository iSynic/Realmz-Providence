class_name ProvidenceReadinessJob
extends RefCounted

class Check extends RefCounted:
	var connection
	var epoch: int
	var generation: int
	var job_id := -1
	var revision := -1
	var current: Callable
	var borrowed: ProvidenceEditorOperation

var operations: ProvidenceEditorOperation
var bridge
var _generation := 0
var _active: Check


func cancel() -> void:
	_generation += 1
	var check := _active
	if check != null:
		await _cancel_check(check)
		_clear_active(check)


func run(params: Dictionary, current: Callable = Callable(), borrowed: ProvidenceEditorOperation = null) -> Dictionary:
	if bridge == null:
		return _failure("No scenario connection is available.")
	var check := _start_check(current, borrowed)
	if not preload("res://src/issues_validation_job.gd").supported(check.connection):
		return await _run_legacy(check, params)
	var accepted := await _request(check, "readiness.begin", params)
	if accepted.get("ok", false):
		var ticket_error := _accept_ticket(check, accepted.get("result"))
		if not ticket_error.is_empty():
			return await _finish(check, _failure(ticket_error))
	if not _current(check):
		return await _finish(check, _stale())
	if not accepted.get("ok", false):
		return await _finish(check, accepted)
	while _current(check):
		await operations.get_tree().create_timer(0.025).timeout
		if not _current(check):
			break
		if operations.busy and borrowed == null:
			continue
		var response := await _request(check, "readiness.poll", {"jobId": check.job_id})
		if not _current(check):
			break
		var polled := _accept_poll(check, response)
		if not polled.get("pending", false):
			return await _finish(check, polled)
	return await _finish(check, _stale())


func _start_check(current: Callable, borrowed: ProvidenceEditorOperation) -> Check:
	_generation += 1
	var check := Check.new()
	check.connection = bridge
	check.epoch = preload("res://src/issues_validation_job.gd").connection_epoch(bridge) if bridge != null else -1
	check.generation = _generation
	check.current = current
	check.borrowed = borrowed
	_active = check
	return check


func _current(check: Check) -> bool:
	if check.generation != _generation or check.connection != bridge or check.connection == null:
		return false
	if preload("res://src/issues_validation_job.gd").connection_epoch(check.connection) != check.epoch:
		return false
	return not check.current.is_valid() or bool(check.current.call())


func _run_legacy(check: Check, params: Dictionary) -> Dictionary:
	var options := params.duplicate()
	var target := str(options.get("target", "classic"))
	options.erase("target")
	var response := await _request(check, "project.inspect-%s-readiness" % target, options)
	return await _finish(check, response if _current(check) else _stale())


func _accept_ticket(check: Check, value: Variant) -> String:
	if not value is Dictionary:
		return "Readiness returned an invalid request."
	if _integer(value.get("jobId")) and int(value.jobId) > 0:
		check.job_id = int(value.jobId)
	if check.job_id < 0 or not _integer(value.get("revision")) or int(value.revision) < 0 or value.get("status") != "pending":
		return "Readiness returned an invalid request."
	check.revision = int(value.revision)
	return ""


func _accept_poll(check: Check, response: Dictionary) -> Dictionary:
	if not response.get("ok", false):
		return response
	if not response.get("result") is Dictionary:
		return _failure("Readiness returned an invalid response.")
	var result: Dictionary = response.result
	if not _integer(result.get("jobId")) or int(result.jobId) != check.job_id:
		return _failure("Readiness returned a different request.")
	var status := str(result.get("status", ""))
	if status in ["outdated", "superseded"]:
		return _stale()
	if not _integer(result.get("revision")) or int(result.revision) != check.revision:
		return _failure("Readiness returned an unexpected scenario version.")
	if status == "pending":
		return {"pending": true}
	if status == "failed":
		return {"ok": false, "stale": true, "error": str(result.get("error", "Readiness check failed."))}
	if status != "ready" or not result.get("page") is Dictionary:
		return _failure("Readiness returned an invalid response.")
	var page: Dictionary = result.page
	if not _integer(page.get("revision")) or int(page.revision) != check.revision:
		return _failure("Readiness returned an unexpected scenario version.")
	if page.get("status") not in ["ready", "ready-with-warnings", "blocked"]:
		return _failure("Readiness returned an invalid result.")
	return {"ok": true, "result": page}


func _finish(check: Check, response: Dictionary) -> Dictionary:
	if not response.get("ok", false):
		await _cancel_check(check)
	_clear_active(check)
	return response


func _clear_active(check: Check) -> void:
	if _active == check:
		_active = null


func _cancel_check(check: Check) -> void:
	if check.job_id <= 0 or check.connection == null:
		return
	if preload("res://src/issues_validation_job.gd").connection_epoch(check.connection) != check.epoch:
		return
	if operations.busy and check.borrowed == null:
		return
	# A late ticket belongs to its captured connection, never a replacement.
	await _request(check, "readiness.cancel", {"jobId": check.job_id})
	check.job_id = -1


func _request(check: Check, method: String, params: Dictionary) -> Dictionary:
	return await operations.run_workflow(check.connection, "", func(op): return await op.request(method, params), check.borrowed)


static func _integer(value: Variant) -> bool:
	return typeof(value) in [TYPE_INT, TYPE_FLOAT] and is_finite(float(value)) and float(value) == floor(float(value))


static func _failure(message: String) -> Dictionary:
	return {"ok": false, "error": message}


static func _stale() -> Dictionary:
	return {"ok": false, "stale": true, "error": "Readiness check cancelled."}
