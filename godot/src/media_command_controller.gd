extends RefCounted

signal changed(result: Dictionary, domain: String)
signal status_changed(message: String)
signal recovery_changed(locked: bool)
signal recovery_finished(outcome: String, pending: Dictionary)

var operations: ProvidenceEditorOperation
var _bridge: RefCounted
var _generation := 0
var _pending := {}
var _session_key := ""


func attach_session(bridge: RefCounted) -> void:
	var key := str(bridge.current_project_path()) + ":" + str(bridge.connection_epoch()) if bridge != null else ""
	if bridge == _bridge and key == _session_key: return
	_bridge = bridge
	_session_key = key
	_generation += 1


func is_locked() -> bool:
	return not _pending.is_empty() or operations != null and operations.requires_reopen


func pending_context() -> Dictionary:
	return _pending.duplicate(true)


func prepare(method: String, params: Dictionary) -> Dictionary:
	if _bridge == null: return {"ok": false, "error": "Open the source workspace first."}
	var generation := _generation
	var source_bridge := _bridge
	var epoch: int = source_bridge.connection_epoch()
	var response := await operations.run_workflow(source_bridge, "Review media", func(operation):
		return await operation.request(method, params))
	if generation != _generation or _bridge == null or epoch != _bridge.connection_epoch(): return {"ok": false, "stale": true, "error": "The source session changed. Reopen the review."}
	return response


func perform(method: String, params: Dictionary, domain: String, context: Dictionary) -> Dictionary:
	if is_locked(): return {"ok": false, "outcomeUnknown": true, "error": "Reconcile the original operation before making another change."}
	if _bridge == null: return {"ok": false, "error": "Open the source workspace first."}
	if context.has("sourceEpoch") and (context.sourceEpoch != _bridge.connection_epoch() or context.get("sourcePath", "") != str(_bridge.current_project_path())):
		return {"ok": false, "stale": true, "error": "The originating session changed. Reopen the review before submitting."}
	var generation := _generation
	var submitted := params.duplicate(true)
	submitted["operationId"] = Crypto.new().generate_random_bytes(32).hex_encode()
	var intent := {"method": method, "params": submitted}
	var source_bridge := _bridge
	var source_path := str(source_bridge.current_project_path())
	var library_root := str(source_bridge.configured_personal_library_root())
	var response := await operations.run_workflow(source_bridge, "Apply media", func(operation):
		return await operation.request(method, submitted))
	if response.get("outcomeUnknown", false):
		_pending = {"intent": intent, "domain": domain, "context": context.duplicate(true), "projectPath": source_path, "libraryRoot": library_root}
		recovery_changed.emit(true)
		status_changed.emit("Outcome unconfirmed. Submitted values are kept; use Reconcile stored state.")
	elif generation == _generation and response.get("ok", false):
		changed.emit(response.get("result", {}), domain)
	elif generation == _generation:
		status_changed.emit(str(response.get("error", "The operation was rejected. Your draft is kept.")))
	return response


func reconcile() -> Dictionary:
	if _pending.is_empty(): return {"ok": true}
	if _bridge == null: return {"ok": false, "error": "Open the original workspace before reconciling."}
	if _pending.domain == "project" and str(_bridge.current_project_path()) != str(_pending.projectPath):
		return {"ok": false, "error": "Reopen the original scenario to check its submitted operation."}
	if _pending.domain == "personal" and str(_bridge.configured_personal_library_root()) != str(_pending.libraryRoot):
		return {"ok": false, "error": "Reopen the original My Library to check its submitted operation."}
	var pending := _pending.duplicate(true)
	var params := {"operationId": pending.intent.params.operationId, "expectedIntent": pending.intent, "domain": pending.domain}
	var response := await operations.recover_media(_bridge, params)
	if not response.get("mediaRecoveryConfirmed", false):
		status_changed.emit("The original result remains unconfirmed. No mutation was retried.")
		return response
	_pending.clear()
	recovery_changed.emit(false)
	var result: Dictionary = response.get("result", {})
	var outcome := str(result.get("outcome", "unknown"))
	status_changed.emit("The original change was saved." if outcome == "committed" else "The original change was not committed. Review the retained draft before a new submission.")
	if outcome == "committed": changed.emit(result.get("response", {}).get("result", {}), str(pending.domain))
	recovery_finished.emit(outcome, pending)
	return response
