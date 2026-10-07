extends SceneTree

const Drafts = preload("res://src/editor_draft_apply.gd")

class DraftEditor extends Control:
	var dirty := true
	var applied := 0
	var drafts: RefCounted
	var response: Dictionary = {"ok": true}
	var stays_dirty := false
	var delay := false
	func has_unapplied_changes() -> bool: return dirty
	func discard_draft() -> void: dirty = false
	func commit_selected() -> void:
		applied += 1
		if delay: await get_tree().create_timer(0.04).timeout
		if drafts.accept(response) and not stays_dirty: dirty = false


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var tabs := TabContainer.new()
	var editor := DraftEditor.new()
	var drafts := Drafts.new()
	editor.drafts = drafts
	tabs.add_child(editor)
	root.add_child(tabs)
	drafts.initialize(tabs, func(response): return response.get("ok", false), func(): return null)
	assert(drafts.has_draft())
	# Acceptance follows the command result, not a revision side effect.
	assert((await drafts.commit()).get("ok", false) and not drafts.has_draft())
	editor.dirty = true
	editor.response = {"ok": false, "error": "Controlled rejection"}
	assert(not (await drafts.commit()).get("ok", false) and drafts.has_draft())
	editor.response = {"ok": true}
	editor.stays_dirty = true
	assert((await drafts.commit()).get("partlyApplied", false) and drafts.has_draft())
	editor.response = {"ok": false, "outcomeUnknown": true, "error": "Connection lost"}
	assert((await drafts.commit()).get("outcomeUnknown", false) and drafts.has_draft())
	assert(editor.applied == 4, "An unknown outcome must not retry the mutation")
	drafts.discard()
	assert(not drafts.has_draft())
	editor.delay = true
	editor.dirty = true
	editor.stays_dirty = false
	editor.response = {"ok": true}
	var completed: Array = []
	_collect_async(drafts, completed)
	assert((await drafts.commit()).get("busy", false), "A second Apply entered the pending draft")
	assert(editor.applied == 5 and drafts.has_draft(), "Pending Apply prematurely discarded or repeated the draft")
	while completed.is_empty(): await process_frame
	assert(completed[0].get("ok", false) and not drafts.has_draft(), "Asynchronous draft completion was not collected")
	tabs.free()
	drafts = null
	await process_frame
	print("PROVIDENCE_DRAFT_CONTROLLER_OK accepted rejected partial unknown no-retry discard")
	quit()


func _collect_async(drafts: RefCounted, completed: Array) -> void:
	completed.append(await drafts.commit())
