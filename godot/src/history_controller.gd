extends RefCounted

signal projection_applied(projection: Dictionary)

const Operation = preload("res://src/editor_operation.gd")
var operations: Operation
var refresh_visible: Callable
var requires_reopen := false


func execute(bridge, revision: int, direction: String) -> Dictionary:
	if requires_reopen:
		return {"ok": false, "outcomeUnknown": true, "error": "Reopen the project before retrying."}
	var label := "Undo" if direction == "undo" else "Redo"
	if not operations.begin(bridge, label):
		return {"ok": false, "busy": true, "error": "Wait for the current operation to finish."}
	var response: Dictionary = await operations.request("history." + direction, {"expectedRevision": revision})
	if response.get("ok", false):
		projection_applied.emit(response.result)
		var refreshed: Dictionary = await refresh_visible.call(response.result)
		if not refreshed.get("ok", false):
			response["viewRefreshError"] = refreshed.get("error", "The visible document could not refresh.")
			requires_reopen = bool(refreshed.get("outcomeUnknown", false))
			if requires_reopen: response["outcomeUnknown"] = true
	else:
		requires_reopen = bool(response.get("outcomeUnknown", false))
	operations.finish(response)
	return response


func reset() -> void:
	requires_reopen = false
	if operations != null: operations.reset_session()
