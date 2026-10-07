extends SceneTree

class FaultBridge extends "res://src/native_bridge.gd":
	var lose_next_reply := false
	var reject_next := false
	var apply_attempts := 0
	func _request(method: String, params: Dictionary) -> Dictionary:
		if method != "battle.draft.apply": return super._request(method, params)
		apply_attempts += 1
		if reject_next:
			reject_next = false
			super._request("message.update", {"expectedRevision": params.expectedRevision, "identity": "message:148", "text": "Concurrent edit before rejected Apply"})
		var response: Dictionary = super._request(method, params)
		if lose_next_reply:
			lose_next_reply = false
			return {"ok": false, "outcomeUnknown": true, "error": "Controlled lost acknowledgement after durable Battle Apply"}
		return response

var _shell
var _view: ProvidenceBattleEditor
var _failed := false
var _root_path := ""
var _project := ""
var _receipt: Dictionary = {}


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if not _check(args.size() == 2, "Expected source project and a disposable output root"): return
	_root_path = args[1]
	_project = _root_path.path_join("project")
	DirAccess.make_dir_recursive_absolute(_root_path)
	if not _copy_project(args[0]): return
	root.size = Vector2i(1600, 900); root.content_scale_size = root.size; root.gui_embed_subwindows = true
	_shell = load("res://src/editor_shell.tscn").instantiate()
	root.add_child(_shell)
	await process_frame
	await _shell._project_session.open_project(_project)
	if not _check(_shell._session_view.connected, "The disposable project did not open"): return
	if not _seed_caller(): return
	await _shell._navigation.select_route("combat.battles")
	_view = _shell._workbenches.battle
	if not _check(_view.current_selection() == 0, "Battle route did not load the applied record"): return
	await _used_by_and_return()
	if _failed: return
	await _monster_and_return()
	if _failed: return
	await _save_reopen()
	if _failed: return
	await _unknown_apply()
	if _failed: return
	_receipt.merge({"kind": "providence.battle-shell-journey", "adapter": _shell._bridge.request("build.identity").get("result", {}),
		"project": _project, "viewport": [1600, 900], "savedBattle": _shell._bridge.request("battle.open", {"nativeId": 0}).result.battle})
	var file := FileAccess.open(_root_path.path_join("receipt.json"), FileAccess.WRITE)
	file.store_string(JSON.stringify(_receipt, "\t")); file.close()
	_shell._close_project(); _shell.queue_free(); await process_frame
	print("PROVIDENCE_BATTLE_SHELL_JOURNEY_OK real-used-by exact-XAP-slot dirty-route-cancel monster-edit-return saved-reopened lost-durable-ack receipt-only-no-replay history-restored layout=1600")
	quit(0)


func _copy_project(source: String) -> bool:
	var bridge := ProvidenceNativeBridge.new(_root_path.path_join("settings.cfg"))
	if not _ok(bridge.start_project(source)): return false
	var copied := bridge.request("project.save-as", {"path": _project})
	bridge.stop()
	return _ok(copied)


func _seed_caller() -> bool:
	var response: Dictionary = _shell._bridge.request("extra-action-point.open", {"identity": "extra-action-point:4"})
	if not _ok(response): return false
	var record: Dictionary = response.result.extraActionPoint
	record.actions = [{"slot": 4, "rawOpcode": 2, "targetNativeId": 1}]
	var changed: Dictionary = _shell._bridge.request("extra-action-point.update", {"expectedRevision": _shell._session_view.revision, "extraActionPoint": record})
	if not _ok(changed): return false
	_shell._session_view.apply(changed.result)
	changed = _shell._bridge.request("extra-code.upsert", {"expectedRevision": _shell._session_view.revision, "row": {"nativeId": 1, "values": [0, 0, 0, 0, 0]}})
	if not _ok(changed): return false
	_shell._session_view.apply(changed.result)
	return true


func _used_by_and_return() -> void:
	_view.get_node("%BattleCanvas").selected_slot = 35
	_view.get_node("%Distance").grab_focus()
	_view.draft.edit("distance", 19)
	var uses: Window = _view.get_node("BattleUses")
	_view.get_node("%UsedBy").pressed.emit(); await _idle()
	var tree: Tree = uses.get_node("%Uses")
	var row: TreeItem = tree.get_root().get_first_child()
	if not _check(row != null and row.get_metadata(0).source == "extra-action-point:4" and str(row.get_metadata(0).field).begins_with("actions[4]"),
		"Used By did not resolve the exact authored caller and slot"): return
	row.select(0); tree.item_selected.emit(); uses.get_node("%Open").pressed.emit(); await _idle()
	if not _check(_shell._unapplied_dialog.visible, "Opening Used By skipped the dirty Battle guard"): return
	_shell._unapplied_dialog.canceled.emit(); _shell._unapplied_dialog.hide()
	if not _check(_route() == "combat.battles" and _view.draft.record.distance == 19, "Cancelling linked navigation changed the draft"): return
	_view.get_node("%Discard").pressed.emit()
	_view.get_node("%Distance").grab_focus()
	_view.get_node("%UsedBy").pressed.emit(); await _idle()
	row = tree.get_root().get_first_child(); row.select(0); tree.item_selected.emit()
	uses.get_node("%Open").pressed.emit(); await _idle()
	var extra: Control = _shell._documents.view("scripts.macros")
	if not _check(_route() == "scripts.macros" and extra.selected_identity() == "extra-action-point:4"
		and int(extra.get_node("%SemanticActionSteps").read_state().selectedSlot) == 4, "Used By lost the exact source step"): return
	await _shell._navigation.navigate_back(); await _idle()
	_check(_route() == "combat.battles" and _view.current_selection() == 0 and _view.get_node("%BattleCanvas").selected_slot == 35
		and _view.get_node("%Distance").has_focus(), "Back lost the Battle, cell or originating focus")
	_receipt["usedBy"] = {"source": "extra-action-point:4", "slot": 4, "cancelKeptDraft": true, "returnCell": 35}


func _monster_and_return() -> void:
	_view.get_node("%BattleCanvas").selected_slot = 35
	_view.get_node("%BattleCanvas").cell_selected.emit(35)
	_view.get_node("%OpenSelectedMonster").pressed.emit(); await _idle()
	var route: Control = _shell._documents.view("combat.monsters")
	var workbench: Control = route.get_node("Workbench")
	if not _check(_route() == "combat.monsters" and workbench.browser.native_id == 1 and workbench.browser.set_id == 0,
		"Open Monster did not preserve the exact selected variant"): return
	var armor: Control
	for field in workbench.form.find_children("*", "", true, false):
		if field.has_method("bind_record") and field.field_path == "armor": armor = field; break
	if not _check(armor != null, "The Monster Armor control is missing"): return
	armor.get_node("Value").text = "5"; armor.get_node("Value").text_changed.emit("5")
	if not _ok(await route.commit_selected()): return
	await _shell._navigation.navigate_back(); await _idle()
	_check(_route() == "combat.battles" and _view.get_node("%BattleCanvas").selected_slot == 35
		and _view.draft.record.grid[35] == -1, "Monster edit/return changed the selected cell or placement side")
	_receipt["monsterReturn"] = {"nativeId": 1, "setId": 0, "armor": 5, "cell": 35, "value": -1}


func _save_reopen() -> void:
	_view.draft.edit("distance", 20)
	if not _ok(await _view.commit_selected()): return
	var saves: Array = []
	_shell._project_session.project_saved.connect(func(revision): saves.append(revision))
	await _shell._commands.dispatch(&"file.save")
	if not _check(saves.size() == 1, "The ordinary Save command did not confirm persistence"): return
	_shell._close_project()
	await _shell._project_session.open_project(_project)
	await _shell._navigation.select_route("combat.battles"); await _idle()
	_view = _shell._workbenches.battle
	_check(_view.draft.record.distance == 20 and _view.draft.record.grid[35] == -1 and not _view.has_unapplied_changes(),
		"Save/reopen lost canonical Battle fields")
	_receipt["saveReopen"] = {"savedRevision": saves[0], "distance": 20, "cell": 35, "value": -1}


func _unknown_apply() -> void:
	_shell._bridge.stop()
	var bridge := FaultBridge.new(_root_path.path_join("fault-settings.cfg"))
	var connected := bridge.start_project(_project)
	if not _ok(connected): return
	_shell._bridge = bridge
	await _shell._activate_session(connected)
	await _shell._navigation.select_route("combat.battles"); await _idle()
	_view = _shell._workbenches.battle
	for dismissal in ["close", "escape", "title"]:
		await _lost_ack_case(bridge, dismissal)
		if _failed: return
	await _rejected_ack_case(bridge)


func _lost_ack_case(bridge: FaultBridge, dismissal: String) -> void:
	var before: int = _shell._session_view.revision
	var distance := int(_view.draft.record.distance)
	var attempts := bridge.apply_attempts
	_view.draft.edit("distance", distance + 1); bridge.lose_next_reply = true
	var response: Dictionary = await _view.commit_selected()
	if not _check(response.get("outcomeUnknown", false) and _shell._operations.requires_reopen and _view.get_node("%Recovery").visible,
		"Lost durable acknowledgement did not lock mutations and retain recovery"): return
	if dismissal == "close": _view.get_node("%CloseFailure").pressed.emit()
	elif dismissal == "title": _view.get_node("%Failure").close_requested.emit()
	else:
		var key := InputEventKey.new(); key.keycode = KEY_ESCAPE; key.pressed = true
		_view.get_node("%Failure").push_input(key, true)
		await process_frame
	if not _check(not _view.get_node("%Failure").visible, "Failure dismissal did not close the explanation: " + dismissal): return
	if not _check(_view.get_node("%Recovery").visible and _view.get_node("%Apply").disabled and _shell._command_bar.undo_button.disabled,
		"Dismissing the explanation removed recovery or unlocked history"): return
	_view.get_node("%Recovery").pressed.emit(); await _idle()
	if not _check(not _shell._operations.requires_reopen and _view.draft.record.distance == distance + 1 and not _view.has_unapplied_changes()
		and bridge.apply_attempts == attempts + 1 and _shell._session_view.revision == before + 1 and not _shell._command_bar.undo_button.disabled,
		"Receipt recovery lost the committed record, replayed Apply or failed to restore history"): return
	await _shell._commands.dispatch(&"edit.undo"); await _idle()
	if not _check(_view.draft.record.distance == distance, "Undo after recovery did not restore the previous complete Battle"): return
	await _shell._commands.dispatch(&"edit.redo"); await _idle()
	_check(_view.draft.record.distance == distance + 1 and bridge.apply_attempts == attempts + 1, "Redo did not restore the committed Battle or replayed Apply")
	_receipt["lostAcknowledgement-" + dismissal] = {"applyAttempts": 1, "originalRevision": before + 1, "receiptConfirmed": true, "undoRedo": true}


func _rejected_ack_case(bridge: FaultBridge) -> void:
	var distance := int(_view.draft.record.distance)
	var attempts := bridge.apply_attempts
	var before: int = _shell._session_view.revision
	_view.draft.edit("distance", distance + 1)
	bridge.reject_next = true; bridge.lose_next_reply = true
	var response: Dictionary = await _view.commit_selected()
	if not _check(response.get("outcomeUnknown", false), "Controlled rejected acknowledgement did not enter recovery"): return
	_view.get_node("%CloseFailure").pressed.emit()
	_view.get_node("%Recovery").pressed.emit(); await _idle()
	if not _check(not _shell._operations.requires_reopen and _view.draft.record.distance == distance + 1 and _view.has_unapplied_changes()
		and bridge.apply_attempts == attempts + 1 and not _shell._command_bar.undo_button.disabled and _shell._session_view.revision == before + 1,
		"Known rejection lost its draft, replayed Apply or stranded current revision/history"): return
	var current: Dictionary = bridge.request("battle.open", {"nativeId": 0})
	_check(current.result.battle.distance == distance, "A rejected Apply changed the canonical Battle")
	_view.get_node("%Failure").hide(); _view.get_node("%Discard").pressed.emit()
	await _view.controller.reload()
	_receipt["lostRejectedAcknowledgement"] = {"applyAttempts": 1, "draftKept": true, "historyRestored": true, "canonicalDistance": distance}


func _route() -> String:
	return _shell._documents.identity_for_tab(_shell._document_tabs.current_tab)


func _idle() -> void:
	var deadline := Time.get_ticks_msec() + 20000
	var stable := 0
	while stable < 5:
		if not _check(Time.get_ticks_msec() < deadline, "A native workflow did not finish within 20 seconds"): return
		await process_frame
		stable = 0 if _shell._operations.busy else stable + 1


func _ok(response: Dictionary) -> bool:
	return _check(response.get("ok", false), str(response.get("error", "Native request failed")))


func _check(condition: bool, message: String) -> bool:
	if not condition and not _failed:
		_failed = true; push_error("PROVIDENCE_BATTLE_SHELL_JOURNEY_FAILED: " + message); quit(1)
	return condition
