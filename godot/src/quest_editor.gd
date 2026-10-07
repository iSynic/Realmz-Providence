class_name ProvidenceQuestEditor
extends HSplitContainer

signal source_requested(reference: Dictionary)
signal selection_changed(quest: Dictionary)
signal apply_state_changed(can_apply: bool)

var open_handler: Callable
var commit_handler: Callable
var delete_handler: Callable
var flow_handler: Callable
var source_context: Callable
var _catalog: Array = []
var _visible: Array = []
var _quest: Dictionary = {}
var _used_by: Array = []
var _filter := "all"
var _flow_generation := {"checks": 0, "changes": 0}
var _document_revision := -1

@onready var _search := find_child("QuestSearch", true, false) as LineEdit
@onready var _list := find_child("QuestCollection", true, false) as Tree
@onready var _status := find_child("BrowserStatus", true, false) as Label
@onready var _identity := find_child("QuestIdentity", true, false) as Label
@onready var _summary := find_child("Summary", true, false) as Label
@onready var _label := find_child("QuestLabel", true, false) as LineEdit
@onready var _checks := find_child("Checks", true, false)
@onready var _changes := find_child("Changes", true, false)
@onready var _note := find_child("ContextNotes", true, false) as TextEdit
@onready var _apply := find_child("ApplyLabel", true, false) as Button
@onready var _delete := find_child("DeleteLabel", true, false) as Button


func _ready() -> void:
	_search.text_changed.connect(func(_value: String): _render_catalog())
	_list.item_selected.connect(func():
		var item := _list.get_selected()
		if item != null: _select_visible(int(item.get_metadata(0))))
	_checks.source_requested.connect(_open_source)
	_changes.source_requested.connect(_open_source)
	_checks.page_requested.connect(_read_flow)
	_changes.page_requested.connect(_read_flow)
	_label.text_changed.connect(func(_value: String): _update_actions())
	_note.text_changed.connect(_update_actions)
	_apply.pressed.connect(commit_selected)
	_delete.pressed.connect(_delete_selected)
	(find_child("DiscardLabel", true, false) as Button).pressed.connect(discard_draft)
	$RemoveConfirmation.confirmed.connect(func():
		if delete_handler.is_valid(): await delete_handler.call(current_id()))
	(find_child("All", true, false) as Button).pressed.connect(_set_filter.bind("all"))
	(find_child("Used", true, false) as Button).pressed.connect(_set_filter.bind("used"))
	(find_child("Unlabeled", true, false) as Button).pressed.connect(_set_filter.bind("unlabeled"))


func route_identity() -> String:
	return "scripts.quests"

func apply_theme(mode := "dark", density := "balanced") -> void:
	var controls = preload("res://src/discovery_theme.gd").new()
	controls.mode = mode
	controls.density = density
	theme = controls


func set_catalog(result: Dictionary) -> void:
	_catalog = (result.get("items", []) as Array).duplicate(true)
	_render_catalog()


func set_document(result: Dictionary) -> void:
	var quest := result.get("quest", {}) as Dictionary
	if quest.is_empty():
		_clear_document()
		return
	_quest = quest.duplicate(true)
	_document_revision = int(result.get("revision", -1))
	for role in _flow_generation: _flow_generation[role] += 1
	_checks.reset()
	_changes.reset()
	_used_by = (result.get("usedBy", []) as Array).duplicate(true)
	_identity.text = "Quest %03d  ·  %s" % [int(_quest.get("id", 0)), str(_quest.get("label", "Unlabeled quest"))]
	_summary.text = "%d checks · %d changes · %d unique occurrences" % [int(result.get("checks", {}).get("total", 0)), int(result.get("changes", {}).get("total", 0)), int(result.get("occurrences", 0))]
	if int(result.get("retainedOperands", 0)) > 0: _summary.text += " · %d retained operands without effective checks" % int(result.retainedOperands)
	_label.text = str(_quest.get("label", "")) if bool(_quest.get("authored", false)) else ""
	_note.text = str(_quest.get("note", ""))
	for role in ["checks", "changes"]:
		var page: Dictionary = result.get(role, {}).duplicate(true)
		page["revision"] = result.get("revision", -1)
		(_checks if role == "checks" else _changes).set_page(page)
	_restore_selection()
	_update_actions()
	selection_changed.emit(_quest)


func open_id(id: int) -> Dictionary:
	if not open_handler.is_valid(): return {"ok": false, "error": "Quest commands are unavailable."}
	return await open_handler.call(id)


func current_id() -> int:
	return int(_quest.get("id", 0))


func used_by() -> Array:
	return _used_by.duplicate(true)


func has_unapplied_changes() -> bool:
	return not _quest.is_empty() and (_label.text != _applied_label_text() or _note.text != str(_quest.get("note", "")))


func can_apply_draft() -> bool:
	return not _apply.disabled


func discard_draft() -> void:
	if _quest.is_empty(): return
	_label.text = _applied_label_text()
	_note.text = str(_quest.get("note", ""))
	_update_actions()


func commit_selected() -> Dictionary:
	if _quest.is_empty() or not commit_handler.is_valid(): return {"ok": false, "error": "Select a Quest first."}
	return await commit_handler.call({"id": current_id(), "label": _label.text, "note": _note.text})


func accept_saved(quest_label: Dictionary, applied_revision := -1) -> void:
	if applied_revision >= 0: _document_revision = applied_revision
	_quest["label"] = str(quest_label.get("label", ""))
	_quest["note"] = str(quest_label.get("note", ""))
	_quest["authored"] = true
	_update_catalog_label(_quest)
	_update_actions()


func accept_deleted(applied_revision := -1, submitted: Dictionary = {}) -> void:
	if applied_revision >= 0: _document_revision = applied_revision
	var id := current_id()
	_quest["label"] = "Quest %d" % id
	_quest["note"] = ""
	_quest["authored"] = false
	if submitted.is_empty() or _label.text == str(submitted.get("labelDraft", "")): _label.text = ""
	if submitted.is_empty() or _note.text == str(submitted.get("noteDraft", "")): _note.text = ""
	_update_catalog_label(_quest)
	_update_actions()


func read_state() -> Dictionary:
	return {"id": current_id(), "search": _search.text, "filter": _filter, "labelDraft": _label.text, "noteDraft": _note.text}

func document_revision() -> int: return _document_revision


func read_navigation_state() -> Dictionary:
	var state := read_state()
	state["scroll"] = _list.get_scroll().y
	state["checks"] = _checks.state()
	state["changes"] = _changes.state()
	return state


func restore_navigation_state(state: Dictionary) -> bool:
	var id := int(state.get("id", 0))
	if id <= 0: return true
	_search.text = str(state.get("search", ""))
	_filter = str(state.get("filter", "all"))
	_render_catalog()
	var response: Dictionary = await open_id(id)
	if response.get("ok", false):
		preload("res://src/tree_scroll_state.gd").restore(_list, Vector2(0, float(state.get("scroll", 0.0))))
		_checks.restore(state.get("checks", {}))
		_changes.restore(state.get("changes", {}))
	return bool(response.get("ok", false))


func clear() -> void:
	_catalog.clear()
	_visible.clear()
	_list.clear()
	_status.text = "No project open."
	_clear_document()


func _render_catalog() -> void:
	_visible.clear()
	_list.clear()
	var query := _search.text.strip_edges().to_lower()
	var root := _list.create_item()
	for value in _catalog:
		var row := value as Dictionary
		if _filter == "used" and int(row.get("usedBy", 0)) == 0: continue
		if _filter == "unlabeled" and bool(row.get("authored", false)): continue
		var haystack := "%s %s %s" % [row.get("id", ""), row.get("label", ""), row.get("note", "")]
		if not query.is_empty() and not haystack.to_lower().contains(query): continue
		_visible.append(row)
		var item := _list.create_item(root)
		item.set_text(0, "%03d  %s\n%d checks · %d changes" % [int(row.id), str(row.label), int(row.get("checks", 0)), int(row.get("changes", 0))])
		item.set_metadata(0, _visible.size() - 1)
		item.set_custom_minimum_height(46)
		item.set_tooltip_text(0, item.get_text(0))
	_status.text = "%d shown · %d Classic quest flags" % [_visible.size(), _catalog.size()]
	_restore_selection()


func _select_visible(index: int) -> void:
	if index < 0 or index >= _visible.size() or has_unapplied_changes():
		_restore_selection()
		return
	await open_id(int((_visible[index] as Dictionary).get("id", 0)))


func _read_flow(role: String, query: String, offset: int, origin := "") -> void:
	if not flow_handler.is_valid(): return
	var id := current_id()
	_flow_generation[role] += 1
	var generation: int = _flow_generation[role]
	var pane = _checks if role == "checks" else _changes
	var interaction: int = pane.interaction_token()
	var response: Dictionary = await flow_handler.call(id, role, query, offset, origin)
	if current_id() != id or generation != _flow_generation[role] or interaction != pane.interaction_token(): return
	if response.get("ok", false):
		if origin.is_empty(): (_checks if role == "checks" else _changes).set_page(response.result)
		else: (_checks if role == "checks" else _changes).accept_origin(response.result)
	else:
		_summary.text = str(response.get("error", "Could not load Quest flow."))
		(_checks if role == "checks" else _changes).show_failure(_summary.text)


func highlight_origin(source: String, slot: int) -> void:
	var occurrence := "%s|actions[%d]" % [source, slot]
	_checks.highlight_origin(occurrence)
	_changes.highlight_origin(occurrence)

func highlight_reference(reference: Dictionary) -> void:
	var field := str(reference.get("field", ""))
	var slot := preload("res://src/source_navigation.gd").action_slot(field)
	var occurrence := "%s|%s" % [reference.get("source", ""), "actions[%d]" % slot if slot >= 0 else field]
	_checks.highlight_origin(occurrence)
	_changes.highlight_origin(occurrence)

func _open_source(reference: Dictionary) -> void:
	if source_context.is_valid() and int(source_context.call().get("revision", -1)) != int(reference.get("expectedRevision", -1)):
		_checks.show_failure("Quest callers belong to an earlier revision")
		_changes.show_failure("Quest setters belong to an earlier revision")
		return
	source_requested.emit(reference)


func _set_filter(filter: String) -> void:
	_filter = filter
	_render_catalog()


func _delete_selected() -> void:
	if not _quest.is_empty() and delete_handler.is_valid(): $RemoveConfirmation.popup_centered()


func _update_actions() -> void:
	_apply.disabled = _quest.is_empty() or _label.text.strip_edges().is_empty() or not has_unapplied_changes()
	_apply.tooltip_text = "Enter a Quest name before applying." if _label.text.strip_edges().is_empty() else "Apply the Quest name and notes together."
	find_child("DisabledReason", true, false).text = _apply.tooltip_text if has_unapplied_changes() and _label.text.strip_edges().is_empty() else "Removing a label does not reset its quest value."
	_delete.disabled = _quest.is_empty() or not bool(_quest.get("authored", false))
	apply_state_changed.emit(not _apply.disabled)


func _update_catalog_label(quest: Dictionary) -> void:
	for index in _catalog.size():
		if int((_catalog[index] as Dictionary).get("id", 0)) == int(quest.get("id", 0)):
			_catalog[index]["label"] = quest.get("label", "")
			_catalog[index]["note"] = quest.get("note", "")
			_catalog[index]["authored"] = quest.get("authored", false)
			break
	_render_catalog()


func _restore_selection() -> void:
	_list.set_block_signals(true)
	_list.deselect_all()
	for index in _visible.size():
		if int((_visible[index] as Dictionary).get("id", 0)) == current_id():
			_list.get_root().get_child(index).select(0)
			break
	_list.set_block_signals(false)
	if _list.get_selected() != null: _list.ensure_cursor_is_visible()


func _clear_document() -> void:
	_quest.clear()
	_document_revision = -1
	_used_by.clear()
	_identity.text = "Select a Quest slot"
	_summary.text = ""
	_label.text = ""
	_note.text = ""
	for role in _flow_generation: _flow_generation[role] += 1
	_checks.reset()
	_changes.reset()
	_update_actions()


func _applied_label_text() -> String:
	return str(_quest.get("label", "")) if bool(_quest.get("authored", false)) else ""
