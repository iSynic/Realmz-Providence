extends SceneTree

var _applies := 0
var _opened_rogue := {}

func _initialize() -> void: call_deferred("_run")

func _run() -> void:
	var editor = load("res://src/complex_encounter_editor.tscn").instantiate()
	root.add_child(editor)
	await process_frame
	editor.set_action_catalog(_catalog())
	editor.set_summaries({"items": [_summary(0, "Gate"), _summary(9, "Rogue gate")]}, 12, "complex-encounter:0")
	editor.set_document(_document(0, 24, [_source_step()]))
	editor.encounter_apply_draft_requested.connect(func(_draft): _applies += 1)
	editor.semantic_target_open_requested.connect(func(kind, native_id, identity, context):
		_opened_rogue = {"kind": kind, "nativeId": native_id, "identity": identity, "context": context})
	assert(editor._physical.size() == 8 and editor._magic.size() == 10 and editor._items.size() == 5)
	var baseline: Dictionary = editor.read_state().draft
	assert(baseline.texts.size() == 9 and baseline.spellIds.size() == 10 and baseline.itemIds.size() == 5)
	assert(int(baseline.spellIds[0]) == 1100 and int(baseline.itemIds[0]) == 9999)
	assert(editor.get_node("%OpenRogue").disabled == false)
	editor.call("_open_rogue")
	assert(_opened_rogue.kind == "rogue-encounter" and int(_opened_rogue.nativeId) == 4)
	assert(_opened_rogue.context.returnIdentity == "complex-encounter:0" and _opened_rogue.context.field == "rogue")
	var physical_text := (editor._physical[0] as Dictionary).text as LineEdit
	physical_text.text = "Open the gate"
	physical_text.text_changed.emit(physical_text.text)
	assert(editor.has_unapplied_changes())
	editor.commit_selected()
	await process_frame
	assert(_applies == 1)
	var dialog: Window = editor.get_node("%SimpleEncounterCopyDialog")
	dialog.open_for("complex-encounter:0", [_summary(0, "Gate"), _summary(9, "Rogue gate")], editor.get_node("%CopyEncounter"), "Complex")
	dialog.set_source_document(_document(9, 72, []))
	dialog.cancel()
	assert(int(editor.read_state().draft.promptMessageNativeId) == 24)
	dialog.open_for("complex-encounter:0", [_summary(0, "Gate"), _summary(9, "Rogue gate")], editor.get_node("%CopyEncounter"), "Complex")
	dialog.set_source_document(_document(9, 72, []))
	dialog.call("_accept")
	assert(int(editor.read_state().draft.promptMessageNativeId) == 72)
	assert(str(editor.read_state().draft.source) == "complex-encounter:0")
	print("PROVIDENCE_COMPLEX_ENCOUNTER_AUTHORING_OK physical=8 magic=10 items=5 rogue=exact copy=draft-only apply=atomic")
	quit(0)

func _summary(native_id: int, label: String) -> Dictionary:
	return {"identity": "complex-encounter:%d" % native_id, "nativeId": native_id, "label": label}

func _catalog() -> Dictionary:
	return {"items": [{"identity": "realmz.action.1", "label": "Show Message", "opcode": 1,
		"category": "Text", "targetFamily": "message", "formId": null}],
		"forms": [{"identity": "unused", "fields": []}]}

func _document(native_id: int, prompt: int, steps: Array) -> Dictionary:
	return {"revision": 12, "encounter": {
		"identity": "complex-encounter:%d" % native_id, "nativeId": native_id,
		"promptMessageNativeId": prompt, "canBackOut": true, "maxTimes": 3,
		"actionResult": 1, "wordResult": 2, "groups": [1, 0, 0, 0, 0, 0, 0, 0],
		"spellIds": [1100, 0, 0, 0, 0, 0, 0, 0, 0, 0], "spellResults": [3, 0, 0, 0, 0, 0, 0, 0, 0, 0],
		"itemIds": [9999, 0, 0, 0, 0], "itemResults": [2, 0, 0, 0, 0],
		"thief": true, "casteSuccess": 77, "thiefSuccess": 4, "thiefFail": 1,
		"texts": ["Lift latch", "", "", "", "", "", "", "", "friend"]},
		"promptPreview": "Prompt %d" % prompt, "references": [], "steps": steps,
		"responseControls": {"physical": {"exactRequiredSet": true}},
		"roguePreview": {"summary": "Rogue Encounter 4 · 3 actions · returns 1, 2"}}

func _source_step() -> Dictionary:
	return {"slot": 0, "rawOpcode": 1, "opcode": 1, "targetNativeId": 42,
		"definition": {"identity": "realmz.action.1", "label": "Show Message", "opcode": 1,
			"category": "Text", "targetFamily": "message", "formId": null}}
