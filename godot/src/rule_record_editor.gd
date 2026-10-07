class_name ProvidenceRuleRecordEditor
extends VBoxContainer

signal document_applied(result: Dictionary)
signal route_requested(tab_index: int)

const READ_ONLY_TEXT := Color(0.86, 0.91, 0.95, 1.0)

@onready var _search: LineEdit = %RecordSearch
@onready var _records: ItemList = %RecordList
@onready var _record_status: Label = %RecordStatus
@onready var _identity: Label = %RecordIdentity
@onready var _source_status: Label = %SourceStatus
@onready var _problems: Label = %RecordProblems
@onready var _reason: Label = %DisabledReason

var _bridge
var _summaries: Array = []
var _applied_result: Dictionary = {}
var _applied_identity := ""
var _operations: ProvidenceEditorOperation
var _read_bridge: Callable
var _read_generation := 0


func command_state(command_id: String) -> String:
	return "working" if command_id in [_list_method(), _open_method()] else "visible-disabled"


func route_identity() -> String:
	return ""


func current_applied_identity() -> String:
	return _applied_identity


func current_selection() -> String:
	return _applied_identity


func workbench_title() -> String:
	return "  ACTORS & SYSTEMS  /  %s EDITOR" % _record_label().to_upper()


func apply_label() -> String:
	return "Apply %s" % _record_label()


func has_unapplied_changes() -> bool:
	return false


func configure_operations(operations: ProvidenceEditorOperation, read_bridge: Callable) -> void:
	_operations = operations
	_read_bridge = read_bridge


func refresh_workbench(operation: ProvidenceEditorOperation = null) -> Dictionary:
	return await reload(_read_bridge.call(), _applied_identity, operation)


func reload(bridge, preferred_identity := "", borrowed: ProvidenceEditorOperation = null) -> Dictionary:
	if _operations == null: return await _reload(null, bridge, preferred_identity)
	return await _operations.run_workflow(bridge, "Load " + _record_label(), _reload.bind(bridge, preferred_identity), borrowed)


func _reload(operation: ProvidenceEditorOperation, bridge, preferred_identity: String) -> Dictionary:
	if _bridge != bridge: clear_selection()
	_bridge = bridge
	var generation := _read_generation
	var response := await _request(operation, _list_method(), {"offset": 0, "limit": 128})
	if response.get("outcomeUnknown", false): return response
	if generation != _read_generation: return _changed()
	if not bool(response.get("ok", false)):
		_set_error(str(response.get("error", "%s records could not be listed." % _record_label())))
		return response
	var result := response.get("result", {}) as Dictionary
	_summaries = (result.get("items", []) as Array).duplicate(true)
	_record_status.text = "%d %s RECORDS%s" % [
		int(result.get("total", _summaries.size())),
		_record_label().to_upper(),
		" · first 128 shown" if bool(result.get("truncated", false)) else "",
	]
	_render_record_list()
	if _records.item_count == 0:
		clear_selection()
		_reason.text = "No %s records are present in this project." % _native_family()
		return response
	var index := _index_for_identity(preferred_identity)
	if index < 0:
		index = 0
	_records.select(index)
	return await _open_identity(operation, str(_records.get_item_metadata(index)))


func open_identity(identity: String) -> Dictionary:
	if _operations == null: return await _open_identity(null, identity)
	if _bridge == null: return {"ok": false, "error": "Open a project before selecting a rule."}
	return await _operations.run_workflow(_bridge, "Open " + _record_label(), _open_identity.bind(identity))


func _open_identity(operation: ProvidenceEditorOperation, identity: String) -> Dictionary:
	if identity != _applied_identity: clear_selection()
	if _bridge == null or identity.is_empty():
		var unavailable := {"ok": false, "error": "Select a source-backed %s record." % _record_label()}
		_set_error(str(unavailable.error))
		return unavailable
	var generation := _read_generation
	var response := await _request(operation, _open_method(), {"identity": identity})
	if response.get("outcomeUnknown", false): return response
	if generation != _read_generation: return _changed()
	if not bool(response.get("ok", false)):
		_set_error(str(response.get("error", "%s could not be opened." % _record_label())))
		return response
	var result := response.get("result", {}) as Dictionary
	var rule := (result.get("rule", {}) as Dictionary).duplicate(true)
	if str(rule.get("id", "")) != identity:
		var mismatch := {"ok": false, "error": "%s returned a different or non-canonical identity." % _open_method()}
		_set_error(str(mismatch.error))
		return mismatch
	if str(rule.get("name", "")).strip_edges().is_empty():
		rule["name"] = _summary_name(identity)
	_applied_result = result.duplicate(true)
	_applied_identity = identity
	_render_document(rule)
	_render_evidence(result, rule)
	_select_applied_record()
	document_applied.emit(_applied_result.duplicate(true))
	return response


func clear_selection() -> void:
	_read_generation += 1
	_applied_result.clear()
	_applied_identity = ""
	if _records != null:
		_records.deselect_all()
	if _identity != null:
		_identity.text = "Select a %s record" % _record_label()
	if _source_status != null:
		_source_status.text = "No retained source selected"
	if _problems != null:
		_problems.text = "No %s selected." % _record_label()
	if _reason != null:
		_reason.text = _disabled_reason()
	_clear_document()
	document_applied.emit({})


func teardown_session() -> void:
	_bridge = null
	clear_selection()
	_summaries.clear()
	if _records != null: _records.clear()


func present_selection() -> void:
	document_applied.emit(_applied_result.duplicate(true))


func _request(operation: ProvidenceEditorOperation, method: String, params: Dictionary) -> Dictionary:
	return _bridge.request(method, params) if operation == null else await operation.request(method, params)


func _changed() -> Dictionary:
	return {"ok": false, "stale": true, "error": "The rule session or search changed while loading."}


func _ready() -> void:
	_style_read_only_fields()
	var detail_scroll := find_child("*DetailScroll", true, false) as ScrollContainer
	if detail_scroll != null:
		detail_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	for route in [["SpellsTab", "rules.spells"], ["RacesTab", "rules.races"], ["CastesTab", "rules.castes"]]:
		var button := find_child(str(route[0]), true, false) as Button
		button.disabled = str(route[1]) == route_identity()
		button.pressed.connect(route_requested.emit.bind(ProvidenceRouteCatalog.tab_for_route(str(route[1]))))
	_search.text_changed.connect(_on_search_changed)
	_records.item_selected.connect(_on_record_selected)
	visibility_changed.connect(_on_visibility_changed)
	clear_selection()


func _render_record_list() -> void:
	var scroll := _records.get_v_scroll_bar().value
	_records.clear()
	var query := _search.text.strip_edges().to_lower()
	for value in _summaries:
		var summary := value as Dictionary
		var label := _summary_label(summary)
		if not query.is_empty() and not label.to_lower().contains(query):
			continue
		_records.add_item(label)
		_records.set_item_metadata(_records.item_count - 1, str(summary.get("identity", "")))
	_select_applied_record()
	_records.get_v_scroll_bar().set_deferred("value", scroll)


func _render_evidence(result: Dictionary, rule: Dictionary) -> void:
	var source := result.get("source", {}) as Dictionary
	var retained := bool(source.get("retained", false))
	_source_status.text = "%s · %s" % [str(source.get("nativePath", _native_family())), "retained byte source" if retained else "source bytes unavailable"]
	var references := result.get("references", []) as Array
	var used_by := result.get("usedBy", []) as Array
	var diagnostics := result.get("diagnostics", []) as Array
	var row := maxi(0, int(rule.get("classicId", 1)) - 1)
	_problems.text = "%d outgoing · %d used by · %d problem%s · row %d · bytes %d…%d" % [
		references.size(), used_by.size(), diagnostics.size(), "" if diagnostics.size() == 1 else "s",
		row, row * _record_bytes(), row * _record_bytes() + _record_bytes() - 1,
	]
	_reason.text = _disabled_reason()


func _on_record_selected(index: int) -> void:
	if index >= 0:
		var response := await open_identity(str(_records.get_item_metadata(index)))
		if response.get("busy", false): _select_applied_record()


func _on_search_changed(_value: String) -> void:
	_read_generation += 1
	_render_record_list()


func _on_visibility_changed() -> void:
	if _operations == null and is_node_ready() and not is_visible_in_tree():
		clear_selection()


func _index_for_identity(identity: String) -> int:
	for index in range(_records.item_count):
		if str(_records.get_item_metadata(index)) == identity:
			return index
	return -1


func _summary_name(identity: String) -> String:
	for value in _summaries:
		var summary := value as Dictionary
		if str(summary.get("identity", "")) == identity:
			return str(summary.get("name", ""))
	return ""


func _select_applied_record() -> void:
	var index := _index_for_identity(_applied_identity)
	if index >= 0:
		_records.select(index)


func _set_error(message: String) -> void:
	clear_selection()
	_reason.text = message
	_record_status.text = "%s projection unavailable" % _record_label()
	document_applied.emit({})


func _set_text(node_name: String, value: Variant) -> void:
	var field := find_child(node_name, true, false) as LineEdit
	if field != null:
		if field.text == str(value): return
		field.text = str(value)
		field.tooltip_text = str(value)


func _set_list(node_name: String, values: Array, empty_text := "None") -> void:
	var list := find_child(node_name, true, false) as ItemList
	if list == null:
		return
	var scroll := list.get_v_scroll_bar().value
	var selection: Dictionary = {}
	for index in list.get_selected_items(): selection[index] = list.get_item_text(index)
	list.clear()
	for value in values:
		list.add_item(str(value))
		list.set_item_tooltip(list.item_count - 1, str(value))
		if selection.get(list.item_count - 1) == str(value): list.select(list.item_count - 1, false)
	if values.is_empty():
		list.add_item(empty_text)
		list.set_item_disabled(0, true)
	list.get_v_scroll_bar().set_deferred("value", scroll)


func _list_method() -> String:
	return ""


func _open_method() -> String:
	return ""


func _record_label() -> String:
	return "Rule"


func _native_family() -> String:
	return "native rule table"


func _record_bytes() -> int:
	return 0


func _summary_label(_summary: Dictionary) -> String:
	return ""


func _render_document(_rule: Dictionary) -> void:
	pass


func _clear_document() -> void:
	pass


func _disabled_reason() -> String:
	return "Read-only · editing commands are not connected yet."


func _style_read_only_fields() -> void:
	for node in find_children("*", "LineEdit", true, false):
		var field := node as LineEdit
		if field != null and not field.editable:
			field.add_theme_color_override("font_uneditable_color", READ_ONLY_TEXT)
