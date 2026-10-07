extends RefCounted

var _bridge
var _id := -1
var _revision := -1
var _epoch := -1


static func supported(bridge) -> bool:
	return bridge != null and bridge.has_method("supports_validation_jobs") and bool(bridge.supports_validation_jobs())


static func connection_epoch(bridge) -> int:
	return int(bridge.connection_epoch()) if bridge.has_method("connection_epoch") else 0


func active() -> bool:
	return _id >= 0


func has_ready_response() -> bool:
	return false


static func _integer(value: Variant) -> bool:
	return typeof(value) in [TYPE_INT, TYPE_FLOAT] and is_finite(float(value)) and float(value) == floor(float(value))


func start(bridge, params: Dictionary) -> Dictionary:
	_bridge = bridge
	_epoch = connection_epoch(bridge)
	_id = -1
	_revision = -1
	var response: Dictionary = bridge.request("validation.begin", params)
	return _accept_ticket(response)


func _accept_ticket(response: Dictionary) -> Dictionary:
	if not bool(response.get("ok", false)):
		return response
	if not response.get("result") is Dictionary:
		return _failure("The checker returned an invalid request. Try again.")
	var ticket: Dictionary = response.result
	if not _integer(ticket.get("jobId")) or not _integer(ticket.get("revision")) or int(ticket.jobId) <= 0 or int(ticket.revision) < 0 or ticket.get("status") != "pending":
		return _failure("The checker returned an invalid request. Try again.")
	_id = int(ticket.jobId)
	_revision = int(ticket.revision)
	return {"ok": true}


func poll() -> Dictionary:
	if not active():
		return {}
	if connection_epoch(_bridge) != _epoch:
		return _failure("The scenario connection changed. Check again.")
	var response: Dictionary = _bridge.request("validation.poll", {"jobId": _id})
	return _accept_poll(response)


func _accept_poll(response: Dictionary) -> Dictionary:
	if not bool(response.get("ok", false)):
		_id = -1
		return response
	if not response.get("result") is Dictionary:
		return _failure("The checker returned an invalid response. Try again.")
	var result: Dictionary = response.result
	if not _integer(result.get("jobId")) or int(result.jobId) != _id:
		return _failure("The checker returned a different request. Try again.")
	var status := str(result.get("status", ""))
	if status == "outdated" and _integer(result.get("revision")) and int(result.revision) > _revision:
		_id = -1
		return {"ok": false, "retryRevision": int(result.revision)}
	if status in ["pending", "ready"] and (not _integer(result.get("revision")) or int(result.revision) != _revision):
		return _failure("The checker returned an unexpected scenario version. Try again.")
	if status == "pending":
		return {}
	_id = -1
	if status == "ready" and result.get("page") is Dictionary and _integer(result.page.get("revision")) and int(result.page.revision) == _revision:
		return {"ok": true, "result": result.page}
	if status == "failed":
		return _failure(str(result.get("error", "Validation failed. Try again.")))
	return _failure("This check is no longer available. Check again.")


func cancel() -> void:
	if active() and _bridge != null and connection_epoch(_bridge) == _epoch:
		_bridge.request("validation.cancel", {"jobId": _id})
	_id = -1
	_bridge = null


func _failure(message: String) -> Dictionary:
	_id = -1
	return {"ok": false, "error": message}
