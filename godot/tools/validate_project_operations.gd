extends SceneTree

const Operation = preload("res://src/editor_operation.gd")

class SourceBridge extends ProvidenceNativeBridge:
	var candidate: ProvidenceNativeBridge
	var reply := {"ok": true, "result": {"projectPath": "copied-project", "revision": 7}}
	var calls: Array = []
	func is_project_backed() -> bool: return true
	func current_project_path() -> String: return "source-project"
	func fork_connection() -> ProvidenceNativeBridge: return candidate
	func current_application_library_root() -> String: return "application-library"
	func current_reference_catalog_root() -> String: return "reference-catalog"
	func current_monster_library_root() -> String: return "monster-library"
	func _request(method: String, params: Dictionary) -> Dictionary:
		OS.delay_msec(40)
		calls.append({"method": method, "params": params})
		return reply.duplicate(true)

class Candidate extends ProvidenceNativeBridge:
	var reply := {"ok": true, "result": {"revision": 7}}
	var opened_path := ""
	var options: Dictionary = {}
	var created_id := ""
	var configuration_reply := {"ok": true}
	var configured: Array = []
	func _configure_library(kind: String, directory: String, _executable: String, _restart: bool) -> Dictionary:
		OS.delay_msec(40)
		configured.append([kind, directory])
		return configuration_reply.duplicate(true)
	func begin_project_start(path: String, connection_options: Dictionary = {}) -> Dictionary:
		opened_path = path
		options = connection_options
		_connection_epoch += 1
		_request_worker = Thread.new()
		assert(_request_worker.start(_complete) == OK)
		return {"ok": true}
	func begin_project_create(project_id: String, path: String) -> Dictionary:
		created_id = project_id
		return begin_project_start(path)
	func _complete() -> Dictionary:
		OS.delay_msec(40)
		return reply.duplicate(true)

var _operation: Operation
var _frames := 0
var _failed := false


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	_operation = Operation.new()
	root.add_child(_operation)
	process_frame.connect(func(): _frames += 1)
	for outcome in ["success", "copy-rejected", "copy-unknown", "open-rejected"]:
		await _save_as(outcome)
	await _new_project()
	await _activation_failure()
	for outcome in ["success", "invalid-library", "open-rejected", "view-rejected"]:
		await _configure_library(outcome)
	await _library_draft_guard()
	_operation.free()
	if not _failed: print("PROVIDENCE_PROJECT_OPERATIONS_OK save-as candidate-isolation unknown-no-retry responsive-new")
	quit(1 if _failed else 0)


func _save_as(outcome: String) -> void:
	var source := SourceBridge.new()
	var candidate := Candidate.new()
	if outcome == "copy-rejected": source.reply = {"ok": false, "error": "Destination exists"}
	if outcome == "copy-unknown": source.reply = {"ok": false, "outcomeUnknown": true, "error": "Lost acknowledgment"}
	if outcome == "open-rejected": candidate.reply = {"ok": false, "outcomeUnknown": true, "error": "Copy could not open"}
	_operation.reset_session()
	_check(_operation.begin(source, "Save As"), "Save As could not reserve its source")
	var frames_before := _frames
	var result: Dictionary = await _operation.save_as(candidate, "destination")
	_check(_frames > frames_before + 1, "Save As stopped frame processing")
	_check(source.calls == [{"method": "project.save-as", "params": {"path": "destination"}}], "Save As changed its command or repeated its copy")
	_check(source.operation_busy(), "Save As released its source before candidate resolution")
	_check(not _operation.begin(source, "Undo"), "Another operation took the Save As lease")
	_check(bool(result.get("ok", false)) == (outcome == "success"), "Save As outcome changed")
	_check(bool(result.get("outcomeUnknown", false)) == (outcome == "copy-unknown"), "Copy and candidate failures have the same recovery meaning")
	_check(result.has("saveAs") == (outcome in ["success", "open-rejected"]), "Completed copy was not distinguished from failed copy")
	if outcome in ["success", "open-rejected"]:
		_check(candidate.opened_path == "copied-project", "Save As ignored the returned destination")
		_check(candidate.options == {"applicationLibrary": "application-library", "referenceCatalog": "reference-catalog", "monsterLibrary": "monster-library"}, "Save As lost reference-library options")
	else:
		_check(candidate.opened_path.is_empty(), "Failed copy attempted to open a destination")
	_operation.finish(result)
	_check(not source.operation_busy(), "Save As retained its source lease")
	if outcome == "copy-unknown":
		_check(not _operation.begin(source, "Save As"), "Unknown copy outcome allowed automatic retry")
	source.stop()
	candidate.stop()


func _new_project() -> void:
	var source := SourceBridge.new()
	var candidate := Candidate.new()
	_operation.reset_session()
	_check(_operation.begin(source, "New Project"), "New Project could not reserve the session")
	var frames_before := _frames
	var result: Dictionary = await _operation.create_project(candidate, "new-scenario", "new-directory")
	_check(_frames > frames_before + 1, "New Project stopped frame processing")
	_check(result.get("ok", false) and candidate.created_id == "new-scenario" and candidate.opened_path == "new-directory", "New Project lost its identity or path")
	_check(source.calls.is_empty(), "New Project changed the existing session")
	_operation.finish(result)
	source.stop()
	candidate.stop()


func _check(condition: bool, message: String) -> void:
	if condition: return
	_failed = true
	push_error("PROVIDENCE_PROJECT_OPERATIONS_FAILED " + message)


func _activation_failure() -> void:
	for method in ["open_project", "create_project", "save_as"]:
		var source := SourceBridge.new()
		source.candidate = Candidate.new()
		var session := preload("res://src/project_session_controller.gd").new()
		session.bridge = source
		var statuses: Array = []
		var failures: Array = []
		session.initialize(_operation, func(_response): return {"ok": false, "error": "Controlled view failure"}, func(): return {"connected": true})
		session.status_changed.connect(func(message): statuses.append(message))
		session.failed.connect(func(message): failures.append(message))
		_operation.reset_session()
		if method == "create_project": await session.create_project("fresh", "destination")
		else: await session.call(method, "destination")
		_check(statuses.is_empty(), "Project success replaced a view failure")
		_check(failures.size() == 1 and failures[0].contains("Controlled view failure"), "Project activation lost its failure boundary")
		_check(session.bridge == source.candidate, "View failure discarded the opened project")
		session.bridge.stop()


func _configure_library(outcome: String) -> void:
	var source := SourceBridge.new()
	var candidate := Candidate.new()
	source.candidate = candidate
	if outcome == "invalid-library": candidate.configuration_reply = {"ok": false, "error": "Invalid library"}
	if outcome == "open-rejected": candidate.reply = {"ok": false, "outcomeUnknown": true, "error": "Failed candidate"}
	var session := preload("res://src/project_session_controller.gd").new()
	session.bridge = source
	var activations: Array = []
	session.initialize(_operation, func(response):
		activations.append(response)
		return {"ok": outcome != "view-rejected"}, func(): return {"connected": true})
	_operation.reset_session()
	var frames_before := _frames
	var source_epoch := source.connection_epoch()
	var response: Dictionary = await session.configure_application_library("new-library")
	_check(_frames > frames_before + 1, "Library configuration blocked frame processing")
	_check(response.get("ok", false) == (outcome == "success"), "Library configuration lost its failure boundary")
	_check(candidate.configured == [["application", "new-library"]], "Library validation was changed or retried")
	_check(source.calls.is_empty(), "Library validation wrote to the original session")
	_check(not _operation.requires_reopen, "Candidate failure locked the untouched original project")
	if outcome in ["success", "view-rejected"]:
		_check(session.bridge == candidate and activations.size() == 1, "Opened library connection was not activated")
		_check(candidate.options == {"applicationLibrary": "new-library", "referenceCatalog": "reference-catalog", "monsterLibrary": "monster-library"}, "Library switch discarded other library options")
	else:
		_check(session.bridge == source and source.connection_epoch() == source_epoch and activations.is_empty(), "Failed library connection replaced the live project")
		_check(candidate.opened_path.is_empty() == (outcome == "invalid-library"), "Invalid library was opened")
	_check(not source.operation_busy(), "Library configuration leaked the source lease")
	session.bridge.stop()
	candidate.stop()


func _library_draft_guard() -> void:
	var source := SourceBridge.new()
	source.candidate = Candidate.new()
	var session := preload("res://src/project_session_controller.gd").new()
	session.bridge = source
	session.initialize(_operation, func(_response): return {"ok": true}, func(): return {}, func(): return true)
	_operation.reset_session()
	var response: Dictionary = await session.configure_application_library("new-library")
	_check(not response.get("ok", false) and response.get("error", "").contains("draft is kept"), "Library replacement discarded an unapplied draft")
	_check(source.candidate.configured.is_empty() and source.candidate.opened_path.is_empty(), "Draft guard ran library configuration")
	response = await session.configure_application_library("application-library")
	_check(response.get("ok", false), "Unchanged library needlessly replaced the project")
	source.stop()
	source.candidate.stop()
