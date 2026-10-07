extends SceneTree

class Draft extends Control:
	var dirty := true
	var accepted := false
	var calls := 0
	var drafts
	func has_unapplied_changes() -> bool: return dirty
	func navigation_subject() -> String: return "Treasure 10"
	func discard_draft() -> void: dirty = false
	func commit_selected() -> void:
		calls += 1
		if drafts.accept({"ok": accepted, "error": "Controlled rejection"}): dirty = false

var _continued := 0
var _errors: Array[String] = []


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	root.gui_embed_subwindows = true
	var tabs := TabContainer.new()
	var editor := Draft.new()
	tabs.add_child(editor)
	root.add_child(tabs)
	var dialog := ConfirmationDialog.new()
	root.add_child(dialog)
	var operations := ProvidenceEditorOperation.new()
	root.add_child(operations)
	var drafts := preload("res://src/editor_draft_apply.gd").new()
	editor.drafts = drafts
	drafts.initialize(tabs, func(response): return response.ok, func(): return null)
	var guard := preload("res://src/draft_navigation.gd").new()
	guard.initialize(dialog, drafts, operations, func(): return null, func(): pass, tabs.get_current_tab_control)
	guard.failed.connect(func(message: String): _errors.append(message))
	await guard.request(_continue, "changing documents")
	assert(dialog.visible and _continued == 0 and editor.calls == 0)
	assert(dialog.dialog_text.begins_with("Treasure 10 has unapplied changes."))
	await guard.apply_and_continue()
	assert(dialog.visible and _continued == 0 and editor.dirty and _errors.size() == 1)
	editor.accepted = true
	await guard.apply_and_continue()
	assert(not dialog.visible and _continued == 1 and not editor.dirty and editor.calls == 2)
	await _check_cancel_discard_busy(guard, editor, operations, dialog)
	dialog.free()
	tabs.free()
	operations.free()
	guard = null
	drafts = null
	await process_frame
	print("PROVIDENCE_DRAFT_NAVIGATION_OK apply-failure-kept accepted-once cancel discard busy-no-queue")
	quit()


func _check_cancel_discard_busy(guard, editor: Draft, operations: ProvidenceEditorOperation, dialog: ConfirmationDialog) -> void:
	editor.dirty = true
	await guard.request(_continue)
	guard.cancel()
	dialog.hide()
	await guard.discard_and_continue(&"discard")
	assert(_continued == 1, "Cancel retained a stale destination")
	editor.dirty = true
	await guard.request(_continue)
	await guard.discard_and_continue(&"discard")
	assert(_continued == 2 and not editor.dirty and editor.calls == 2)
	operations.busy = true
	await guard.request(_continue)
	assert(_continued == 2 and not dialog.visible)
	operations.busy = false
	await process_frame
	assert(_continued == 2, "Busy navigation was queued")
	await guard.request(_continue)
	assert(_continued == 3)


func _continue() -> void:
	_continued += 1
