extends SceneTree

class Bridge extends "res://src/native_bridge.gd":
	var revision := 0
	var quest := {"identity": "quest:7", "id": 7, "label": "Quest 7", "note": "", "authored": false}
	var options: Array = [{"identity": "option-label:2", "nativeId": 2, "text": "Leave", "authored": true}]
	var use := {"source": "extra-action-point:3", "field": "actions[0].target", "targetKind": "quest-flag", "targetId": "7"}

	func _request(method: String, params: Dictionary) -> Dictionary:
		match method:
			"text.inspect-draft": return _ok({"feedback":{"valid":true,"encodedBytes":str(params.text).length(),"issues":[]}})
			"reference.used-by": return _ok({"items":[use],"total":1,"offset":0,"truncated":false})
			"text.allocate": return _ok({"available":true,"nativeId":_next_option_id()})
			"text.apply-draft":
				var draft: Dictionary = params.draft
				var option := {"identity":"option-label:%d" % int(draft.nativeId),"nativeId":int(draft.nativeId),"text":draft.text,"authored":true}
				var existing := _option(int(draft.nativeId))
				if existing.is_empty(): options.append(option)
				else: options[options.find(existing)] = option
				return _changed(str(option.identity))
			"quest.list":
				var rows: Array = []
				for id in range(1, 127): rows.append({"identity": "quest:%d" % id, "id": id,
					"label": quest.label if id == 7 else "Quest %d" % id, "note": quest.note if id == 7 else "",
					"authored": quest.authored if id == 7 else false, "usedBy": 1 if id == 7 else 0})
				return _ok({"items": rows, "total": 126})
			"quest.open": return _ok({"quest": quest.duplicate(true), "usedBy": [use], "changes":{"items":[use],"total":1}})
			"quest-label.upsert":
				quest = (params.questLabel as Dictionary).duplicate(true)
				quest["identity"] = "quest:%d" % int(quest.id)
				quest["authored"] = true
				return _changed("quest:7")
			"quest-label.delete":
				quest = {"identity": "quest:7", "id": 7, "label": "Quest 7", "note": "", "authored": false}
				return _changed("quest:7")
			"option-label.list": return _ok({"items": options.duplicate(true), "total": options.size(), "truncated": false})
			"option-label.open":
				var option := _option(int(params.nativeId))
				return _ok({"optionLabel": option.duplicate(true), "usedBy": [use], "diagnostics": []})
			"option-label.update":
				var option := (params.optionLabel as Dictionary).duplicate(true)
				options[options.find(_option(int(option.nativeId)))] = option
				return _changed(str(option.identity))
			"option-label.create":
				var id := _next_option_id()
				options.append({"identity": "option-label:%d" % id, "nativeId": id, "text": "", "authored": true})
				return _changed("option-label:%d" % id)
			"option-label.duplicate":
				var source := _option(int(params.nativeId))
				var id := _next_option_id()
				options.append({"identity": "option-label:%d" % id, "nativeId": id, "text": source.text, "authored": true})
				return _changed("option-label:%d" % id)
			_: return {"ok": false, "error": "Unexpected method %s" % method}

	func _ok(result: Dictionary) -> Dictionary:
		result["revision"] = revision
		return {"ok": true, "result": result}

	func _changed(identity: String) -> Dictionary:
		revision += 1
		return _ok({"changedEntities": [identity]})

	func _option(id: int) -> Dictionary:
		for value in options:
			if int((value as Dictionary).nativeId) == id: return value
		return {}

	func _next_option_id() -> int:
		for id in 10_000:
			if _option(id).is_empty(): return id
		return options.size()


var _bridge := Bridge.new()
var _operations := ProvidenceEditorOperation.new()
var _quest_controller := preload("res://src/quest_controller.gd").new()
var _quest: ProvidenceQuestEditor
var _strings: ProvidenceStringEditor
var _accepted: Array = []


func _initialize() -> void: call_deferred("_run")


func _run() -> void:
	root.add_child(_operations)
	_quest = load("res://src/story_flags_editor.tscn").instantiate()
	_strings = load("res://src/string_editor.tscn").instantiate()
	root.add_child(_quest)
	root.add_child(_strings)
	_strings.hide()
	_quest_controller.initialize(_quest, _operations, _context, func(): return _bridge, _accept)
	_quest_controller.projection_applied.connect(_apply_projection)
	_strings.attach_session(_bridge, _context, _accept, _accept, 0, _operations)
	_strings.projection_applied.connect(_apply_projection)
	assert((await _quest_controller.reload()).ok)
	assert((await _quest.open_id(7)).ok and _quest.current_id() == 7)
	var opened_source: Array = []
	_quest.source_requested.connect(func(reference: Dictionary): opened_source.append(reference))
	var uses := _quest.find_child("Changes", true, false).find_child("QuestFlow", true, false) as Tree
	uses.get_root().get_child(0).select(0)
	uses.item_activated.emit()
	assert(opened_source.size() == 1 and opened_source[0].source == "extra-action-point:3")
	(_quest.find_child("QuestLabel", true, false) as LineEdit).text = "Bridge secured"
	assert(_quest.has_unapplied_changes())
	assert((await _quest.commit_selected()).ok and _bridge.quest.label == "Bridge secured")
	assert((await _quest_controller.delete(7)).ok and not _bridge.quest.authored)
	_quest.hide()
	_strings.show()
	assert((await _strings.open_option_label(2)).ok)
	assert(_strings.selected_identity() == "option-label:2")
	(_strings.find_child("MessageText", true, false) as TextEdit).text = "Stay"
	await _strings.commit_selected()
	assert(_bridge._option(2).text == "Stay" and not _strings.has_unapplied_changes())
	(_strings.find_child("NewString", true, false) as Button).pressed.emit()
	await process_frame
	while _operations.busy: await process_frame
	assert(_strings.selected_identity() == "option-label:0" and _bridge._option(0).is_empty())
	(_strings.find_child("MessageText", true, false) as TextEdit).text = "New choice"
	await _strings.commit_selected()
	(_strings.find_child("DuplicateString", true, false) as Button).pressed.emit()
	await process_frame
	while _operations.busy: await process_frame
	assert(_strings.selected_identity() == "option-label:1" and _strings.draft_text() == "New choice" and _bridge._option(1).is_empty())
	await _strings.commit_selected()
	assert(_bridge._option(1).text == "New choice")
	assert(not (_strings.find_child("SoundLink", true, false) as Control).visible)
	_quest_controller.dispose()
	_bridge.stop()
	print("PROVIDENCE_QUEST_OPTION_AUTHORING_OK exactQuest=7 usedBy=open label=upsert-delete exactOption=2 option=update-create-duplicate")
	quit()


func _context() -> Dictionary: return {"revision": _bridge.revision}


func _apply_projection(_projection: Dictionary) -> void: pass


func _accept(response: Dictionary) -> bool:
	_accepted.append(response)
	return bool(response.get("ok", false))
