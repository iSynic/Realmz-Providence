extends RefCounted

signal failed(message: String)

var _view: ProvidenceProblemsDock
var _operations: ProvidenceEditorOperation
var _bridge: RefCounted
var _generation := 0


func initialize(view: ProvidenceProblemsDock, operations: ProvidenceEditorOperation) -> void:
	_view = view
	_operations = operations
	_view.tab_changed.connect(_select_surface)


func attach_session(bridge: RefCounted) -> void:
	_generation += 1
	_bridge = bridge
	_view.reset()


func teardown() -> void:
	attach_session(null)


func refresh(borrowed: ProvidenceEditorOperation = null) -> Dictionary:
	if _bridge == null: return {"ok": false, "error": "No project is open."}
	return await _operations.run_workflow(_bridge, "Validate", _read_validation.bind(_generation), borrowed)


func _read_validation(operation: ProvidenceEditorOperation, generation: int) -> Dictionary:
	var response := await operation.request("validation.list", {"offset": 0, "limit": 128})
	if response.get("outcomeUnknown", false): return response
	if generation != _generation: return _stale()
	if response.get("ok", false): _view.set_diagnostics(response.result.get("items", []))
	return response


func _select_surface(tab: int) -> void:
	if tab != 1 or _bridge == null:
		_view.show_selected_local()
		return
	var response := await _operations.run_workflow(_bridge, "Check compatibility", _read_compatibility.bind(_generation))
	if not response.get("ok", false) and not response.get("stale", false): failed.emit(str(response.get("error", "Compatibility could not load.")))


func _read_compatibility(operation: ProvidenceEditorOperation, generation: int) -> Dictionary:
	var response := await operation.request("compatibility.classify")
	if response.get("outcomeUnknown", false): return response
	if generation != _generation or _view.selected_tab() != 1: return _stale()
	if response.get("ok", false): _view.show_compatibility(response.result)
	return response


func _stale() -> Dictionary:
	return {"ok": false, "stale": true, "error": "The project or output surface changed while loading."}
