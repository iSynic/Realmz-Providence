extends SceneTree

class TextBridge extends RefCounted:
	var revision := 7
	var text := "First line\n".repeat(80)
	var failure := ""
	var requests: Array = []
	func request(method: String, params: Dictionary = {}) -> Dictionary:
		requests.append({"method": method, "params": params.duplicate(true)})
		if method == "text-resource.open":
			return {"ok": true, "result": {"revision": revision, "resource": {"identity": params.identity, "resourceId": -202}, "text": text}}
		if method == "text-resource.inspect-styles":
			var draft := text
			for edit in params.get("edits",[]):
				if edit.kind=="replace-text": draft = draft.left(int(edit.start))+str(edit.text)+draft.substr(int(edit.start)+int(edit.removed))
			if draft.contains("🧭"): return {"ok":false,"error":"character compass at character index %d is not representable in Classic MacRoman text" % draft.find("🧭")}
			return {"ok":true,"result":{"styles":[],"styleEditable":true,"feedback":{"valid":true,"encodedBytes":draft.length()}}}
		assert(method == "text-resource.apply-styles")
		assert(params.identity == "text:-202")
		if params.expectedRevision != revision:
			return {"ok": false, "error": "revision conflict: expected %d, current revision is %d" % [params.expectedRevision, revision]}
		if not failure.is_empty():
			return {"ok": false, "error": failure}
		for edit in params.get("edits",[]):
			if edit.kind=="replace-text": text = text.left(int(edit.start))+str(edit.text)+text.substr(int(edit.start)+int(edit.removed))
		revision += 1
		return {"ok": true, "result": {"revision": revision, "canUndo": true}}


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	root.gui_embed_subwindows = true
	root.size=Vector2i(1600,900)
	var dialog = load("res://src/text_resource_dialog.tscn").instantiate()
	root.add_child(dialog)
	var bridge := TextBridge.new()
	var applied: Array = []
	dialog.applied.connect(func(projection, identity): applied.append([projection, identity]))
	assert(dialog.open_text(bridge, "text:-202").ok)
	await process_frame
	root.size=Vector2i(1600,900)
	var draft: TextEdit = dialog.editor
	assert(draft.text == bridge.text and draft.wrap_mode == TextEdit.LINE_WRAPPING_BOUNDARY)
	assert(not draft.tab_input_mode and dialog.get_node("%Apply").disabled)
	dialog.request_cancel()
	assert(not dialog.visible and not dialog.get_node("%Discard").visible)
	assert(bridge.requests.size() == 1 and bridge.revision == 7)
	assert(dialog.open_text(bridge, "text:-202").ok)
	draft.text = "Changed first line\n" + "The long road winds through the trees.\n".repeat(80)
	draft.text_changed.emit()
	dialog._draft_changed()
	await dialog.get_node("%StyleWorkbench")._inspect()
	draft.set_caret_line(40)
	draft.set_caret_column(8)
	draft.select(40, 0, 40, 8)
	draft.scroll_vertical = 30
	var retained := draft.text
	var scroll := draft.scroll_vertical
	bridge.failure = "Not enough free disk space to store this text."
	dialog.apply_text()
	assert(dialog.visible and draft.text == retained and bridge.revision == 7)
	assert(draft.get_caret_line() == 40 and draft.get_selected_text() == "The long")
	assert(draft.scroll_vertical == scroll)
	assert(dialog.get_node("%Outcome").text.contains("Nothing was applied"))
	assert(not dialog.get_node("%Apply").disabled and applied.is_empty())
	dialog.request_cancel()
	assert(dialog.get_node("%Discard").visible)
	assert(dialog.get_node("%Discard").get_cancel_button().has_focus())
	dialog.get_node("%Discard").hide()
	dialog.get_node("%Discard").canceled.emit()
	assert(dialog.visible and draft.text == retained)
	bridge.failure = ""
	bridge.revision = 8
	bridge.text = "Current text changed elsewhere.\n".repeat(90)
	dialog.apply_text()
	assert(dialog.get_node("%Apply").disabled and dialog.get_node("%ReviewCurrent").visible)
	assert(draft.focus_next == dialog.get_node("%ReviewCurrent").get_path())
	var before := bridge.requests.size()
	dialog.apply_text()
	assert(bridge.requests.size() == before)
	dialog.review_current()
	assert(dialog.get_node("%Comparison").visible)
	assert(dialog.get_node("%CurrentText").text == bridge.text)
	assert(dialog.get_node("%RetainedText").text == retained)
	dialog.accept_current()
	await dialog.get_node("%StyleWorkbench")._inspect()
	assert(not dialog.get_node("%Apply").disabled and draft.text == retained)
	await process_frame
	assert(draft.get_selected_text() == "The long" and draft.scroll_vertical == scroll)
	assert(bridge.revision == 8)
	dialog.apply_text()
	assert(not dialog.visible and bridge.text == retained and bridge.revision == 9)
	assert(applied.size() == 1 and applied[0][1] == "text:-202")
	assert(bridge.requests[-1].params.expectedRevision == 8)
	assert(not bridge.requests.any(func(entry): return entry.method == "project.save"))
	await _check_encoding_departure(dialog,bridge)
	dialog.queue_free()
	await process_frame
	print("PROVIDENCE_TEXT_RESOURCE_DIALOG_OK long-text draft-retention encoding conflict explicit-rebase cancel no-save")
	quit(0)

func _check_encoding_departure(dialog: Window, bridge: TextBridge) -> void:
	var draft: TextEdit = dialog.editor
	assert(dialog.open_text(bridge, "text:-202").ok)
	draft.text = "One\nA🧭B"
	draft.text_changed.emit()
	dialog._draft_changed()
	bridge.failure = "character '🧭' at character index 5 is not representable in Classic MacRoman text"
	await dialog.get_node("%StyleWorkbench")._inspect()
	assert(dialog.visible and dialog.get_node("%SelectCharacter").visible)
	assert(draft.focus_next == dialog.get_node("%SelectCharacter").get_path())
	assert(dialog.get_node("%Outcome").text.begins_with("Line 2, column 2:"))
	dialog.get_node("%SelectCharacter").pressed.emit()
	assert(draft.get_selected_text() == "🧭")
	dialog.get_node("%Cancel").grab_focus()
	var escape := InputEventKey.new()
	escape.keycode = KEY_ESCAPE
	escape.pressed = true
	dialog._input(escape)
	assert(dialog.get_node("%Discard").visible)
	dialog.get_node("%Discard").hide()
	dialog.get_node("%Discard").canceled.emit()
	var navigated: Array = []
	dialog.request_navigation(func(): navigated.append(true))
	assert(navigated.is_empty())
	dialog.get_node("%Discard").hide()
	dialog.get_node("%Discard").confirmed.emit()
	assert(navigated == [true] and not dialog.visible and bridge.revision == 9)
