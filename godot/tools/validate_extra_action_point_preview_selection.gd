extends SceneTree


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var editor: Control = load("res://src/extra_action_point_editor.tscn").instantiate()
	root.add_child(editor)
	editor.size = Vector2(1220, 820)
	await process_frame
	var document := {
		"identity": "extra-action-point:80",
		"nativeId": 80,
		"classicDoorId": 0,
		"postActionLevel": 0,
		"postActionX": 0,
		"postActionY": 0,
		"chancePercent": 100,
		"actions": [],
	}
	editor.set_document({
		"revision": 3,
		"extraActionPoint": document,
		"references": [],
		"extraCodeAttachments": [],
	})
	if editor.current_applied_native_id() != 80 or editor.trusted_applied_native_id() != 80:
		_fail("canonical Extra Action Point identity was not retained as the applied preview target")
		return
	var selection := ProvidenceRebuiltPreviewSelection.new()
	var applied_target := selection.current_target("scripts.macros", "", Vector2i(-1, -1), {}, {}, "", -1, -1, -1, -1, -1, -1, editor.trusted_applied_native_id()) as Dictionary
	var draft_target := selection.current_target("scripts.macros", "", Vector2i(-1, -1), {}, {}, "", -1, -1, -1, -1, -1, -1, editor.trusted_applied_native_id(true)) as Dictionary
	if applied_target != {"kind": "extra-action-point-program", "id": 80} or not draft_target.is_empty() or applied_target.has("ownerId"):
		_fail("Extra Action Point F6 selection was not exact, draft-guarded, and owner-free")
		return
	var chance := editor.find_child("ChancePercent", true, false) as SpinBox
	chance.value = 75
	if not editor.has_unapplied_changes() or editor.trusted_applied_native_id() != -1:
		_fail("unapplied Extra Action Point fields remained previewable")
		return
	document["chancePercent"] = 75
	document["identity"] = "Data ED3:macro:80"
	editor.set_document({
		"revision": 4,
		"extraActionPoint": document,
		"references": [],
		"extraCodeAttachments": [],
	})
	if editor.current_applied_native_id() != -1 or editor.trusted_applied_native_id() != -1:
		_fail("a noncanonical imported alias became a Providence editor selection")
		return
	var preview: Node = load("res://src/rebuilt_preview_controller.tscn").instantiate()
	root.add_child(preview)
	var target_arguments := preview._target_arguments(applied_target) as Dictionary
	if (
		str(target_arguments.get("command", "")) != "prepare-extra-action-point-program"
		or (target_arguments.get("arguments", PackedStringArray()) as PackedStringArray) != PackedStringArray(["80"])
	):
		_fail("Extra Action Point target did not map to the standalone lockstep producer")
		return
	print("PROVIDENCE_EXTRA_ACTION_POINT_PREVIEW_SELECTION_OK exactIdentity=guarded draft=suppressed owner=omitted context=standalone")
	preview.queue_free()
	editor.queue_free()
	quit(0)


func _fail(message: String) -> void:
	push_error("PROVIDENCE_EXTRA_ACTION_POINT_PREVIEW_SELECTION_FAILED: %s" % message)
	quit(1)
