extends RefCounted

const MESSAGE_PAGE_SIZE := 128

static func _run_lifecycle_smoke(shell: Control, project_path: String) -> void:
	await shell._project_session.create_project("ui-lifecycle-smoke", project_path)
	var created = shell._bridge.request("session.describe")
	if not bool(created.get("ok", false)):
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, str(created.get("error", "fresh project creation failed")))
		return
	var session := created.get("result", {}) as Dictionary
	if int(session.get("revision", -1)) != 0 or str(session.get("projectId", "")) != "ui-lifecycle-smoke":
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "fresh project did not open as authored revision 0")
		return
	if int((session.get("counts", {}) as Dictionary).get("messages", -1)) != 0:
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "fresh project unexpectedly contained authored messages")
		return
	var empty_message_page = shell._bridge.request("message.list", {"offset": 0, "limit": 10_000})
	if not bool(empty_message_page.get("ok", false)):
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, str(empty_message_page.get("error", "bounded message page failed")))
		return
	var empty_page := empty_message_page.get("result", {}) as Dictionary
	if int(empty_page.get("limit", -1)) != MESSAGE_PAGE_SIZE \
			or int(empty_page.get("total", -1)) != 0 \
			or not (empty_page.get("items", []) as Array).is_empty() \
			or empty_page.has("snapshot"):
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "message list did not return the bounded paging contract")
		return

	var created_message = shell._bridge.request("message.create", {
		"expectedRevision": 0,
		"nativeId": 12,
		"text": "A durable message survives native project reopen.",
	})
	if not bool(created_message.get("ok", false)):
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, str(created_message.get("error", "message creation failed")))
		return
	if int((created_message.result as Dictionary).get("revision", -1)) != 1:
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "message creation did not advance the bounded revision")
		return
	if not await _lifecycle_save_and_reopen(shell, project_path, 1, true, false):
		return

	var undone = shell._bridge.request("history.undo", {"expectedRevision": 1})
	if not bool(undone.get("ok", false)) or int((undone.get("result", {}) as Dictionary).get("revision", -1)) != 2:
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, str(undone.get("error", "undo after reopen failed")))
		return
	if not await _lifecycle_save_and_reopen(shell, project_path, 2, false, true):
		return

	var redone = shell._bridge.request("history.redo", {"expectedRevision": 2})
	if not bool(redone.get("ok", false)) or int((redone.get("result", {}) as Dictionary).get("revision", -1)) != 3:
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, str(redone.get("error", "redo after second reopen failed")))
		return
	if not await _lifecycle_save_and_reopen(shell, project_path, 3, true, false):
		return

	shell._close_project()
	if shell._command_bar.get_node("ProvidenceBrand/ProjectName").text != "No project open":
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "closing the project left a stale project title")
		return
	print("PROVIDENCE_LIFECYCLE_SMOKE_OK revision=3")
	shell.get_tree().quit(0)

static func _run_save_as_smoke(shell: Control, source_path: String, destination_path: String) -> void:
	await shell._project_session.create_project("ui-save-as-smoke", source_path)
	var created = shell._bridge.request("session.describe")
	if not bool(created.get("ok", false)):
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, str(created.get("error", "Save As source project creation failed")))
		return
	var created_message = shell._bridge.request("message.create", {
		"expectedRevision": 0,
		"nativeId": 12,
		"text": "Portable Save As keeps this message and its undo history.",
	})
	if not bool(created_message.get("ok", false)):
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, str(created_message.get("error", "Save As source edit failed")))
		return

	await shell._project_session.save_as(destination_path)
	var described = shell._bridge.request("session.describe")
	if not bool(described.get("ok", false)):
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, str(described.get("error", "Save As session could not be inspected")))
		return
	var destination_session := described.get("result", {}) as Dictionary
	if int(destination_session.get("revision", -1)) != 1 or not bool(destination_session.get("canUndo", false)):
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "Save As did not preserve revision and undo history")
		return
	var actual_destination = shell._bridge.current_project_path().replace("\\", "/").simplify_path()
	var expected_destination := destination_path.replace("\\", "/").simplify_path()
	if actual_destination != expected_destination:
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "Save As did not switch the native session to the destination project: expected '%s', got '%s'" % [expected_destination, actual_destination])
		return
	var opened_message = shell._bridge.request("message.open", {"nativeId": 12})
	if not bool(opened_message.get("ok", false)):
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, str(opened_message.get("error", "saved-as message was unavailable")))
		return
	var message := (opened_message.get("result", {}) as Dictionary).get("message", {}) as Dictionary
	if str(message.get("text", "")) != "Portable Save As keeps this message and its undo history.":
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "Save As changed canonical message semantics")
		return

	if not await _verify_save_as_independence(shell, source_path, destination_path): return
	var destination_reopened = await _reopen_project(shell, destination_path)
	if not bool(destination_reopened.get("ok", false)):
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, str(destination_reopened.get("error", "saved-as project reopen failed")))
		return
	var reopened_session := destination_reopened.get("result", {}) as Dictionary
	if int(reopened_session.get("revision", -1)) != 2 \
			or int((reopened_session.get("counts", {}) as Dictionary).get("messages", -1)) != 0 \
			or not bool(reopened_session.get("canRedo", false)):
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "saved-as undo state did not survive reopen")
		return

	print("PROVIDENCE_SAVE_AS_SMOKE_OK sourceRevision=1 destinationRevision=2")
	shell.get_tree().quit(0)

static func _lifecycle_save_and_reopen(shell: Control,
	project_path: String,
	expected_revision: int,
	expect_message: bool,
	expect_redo: bool
) -> bool:
	var saved = shell._bridge.request("project.save")
	if not bool(saved.get("ok", false)):
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, str(saved.get("error", "project save failed")))
		return false
	var save_result := saved.get("result", {}) as Dictionary
	var expected_snapshot_path := project_path.path_join("project.providence.json")
	if int(save_result.get("revision", -1)) != expected_revision:
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "project save returned the wrong revision")
		return false
	var saved_path := str(save_result.get("path", "")).replace("\\", "/").simplify_path()
	var expected_path := expected_snapshot_path.replace("\\", "/").simplify_path()
	if saved_path != expected_path:
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "project save wrote outside portable project truth")
		return false
	if str(save_result.get("snapshotSha256", "")).length() != 64:
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "project save did not report a deterministic snapshot hash")
		return false

	var reopened = await _reopen_project(shell, project_path)
	if not bool(reopened.get("ok", false)):
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, str(reopened.get("error", "project reopen failed")))
		return false
	var session := reopened.get("result", {}) as Dictionary
	if shell._command_bar.get_node("ProvidenceBrand/ProjectName").text != "ui-lifecycle-smoke":
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "reopening the project did not update the project title")
		return false
	if int(session.get("revision", -1)) != expected_revision:
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "reopened session lost its revision")
		return false
	var message_count := int((session.get("counts", {}) as Dictionary).get("messages", -1))
	if (message_count == 1) != expect_message:
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "reopened session did not preserve canonical message semantics")
		return false
	if expect_message:
		var opened_message = shell._bridge.request("message.open", {"nativeId": 12})
		if not bool(opened_message.get("ok", false)):
			preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, str(opened_message.get("error", "reopened Message 12 was unavailable")))
			return false
		var message := (opened_message.result as Dictionary).get("message", {}) as Dictionary
		if str(message.get("text", "")) != "A durable message survives native project reopen.":
			preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "reopened message text changed")
			return false
	if bool(session.get("canRedo", false)) != expect_redo:
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "reopened session did not preserve redo availability")
		return false
	return true


static func _verify_save_as_independence(shell: Control, source_path: String, destination_path: String) -> bool:
	var undone = shell._bridge.request("history.undo", {"expectedRevision": 1})
	if not bool(undone.get("ok", false)) or int((undone.get("result", {}) as Dictionary).get("revision", -1)) != 2:
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, str(undone.get("error", "saved-as undo failed")))
		return false
	var source_reopened = await _reopen_project(shell, source_path)
	if not bool(source_reopened.get("ok", false)):
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, str(source_reopened.get("error", "source project reopen failed")))
		return false
	var source_session := source_reopened.get("result", {}) as Dictionary
	if int(source_session.get("revision", -1)) != 1:
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "editing the saved-as project changed the source revision")
		return false
	var source_message = shell._bridge.request("message.open", {"nativeId": 12})
	if not bool(source_message.get("ok", false)):
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "editing the saved-as project changed the source message")
		return false

	var refused = shell._bridge.save_project_as(destination_path)
	if bool(refused.get("ok", false)):
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "Save As replaced an existing destination")
		return false
	var actual_source = shell._bridge.current_project_path().replace("\\", "/").simplify_path()
	var expected_source := source_path.replace("\\", "/").simplify_path()
	if actual_source != expected_source:
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "failed Save As switched away from the source project")
		return false
	return true


static func _reopen_project(shell: Control, project_path: String) -> Dictionary:
	# Exercise the same candidate-connection and session-rebinding boundary as the
	# native Open command. Visible selection reads may still be retiring here.
	while shell._operations.busy:
		await shell._operations.completed
	await shell._project_session.open_project(project_path)
	return shell._bridge.request("session.describe")
