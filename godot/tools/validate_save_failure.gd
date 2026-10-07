extends SceneTree

class CheckedShell extends "res://src/editor_shell.gd":
	var failures: Array[String] = []
	func _show_error(message: String) -> void:
		failures.append(message)
		_status.text = message
		if not message.contains("Controlled write failure"): push_error(message)

class FailingBridge extends ProvidenceNativeBridge:
	var requests: Array[String] = []
	func is_project_backed() -> bool:
		return true
	func _request(method: String, _params: Dictionary = {}) -> Dictionary:
		OS.delay_msec(40)
		requests.append(method)
		return {"ok": false, "error": "Controlled write failure"}


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var shell = load("res://src/editor_shell.tscn").instantiate()
	shell.set_script(CheckedShell)
	root.add_child(shell)
	await process_frame
	var actual_bridge = shell._bridge
	var failing := FailingBridge.new()
	var revision: int = shell._session_view.revision
	shell._bridge = failing
	shell._project_session.save()
	assert(shell._operations.busy and shell._status.text == "Save in progress…")
	await shell._project_session.save()
	await shell._project_session.open_project("must-not-open-while-saving")
	shell._close_project()
	assert(shell._bridge == failing and shell._operations.busy)
	await shell._operations.completed
	await process_frame
	shell._bridge = actual_bridge
	var status: String = shell._status.text
	assert(shell.failures.size() == 1 and shell.failures[0].contains("Controlled write failure"))
	if not shell._item_editor.get_node("%SaveNotice").text.begins_with("Not saved.") or not shell._item_editor.get_node("%SaveActions").visible or shell._item_editor.get_node("%SaveItemProject").text != "Retry Save":
		push_error("PROVIDENCE_SAVE_FAILURE_FAILED persistent recovery controls absent")
		quit(1)
		return
	if not status.begins_with("Not saved.") or not status.contains("Save As") or failing.requests != ["project.save"] or shell._session_view.revision != revision:
		push_error("PROVIDENCE_SAVE_FAILURE_FAILED recovery guidance or session state changed")
		quit(1)
		return
	shell.queue_free()
	await process_frame
	print("PROVIDENCE_SAVE_FAILURE_OK injected-response no-session-replacement")
	quit(0)
