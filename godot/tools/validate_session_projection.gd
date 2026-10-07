extends SceneTree

class Problems extends RefCounted:
	var reads: Array = []
	var context: Callable
	func refresh() -> Dictionary:
		reads.append(context.call())
		return {"ok": true}

var _view := preload("res://src/session_projection.gd").new()
var _operations := ProvidenceEditorOperation.new()
var _changes := ProvidenceDocumentChanges.new()
var _problems := Problems.new()
var _events: Array = []


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var dock: ProvidenceProblemsDock = preload("res://src/problems_dock.tscn").instantiate()
	root.add_child(dock)
	root.add_child(_operations)
	root.add_child(_view)
	_changes.register_document("text.messages", ["message"])
	_view.initialize(_changes, _operations, _problems, dock, func(): return true)
	_problems.context = _view.context
	_view.history_changed.connect(func(undo, redo): _events.append([undo, redo]))
	_view.authored_change.connect(func(): _events.append("dirty"))
	_view.revision_changed.connect(func(revision): _events.append(revision))
	_view.attach({"projectId": "first", "revision": 3, "canUndo": true})
	assert(_view.context() == {"projectId": "first", "revision": 3, "connected": true, "sessionGeneration": 1})
	_view.apply({"revision": 4, "canRedo": true, "changedEntities": ["message:1"],
		"referenceChanges": [{"source": "a", "field": "x", "target": "old"}]})
	assert(_events == [[true, false], "dirty", [false, true], 4])
	assert(_changes.needs_refresh("text.messages"))
	_view.apply({"revision": 4, "referenceChanges": [
		{"source": "a", "field": "x", "target": "new"}, {"source": "a", "field": "y", "target": "second"}]}, false)
	assert(_view.references.size() == 2 and _view.references[0].target == "new")
	assert(_events.count("dirty") == 1 and _events.count(4) == 1)
	_view.connected = false
	_operations.requires_reopen = true
	_operations.completed.emit({"ok":true,"mediaRecoveryConfirmed":true})
	assert(not _view.connected, "An unresolved shared operation unlocked the session")
	_operations.requires_reopen = false
	_operations.completed.emit({"ok":true})
	assert(not _view.connected, "An ordinary read unlocked an unconfirmed session")
	_operations.completed.emit({"ok":true,"mediaRecoveryConfirmed":true})
	assert(_view.connected and _view.revision == 4, "Confirmed recovery lost the current session")
	await _check_deferred_validation()
	_operations.busy = true
	_view.apply({"revision": 2, "truncated": true})
	await process_frame
	_view.free()
	_operations.busy = false
	await process_frame
	assert(_problems.reads.size() == 1, "Teardown issued a queued validation read")
	_operations.free()
	dock.free()
	await process_frame
	print("PROVIDENCE_SESSION_PROJECTION_OK acknowledged-context bounded-reference-merge coalesced-validation replaced-session-clear queued-teardown confirmed-recovery-only")
	quit()


func _check_deferred_validation() -> void:
	_operations.busy = true
	_view.apply({"revision": 4, "truncated": true})
	await process_frame
	assert(_problems.reads.is_empty(), "Validation contended with an active operation")
	_view.clear()
	_operations.busy = false
	for _frame in 3: await process_frame
	assert(_problems.reads.is_empty(), "A cleared session retained a deferred validation read")
	assert(not _view.connected and _view.references.is_empty() and _view.revision == 0)
	_view.attach({"projectId": "second", "revision": 8})
	_view.apply({"revision": 8, "truncated": true})
	_view.attach({"projectId": "third", "revision": 2})
	_view.apply({"revision": 2, "truncated": true})
	_view.apply({"revision": 2, "truncated": true})
	for _frame in 3: await process_frame
	assert(_problems.reads == [{"projectId": "third", "revision": 2, "connected": true, "sessionGeneration": 4}], "An old refresh cleared or duplicated the new session's read")
