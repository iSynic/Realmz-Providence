extends RefCounted

signal library_changed
signal status_changed(message: String)

var operations: ProvidenceEditorOperation
var _bridge: RefCounted
var _generation := 0


func attach_session(bridge: RefCounted) -> void:
	if _bridge == bridge: return
	_bridge = bridge
	_generation += 1


func import_image(path: String, revision: int, collection: String, refresh: Callable) -> Dictionary:
	var params := {"identity": "personal:" + Crypto.new().generate_random_bytes(16).hex_encode(),
		"name": path.get_file().get_basename(), "path": path, "expectedRevision": revision}
	if not collection.is_empty(): params["collection"] = collection
	return await mutate("personal-library.import-image", params, refresh)


func mutate(method: String, params: Dictionary, refresh: Callable) -> Dictionary:
	if _bridge == null: return {"ok": false, "error": "Open My Library before editing assets."}
	var generation := _generation
	var response := await operations.run_workflow(_bridge, "Update My Library",
		_mutation_workflow.bind(method, params.duplicate(true), refresh, generation))
	if generation != _generation: return response
	if response.get("ok", false):
		library_changed.emit()
		if response.has("viewRefreshError"): status_changed.emit("Library updated; " + str(response.viewRefreshError))
	else:
		status_changed.emit(str(response.get("error", "The library changed. Review it before trying again.")))
	return response


func _mutation_workflow(operation: ProvidenceEditorOperation, method: String, params: Dictionary, refresh: Callable, generation: int) -> Dictionary:
	var response := await operation.request(method, params)
	if response.get("outcomeUnknown", false) or generation != _generation: return response
	# A known rejection can reload the latest library revision. Unknown outcomes
	# stop here; neither the mutation nor any follow-up read is automatically retried.
	var refreshed: Dictionary = await refresh.call(operation, bool(response.get("ok", false)))
	if not refreshed.get("ok", false):
		response["viewRefreshError"] = str(refreshed.get("error", "Refresh the asset list."))
		if refreshed.get("outcomeUnknown", false): response["outcomeUnknown"] = true
	return response
