class_name ProvidenceMonsterBrowserState
extends RefCounted

signal detail_cleared
signal detail_loaded(result: Dictionary)

const PAGE_SIZE := 128
const SET_IDS := [0, 1, -1]

var set_id := 0
var native_id := -1
var query := ""
var offset := 0
var revision := -1
var catalog: Dictionary = {}
var detail: Dictionary = {}
var error := ""
var _bridge
var _operations: ProvidenceEditorOperation
var _generation := 0
var detail_presenter: Callable
var navigation_guard: Callable


func attach(bridge, operations: ProvidenceEditorOperation = null) -> void:
	_generation += 1
	_bridge = bridge
	_operations = operations
	set_id = 0
	native_id = -1
	query = ""
	offset = 0
	revision = -1
	catalog.clear()
	_clear_detail()


func search(text: String) -> Dictionary:
	return await _run("Search monsters", _search.bind(text))


func _search(operation: ProvidenceEditorOperation, text: String) -> Dictionary:
	query = text.strip_edges()
	return await _load_page(operation, 0)


func load_page(start: int, borrowed: ProvidenceEditorOperation = null) -> Dictionary:
	return await _run("Load monsters", _load_page.bind(start), borrowed)


func _load_page(operation: ProvidenceEditorOperation, start: int) -> Dictionary:
	revision = -1
	catalog.clear()
	_clear_detail()
	native_id = -1
	offset = maxi(0, start)
	if _bridge == null:
		return _fail("Open a project to inspect monsters.")
	var generation := _generation
	var response := await _request(operation, "monster.catalog", {
		"setId": set_id, "query": query, "offset": offset, "limit": PAGE_SIZE,
	})
	if response.get("outcomeUnknown", false): return response
	if generation != _generation: return _changed()
	if not bool(response.get("ok", false)):
		error = str(response.get("error", "Monster catalog unavailable."))
		return response
	var result: Dictionary = response.get("result", {})
	var page: Dictionary = result.get("catalog", {})
	var rows: Array = page.get("items", [])
	if rows.size() > PAGE_SIZE or int(page.get("offset", -1)) != offset:
		return _fail("Monster catalog returned an unexpected page.")
	catalog = page.duplicate(true)
	revision = int(result.get("revision", -1))
	return response


func switch_set(next_set: int, borrowed: ProvidenceEditorOperation = null) -> Dictionary:
	return await _run("Select monster set", _switch_set.bind(next_set), borrowed)


func _switch_set(operation: ProvidenceEditorOperation, next_set: int) -> Dictionary:
	_clear_detail()
	if next_set not in SET_IDS:
		return _fail("Unknown monster set.")
	var retained_id := native_id
	set_id = next_set
	var response := await _load_page(operation, 0)
	if bool(response.get("ok", false)) and retained_id >= 0:
		return await _open_record(operation, retained_id)
	return response


func open_record(next_id: int, borrowed: ProvidenceEditorOperation = null) -> Dictionary:
	return await _run("Open monster", _open_record.bind(next_id), borrowed)


func _open_record(operation: ProvidenceEditorOperation, next_id: int) -> Dictionary:
	_clear_detail()
	native_id = next_id
	if _bridge == null or native_id < 0:
		return _fail("Select a source-backed monster.")
	var generation := _generation
	var response := await _request(operation, "monster.open", {
		"setId": set_id, "nativeId": native_id,
	})
	if response.get("outcomeUnknown", false): return response
	if generation != _generation: return _changed()
	if not bool(response.get("ok", false)):
		error = str(response.get("error", "Selected monster variant is unavailable."))
		return response
	var result: Dictionary = response.get("result", {})
	var record: Dictionary = result.get("monster", {})
	var expected_identity := "monster:%d:%d" % [set_id, native_id]
	if int(result.get("setId", 99)) != set_id or int(record.get("nativeId", -1)) != native_id or str(record.get("identity", "")) != expected_identity:
		return _fail("Monster detail does not match the selected set and record.")
	detail = result.duplicate(true)
	revision = int(result.get("revision", -1))
	if detail_presenter.is_valid():
		var presented: Dictionary = await detail_presenter.call(detail.duplicate(true), operation)
		if not presented.get("ok", false): return presented
	if generation != _generation: return _changed()
	detail_loaded.emit(detail.duplicate(true))
	return response


func cancel_pending_read() -> void:
	_generation += 1


func selection_token() -> int:
	return _generation


func restore_selection(selection: Dictionary, borrowed: ProvidenceEditorOperation = null) -> Dictionary:
	return await _run("Restore monster selection", _restore_selection.bind(selection), borrowed)


func _restore_selection(operation: ProvidenceEditorOperation, selection: Dictionary) -> Dictionary:
	var next_set := int(selection.get("setId", 0))
	if next_set not in SET_IDS: return _fail("Unknown monster set.")
	set_id = next_set
	query = str(selection.get("scenarioQuery", ""))
	var page := await _load_page(operation, int(selection.get("scenarioOffset", 0)))
	if not page.get("ok", false): return page
	var selected_id := int(selection.get("nativeId", -1))
	return page if selected_id < 0 else await _open_record(operation, selected_id)


func _run(label: String, workflow: Callable, borrowed: ProvidenceEditorOperation = null) -> Dictionary:
	if borrowed == null and navigation_guard.is_valid() and not await navigation_guard.call(label):
		return {"ok": false, "canceled": true}
	if _operations == null: return await workflow.call(null)
	if _bridge == null: return _fail("Open a project to inspect monsters.")
	return await _operations.run_workflow(_bridge, label, workflow, borrowed)


func _request(operation: ProvidenceEditorOperation, method: String, params: Dictionary) -> Dictionary:
	return _bridge.request(method, params) if operation == null else await operation.request(method, params)


func _changed() -> Dictionary:
	return {"ok": false, "stale": true, "error": "The monster session or search changed while loading."}


func _clear_detail() -> void:
	detail.clear()
	error = ""
	detail_cleared.emit()


func _fail(message: String) -> Dictionary:
	error = message
	return {"ok": false, "error": message}
