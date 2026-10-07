extends RefCounted

var _collecting := false
var _result: Dictionary = {}
var _tabs: TabContainer
var _response_handler: Callable
var _dialog_resolver: Callable
var _custom: Dictionary = {}


func initialize(tabs: TabContainer, response_handler: Callable, dialog_resolver: Callable) -> void:
	_tabs = tabs
	_response_handler = response_handler
	_dialog_resolver = dialog_resolver


func register_editor(editor: Control, has_draft: Callable, discard: Callable, apply: Callable) -> void:
	_custom[editor] = {"hasDraft": has_draft, "discard": discard, "apply": apply}


func has_draft() -> bool:
	var dialog: Window = _dialog_resolver.call()
	if dialog != null: return dialog.has_unapplied_changes()
	var editor := _tabs.get_current_tab_control()
	if _custom.has(editor): return _custom[editor].hasDraft.call()
	return editor.has_unapplied_changes() if editor.has_method("has_unapplied_changes") else false


func discard() -> void:
	var editor := _tabs.get_current_tab_control()
	if _custom.has(editor):
		_custom[editor].discard.call()
	elif editor.has_method("discard_draft"):
		editor.discard_draft()


func commit() -> Dictionary:
	if _collecting:
		return {"ok": false, "busy": true, "error": "Wait for the current change to finish. Your draft is kept."}
	var editor: Control = _tabs.get_current_tab_control()
	if not _custom.has(editor) and not editor.has_method("commit_selected"): return {}
	if editor.has_method("draft_error"):
		var problem: Dictionary = editor.draft_error()
		if not problem.is_empty():
			return problem
	_result = {}
	_collecting = true
	if _custom.has(editor):
		await _custom[editor].apply.call()
	elif editor.has_method("commit_selected"):
		await editor.commit_selected()
	_collecting = false
	if _result.is_empty():
		return {"ok": false, "error": "The editor did not confirm this change. Check the selected record before trying again."}
	if bool(_result.get("ok", false)) and has_draft():
		return {"ok": false, "error": "Some changes still need to be applied. Keep editing before leaving this record.", "partlyApplied": true}
	return _result


func accept(response: Dictionary) -> bool:
	if _collecting:
		if _result.is_empty() or bool(_result.get("ok", false)):
			_result = response.duplicate(true)
		return bool(response.get("ok", false))
	return _response_handler.call(response)


static func failure(message: String, control: Control, tree: Tree = null, slot: int = -1) -> Dictionary:
	return {"ok": false, "error": message, "control": control, "actionTree": tree, "actionSlot": slot}


static func focus_error(problem: Dictionary, fallback: Control) -> void:
	var tree: Tree = problem.get("actionTree")
	if is_instance_valid(tree) and tree.get_root() != null:
		var item := tree.get_root().get_first_child()
		while item != null:
			var metadata: Variant = item.get_metadata(0)
			if metadata is Dictionary and int(metadata.get("slot", -1)) == int(problem.get("actionSlot", -1)):
				if tree.get_selected() != item:
					item.select(0)
					tree.item_selected.emit()
				tree.scroll_to_item(item)
				break
			item = item.get_next()
	var control: Control = problem.get("control")
	if not is_instance_valid(control): control = fallback
	if is_instance_valid(control) and control.is_visible_in_tree():
		control.grab_focus()
