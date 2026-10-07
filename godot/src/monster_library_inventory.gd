extends VBoxContainer

signal selection_cleared
signal entry_selected(result: Dictionary)
signal rows_changed
signal multiple_selected(items: Array)
signal entry_requested

const RowScene = preload("res://src/monster_inventory_row.tscn")
const RangeSelection = preload("res://src/monster_library_range.gd")
const SCOPES := {"All": "all", "BuiltIn": "built-in", "Custom": "custom"}
const LABELS := {"all": "All", "built-in": "Built-in", "custom": "Custom"}

@onready var _rows: VBoxContainer = %Rows
@onready var _search: LineEdit = %LibrarySearch
@onready var _status: Label = %LibraryStatus
@onready var _previous: Button = %Previous
@onready var _next: Button = %Next
@onready var _delay: Timer = %SearchDelay

var _bridge
var _operations: ProvidenceEditorOperation
var selection_presenter: Callable
var navigation_guard: Callable
var drag_provider: Callable
var _scope := "all"
var _loaded_scope := "all"
var _loaded_query := ""
var _offset := 0
var _selected: Dictionary = {}
var _page_items: Array = []
var _anchor := ""
var _anchor_index := -1
var _selection_active := false
var _modifiers := Vector2i.ZERO
var _filters := ButtonGroup.new()
var _entry: Dictionary = {}
var revision := -1
var _selection_generation := 0
var _range_status := ""
var last_selection_metrics: Dictionary = {}
var _history_state: Dictionary = {}
var _history_locked := false


func _ready() -> void:
	$Header/PopulateScenario.fallback_controls.append(_search)
	_search.text_changed.connect(func(_text: String):
		cancel_pending_selection()
		_delay.start())
	_search.text_submitted.connect(func(_text: String): _search_all())
	_delay.timeout.connect(_search_all)
	_previous.pressed.connect(func(): await load_page(maxi(0, _offset - 128), true))
	_next.pressed.connect(func(): await load_page(_offset + 128, true))
	for node_name in SCOPES:
		var button := get_node("OwnershipFilters/" + str(node_name)) as Button
		button.button_group = _filters
		button.disabled = true
		button.pressed.connect(_change_scope.bind(str(SCOPES[node_name])))
	_search.editable = false


func attach(bridge, operations: ProvidenceEditorOperation = null, borrowed: ProvidenceEditorOperation = null) -> Dictionary:
	_bridge = bridge
	_operations = operations
	return await _run("Load Monster Library", _attach, borrowed)


func _attach(operation: ProvidenceEditorOperation) -> Dictionary:
	cancel_pending_selection()
	var generation := _selection_generation
	revision = -1
	_delay.stop()
	_search.editable = _bridge != null
	_scope = "all"
	_search.text = ""
	(get_node("OwnershipFilters/All") as Button).button_pressed = true
	for node_name in SCOPES:
		(get_node("OwnershipFilters/" + str(node_name)) as Button).disabled = _bridge == null
		var scope := str(SCOPES[node_name])
		var count := "—"
		if _bridge != null:
			var response := await _request(operation, "monster-library.list", {"ownership": scope, "offset": 0, "limit": 1})
			if response.get("outcomeUnknown", false): return response
			if generation != _selection_generation: return _changed()
			if bool(response.get("ok", false)):
				count = str(int((response.get("result", {}) as Dictionary).get("total", 0)))
		(get_node("OwnershipFilters/" + str(node_name)) as Button).text = "%s %s" % [LABELS[scope], count]
	var page := await _load_page(operation, 0, false)
	set_history_state({})
	if page.get("ok", false):
		var history_generation := _selection_generation
		var history := await _request(operation, "monster-library.describe", {})
		if history.get("outcomeUnknown", false): return history
		if history_generation != _selection_generation: return _changed()
		if history.get("ok", false): set_history_state(history.result)
	return page


func load_page(start: int, preserve_selection := false, borrowed: ProvidenceEditorOperation = null) -> Dictionary:
	return await _run("Browse Monster Library", _load_page.bind(start, preserve_selection), borrowed)


func _load_page(operation: ProvidenceEditorOperation, start: int, preserve_selection: bool) -> Dictionary:
	cancel_pending_selection()
	$Header/PopulateScenario.close_menu()
	rows_changed.emit()
	if not preserve_selection:
		_clear_selection()
	_page_items.clear()
	for child in _rows.get_children():
		_rows.remove_child(child)
		child.queue_free()
	_previous.disabled = true
	_next.disabled = true
	_offset = maxi(0, start)
	if _bridge == null:
		return _fail("No Monster Library attached. Scenario inspection remains available.")
	var generation := _selection_generation
	var response := await _request(operation, "monster-library.list", {
		"ownership": _scope, "query": _search.text.strip_edges(), "offset": _offset, "limit": 128,
	})
	if response.get("outcomeUnknown", false): return response
	if generation != _selection_generation: return _changed()
	if not bool(response.get("ok", false)):
		_clear_selection()
		_status.text = str(response.get("error", "Monster Library unavailable."))
		return response
	var result: Dictionary = response.get("result", {})
	var items: Array = result.get("items", [])
	if items.size() > 128 or int(result.get("offset", -1)) != _offset:
		_clear_selection()
		return _fail("Monster Library returned an unexpected page.")
	var total := int(result.get("total", 0))
	if preserve_selection and revision >= 0 and revision != int(result.get("revision", -1)):
		_clear_selection()
	revision = int(result.get("revision", -1))
	if _loaded_scope != _scope or _loaded_query != _search.text.strip_edges():
		# Membership is stable across filters; range positions belong to one query.
		_anchor_index = -1
		for identity in _selected: _selected[identity].index = -1
	_loaded_scope = _scope
	_loaded_query = _search.text.strip_edges()
	_page_items = items.duplicate(true)
	_status.text = "%d monsters · %d–%d shown" % [total, _offset + 1, _offset + items.size()] if not items.is_empty() else "No matching library entries."
	_previous.disabled = _offset == 0
	_next.disabled = _offset + items.size() >= total or items.is_empty()
	for item: Dictionary in items:
		var row := RowScene.instantiate() as Button
		_rows.add_child(row)
		row.set_meta("identity", str(item.identity))
		if item.has("iconId"):
			row.set_meta("icon_id", int(item.iconId))
		(row.get_node("Contents/Facts/Name") as Label).text = str(item.label)
		var ownership := "Protected Built-in Reference" if str(item.ownership) == "built-in" else "Custom Library Entry"
		var facts := "ID %d, HD %d, armor %d, agility %d, icon %d" % [item.preferredScenarioMonsterId, item.hitDice, item.armor, item.agility, item.iconId]
		(row.get_node("Contents/Facts/Summary") as Label).text = ownership + " | " + facts
		row.tooltip_text = "%s\n%s\n%s" % [item.label, ownership, facts]
		row.gui_input.connect(_remember_modifiers)
		row.pressed.connect(func(): await select_entry(str(item.identity), _modifiers.x != 0, _modifiers.y != 0))
		row.set_drag_forwarding(drag_provider.bind(str(item.identity), row), Callable(), Callable())
	set_selection_active(_selection_active)
	return response


func open_entry(identity: String, borrowed: ProvidenceEditorOperation = null) -> Dictionary:
	return await _run("Open Library monster", _open_entry.bind(identity), borrowed)


func _open_entry(operation: ProvidenceEditorOperation, identity: String, present := true) -> Dictionary:
	_clear_selection()
	var index := _page_items.find_custom(func(item: Dictionary): return str(item.identity) == identity)
	_selected[identity] = {"item": _page_items[index].duplicate(true), "index": _offset + index} if index >= 0 else {"item": {}, "index": -1}
	_anchor = identity
	_anchor_index = _offset + index if index >= 0 else -1
	return await _open_selected(operation, identity, present)


func select_entry(identity: String, additive := false, range_selection := false) -> Dictionary:
	return await _run("Select Library monsters", _select_entry.bind(identity, additive, range_selection))


func _select_entry(operation: ProvidenceEditorOperation, identity: String, additive: bool, range_selection: bool) -> Dictionary:
	cancel_pending_selection()
	var generation := _selection_generation
	var metrics: Dictionary = {}
	last_selection_metrics = metrics
	var ordered: Array = _page_items.map(func(item: Dictionary): return str(item.identity))
	if not ordered.has(identity):
		return _fail("Selected Library entry is not on this page.")
	var index := _offset + ordered.find(identity)
	var data := {"item": _page_items[ordered.find(identity)].duplicate(true), "index": index}
	if range_selection and _anchor_index >= 0:
		var first := mini(_anchor_index, index)
		var source_revision := revision
		var previous_status := _status.text
		_range_status = previous_status
		entry_requested.emit()
		_status.text = "Loading selected Library range…"
		var obsolete := func(): return not is_instance_valid(self) or generation != _selection_generation or revision != source_revision
		var range_result := await RangeSelection.load_range(_bridge if operation == null else operation, _scope, _search.text.strip_edges(), revision, first, maxi(_anchor_index, index), obsolete, metrics)
		if range_result.get("outcomeUnknown", false): return range_result
		if obsolete.call():
			return {"ok": false, "cancelled": true}
		_status.text = previous_status
		_range_status = ""
		if not bool(range_result.get("ok", false)):
			_clear_selection()
			_status.text = str(range_result.get("error", "Library range unavailable."))
			return range_result
		var items: Array = range_result.items
		if str(items[0].identity) != (_anchor if _anchor_index <= index else identity) or str(items[-1].identity) != (identity if _anchor_index <= index else _anchor):
			_clear_selection()
			return _fail("Library range endpoints changed. Reload and select again.")
		_selected.clear()
		for relative in items.size():
			_selected[str(items[relative].identity)] = {"item": items[relative], "index": first + relative}
	elif additive:
		if _selected.has(identity) and _selected.size() > 1:
			_selected.erase(identity)
			if str(_entry.get("entry", {}).get("identity", "")) == identity:
				identity = str(_selected.keys()[-1])
		else:
			_selected[identity] = data
		_anchor = identity
		_anchor_index = int(_selected[identity].index)
	else:
		_selected = {identity: data}
		_anchor = identity
		_anchor_index = index
	var started := Time.get_ticks_usec()
	var response := await _open_selected(operation, identity)
	metrics["maxStepUsec"] = maxi(int(metrics.get("maxStepUsec", 0)), Time.get_ticks_usec() - started)
	return response


func _open_selected(operation: ProvidenceEditorOperation, identity: String, present := true) -> Dictionary:
	$Header/PopulateScenario.close_menu()
	_entry.clear()
	if present: entry_requested.emit()
	if _bridge == null:
		return _fail("No Monster Library attached.")
	var detail_started := Time.get_ticks_usec()
	var generation := _selection_generation
	var response := await _request(operation, "monster-library.open", {"identity": identity})
	if response.get("outcomeUnknown", false): return response
	if generation != _selection_generation: return _changed()
	last_selection_metrics["detailRequestUsec"] = Time.get_ticks_usec() - detail_started
	if not bool(response.get("ok", false)):
		_status.text = str(response.get("error", "Library entry unavailable."))
		return response
	var result: Dictionary = response.get("result", {})
	if str((result.get("entry", {}) as Dictionary).get("identity", "")) != identity:
		return _fail("Library detail does not match the selected entry.")
	if revision >= 0 and int(result.get("revision", -1)) != revision:
		_clear_selection()
		return _fail("Library changed during selection. Reload and select again.")
	_entry = result.duplicate(true)
	revision = int(result.get("revision", -1))
	if present:
		var presented := await _publish_selection(operation)
		if not presented.get("ok", false): return presented
	if generation != _selection_generation: return _changed()
	return response


func clear_multiple_selection() -> void:
	await _run("Clear Library multiselection", _clear_multiple_selection)


func _clear_multiple_selection(operation: ProvidenceEditorOperation) -> Dictionary:
	cancel_pending_selection()
	var identity := str(_entry.get("entry", {}).get("identity", ""))
	_selected = {} if identity.is_empty() else {identity: _selected.get(identity, {"item": {}, "index": -1})}
	_anchor = identity
	_anchor_index = int(_selected.get(identity, {}).get("index", -1))
	var presented := await _publish_selection(operation)
	if not presented.get("ok", false): return presented
	if _anchor_index >= 0 and _anchor_index / 128 != _offset / 128:
		var page := await _load_page(operation, (_anchor_index / 128) * 128, true)
		if not page.get("ok", false): return page
	for row: Button in _rows.get_children():
		if str(row.get_meta("identity")) == identity:
			row.grab_focus()
	return {"ok": true}


func _publish_selection(operation: ProvidenceEditorOperation = null) -> Dictionary:
	set_selection_active(true)
	if selection_presenter.is_valid():
		var presented: Dictionary = await selection_presenter.call(operation)
		if not presented.get("ok", false): return presented
	if _selected.size() > 1:
		multiple_selected.emit(_selected.values().map(func(data: Dictionary): return data.item).duplicate(true))
	elif not _entry.is_empty():
		entry_selected.emit(_entry.duplicate(true))
	return {"ok": true}


func selected_items() -> Array:
	return _selected.values().map(func(data: Dictionary): return data.item).duplicate(true)


func selected_identities() -> Array:
	return _selected.keys()


func _remember_modifiers(event: InputEvent) -> void:
	if event is InputEventWithModifiers:
		_modifiers = Vector2i(int(event.ctrl_pressed or event.meta_pressed), int(event.shift_pressed))


func current_entry() -> Dictionary:
	return _entry.duplicate(true)


func navigation_snapshot() -> Dictionary:
	return {"scope": _scope, "query": _search.text, "offset": _offset,
		"scroll": $InventoryScroll.scroll_vertical, "anchor": _anchor, "anchorIndex": _anchor_index, "active": _selection_active,
		"entry": str(_entry.get("entry", {}).get("identity", "")),
		"selected": _selected.keys().map(func(identity): return {"identity": identity, "index": _selected[identity].index})}


func restore_navigation(state: Dictionary, borrowed: ProvidenceEditorOperation = null) -> Dictionary:
	return await _run("Restore Monster Library page", _restore_navigation.bind(state), borrowed)


func _restore_navigation(operation: ProvidenceEditorOperation, state: Dictionary) -> Dictionary:
	_scope = str(state.get("scope", "all"))
	if not LABELS.has(_scope): return _fail("Unknown Monster Library ownership filter.")
	_search.text = str(state.get("query", ""))
	for node_name in SCOPES:
		(get_node("OwnershipFilters/" + str(node_name)) as Button).set_pressed_no_signal(SCOPES[node_name] == _scope)
	var loaded := await _load_page(operation, int(state.get("offset", 0)), false)
	if not loaded.get("ok", false): return loaded
	$InventoryScroll.set_deferred("scroll_vertical", int(state.get("scroll", 0)))
	var count: int = state.get("selected", []).size()
	if count == 0: return loaded
	if count == 1: return await _open_entry(operation, str(state.get("entry", "")), bool(state.get("active", false)))
	var generation := _selection_generation
	var current := func(): return is_instance_valid(self) and generation == _selection_generation
	var membership := await preload("res://src/monster_library_selection_restore.gd").load_membership(_bridge if operation == null else operation, state, revision, current)
	if not membership.get("ok", false): return membership
	_selected = membership.selected
	_anchor = str(state.get("anchor", ""))
	_anchor_index = int(state.get("anchorIndex", -1))
	return await _open_selected(operation, str(state.get("entry", "")), bool(state.get("active", false)))


func set_selection_active(active: bool) -> void:
	_selection_active = active
	%SelectionCount.visible = active and _selected.size() > 1
	%SelectionCount.text = "%d selected · Ctrl / Shift" % _selected.size()
	for row: Button in _rows.get_children():
		row.set_pressed_no_signal(active and _selected.has(str(row.get_meta("identity"))))


func set_history_state(state: Dictionary) -> void:
	_history_state = state.duplicate()
	_refresh_history()


func set_history_locked(locked: bool) -> void:
	_history_locked = locked
	_refresh_history()


func _refresh_history() -> void:
	$History/UndoLibrary.disabled = _history_locked or not _history_state.get("canUndo", false)
	$History/RedoLibrary.disabled = _history_locked or not _history_state.get("canRedo", false)


func cancel_pending_selection() -> void:
	_selection_generation += 1
	if not _range_status.is_empty():
		_status.text = _range_status
		_range_status = ""


func _search_all() -> void:
	_delay.stop()
	var response := await load_page(0, true)
	if response.get("canceled", false):
		_scope = _loaded_scope
		_search.text = _loaded_query
		for node_name in SCOPES:
			(get_node("OwnershipFilters/" + str(node_name)) as Button).set_pressed_no_signal(SCOPES[node_name] == _scope)
	if response.get("busy", false) and not response.get("outcomeUnknown", false): _delay.start()


func _change_scope(scope: String) -> void:
	_scope = scope
	cancel_pending_selection()
	await _search_all()


func _clear_selection() -> void:
	cancel_pending_selection()
	_entry.clear()
	_selected.clear()
	_anchor = ""
	_anchor_index = -1
	_modifiers = Vector2i.ZERO
	set_selection_active(false)
	selection_cleared.emit()


func _fail(message: String) -> Dictionary:
	_status.text = message
	return {"ok": false, "error": message}


func _run(label: String, workflow: Callable, borrowed: ProvidenceEditorOperation = null) -> Dictionary:
	if borrowed == null and navigation_guard.is_valid() and not await navigation_guard.call(label):
		return {"ok": false, "canceled": true}
	if _operations == null or _bridge == null: return await workflow.call(null)
	return await _operations.run_workflow(_bridge, label, workflow, borrowed)


func _request(operation: ProvidenceEditorOperation, method: String, params: Dictionary) -> Dictionary:
	return _bridge.request(method, params) if operation == null else await operation.request(method, params)


func _changed() -> Dictionary:
	return {"ok": false, "stale": true, "error": "The Library search or selection changed while loading."}
