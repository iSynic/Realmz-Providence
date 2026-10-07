extends ProvidenceNativeBridge

var polls := 0
var begins := 0
var cancelled: Array[int] = []
var begin_delay := 5
var poll_delay := 5
var ready_after := 3
var jobs_supported := true
var ticket_override: Variant
var poll_override: Variant
var calls: Array[Dictionary] = []


func _init() -> void:
	_project_backed = true
	_project_path = "readiness-fixture"


func supports_validation_jobs() -> bool:
	return jobs_supported


func change_epoch() -> void:
	_connection_epoch += 1


func _request(method: String, params: Dictionary) -> Dictionary:
	calls.append({"method": method, "params": params.duplicate(true)})
	match method:
		"readiness.begin":
			begins += 1
			OS.delay_msec(begin_delay)
			return {"ok": true, "result": ticket_override if ticket_override != null else
				{"jobId": begins, "revision": 7, "status": "pending"}}
		"readiness.cancel":
			cancelled.append(int(params.jobId))
			return {"ok": true, "result": {"cancelled": true}}
		"readiness.poll":
			polls += 1
			OS.delay_msec(poll_delay)
			return {"ok": true, "result": poll_override if poll_override != null else
				{"jobId": params.jobId, "revision": 7, "status": "ready" if polls >= ready_after else "pending",
				"page": {"revision": 7, "status": "ready-with-warnings"}}}
		"project.inspect-classic-readiness", "project.inspect-rebuilt-readiness":
			OS.delay_msec(begin_delay)
			return {"ok": true, "result": {"revision": 7, "status": "ready-with-warnings"}}
	return {"ok": false, "error": "Unexpected readiness request"}
