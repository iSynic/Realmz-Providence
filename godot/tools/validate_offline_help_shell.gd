extends SceneTree

class HeldStatus extends "res://src/collaboration_observer.gd":
	signal released(response: Dictionary)
	var pending := false
	func read_status(_source: ProvidenceNativeBridge, _tree: SceneTree) -> Dictionary:
		pending = true
		return await released

class HeldDraftRegistration extends "res://src/collaboration_session.gd":
	signal registration_released
	var registration_pending := false
	func _report_draft() -> Dictionary:
		registration_pending = true
		await registration_released
		return {"ok":true}

class PendingControlBridge extends ProvidenceNativeBridge:
	func poll_request() -> Dictionary: return {"pending":true}

class ClosingControlOwner extends Node:
	var control = preload("res://src/collaboration_observer.gd").new()
	var completed := [false]
	func start() -> void:
		control._bridge = PendingControlBridge.new()
		var response: Dictionary = await control._wait(get_tree())
		completed[0] = response.get("cancelled", false)
	func _exit_tree() -> void: control.close()

var _shell: Control
var _reader: Window
var _scratch := ""


func _initialize() -> void: _run.call_deferred()


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	assert(args.size() == 1, "Expected retained evidence root")
	_scratch = args[0]
	root.gui_embed_subwindows = true
	OS.set_environment("PROVIDENCE_PROJECT_PATH", "")
	_shell = load("res://src/editor_shell.tscn").instantiate()
	root.add_child(_shell)
	if not _shell.startup_presentable: await _shell.startup_completed
	_reader = _shell._commands._offline_help.get_node("%Reader")
	for pair in [["help.documents", "getting-started"], ["help.shortcuts", "shortcuts"], ["help.compatibility", "glossary"], ["help.source-evidence", "evidence"], ["help.about", "about"]]:
		_shell._application_menu.command_requested.emit(StringName(pair[0]))
		await _settle()
		assert(_reader.visible and _reader.topic == pair[1])
		_reader.close_reader()
	_shell._commands.show_palette()
	_shell._palette._request_command("help.documents")
	await _settle()
	assert(_reader.visible and _reader.get_node("%OpenTool").disabled)
	_reader.close_reader()
	_shell._bridge.stop()
	_shell._bridge = ProvidenceNativeBridge.new(_scratch.path_join("settings.cfg"))
	var created: Dictionary = _shell._bridge.create_project("offline-help-guard", _scratch.path_join("project"))
	assert(created.get("ok", false), str(created))
	assert((await _shell._activate_session(created, "scenario.contact")).ok)
	await _settle()
	await _draft_guards()
	await _availability()
	await _draft_registration_availability()
	await _status_read_keeps_commands_available()
	await _control_owner_cancels_before_free()
	await _queued_teardown_ignores_status()
	print("PROVIDENCE_OFFLINE_HELP_SHELL_OK menu palette no-project real-adapter draft-kept cancel discard apply history busy recovery dialog guards held-status-read")
	quit()


func _edit_name(value: String) -> void:
	var view = _shell._documents.view("scenario.contact")
	view.text_field("ContactTitle").text = value
	view.draft_changed()
	assert(view.has_unapplied_changes())
	await view.controller.validate()
	assert(view.can_commit())


func _open_maps() -> void:
	_shell._commands.dispatch(&"help.documents")
	await _settle()
	await _wait_tool_enabled()
	_reader.get_node("%OpenTool").pressed.emit()
	await _settle()


func _draft_guards() -> void:
	var view = _shell._documents.view("scenario.contact")
	var revision: int = _shell._session_view.revision
	await _edit_name("Kept while reading")
	await _open_maps()
	assert(_shell._unapplied_dialog.visible and view.has_unapplied_changes())
	assert(_shell._session_view.revision == revision)
	_shell._unapplied_dialog.hide()
	_shell._unapplied_dialog.canceled.emit()
	await _settle()
	assert(_reader.visible and view.text_field("ContactTitle").text == "Kept while reading")
	_reader.get_node("%OpenTool").pressed.emit()
	await _settle()
	_shell._unapplied_dialog.custom_action.emit(&"discard")
	await _settle()
	assert(not _reader.visible and not view.has_unapplied_changes())
	assert(_shell._navigation.current_route() == "maps.land" and _shell._session_view.revision == revision)
	await _shell._navigation.select_route("scenario.contact")
	await _edit_name("Applied through Help guard")
	await _open_maps()
	_shell._unapplied_dialog.confirmed.emit()
	await _settle()
	assert(not _reader.visible and not view.has_unapplied_changes())
	assert(_shell._navigation.current_route() == "maps.land" and _shell._session_view.revision == revision + 1)
	await _prove_old_settle_race()
	await _shell._execute_history("undo")
	await _settle()
	assert(_shell._session_view.revision == revision + 2, "Undo was not submitted after the completed navigation")
	await _shell._navigation.select_route("scenario.contact")
	assert(view.text_field("ContactTitle").text != "Applied through Help guard", JSON.stringify({"revision": _shell._session_view.revision, "viewRevision": view.applied_revision(), "refresh": _shell._documents.controller("scenario.contact").refresh_in_progress(), "stale": _shell._document_changes.needs_refresh("scenario.contact"), "status": _shell._status.text}))


func _availability() -> void:
	assert(_shell._operations.begin(_shell._bridge, "Controlled Help availability"))
	_shell._commands.dispatch(&"help.documents")
	await _settle(false)
	assert(_reader.visible and _reader.get_node("%OpenTool").disabled)
	assert(_reader.get_node("%OpenTool").tooltip_text.contains("current operation"))
	_shell._operations.finish({"ok": true}, false, false)
	assert(_reader.get_node("%OpenTool").disabled and _reader._availability().allowed, "Availability is a periodic UI projection, distinct from the completed operation")
	await _wait_tool_enabled()
	_shell._operations.requires_reopen = true
	await create_timer(0.3).timeout
	assert(_reader.get_node("%OpenTool").disabled and _reader.get_node("%OpenTool").tooltip_text.contains("Reopen"))
	_shell._operations.requires_reopen = false
	_shell._issues.repair.show()
	await create_timer(0.3).timeout
	assert(_reader.get_node("%OpenTool").disabled and _reader.get_node("%OpenTool").tooltip_text.contains("authoring dialog"))
	_shell._issues.repair.hide()
	await create_timer(0.3).timeout
	assert(not _reader.get_node("%OpenTool").disabled)
	_reader.close_reader()


func _wait_tool_enabled() -> void:
	var deadline := Time.get_ticks_msec() + 2000
	while _reader.get_node("%OpenTool").disabled and Time.get_ticks_msec() < deadline: await process_frame
	assert(not _reader.get_node("%OpenTool").disabled, _reader.get_node("%OpenTool").tooltip_text)


func _status_read_keeps_commands_available() -> void:
	var collaboration = _shell._collaboration
	collaboration.set_process(false)
	while collaboration._checking or _shell._operations.busy: await process_frame
	collaboration._observer.close()
	var held := HeldStatus.new()
	collaboration._observer = held
	collaboration._process(0.3)
	assert(held.pending and collaboration._checking)
	assert(not _shell._operations.busy and not _shell._bridge.operation_busy())
	_shell._commands.dispatch(&"help.documents")
	await _settle()
	await _wait_tool_enabled()
	assert(held.pending and collaboration._checking, "The controlled status response must still be outstanding")
	_reader.get_node("%OpenTool").pressed.emit()
	await _settle()
	assert(not _reader.visible and _shell._navigation.current_route() == "maps.land")
	held.released.emit({"ok": true, "result": {"revision": _shell._session_view.revision}})
	while collaboration._checking: await process_frame
	held.close()
	collaboration._observer = preload("res://src/collaboration_observer.gd").new()
	collaboration.set_process(true)
	print("COLLABORATION_STATUS_READ_OK held-response Help availability and ordinary navigation remain usable")


func _draft_registration_availability() -> void:
	var original = _shell._collaboration
	original.set_process(false)
	while original._checking or _shell._operations.busy: await process_frame
	assert(not _shell._redo_button.disabled, "The witnessed Help-guard Undo must leave Redo available")
	var controlled := HeldDraftRegistration.new()
	controlled.set_process(false)
	_shell.add_child(controlled)
	controlled.initialize(original._read_bridge, _shell._operations, _shell._draft_apply, original._prepare_input, original._read_context, original._refresh_external)
	var held := HeldStatus.new()
	controlled._observer = held
	controlled._process(0.3)
	held.released.emit({"ok":true,"result":{"revision":_shell._session_view.revision}})
	assert(controlled.registration_pending and not _shell._operations.busy and not _shell._bridge.operation_busy())
	assert(not _shell._redo_button.disabled, "Draft registration must leave the editing stream and enabled commands available")
	var view = _shell._documents.view("scenario.contact")
	assert(view.text_field("ContactTitle").editable, "Ordinary typing must remain available during draft registration")
	view.text_field("ContactTitle").text = "Typed while draft registration was pending"
	view.draft_changed()
	controlled.registration_released.emit()
	while controlled._checking: await process_frame
	assert(view.text_field("ContactTitle").text == "Typed while draft registration was pending" and view.has_unapplied_changes())
	view.discard_draft()
	controlled.queue_free()
	await process_frame
	original.set_process(true)
	await _settle()
	print("COLLABORATION_DRAFT_REGISTRATION_OK separate-control-stream commands-available late-typing retained")


func _queued_teardown_ignores_status() -> void:
	var collaboration = _shell._collaboration
	collaboration.set_process(false)
	while collaboration._checking or _shell._operations.busy: await process_frame
	collaboration._observer.close()
	var held := HeldStatus.new()
	collaboration._observer = held
	var presentations := [0]
	collaboration.state_changed.connect(func(_state): presentations[0] += 1)
	collaboration._process(0.3)
	assert(held.pending and collaboration._checking)
	var revision: int = _shell._session_view.revision
	_shell.queue_free()
	held.released.emit({"ok":true,"result":{"revision":revision}})
	assert(presentations[0] == 0, "A late response must not inspect workbenches in a queued shell")
	await process_frame
	print("COLLABORATION_TEARDOWN_OK queued-ancestor late-status-response ignored")


func _control_owner_cancels_before_free() -> void:
	var owner := ClosingControlOwner.new()
	root.add_child(owner)
	owner.start()
	assert(owner.control._waiting)
	var completed: Array = owner.completed
	owner.queue_free()
	await process_frame
	assert(completed[0], "Closing an owner must synchronously cancel its control await before the Node is freed")
	print("COLLABORATION_CONTROL_LIFETIME_OK owner-exit cancels-await before-node-free")


func _settle(idle := true) -> void:
	var deadline := Time.get_ticks_msec() + 15000
	var stable := 0
	while stable < 5 and Time.get_ticks_msec() < deadline:
		await process_frame
		var view = _shell._documents.view("scenario.contact")
		var ready: bool = not _shell._operations.busy and not _shell._bridge.operation_busy() and not _shell._draft_apply._collecting and view._validation_delay.is_stopped()
		stable = stable + 1 if not idle or ready else 0
	assert(stable >= 5, "Help workflow did not settle")


func _prove_old_settle_race() -> void:
	_controlled_read.call_deferred()
	for frame in 5: await process_frame
	while _shell._operations.busy or _shell._bridge.operation_busy(): await process_frame
	for frame in 5: await process_frame
	assert(_shell._operations.busy, "Old five-frame tail should return during the controlled read")
	var revision: int = _shell._session_view.revision
	await _shell._execute_history("undo")
	assert(_shell._session_view.revision == revision, "Busy history intent must not submit a write")
	assert(_shell._documents.view("scenario.contact").text_field("ContactTitle").text == "Applied through Help guard", "The old harness must reproduce the unchanged-title symptom")
	await _settle()
	print("HELP_HARNESS_RACE_REPRODUCED old-tail-returned-busy undo-not-submitted stable-operation-boundary-corrected")


func _controlled_read() -> void:
	for frame in 7: await process_frame
	assert(_shell._operations.begin(_shell._bridge, "Controlled late read"))
	for frame in 6: await process_frame
	_shell._operations.finish({"ok": true}, false, false)
