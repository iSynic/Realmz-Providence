extends "res://src/issues_validation_job.gd"

var operations: ProvidenceEditorOperation
var _generation := 0
var _starting := false
var _waiting := false
var _params: Dictionary = {}
var _response: Dictionary = {}
var _cancel_id := -1
var _cancel_epoch := -1


func active() -> bool:
	return _starting or _id >= 0


func has_ready_response() -> bool:
	return not _waiting and not _response.is_empty()


func start(bridge, params: Dictionary) -> Dictionary:
	_generation += 1
	_bridge = bridge
	_epoch = connection_epoch(bridge)
	_id = -1
	_revision = -1
	_params = params.duplicate(true)
	_response.clear()
	_starting = true
	return {"ok": true}


func cancel() -> void:
	_generation += 1
	if _id >= 0:
		_cancel_id = _id
		_cancel_epoch = _epoch
	_id = -1
	_starting = false
	_response.clear()


func poll() -> Dictionary:
	if _waiting or _bridge == null: return {}
	if connection_epoch(_bridge) != _epoch:
		var was_active := active()
		_starting = false
		_cancel_id = -1
		return _failure("The scenario connection changed. Check again.") if was_active else {}
	if not _response.is_empty():
		var response := _response
		_response = {}
		if _starting:
			_starting = false
			var accepted := _accept_ticket(response)
			return {} if accepted.get("ok", false) else accepted
		return _accept_poll(response)
	if operations.busy: return {}
	if operations.requires_reopen:
		var was_active := active()
		_starting = false
		_cancel_id = -1
		return _failure("The scenario connection changed. Reopen the project before checking again.") if was_active else {}
	if _cancel_id >= 0:
		if _cancel_epoch == _epoch: _request("validation.cancel", {"jobId": _cancel_id}, _generation)
		_cancel_id = -1
	elif _starting:
		_request("validation.begin", _params, _generation)
	elif _id >= 0:
		_request("validation.poll", {"jobId": _id}, _generation)
	return {}


func _request(method: String, params: Dictionary, generation: int) -> void:
	var bridge = _bridge
	var epoch := _epoch
	_waiting = true
	# Each bounded read owns one lease, not the lifetime of the server job.
	# New filters replace pending reads; they never queue obsolete projections.
	# The workbench owns Checking/Retry feedback. Background polls must not
	# replace the author-facing Saved/Unsaved status, including after navigation.
	var response: Dictionary = await operations.run_workflow(bridge, "", func(op): return await op.request(method, params))
	_waiting = false
	if bridge != _bridge or epoch != _epoch: return
	if generation != _generation:
		# A cancelled begin may have acquired its ticket after cancellation.
		# Cancel only that ticket on its original connection, never a replacement.
		if method == "validation.begin" and not _starting and response.get("result") is Dictionary:
			var ticket: Dictionary = response.result
			if _integer(ticket.get("jobId")) and int(ticket.jobId) > 0:
				_cancel_id = int(ticket.jobId)
				_cancel_epoch = epoch
		return
	if method != "validation.cancel": _response = response
