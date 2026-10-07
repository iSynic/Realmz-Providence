extends RefCounted

var operations: ProvidenceEditorOperation
var read_bridge: Callable
var generation := 0

func configure(operation: ProvidenceEditorOperation, bridge: Callable) -> void:
	operations = operation
	read_bridge = bridge

func invalidate() -> void:
	generation += 1

func request(method: String, params: Dictionary, borrowed: ProvidenceEditorOperation = null) -> Dictionary:
	var bridge = read_bridge.call() if read_bridge.is_valid() else null
	if bridge == null or operations == null: return {"ok":false, "error":"Open a scenario first."}
	var token := generation
	var epoch: int = bridge.connection_epoch()
	# The view owns read progress; background context must not replace save status.
	var response: Dictionary = await operations.run_workflow(bridge, "", func(operation):
		return await operation.request(method, params), borrowed)
	if token != generation or epoch != bridge.connection_epoch():
		return {"ok":false, "stale":true, "error":"The scenario session changed."}
	return response
