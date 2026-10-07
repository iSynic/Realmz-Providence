extends SceneTree

class DraftBridge extends RefCounted:
	var revision := 7
	var available := true
	var style: Variant = null
	var failure := ""
	var uncertain := false
	var invalid_file := false
	var text := "The old bridge rises from the mist.\n".repeat(1000)
	var calls: Array = []
	func is_project_backed() -> bool: return true
	func request(method: String, params: Dictionary = {}) -> Dictionary:
		calls.append({"method": method, "params": params.duplicate(true)})
		if method == "session.describe": return {"ok": true, "result": {"revision": revision}}
		if params.get("expectedRevision") != revision: return {"ok": false, "error": "revision conflict: expected older revision"}
		match method:
			"text-resource.inspect-new-styles":
				return {"ok":true,"result":{"styles":[],"styleEditable":true,"feedback":{"valid":true,"encodedBytes":0}}}
			"text-resource.validate-draft":
				var name_error: Variant = "Give this text a nonempty name without control characters." if params.label.is_empty() else null
				var index: int = params.text.find("🧭")
				var text_error: Variant = "character compass at character index %d is not representable" % index if index >= 0 else null
				return {"ok": true, "result": {"valid": name_error == null and text_error == null, "nameError": name_error, "textError": text_error}}
			"text-resource.check-number":
				return {"ok": true, "result": {"available": available, "reason": "This number already has text. Choose another number.", "styleCompanion": style}}
			"text-resource.prepare-import":
				if invalid_file: return {"ok": false, "error": "This file is not valid UTF-8."}
				return {"ok": true, "result": {"text": text, "bomRemoved": true, "lineEndingsNormalized": true}}
			"text-resource.create":
				if not failure.is_empty(): return {"ok": false, "error": failure, "outcomeUnknown": uncertain}
				assert(available)
				if style is Dictionary: assert(params.preserveStyleIdentity == style.identity)
				revision += 1
				return {"ok": true, "result": {"revision": revision, "identity": "text:%d" % params.resourceId}}
		return {"ok": false, "error": "Unexpected method: " + method}


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	root.gui_embed_subwindows = true
	root.size = Vector2i(1600, 900)
	var dialog = load("res://src/new_text_dialog.tscn").instantiate()
	root.add_child(dialog)
	var bridge := DraftBridge.new()
	assert(dialog.open_new(bridge).ok)
	await dialog.validate_now()
	assert(dialog.get_node("%Create").disabled and not dialog.has_unapplied_changes())
	await process_frame
	assert(dialog.get_node("%Create").get_global_rect().end.y <= dialog.size.y,"New Text clipped Create")
	assert(dialog.get_node("%Cancel").get_global_rect().end.y <= dialog.size.y,"New Text clipped Cancel")
	assert(dialog.editor.tab_input_mode == false)
	await _check_keyboard(dialog)
	dialog.get_node("%Number").text = "203"
	dialog.get_node("%TextName").text = "Arrival at the old bridge"
	dialog.editor.text = "Retained draft\nwith a selection"
	dialog.editor.text_changed.emit()
	await dialog.get_node("%StyleWorkbench")._inspect()
	dialog.draft_changed()
	await dialog.validate_now()
	assert(not dialog.get_node("%Create").disabled)
	dialog.editor.select(0, 0, 0, 8)
	dialog.request_load()
	assert(dialog.get_node("%ReplaceDraft").visible)
	assert(dialog.get_node("%ReplaceDraft").get_cancel_button().has_focus())
	dialog.get_node("%ReplaceDraft").canceled.emit()
	dialog.get_node("%ReplaceDraft").hide()
	bridge.invalid_file = true
	await dialog.load_file("invalid.txt")
	assert(dialog.editor.text == "Retained draft\nwith a selection")
	assert(dialog.editor.get_selected_text() == "Retained")
	assert(not dialog.get_node("%Create").disabled)
	bridge.invalid_file = false
	await dialog.load_file("bridge.txt")
	await dialog.get_node("%StyleWorkbench")._inspect()
	assert(dialog.editor.text == bridge.text and bridge.text.length() > 16000)
	assert(dialog.get_node("%TextName").text == "Arrival at the old bridge" and dialog.get_node("%Number").text == "203")
	assert(dialog.get_node("%FileStatus").text.contains("BOM removed"))
	dialog.editor.text = "First line\nUnsupported 🧭"
	dialog.editor.text_changed.emit()
	await dialog.get_node("%StyleWorkbench")._inspect()
	dialog.draft_changed()
	await dialog.validate_now()
	assert(dialog.get_node("%Create").disabled and dialog.get_node("%SelectCharacter").visible)
	dialog.get_node("%SelectCharacter").pressed.emit()
	assert(dialog.editor.get_selected_text() == "🧭")
	assert(dialog.editor.focus_next == dialog.get_node("%SelectCharacter").get_path())
	dialog.editor.text = "Corrected long text\n".repeat(1000)
	dialog.editor.text_changed.emit()
	await dialog.get_node("%StyleWorkbench")._inspect()
	dialog.draft_changed()
	bridge.available = false
	await dialog.validate_now()
	assert(dialog.get_node("%Create").disabled and dialog.get_node("%Availability").text.contains("already has text"))
	bridge.available = true
	bridge.style = {"identity": "style:203"}
	dialog.draft_changed()
	await dialog.validate_now()
	assert(dialog.get_node("%PreserveStyle").visible and dialog.get_node("%Create").disabled)
	dialog.get_node("%PreserveStyle").button_pressed = true
	assert(not dialog.get_node("%Create").disabled)
	bridge.revision += 1
	await dialog.create_text()
	assert(dialog.get_node("%CheckAgain").visible and dialog.get_node("%Create").disabled)
	await dialog.recheck()
	await dialog.get_node("%StyleWorkbench")._inspect()
	assert(not dialog.get_node("%PreserveStyle").button_pressed and dialog.get_node("%Create").disabled)
	dialog.get_node("%PreserveStyle").button_pressed = true
	bridge.failure = "Storage is full. Free space, then retry."
	await dialog.create_text()
	assert(dialog.visible and dialog.get_node("%Create").text == "Retry Create")
	assert(dialog.editor.text == "Corrected long text\n".repeat(1000))
	await _check_uncertain_creation(dialog,bridge)
	bridge.available = false
	await dialog.recheck()
	await dialog.get_node("%StyleWorkbench")._inspect()
	assert(dialog.get_node("%Create").disabled)
	bridge.available = true
	dialog.draft_changed()
	await dialog.validate_now()
	dialog.get_node("%TextName").text = ""
	dialog.draft_changed()
	await dialog.validate_now()
	assert(dialog.get_node("%NameError").visible and dialog.get_node("%Create").disabled)
	dialog.get_node("%TextName").text = "Arrival at the old bridge"
	dialog.draft_changed()
	await dialog.validate_now()
	dialog.get_node("%PreserveStyle").button_pressed = true
	bridge.failure = ""
	await _check_single_create(dialog,bridge)
	assert(dialog.open_new(bridge).ok)
	dialog.editor.text = "Unsaved draft"
	dialog.editor.text_changed.emit()
	await dialog.get_node("%StyleWorkbench")._inspect()
	dialog.draft_changed()
	var escaped := InputEventKey.new()
	escaped.keycode = KEY_ESCAPE
	escaped.pressed = true
	dialog._input(escaped)
	assert(dialog.get_node("%Discard").visible and dialog.get_node("%Discard").get_cancel_button().has_focus())
	dialog.get_node("%Discard").canceled.emit()
	dialog.get_node("%Discard").hide()
	assert(dialog.visible and dialog.editor.text == "Unsaved draft")
	dialog.queue_free()
	await process_frame
	print("PROVIDENCE_NEW_TEXT_DIALOG_OK draft-import-validation-style-stale-failure-uncertain-busy-guards")
	quit(0)

func _check_uncertain_creation(dialog: Window, bridge: DraftBridge) -> void:
	bridge.uncertain = true
	bridge.failure = "Native adapter closed the command stream."
	await dialog.create_text()
	assert(dialog.get_node("%Create").disabled and dialog.get_node("%CheckAgain").text == "Reopen project required")
	assert(not dialog.get_node("%TextName").editable and not dialog.get_node("%Number").editable and dialog.get_node("%Cancel").disabled)
	var retained_number: String = dialog.get_node("%Number").text
	var retained_text: String = dialog.editor.text
	var unknown_calls: int = bridge.calls.size()
	dialog.request_cancel()
	dialog.request_load()
	await dialog.recheck()
	assert(dialog.visible and not dialog.get_node("%Discard").visible and bridge.calls.size()==unknown_calls)
	bridge.uncertain = false
	bridge.failure = ""
	dialog.discard_draft()
	await dialog.open_new(bridge)
	dialog.get_node("%Number").text = retained_number
	dialog.editor.text = retained_text
	dialog.editor.text_changed.emit()
	await dialog.get_node("%StyleWorkbench")._inspect()

func _check_single_create(dialog: Window, bridge: DraftBridge) -> void:
	var created: Array = []
	dialog.created.connect(func(projection, identity): created.append([projection, identity]))
	var create_count := bridge.calls.filter(func(call): return call.method == "text-resource.create").size()
	dialog.create_text()
	assert(dialog.get_node("%Create").disabled and dialog.get_node("%Cancel").disabled and not dialog.editor.editable)
	dialog.create_text()
	for _frame in range(3): await process_frame
	assert(created.size() == 1 and created[0][1] == "text:203" and not dialog.visible)
	assert(bridge.calls.filter(func(call): return call.method == "text-resource.create").size() == create_count + 1)
	assert(not bridge.calls.any(func(call): return call.method == "project.save"))

func _check_keyboard(dialog: Window) -> void:
	dialog.editor.grab_focus()
	var newline := InputEventKey.new()
	newline.keycode = KEY_ENTER
	newline.unicode = 13
	newline.pressed = true
	dialog.push_input(newline)
	await process_frame
	assert(dialog.editor.text == "\n")
	newline.pressed = false
	dialog.push_input(newline)
	var tab := InputEventKey.new()
	tab.keycode = KEY_TAB
	tab.pressed = true
	dialog.push_input(tab)
	await process_frame
	assert(dialog.editor.text == "\n" and dialog.get_node("%Cancel").has_focus())
	tab.pressed = false
	dialog.push_input(tab)
