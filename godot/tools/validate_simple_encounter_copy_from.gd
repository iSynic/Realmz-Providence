extends SceneTree

var _applies := 0


func _initialize() -> void: call_deferred("_run")


func _run() -> void:
	var editor = load("res://src/simple_encounter_editor.tscn").instantiate()
	root.add_child(editor)
	await process_frame
	editor.set_action_catalog(_catalog())
	editor.set_summaries({"items": [_summary(1, "Target"), _summary(2, "Source")]}, 7, "simple-encounter:1")
	editor.set_document(_document(1, "Target response", 10, []))
	editor.encounter_apply_draft_requested.connect(func(_draft): _applies += 1)
	var baseline: Dictionary = editor.read_state().draft
	var dialog: Window = editor.get_node("%SimpleEncounterCopyDialog")
	dialog.open_for("simple-encounter:1", [_summary(1, "Target"), _summary(2, "Source")], editor.get_node("%CopyEncounter"))
	dialog.set_source_document(_document(2, "Source response", 20, [_source_step()]))
	dialog.cancel()
	assert(editor.read_state().draft == baseline and _applies == 0)
	dialog.open_for("simple-encounter:1", [_summary(1, "Target"), _summary(2, "Source")], editor.get_node("%CopyEncounter"))
	dialog.set_source_document(_document(2, "Source response", 20, [_source_step()]))
	dialog.call("_accept")
	var copied: Dictionary = editor.read_state().draft
	assert(copied.source == "simple-encounter:1" and int(copied.nativeId) == 1)
	assert(int(copied.promptMessageNativeId) == 20 and copied.texts[0] == "Source response")
	assert(copied.steps.size() == 1 and int(copied.steps[0].targetNativeId) == 42)
	assert(editor.has_unapplied_changes() and _applies == 0)
	editor.commit_selected()
	await process_frame
	assert(_applies == 1)
	print("PROVIDENCE_SIMPLE_ENCOUNTER_COPY_FROM_OK preview=source cancel=preserved merge=draft-only identity=retained apply=single")
	quit(0)


func _catalog() -> Dictionary:
	return {"items": [{"identity": "realmz.action.1", "label": "Show Message", "opcode": 1,
		"category": "Text", "targetFamily": "message", "formId": null}],
		"forms": [{"identity": "unused", "fields": []}]}


func _summary(native_id: int, label: String) -> Dictionary:
	return {"identity": "simple-encounter:%d" % native_id, "nativeId": native_id, "label": label}


func _document(native_id: int, response: String, prompt: int, steps: Array) -> Dictionary:
	return {"revision": 7, "encounter": {"identity": "simple-encounter:%d" % native_id,
		"nativeId": native_id, "promptMessageNativeId": prompt, "canBackOut": true,
		"maxTimes": 3, "casteSuccess": 0, "texts": [response, "", "", ""],
		"choiceResults": [1, 0, 0, 0]}, "promptPreview": "Prompt %d" % prompt,
		"references": [], "steps": steps}


func _source_step() -> Dictionary:
	return {"slot": 0, "rawOpcode": 1, "opcode": 1, "targetNativeId": 42,
		"definition": {"identity": "realmz.action.1", "label": "Show Message", "opcode": 1,
			"category": "Text", "targetFamily": "message", "formId": null}}

