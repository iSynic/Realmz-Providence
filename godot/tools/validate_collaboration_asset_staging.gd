extends SceneTree

var _view: Control
var _drafts := preload("res://src/editor_draft_apply.gd").new()
var _samples := 0
var _failed := false


func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	var tabs := TabContainer.new()
	root.add_child(tabs)
	_drafts.initialize(tabs, Callable(), func(): return null)
	_view = load("res://src/unified_assets_editor.tscn").instantiate()
	await _view.prepare_async(self)
	process_frame.connect(_sample)
	await _view.initialize_staged(tabs)
	process_frame.disconnect(_sample)
	_check(_samples >= 4, "Observe the staged workbench before all five children attach")
	_check(not _drafts.has_any_draft(), "Ready workbench releases its temporary editing hold")
	# A real text draft remains authoritative once the workbench is ready.
	_view.get_node("%NewTextDialog").show()
	_check(_drafts.has_any_draft(), "Ready workbench still reports an unapplied document")
	_view.get_node("%NewTextDialog").hide()
	_view.queue_free()
	await process_frame
	if not _failed:
		print("PROVIDENCE_COLLABORATION_ASSET_STAGING_OK incomplete-blocks-writes ready-releases-hold real-draft-retained")
	quit(1 if _failed else 0)


func _sample() -> void:
	if not _view.is_inside_tree(): return
	_samples += 1
	_check(_drafts.has_any_draft(), "Incomplete workbench holds external edits")
	_check(_drafts.draft_locations().size() == 1, "Incomplete workbench has a safe draft location")


func _check(condition: bool, label: String) -> void:
	if condition: return
	_failed = true
	push_error("COLLABORATION_ASSET_STAGING_FAILED " + label)
