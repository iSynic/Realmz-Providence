extends SceneTree

const Operation = preload("res://src/editor_operation.gd")
const Controller = preload("res://src/publish_targets_controller.gd")

class Bridge extends ProvidenceNativeBridge:
	var calls: Array = []
	var failure_method := ""
	var unknown := false
	func supports_validation_jobs() -> bool: return false
	func _request(method: String, params: Dictionary) -> Dictionary:
		OS.delay_msec(25)
		calls.append({"method": method, "params": params.duplicate(true)})
		if method == failure_method: return {"ok": false, "outcomeUnknown": unknown, "error": "Controlled failure"}
		match method:
			"scenario-contact.open": return {"ok": true, "result": {"contact": {"title": "Published title"}}}
			"compiler.describe": return {"ok": true, "result": {"commit": "fixture-commit", "version": "fixture"}}
			"project.inspect-classic-readiness", "project.inspect-rebuilt-readiness":
				return {"ok": true, "result": {"status": "ready", "revision": 7}}
			"project.inspect-rebuilt-package": return {"ok": true, "result": {"fileCount": 2}}
			"project.compile-classic-slice": return {"ok": true, "result": {"directory": params.directory}}
			"project.compile-rebuilt-package": return {"ok": true, "result": {"path": params.path}}
		return {"ok": false, "error": "Unexpected request " + method}

class Session extends RefCounted:
	var bridge := Bridge.new()
	var revision := 7
	var configuration_result := {"ok": true}
	var revision_after_configuration := 7
	func configure_application_library(_directory: String) -> Dictionary:
		revision = revision_after_configuration
		return configuration_result
	func context() -> Dictionary: return {"projectId": "fallback-title", "revision": revision}

var _operations: Operation
var _dialog: ProvidencePublishTargetsDialog
var _controller
var _session: Session
var _failed := false
var _frames := 0


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	_operations = Operation.new()
	root.add_child(_operations)
	process_frame.connect(func(): _frames += 1)
	_dialog = ProvidencePublishTargetsDialog.new()
	root.add_child(_dialog)
	_session = Session.new()
	_controller = Controller.new()
	_controller.initialize(_dialog, _operations, _session, _session.context)
	await _opening()
	await _readiness()
	await _readiness_input_race()
	await _readiness_failure()
	for outcome in ["success", "classic-rejected", "rebuilt-rejected", "rebuilt-unknown"]:
		await _publication(outcome)
	await _revision_guards()
	await _busy_guard()
	_session.bridge.stop()
	_operations.free()
	_dialog.free()
	if not _failed: print("PROVIDENCE_PUBLISH_TARGETS_CONTROLLER_OK readiness lease input-race revisions partial-publication unknown-no-retry")
	quit(1 if _failed else 0)


func _reset() -> void:
	_operations.reset_session()
	_session.bridge.stop()
	_session.bridge = Bridge.new()
	_session.revision = 7
	_session.revision_after_configuration = 7
	_session.configuration_result = {"ok": true}
	_dialog.set_publish_inputs("classic-output", "rebuilt-output.realmz2", "application-library")


func _opening() -> void:
	var messages: Array = []
	_controller.status_changed.connect(func(message): messages.append(message))
	await _controller.show_targets()
	_check(_dialog.visible and not _operations.busy, "Publishing did not finish opening")
	_check(messages.back() == "Readiness unchecked.", "Opening left stale busy feedback")
	_dialog.hide()


func _readiness() -> void:
	_reset()
	var frames_before := _frames
	await _controller.inspect_readiness("application-library")
	_check(_frames > frames_before + 1, "Readiness blocked frame processing")
	_check(_methods() == ["compiler.describe", "project.inspect-classic-readiness", "project.inspect-rebuilt-readiness", "project.inspect-rebuilt-package"], "Readiness changed its bounded request sequence")
	_check(_session.bridge.calls[1].params == {"offset": 0, "limit": 200}, "Classic readiness is no longer bounded")
	_check(_session.bridge.calls[2].params == {"offset": 0, "limit": 200}, "Rebuilt readiness is no longer bounded")
	_check(_session.bridge.calls[3].params == {"compilerCommit": "fixture-commit", "minimumEngineVersion": "0.1.0"}, "Package preview identity changed")
	_check(_dialog.status_text().begins_with("Ready ·"), "Readiness was not presented")
	_check(not _operations.busy and not _session.bridge.operation_busy(), "Readiness leaked its lease")


func _readiness_input_race() -> void:
	_reset()
	_controller.inspect_readiness("application-library")
	await process_frame
	_check(_operations.busy, "Readiness did not reserve its operation")
	_dialog.set_publish_inputs("changed-classic", "changed.realmz2", "changed-library")
	_controller.inspect_readiness("changed-library")
	await _settle()
	_check(_methods().size() == 4, "Repeated readiness was queued")
	_check(_dialog.status_text().contains("Paths changed"), "Late readiness certified changed inputs")


func _readiness_failure() -> void:
	_reset()
	_session.bridge.failure_method = "project.inspect-classic-readiness"
	await _controller.inspect_readiness("application-library")
	_check(_methods() == ["compiler.describe", "project.inspect-classic-readiness"], "Readiness continued after rejection")
	_check(_dialog.status_text().contains("Controlled failure"), "Readiness lost its rejection")


func _publication(outcome: String) -> void:
	_reset()
	if outcome == "classic-rejected": _session.bridge.failure_method = "project.compile-classic-slice"
	if outcome.begins_with("rebuilt-"): _session.bridge.failure_method = "project.compile-rebuilt-package"
	_session.bridge.unknown = outcome == "rebuilt-unknown"
	var frames_before := _frames
	_controller.publish("classic-output", "rebuilt-output.realmz2", "application-library", 7)
	await process_frame
	_check(_operations.busy, "Publishing did not reserve its operation")
	_controller.publish("duplicate", "duplicate.realmz2", "application-library", 7)
	_check(not _operations.begin(_session.bridge, "Undo"), "History took the publishing lease")
	await _settle()
	_check(_frames > frames_before + 1, "Publishing blocked frame processing")
	var methods := ["compiler.describe", "project.compile-classic-slice"]
	if outcome != "classic-rejected": methods.append("project.compile-rebuilt-package")
	_check(_methods() == methods, "Publishing repeated a write or continued after failure")
	_check(_session.bridge.calls[1].params == {"directory": "classic-output"}, "Classic destination changed")
	if outcome != "classic-rejected":
		_check(_session.bridge.calls[2].params == {"path": "rebuilt-output.realmz2", "compilerCommit": "fixture-commit", "minimumEngineVersion": "0.1.0"}, "Rebuilt destination or compiler identity changed")
	if outcome == "success": _check(_dialog.status_text().begins_with("Published both"), "Publication success was lost")
	if outcome.begins_with("rebuilt-"):
		_check(_dialog.status_text().contains("Classic was published to classic-output and was not removed"), "Partial publication lost the Classic artifact")
	if outcome == "rebuilt-unknown":
		_check(_dialog.status_text().contains("Rebuilt publication could not be confirmed"), "Unknown output was reported as absent")
		_check(_operations.requires_reopen, "Unknown publication permitted mutation retry")
		await _controller.publish("retry", "retry.realmz2", "application-library", 7)
		_check(_methods() == methods, "Unknown publication was automatically retried")


func _revision_guards() -> void:
	_reset()
	await _controller.publish("classic", "rebuilt.realmz2", "library", 6)
	_check(_methods().is_empty() and _dialog.status_text().contains("project changed"), "Stale readiness dispatched publication")
	_session.revision_after_configuration = 8
	await _controller.publish("classic", "rebuilt.realmz2", "library", 7)
	_check(_methods().is_empty() and _dialog.status_text().contains("project changed"), "Library activation bypassed the readiness revision guard")
	_reset()
	_session.configuration_result = {"ok": false, "error": "Invalid library"}
	await _controller.inspect_readiness("bad-library")
	_check(_methods().is_empty() and _dialog.status_text().contains("Invalid library"), "Invalid library continued to compile")


func _busy_guard() -> void:
	_reset()
	_check(_operations.begin(_session.bridge, "History"), "History could not acquire a lease")
	await _controller.inspect_readiness("library")
	_check(_methods().is_empty() and _operations.busy, "Readiness displaced another operation")
	_operations.finish({"ok": true})


func _settle() -> void:
	while _operations.busy: await process_frame


func _methods() -> Array:
	return _session.bridge.calls.map(func(entry): return entry.method)


func _check(condition: bool, message: String) -> void:
	if condition: return
	_failed = true
	push_error("PROVIDENCE_PUBLISH_TARGETS_CONTROLLER_FAILED " + message)
