class_name ProvidenceReadonlyNativeRecordEditor
extends Control

signal document_applied(result: Dictionary)

var _search: LineEdit
var _records: ItemList
var _record_status: Label
var _identity: Label
var _problems: Label
var _reason: Label

var _bridge
var _summaries: Array = []
var _applied_result: Dictionary = {}
var _applied_native_id := -1
var _operations: ProvidenceEditorOperation
var _read_bridge: Callable
var _read_generation := 0


func command_state(command_id: String) -> String:
	return "working" if command_id in [_list_method(), _open_method()] else "visible-disabled"


func current_applied_native_id() -> int:
	return _applied_native_id


func current_selection() -> int:
	return _applied_native_id


func workbench_title() -> String:
	return "  ACTORS & SYSTEMS  /  %s" % _record_label().to_upper()


func apply_label() -> String:
	return "Apply %s" % _record_label()


func trusted_applied_native_id(draft_active := false) -> int:
	return -1 if draft_active or has_unapplied_changes() else _applied_native_id


func current_record() -> Dictionary:
	return (_applied_result.get(_record_key(), {}) as Dictionary).duplicate(true)


func has_unapplied_changes() -> bool:
	return false


func configure_operations(operations: ProvidenceEditorOperation, read_bridge: Callable) -> void:
	_operations = operations
	_read_bridge = read_bridge


func refresh_workbench(operation: ProvidenceEditorOperation = null) -> Dictionary:
	return await reload(_read_bridge.call(), _applied_native_id, operation)


func reload(bridge, preferred_native_id := -1, borrowed: ProvidenceEditorOperation = null) -> Dictionary:
	if _operations == null: return await _reload(null, bridge, preferred_native_id)
	return await _operations.run_workflow(bridge, "Load " + _record_label(), _reload.bind(bridge, preferred_native_id), borrowed)


func _reload(operation: ProvidenceEditorOperation, bridge, preferred_native_id: int) -> Dictionary:
	if _bridge != bridge: clear_selection()
	_bridge = bridge
	var generation := _read_generation
	var response := await _read_catalog(operation)
	if response.get("outcomeUnknown", false): return response
	if generation != _read_generation: return _changed()
	if not bool(response.get("ok", false)):
		_set_error(str(response.get("error", "%s records could not be listed." % _record_label())))
		return response
	var result := response.get("result", {}) as Dictionary
	_accept_list_result(result)
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
	var index := _index_for_native_id(preferred_native_id)
	if index < 0:
		index = 0
	_records.select(index)
	return await _open_native_id(operation, int(_records.get_item_metadata(index)))


func open_native_id(native_id: int) -> Dictionary:
	if _operations == null: return await _open_native_id(null, native_id)
	if _bridge == null: return {"ok": false, "error": "Open a project before selecting a record."}
	return await _operations.run_workflow(_bridge, "Open " + _record_label(), _open_native_id.bind(native_id))


func _open_native_id(operation: ProvidenceEditorOperation, native_id: int) -> Dictionary:
	if native_id != _applied_native_id: clear_selection()
	if _bridge == null or native_id < 0:
		var unavailable := {"ok": false, "error": "Select a source-backed %s record." % _record_label()}
		_set_error(str(unavailable.error))
		return unavailable
	var generation := _read_generation
	var response := await _request(operation, _open_method(), _open_params(native_id))
	if response.get("outcomeUnknown", false): return response
	if generation != _read_generation: return _changed()
	if not bool(response.get("ok", false)):
		_set_error(str(response.get("error", "%s %d could not be opened." % [_record_label(), native_id])))
		return response
	var result := response.get("result", {}) as Dictionary
	var record := result.get(_record_key(), {}) as Dictionary
	var returned_id: Variant = record.get("nativeId")
	var canonical_id := _canonical_native_id(returned_id)
	if (
		canonical_id < 0
		or canonical_id != native_id
		or str(record.get("identity", "")) != "%s:%d" % [_identity_prefix(), native_id]
	):
		var mismatch := {"ok": false, "error": "%s returned a different or non-canonical identity." % _open_method()}
		_set_error(str(mismatch.error))
		return mismatch
	_applied_result = result.duplicate(true)
	_applied_native_id = native_id
	_render_document(record)
	_render_problem_summary(result)
	_select_applied_record()
	document_applied.emit(_applied_result.duplicate(true))
	return response


func clear_selection() -> void:
	_read_generation += 1
	_applied_result.clear()
	_applied_native_id = -1
	if _records != null:
		_records.deselect_all()
	if _identity != null:
		_identity.text = "Select a %s record" % _record_label()
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
	return {"ok": false, "stale": true, "error": "The record session or search changed while loading."}


func _ready() -> void:
	_search = find_child(_search_node_name(), true, false) as LineEdit
	_records = find_child(_list_node_name(), true, false) as ItemList
	_record_status = find_child(_status_node_name(), true, false) as Label
	_identity = find_child(_identity_node_name(), true, false) as Label
	_problems = find_child(_problems_node_name(), true, false) as Label
	_reason = find_child("DisabledReason", true, false) as Label
	_search.text_changed.connect(_on_search_changed)
	_records.item_selected.connect(_on_record_selected)
	visibility_changed.connect(_on_visibility_changed)
	_clear_document()


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
		_records.set_item_metadata(_records.item_count - 1, int(summary.get("nativeId", -1)))
	_select_applied_record()
	_records.get_v_scroll_bar().set_deferred("value", scroll)


func _render_problem_summary(result: Dictionary) -> void:
	var references := result.get("references", []) as Array
	var diagnostics := result.get("diagnostics", []) as Array
	var start := _applied_native_id * _record_bytes()
	_problems.text = "%d typed reference%s · %d problem%s · %s row %d · bytes %d…%d" % [
		references.size(), "" if references.size() == 1 else "s",
		diagnostics.size(), "" if diagnostics.size() == 1 else "s",
		_native_family(), _applied_native_id, start, start + _record_bytes() - 1,
	]
	_reason.text = _disabled_reason()


func _on_record_selected(index: int) -> void:
	if index >= 0:
		var response := await open_native_id(int(_records.get_item_metadata(index)))
		if response.get("busy", false): _select_applied_record()


func _on_search_changed(_value: String) -> void:
	_read_generation += 1
	_render_record_list()


func _on_visibility_changed() -> void:
	if _operations == null and is_node_ready() and not is_visible_in_tree():
		clear_selection()


func _index_for_native_id(native_id: int) -> int:
	for index in range(_records.item_count):
		if int(_records.get_item_metadata(index)) == native_id:
			return index
	return -1


func _select_applied_record() -> void:
	var index := _index_for_native_id(_applied_native_id)
	if index >= 0:
		_records.select(index)


func _set_error(message: String) -> void:
	clear_selection()
	_reason.text = message
	_record_status.text = "%s projection unavailable" % _record_label()
	document_applied.emit({})


func _canonical_native_id(value: Variant) -> int:
	if value is int:
		return int(value) if int(value) >= 0 else -1
	if value is float:
		var integer := int(value)
		return integer if integer >= 0 and float(integer) == float(value) else -1
	return -1


func _list_method() -> String:
	return ""


func _read_catalog(operation: ProvidenceEditorOperation) -> Dictionary:
	return await _request(operation, _list_method(), {"offset": 0, "limit": 128})


func _open_method() -> String:
	return ""


func _open_params(native_id: int) -> Dictionary:
	return {"nativeId": native_id}


func _search_node_name() -> String:
	return "RecordSearch"


func _list_node_name() -> String:
	return "RecordList"


func _status_node_name() -> String:
	return "RecordStatus"


func _identity_node_name() -> String:
	return "RecordIdentity"


func _problems_node_name() -> String:
	return "RecordProblems"


func _record_key() -> String:
	return ""


func _record_label() -> String:
	return "Record"


func _identity_prefix() -> String:
	return "record"


func _native_family() -> String:
	return "native"


func _record_bytes() -> int:
	return 0


func _summary_label(_summary: Dictionary) -> String:
	return ""


func _accept_list_result(_result: Dictionary) -> void:
	pass


func _render_document(_record: Dictionary) -> void:
	pass


func _clear_document() -> void:
	pass


func _disabled_reason() -> String:
	return "Editing awaits a bounded expected-revision command."
