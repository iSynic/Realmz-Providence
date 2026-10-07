extends Window

const Labels = preload("res://src/monster_review_labels.gd")
var _view: ProvidenceBattleEditor
var _operations: ProvidenceEditorOperation
var _bridge: Callable
var _open_source: Callable
var _context: Dictionary = {}
var _generation := 0
var _offset := 0
var _focus: Control


func _ready() -> void:
	%Previous.pressed.connect(func(): await _load(maxi(0, _offset - 128)))
	%Next.pressed.connect(func(): await _load(_offset + 128))
	%Uses.item_selected.connect(func(): %Open.disabled = %Uses.get_selected() == null)
	%Uses.item_activated.connect(_open)
	%Open.pressed.connect(_open)
	%Close.pressed.connect(cancel)
	close_requested.connect(cancel)
	for column in 3: %Uses.set_column_title(column, ["Owner and field", "Battle", "Context"][column])


func configure(view: ProvidenceBattleEditor, operations: ProvidenceEditorOperation, bridge: Callable, open_source: Callable) -> void:
	_view = view
	_operations = operations
	_bridge = bridge
	_open_source = open_source
	view.used_by_requested.connect(begin)


func begin() -> void:
	if not _open_source.is_valid() or _view.current_selection() < 0: return
	_context = {"origin": _view.authoring_generation(), "revision": _view.draft.revision, "nativeId": _view.current_selection()}
	_focus = _view.get_viewport().gui_get_focus_owner()
	%Destination.text = "Battle %d · Used By" % _context.nativeId
	popup_centered(Vector2i(1100, 620))
	%Close.grab_focus()
	await _load(0)


func _load(offset: int) -> void:
	_generation += 1
	var generation := _generation
	%Uses.clear()
	%Open.disabled = true
	%Previous.disabled = true
	%Next.disabled = true
	%Status.text = "Loading uses…"
	var response := await _operations.run_workflow(_bridge.call(), "Find Battle uses", _read.bind(offset))
	if not visible or generation != _generation: return
	if not response.get("ok", false):
		if response.get("outcomeUnknown", false) and _view.controller != null:
			cancel(false)
			_view.controller.report_read_failure(response)
		else: %Status.text = str(response.get("error", "Uses could not load."))
		return
	if _context.origin != _view.authoring_generation() or int(response.get("result", {}).get("revision", -1)) != _context.revision:
		%Status.text = "The Battle or project changed. Close and reopen Used By."
		return
	var page: Dictionary = response.result
	_offset = int(page.offset)
	%Status.text = "%d uses · %d–%d shown" % [page.total, _offset + 1, _offset + page.items.size()] if page.total else "No authored uses. Connect this Battle from an encounter or Action Point."
	%Previous.disabled = _offset == 0
	%Next.disabled = _offset + page.items.size() >= int(page.total)
	var root: TreeItem = %Uses.create_item()
	for entry in page.items:
		var row: TreeItem = %Uses.create_item(root)
		row.set_text(0, "%s · %s" % [Labels.owner(entry.source), Labels.field(entry.field, entry.source)])
		row.set_text(1, str(entry.get("targetId", "")))
		row.set_text(2, "Random encounter region" if str(entry.field).begins_with("battleRange[") else "Script step")
		row.set_metadata(0, entry)
		for column in 3: row.set_tooltip_text(column, row.get_text(column))


func _read(operation: ProvidenceEditorOperation, offset: int) -> Dictionary:
	return await operation.request("reference.used-by", {"targetKind": "battle", "targetId": str(_context.nativeId), "offset": offset, "limit": 128})


func _open() -> void:
	var row: TreeItem = %Uses.get_selected()
	if row == null or _context.origin != _view.authoring_generation(): return
	var reference: Dictionary = row.get_metadata(0)
	var field := str(reference.get("field", ""))
	if field.begins_with("actions["):
		var slot := field.get_slice("[", 1).get_slice("]", 0)
		if slot.is_valid_int(): reference["slot"] = int(slot)
	cancel(false)
	await _open_source.call(reference)


func cancel(restore_focus := true) -> void:
	_generation += 1
	hide()
	var generation := _generation
	var focus := _focus
	if restore_focus and is_instance_valid(focus):
		(func(): if not visible and generation == _generation and is_instance_valid(focus): focus.grab_focus()).call_deferred()


func _input(event: InputEvent) -> void:
	if visible and event.is_action_pressed("ui_cancel"):
		cancel()
		set_input_as_handled()
