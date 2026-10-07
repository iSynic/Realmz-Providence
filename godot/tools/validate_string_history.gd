extends SceneTree

class CheckedBridge extends "res://src/native_bridge.gd":
	var calls: Array[String] = []
	var slow_history := false
	func configured_application_library_root(_explicit_root: String = "") -> String: return ""
	func configured_reference_catalog_root(_explicit_root: String = "") -> String: return ""
	func configured_monster_library_root(_explicit_root: String = "") -> String: return ""
	func _request(method: String, params: Dictionary) -> Dictionary:
		if slow_history and method == "history.undo": OS.delay_msec(180)
		calls.append(method)
		return super._request(method, params)

var _shell
var _failed := false
var _completion_text := ""


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if not _check(args.size() == 1 and args[0].get_file() == "string-project"
		and args[0].get_base_dir().get_file().begins_with("providence-ui-")
		and not DirAccess.dir_exists_absolute(args[0]), "Expected a fresh disposable string-project path."):
		quit(1)
		return
	var prior := OS.get_environment("PROVIDENCE_PROJECT_PATH")
	OS.set_environment("PROVIDENCE_PROJECT_PATH", "")
	root.gui_embed_subwindows = true
	_shell = load("res://src/editor_shell.tscn").instantiate()
	root.add_child(_shell)
	await process_frame
	_shell._bridge.stop()
	_shell._bridge = CheckedBridge.new(args[0].get_base_dir().path_join("settings.cfg"))
	var created: Dictionary = _shell._bridge.create_project("string-history", args[0])
	if _check(created.get("ok", false), "Could not create the disposable project."):
		var inserted: Dictionary = _shell._bridge.request("message.create", {
			"expectedRevision": 0, "nativeId": 7, "text": "Original native string"})
		if _check(inserted.get("ok", false), "Could not create the native string fixture."):
			await _shell._activate_session(_shell._bridge.request("session.describe"))
			await _settle()
			await _exercise()
	_shell.free()
	OS.set_environment("PROVIDENCE_PROJECT_PATH", prior)
	await process_frame
	if not _failed: print("PROVIDENCE_STRING_HISTORY_OK durable-apply undo-visible-before-release redo-visible bounded-requests hidden-stale draft-kept live-typing history-no-queue reopen")
	quit(1 if _failed else 0)


func _exercise() -> void:
	_shell._navigation.select_route("text.messages")
	await _settle()
	var view = _shell._strings
	if not _check(view._message_editor.text == "Original native string", "Route activation did not load the string."): return
	var identity: String = view.selected_identity()
	view._message_editor.text = "Edited native string"
	await _shell._commit_edit()
	await _settle()
	_check(not view.has_unapplied_changes() and _shell._session_view.revision == 2, "Apply was not acknowledged at one durable revision.")
	_shell._operations.completed.connect(func(_response): _completion_text = view._message_editor.text)
	_shell._bridge.calls.clear()
	await _shell._undo()
	_check(_completion_text == "Original native string", "Undo released its operation before replacing visible text.")
	_check(view.selected_identity() == identity and not _shell._document_changes.needs_refresh("text.messages"), "Undo lost selection or left the view stale.")
	_check(_shell._bridge.calls == ["history.undo", "message.list", "message.open", "reference.used-by"], "Undo loaded unrelated workbenches or omitted bounded string reads: " + str(_shell._bridge.calls))
	await _shell._redo()
	_check(_completion_text == "Edited native string", "Redo did not replace visible text before completing.")
	await _check_live_input()
	await _check_hidden_and_draft(identity)
	await _shell._project_session.save()
	await _shell._project_session.open_project(_shell._bridge.current_project_path())
	await _settle()
	_check(_shell._strings._message_editor.text == "Edited native string", "Save/reopen lost the authored string.")


func _check_live_input() -> void:
	var edit: TextEdit = _shell._strings._message_editor
	edit.grab_focus()
	edit.set_caret_column(edit.text.length())
	await process_frame
	_shell._bridge.slow_history = true
	_shell._bridge.calls.clear()
	_shell._undo()
	_check(_shell._operations.busy, "Undo did not show busy synchronously.")
	_key(KEY_X, 120)
	await process_frame
	_check(edit.text == "Edited native stringx" and edit.has_focus(), "Native input was blocked while history ran.")
	for _press in 5: _key(KEY_Z, 0, true)
	await _shell._navigation.select_route("economy.items")
	await _shell._commit_edit()
	_shell._commands.dispatch(&"file.close-project")
	_check(_shell._document_tabs.get_current_tab_control() == _shell._strings, "Busy navigation switched documents.")
	await _settle()
	_check(edit.text == "Edited native stringx" and _shell._strings.has_unapplied_changes(), "History completion erased late typing.")
	_check(_shell._bridge.calls.filter(func(method): return method != "text.inspect-draft") == ["history.undo"], "Busy shortcuts or Apply entered the transport: " + str(_shell._bridge.calls))
	_check(_shell._document_changes.needs_refresh("text.messages"), "The protected late draft lost its pending refresh.")
	_shell._bridge.slow_history = false
	_shell._strings.discard_draft()
	await _shell._presentation.refresh_current()
	_check(edit.text == "Original native string", "Discard followed by refresh did not reconcile the acknowledged Undo.")
	await _shell._redo()
	_check(edit.text == "Edited native string", "Redo after late-draft reconciliation lost authored text.")


func _key(code: Key, unicode: int, control: bool = false) -> void:
	var event := InputEventKey.new()
	event.keycode = code
	event.unicode = unicode
	event.ctrl_pressed = control
	event.pressed = true
	root.push_input(event)
	event.pressed = false
	root.push_input(event)


func _check_hidden_and_draft(identity: String) -> void:
	_shell._navigation.select_route("maps.land")
	await _settle()
	_shell._bridge.calls.clear()
	await _shell._undo()
	_check(not _shell._bridge.calls.has("message.list") and _shell._document_changes.needs_refresh("text.messages"), "Hidden Strings was loaded eagerly or lost its invalidation.")
	_shell._navigation.select_route("text.messages")
	await _settle()
	_check(_shell._strings._message_editor.text == "Original native string", "Hidden Strings did not refresh on activation.")
	await _shell._redo()
	_shell._strings._message_editor.text = "Keep this unrelated draft"
	var count: int = _shell._bridge.calls.size()
	_shell._document_changes.invalidate({"changedEntities": ["land:9"]}, "string-history")
	_check(not _shell._document_changes.needs_refresh("text.messages"), "Unrelated terrain invalidated the Strings cache.")
	await _shell._presentation.refresh_current()
	_check(_shell._strings.has_unapplied_changes() and _shell._strings.selected_identity() == identity, "Unrelated invalidation discarded the draft or selection.")
	_check(_shell._bridge.calls.size() == count, "Refreshing a protected draft entered the native stream.")
	_shell._strings.discard_draft()


func _settle() -> void:
	for _frame in 8: await process_frame
	while _shell._operations.busy: await process_frame
	for _frame in 3: await process_frame


func _check(condition: bool, message: String) -> bool:
	if not condition:
		_failed = true
		push_error("PROVIDENCE_STRING_HISTORY_FAILED " + message)
	return condition
