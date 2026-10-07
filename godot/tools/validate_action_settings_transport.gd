extends SceneTree

class SlowBridge extends "res://src/native_bridge.gd":
	var calls: Array = []
	var synchronous_reads := 0
	func request(method: String, params: Dictionary = {}) -> Dictionary:
		if method.begins_with("action-settings."): synchronous_reads += 1
		return super.request(method, params)
	func _request(method: String, params: Dictionary) -> Dictionary:
		if method.begins_with("action-settings."):
			OS.delay_msec(80)
			calls.append({"method": method, "params": params.duplicate(true)})
		return super._request(method, params)
	func replace_epoch() -> void: _connection_epoch += 1

var _bridge := SlowBridge.new()
var _dialog
var _failed := false
var _revision := 0


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 1 or not args[0].get_file().begins_with("providence-ui-repair-"):
		_check(false, "A disposable repair transport root is required")
		quit(1)
		return
	root.gui_embed_subwindows = true
	root.size = Vector2i(1600, 900)
	_bridge = SlowBridge.new(args[0].path_join("transport-settings.cfg"))
	var fixture = preload("res://tools/action_settings_repair_fixture.gd").new()
	if not fixture.create(_bridge, args[0].path_join("transport"), 10):
		_check(false, fixture.error)
		_bridge.stop()
		quit(1)
		return
	_revision = fixture.revision
	_dialog = preload("res://src/action_settings_repair_dialog.gd").new()
	_dialog.hide()
	root.add_child(_dialog)
	await _open()
	await _typing_and_coalescing()
	await _picker_queries()
	await _discard_during_read()
	await _open()
	await _replacement_epoch()
	_check(_bridge.synchronous_reads == 0, "Repair used main-thread native reads")
	_dialog.free()
	_bridge.stop()
	await process_frame
	if not _failed: print("PROVIDENCE_ACTION_SETTINGS_TRANSPORT_OK worker-reads typing-live coalesced-fields picker-latest discard-safe epoch-guarded")
	quit(1 if _failed else 0)


func _open() -> void:
	var response: Dictionary = await _dialog.open_repair(_bridge, _revision, "extra-action-point:158", 4)
	_check(response.get("ok", false) and _dialog.visible, "Repair could not open through its worker")
	await process_frame


func _typing_and_coalescing() -> void:
	_dialog.change_field("bound0", "9")
	_check(_dialog.operations.busy, "Field check did not reserve the shared transport")
	var field: LineEdit = _dialog.ui.bound0
	field.grab_focus()
	field.caret_column = field.text.length()
	await process_frame
	var key := InputEventKey.new()
	key.keycode = KEY_X
	key.unicode = 120
	key.pressed = true
	_dialog.push_input(key)
	key = InputEventKey.new()
	key.keycode = KEY_X
	_dialog.push_input(key)
	await _fields_settled()
	_check(field.text == "9x" and field.has_focus() and _dialog.view.draft.input.bounds[0] == "9x", "Delayed checking lost live typing or focus")
	var before := _bridge.calls.size()
	_dialog.change_field("bound0", "10")
	_dialog.change_field("bound0", "11")
	_dialog.change_field("bound0", "12")
	await _fields_settled()
	_check(_bridge.calls.size() == before + 2 and _dialog.view.draft.input.bounds[0] == "12", "Field checking queued an obsolete value or applied it last")


func _picker_queries() -> void:
	_dialog.open_picker("area")
	await _busy()
	_dialog.picker._search.text = "obsolete"
	_dialog.picker._search.text_changed.emit("obsolete")
	_dialog.picker._search.text = "3"
	_dialog.picker._search.text_changed.emit("3")
	await _picker_settled()
	_check(_dialog.picker._total > 0 and _dialog.picker._search.text == "3", "The newest choices query was not presented")
	_check(not _bridge.calls.any(func(call): return call.params.get("query") == "obsolete"), "The choices picker queued an obsolete query")
	_dialog.picker.refresh()
	await _busy()
	_dialog.picker.hide()
	await _drain()
	_check(_dialog.picker._items.is_empty(), "A cancelled picker restored late choices")


func _discard_during_read() -> void:
	var original: Dictionary = _dialog.view.draft.duplicate(true)
	_dialog.change_field("bound0", "99")
	_dialog.request_cancel()
	_check(_dialog._discard.visible, "A pending field read lost the discard guard")
	_dialog._discard.confirmed.emit()
	await _fields_settled()
	_check(not _dialog.visible and _dialog.view.draft == original, "A late read changed the discarded dialog")
	var session := _bridge.request("session.describe")
	_check(session.get("ok", false) and session.result.revision == _revision, "Checking or discarding mutated the scenario")


func _replacement_epoch() -> void:
	var original: Dictionary = _dialog.view.draft.duplicate(true)
	_dialog.change_field("bound0", "77")
	_bridge.replace_epoch()
	await _fields_settled()
	_check(_dialog.phase == "stale" and _dialog.view.draft == original and _dialog.ui.bound0.text == "77", "Replacement connection accepted a late result or erased raw input")
	_check(_dialog.operations.requires_reopen, "A changed connection did not require recovery")


func _fields_settled() -> void:
	var deadline := Time.get_ticks_msec() + 5000
	while _dialog._checking_fields and Time.get_ticks_msec() < deadline: await process_frame
	_check(not _dialog._checking_fields, "Repair fields did not settle")
	await process_frame


func _picker_settled() -> void:
	var deadline := Time.get_ticks_msec() + 5000
	while (_dialog.picker._requested or _dialog.picker._loading) and Time.get_ticks_msec() < deadline: await process_frame
	_check(not _dialog.picker._requested and not _dialog.picker._loading, "Repair picker did not settle")


func _busy() -> void:
	var deadline := Time.get_ticks_msec() + 3000
	while not _dialog.operations.busy and Time.get_ticks_msec() < deadline: await process_frame
	_check(_dialog.operations.busy, "Expected repair worker did not start")


func _drain() -> void:
	while _dialog.operations.busy: await process_frame
	await process_frame


func _check(condition: bool, message: String) -> void:
	if not condition:
		_failed = true
		push_error("PROVIDENCE_ACTION_SETTINGS_TRANSPORT_FAILED " + message)
