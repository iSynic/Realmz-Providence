extends Node

signal history_changed(can_undo: bool, can_redo: bool)
signal project_changed
signal revision_changed(revision: int)
signal authored_change
signal reference_changed(reference: Dictionary)
signal status_changed(message: String)

# This is acknowledged view context, not authored state. Only native results
# advance the revision; workbench controllers retain their own local drafts.
var revision := 0
var project_id := ""
var connected := false
var references: Array = []
var _changes: ProvidenceDocumentChanges
var _operations: ProvidenceEditorOperation
var _problems
var _dock: ProvidenceProblemsDock
var _project_backed: Callable
var _generation := 0
var _validation_queued := false


func initialize(changes: ProvidenceDocumentChanges, operations: ProvidenceEditorOperation, problems, dock: ProvidenceProblemsDock, project_backed: Callable) -> void:
	_changes = changes
	_operations = operations
	_problems = problems
	_dock = dock
	_project_backed = project_backed
	_operations.completed.connect(_restore_after_recovery)


func _restore_after_recovery(response: Dictionary) -> void:
	if connected or project_id.is_empty() or _operations.requires_reopen or not response.get("ok", false): return
	var confirmed := ["repairRecoveryConfirmed", "encounterRecoveryConfirmed", "monsterRecoveryConfirmed",
		"itemRecoveryConfirmed", "battleRecoveryConfirmed", "mediaRecoveryConfirmed", "worldRecoveryConfirmed"]
	if not confirmed.any(func(flag): return response.get(flag, false)): return
	# A confirmed read reopens the original session; it does not replace drafts.
	connected = true
	project_changed.emit()


func context() -> Dictionary:
	return {"revision": revision, "projectId": project_id, "connected": connected, "sessionGeneration": _generation}


func attach(session: Dictionary) -> void:
	_generation += 1
	_validation_queued = false
	_operations.reset_session()
	revision = int(session.get("revision", 0))
	project_id = str(session.get("projectId", ""))
	connected = true
	references.clear()
	_dock.reset()
	history_changed.emit(bool(session.get("canUndo", false)), bool(session.get("canRedo", false)))


func clear() -> void:
	_generation += 1
	_validation_queued = false
	revision = 0
	project_id = ""
	connected = false
	references.clear()
	_dock.reset()
	history_changed.emit(false, false)


func apply(projection: Dictionary, refresh_workbenches: bool = true) -> void:
	_changes.invalidate(projection, project_id)
	project_changed.emit()
	var previous := revision
	revision = int(projection.get("revision", revision))
	if revision != previous and _project_backed.call(): authored_change.emit()
	history_changed.emit(bool(projection.get("canUndo", false)), bool(projection.get("canRedo", false)))
	_dock.merge_projection(projection)
	var reference_changes: Array = projection.get("referenceChanges", [])
	if not reference_changes.is_empty():
		_merge_references(reference_changes)
		reference_changed.emit(reference_changes[0])
	if projection.get("truncated", false) and not _validation_queued:
		_validation_queued = true
		_refresh_validation.call_deferred(weakref(self), get_tree(), _generation)
	status_changed.emit(_operations.label + " in progress · updating the view…" if _operations.busy else "Applied bounded delta · revision %d" % revision)
	if refresh_workbenches: revision_changed.emit(revision)


func _merge_references(changes: Array) -> void:
	for changed: Dictionary in changes:
		var replaced := false
		for index in references.size():
			var existing: Dictionary = references[index]
			if existing.get("source") == changed.get("source") and existing.get("field") == changed.get("field"):
				references[index] = changed
				replaced = true
				break
		if not replaced: references.append(changed)


static func _refresh_validation(handle: WeakRef, tree: SceneTree, generation: int) -> void:
	# A weak reference keeps a queued read from resuming on a freed UI node.
	# The session generation also prevents it consuming a replacement's queue.
	while true:
		var view: Node = handle.get_ref()
		if view == null or not view.is_inside_tree() or generation != view._generation or not view._validation_queued: return
		if not view._operations.busy:
			view._validation_queued = false
			var problems: RefCounted = view._problems
			if view.connected: await problems.refresh()
			return
		await tree.process_frame
