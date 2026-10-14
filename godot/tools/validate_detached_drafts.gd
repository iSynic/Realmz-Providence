extends SceneTree

class Editor extends Control:
	var dirty := false
	var applies := 0
	var response := {"ok": true}
	var drafts
	func has_unapplied_changes() -> bool: return dirty
	func discard_draft() -> void: dirty = false
	func commit_selected() -> void:
		applies += 1
		if response.get("ok", false): dirty = false
		drafts.accept(response)

var _checks := 0


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var tabs := TabContainer.new(); root.add_child(tabs)
	var main := Editor.new(); tabs.add_child(main)
	var detached := Editor.new(); root.add_child(detached)
	var drafts := preload("res://src/editor_draft_apply.gd").new()
	drafts.initialize(tabs, func(response): return response.get("ok", false), func(): return null)
	main.drafts = drafts; detached.drafts = drafts
	drafts.register_detached(detached, func(): return false)
	detached.dirty = true
	_check(not drafts.has_draft() and drafts.has_any_draft(), "An unfocused detached draft belongs to global guards")
	drafts.guard_editor(detached)
	_check(drafts.current_editor() == detached and drafts.has_draft(), "Modal guard must keep its explicit draft owner")
	detached.response = {"ok": false, "outcomeUnknown": true, "error": "Lost acknowledgement"}
	var rejected: Dictionary = await drafts.commit()
	_check(rejected.get("outcomeUnknown", false) and detached.dirty and detached.applies == 1, "Unknown result must retain the detached draft without retry")
	drafts.guard_editor(null)
	drafts.unregister_detached(detached); detached.reparent(tabs)
	_check(drafts.has_any_draft() and drafts.first_draft() == detached, "Docking a dirty hidden editor must keep it in global guards")
	drafts.guard_editor(detached); drafts.discard(); drafts.guard_editor(null)
	_check(not drafts.has_any_draft(), "Explicit discard resolves only the selected editor")
	drafts.register_detached(detached, func(): return true)
	_check(drafts.current_editor() == detached, "Focused tool must own Apply")
	main.dirty = true; detached.dirty = true; detached.response = {"ok": true}
	await drafts.commit_editor(detached)
	_check(main.dirty and not detached.dirty, "Tool Apply must leave another draft untouched")
	drafts.unregister_detached(detached)
	tabs.free(); await process_frame
	print("PROVIDENCE_DETACHED_DRAFTS_OK checks=%d focused-owner global-guard docked-draft rejected-apply unknown-no-retry" % _checks)
	quit()


func _check(value: bool, message: String) -> void:
	_checks += 1
	assert(value, message)
