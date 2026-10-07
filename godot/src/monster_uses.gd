extends Window

const Labels = preload("res://src/monster_review_labels.gd")
var _view
var _operations: ProvidenceEditorOperation
var _read_bridge: Callable
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
	for column in 3: %Uses.set_column_title(column, ["Owner and field", "Native value", "Runtime context"][column])


func configure(view, operations: ProvidenceEditorOperation, read_bridge: Callable, open_source: Callable) -> void:
	_view = view
	_operations = operations
	_read_bridge = read_bridge
	_open_source = open_source
	view.record_operation_requested.connect(func(action: String): if action == "UsedBy": begin())


func begin() -> void:
	if _view.draft_domain() != "project" or not _open_source.is_valid(): return
	_context = _view.record_operation_context()
	if _context.is_empty(): return
	_focus = _view.get_viewport().gui_get_focus_owner()
	%Destination.text = _context.destination + " · Used By"
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
	%Status.text = "Loading exact uses…"
	var response: Dictionary = await _operations.run_workflow(_read_bridge.call(), "Find Monster uses", _read.bind(offset))
	if generation != _generation or not visible: return
	if _view.authoring_generation() != _context.origin or _view.browser.revision != _context.revision:
		%Status.text = "The originating Monster changed. Close and reopen Used By."
		return
	if not response.get("ok", false): %Status.text = str(response.get("error", "Uses could not load.")); return
	var page: Dictionary = response.result
	_offset = int(page.offset)
	%Status.text = "%d uses · %d–%d shown" % [page.total, _offset + 1, _offset + page.items.size()] if page.total else "No authored uses. Bestiary visibility is controlled by the Normal record."
	%Previous.disabled = _offset == 0
	%Next.disabled = _offset + page.items.size() >= int(page.total)
	var root: TreeItem = %Uses.create_item()
	for entry in page.items:
		var row: TreeItem = %Uses.create_item(root)
		row.set_text(0, "%s · %s" % [Labels.owner(entry.source), Labels.field(entry.field, entry.source)])
		row.set_text(1, str(entry.rawValue))
		row.set_text(2, entry.context)
		row.set_metadata(0, entry)
		for column in 3: row.set_tooltip_text(column, row.get_text(column))


func _read(operation: ProvidenceEditorOperation, offset: int) -> Dictionary:
	return await operation.request("monster.uses", {"expectedRevision": _context.revision, "nativeId": _context.nativeId, "offset": offset, "limit": 128})


func open_reference(reference: Dictionary) -> void:
	if not _open_source.is_valid(): return
	if visible and (_view.authoring_generation() != _context.origin or _view.browser.revision != _context.revision):
		%Status.text = "The originating Monster changed. Close and reopen Used By."
		%Open.disabled = true
		return
	cancel(false)
	await _open_source.call(reference)


func _open() -> void:
	var row: TreeItem = %Uses.get_selected()
	if row != null: await open_reference(row.get_metadata(0))


func cancel(restore_focus := true) -> void:
	_generation += 1
	hide()
	var closed_generation := _generation
	var focus := _focus
	if restore_focus and is_instance_valid(focus):
		(func(): if not visible and closed_generation == _generation and is_instance_valid(focus): focus.grab_focus()).call_deferred()


func _input(event: InputEvent) -> void:
	if visible and event.is_action_pressed("ui_cancel"):
		cancel()
		set_input_as_handled()
