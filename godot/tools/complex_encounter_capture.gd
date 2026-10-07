extends RefCounted

static func prepare(editor: Control, tree: SceneTree) -> void:
	await editor._navigation.select_route("encounters.complex")
	var view: Control = editor._documents.view("encounters.complex")
	view.set_block_signals(true)
	view.set_action_catalog(_catalog())
	view.set_summaries({"items": [_summary(0, "The western gate"), _summary(9, "Rogue test chamber")], "total": 38}, 42, "complex-encounter:0")
	view.set_document(_document())
	view.set_rogue_page({"items": [{"identity": "rogue-encounter:4", "nativeId": 4,
		"label": "Rogue Encounter 4", "enabledActions": 5, "returnedResults": [1, 2, 4]}]})
	view.set_block_signals(false)
	editor._command_bar.set_project_identity("Half Truth", false)
	editor._status.text = "Ready · revision 42 · native Rust session"
	match OS.get_environment("PROVIDENCE_CAPTURE_ACTION_STATE"):
		"step-editor", "step-editor-resized":
			view.call("_open_step", 2)
			for _frame in range(3): await tree.process_frame
			var workbench: ProvidenceActionStepWorkbench = view._step_dialog._workbench
			view.set_action_form_description(_branch_description(), workbench._describe_generation)
			if OS.get_environment("PROVIDENCE_CAPTURE_ACTION_STATE") == "step-editor-resized":
				view._step_dialog.size = Vector2i(1200, 800)
		"copy-from":
			view.call("_copy")
			view.set_copy_source_document(_copy_document())
		"rogue", "rogue-picker":
			view.set_document(_rogue_document())
			if OS.get_environment("PROVIDENCE_CAPTURE_ACTION_STATE") == "rogue-picker": view.call("_choose_rogue")
		"magic-picker":
			view.set_response_page({"items": [
				{"identity": "spell:32", "nativeId": 32, "label": "Firestorm"},
				{"identity": "spell:41", "nativeId": 41, "label": "Dispel Magic"},
				{"identity": "spell:73", "nativeId": 73, "label": "Stone Shape"}]})
			view.call("_open_response_picker", "magic", 1)
		"manual": view.call("_open_manual")
	for _frame in range(10): await tree.process_frame
	if OS.get_environment("PROVIDENCE_CAPTURE_ACTION_STATE") == "results":
		(view.get_node("EncounterDetailScroll") as ScrollContainer).scroll_vertical = 680
		for _frame in range(4): await tree.process_frame

static func _summary(id: int, label: String) -> Dictionary:
	return {"identity": "complex-encounter:%d" % id, "nativeId": id, "label": label, "populatedActions": 6, "rogueEnabled": id == 9, "problems": 0}

static func _catalog() -> Dictionary:
	return {"items": [
		{"identity": "realmz.action.1", "label": "Show Message", "opcode": 1, "category": "Text", "targetFamily": "message", "formId": null},
		{"identity": "realmz.action.9", "label": "Play Sound", "opcode": 9, "category": "Media", "targetFamily": "sound", "formId": null},
		{"identity": "realmz.action.24", "label": "Continue Steps", "opcode": 24, "category": "Logic", "targetFamily": "", "formId": null},
		{"identity": "realmz.action.42", "label": "Branch By Percent", "opcode": 42, "category": "Logic", "targetFamily": null, "formId": "branch-percent"},
	], "forms": [{"identity": "branch-percent", "fields": [
		{"index": 0, "row": "primary", "name": "percent"}, {"index": 1, "row": "primary", "name": "successBehavior"},
		{"index": 2, "row": "primary", "name": "branchMode"}, {"index": 3, "row": "primary", "name": "target"},
		{"index": 4, "row": "primary", "name": "slot"}]}]}

static func _document() -> Dictionary:
	return {"revision": 42, "encounter": {
		"identity": "complex-encounter:0", "nativeId": 0, "promptMessageNativeId": 24,
		"canBackOut": true, "maxTimes": 3, "actionResult": 1, "wordResult": 2,
		"groups": [1, 0, 1, 0, 0, 0, 0, 0],
		"spellIds": [1100, 32, 4, 0, 0, 0, 0, 0, 0, 0], "spellResults": [2, 1, 3, 0, 0, 0, 0, 0, 0, 0],
		"itemIds": [9999, 904, 0, 0, 0], "itemResults": [4, 2, 0, 0, 0],
		"thief": true, "casteSuccess": 0, "thiefSuccess": 4, "thiefFail": 1,
		"texts": ["Force the western gate", "Knock and call out", "Use the hidden latch", "", "", "", "", "", "moonstone"]},
		"promptPreview": "The weathered western gate is barred from within. What will you try?",
		"references": [], "steps": [_step(0, 1, 551), _step(1, 9, 1015), _branch_step(2), _step(8, 1, 118), _step(16, 1, 119), _step(24, 1, 191)],
		"responseControls": {"physical": {"exactRequiredSet": true}, "magic": {"spellClassRange": [1, 6]}, "items": {"blankEnabledSentinel": 9999}},
		"roguePreview": {"identity": "rogue-encounter:4", "nativeId": 4, "summary": "Rogue Encounter 4 · 5 actions · returns Results 1, 2, 4"}}

static func _copy_document() -> Dictionary:
	var result := _document().duplicate(true)
	result.encounter.identity = "complex-encounter:9"
	result.encounter.nativeId = 9
	result.encounter.promptMessageNativeId = 72
	result.promptPreview = "A wary locksmith offers to test the sealed mechanism."
	result.encounter.texts[0] = "Ask the locksmith to inspect it"
	result.steps = [_step(0, 1, 742), _step(8, 1, 743), _step(16, 9, 1008)]
	return result

static func _rogue_document() -> Dictionary:
	var result := _document().duplicate(true)
	result.encounter.identity = "complex-encounter:9"
	result.encounter.nativeId = 9
	result.encounter.promptMessageNativeId = 72
	result.promptPreview = "A difficult lock bars the lower passage."
	result.encounter.texts[8] = "tumbler"
	return result

static func _step(slot: int, opcode: int, target: int) -> Dictionary:
	var label := "Show Message" if opcode == 1 else "Play Sound"
	var family := "message" if opcode == 1 else "sound"
	return {"slot": slot, "rawOpcode": opcode, "opcode": opcode, "targetNativeId": target,
		"definition": {"identity": "realmz.action.%d" % opcode, "label": label, "opcode": opcode, "category": "Text" if opcode == 1 else "Media", "targetFamily": family, "formId": null}}

static func _branch_step(slot: int) -> Dictionary:
	return {"slot": slot, "rawOpcode": 42, "opcode": 42, "targetNativeId": 33,
		"definition": _catalog().items[3], "primarySettings": {"nativeId": 33,
			"typedValues": {"percent": 33, "successBehavior": 1, "branchMode": 0, "target": 33, "slot": 2}}}

static func _branch_description() -> Dictionary:
	return {"action": _catalog().items[3], "title": "Branch By Percent", "available": true,
		"availabilityReason": null, "unresolvedFieldCount": 0, "editableFieldCount": 5,
		"evidence": {"kind": "source-supported", "status": "source-audited", "sources": [], "note": ""},
		"fields": [
			_branch_field("percent", "Percent chance", 33, "integer", null, [], 0, 100, "percent"),
			_branch_field("successBehavior", "On success", 1, "choice", null,
				[{"value": 1, "label": "Branch"}, {"value": 2, "label": "Exit and save codes"}, {"value": -2, "label": "Exit and erase"}], -2, 2, null),
			_branch_field("branchMode", "Destination type", 0, "choice", null,
				[{"value": 0, "label": "Extra Action Point"}, {"value": 1, "label": "Code position in this result"}], 0, 1, null),
			{"key": "target", "index": 3, "row": "primary", "label": "Branch destination",
				"explanation": "Reusable script run when the percent roll succeeds.", "control": "target", "value": 33,
				"minimum": 0, "maximum": 32767, "units": null, "choices": [], "specialValues": [],
				"targetKind": "extra-action-point", "editable": true, "availabilityReason": null, "preserved": false,
				"applicableContext": "Branch destination.", "preservationPolicy": "Edit only here.",
				"preview": {"kind": "extra-action-point", "identity": "extra-action-point:33", "value": 33,
					"label": "Extra Action Point 33", "detail": "6 populated steps"}},
			_branch_field("slot", "Code position", 2, "integer", null, [], 0, 7, "step")],
		"summary": "33% chance · Branch to Extra Action Point 33"}

static func _branch_field(key: String, label: String, value: int, control: String, target_kind, choices: Array, minimum: int, maximum: int, units) -> Dictionary:
	return {"key": key, "index": 0, "row": "primary", "label": label, "explanation": label,
		"control": control, "value": value, "minimum": minimum, "maximum": maximum, "units": units,
		"choices": choices, "specialValues": [], "targetKind": target_kind, "editable": true,
		"availabilityReason": null, "preserved": false, "applicableContext": "Complex Encounter result script.",
		"preservationPolicy": "Edit only here.", "preview": null,
		"evidence": {"kind": "source-supported", "status": "source-audited", "sources": [], "note": ""}}
