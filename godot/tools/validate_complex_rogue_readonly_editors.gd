extends SceneTree

class EncounterBridge:
	extends RefCounted

	var mismatch_method := ""
	var error_method := ""
	var malformed_uses := false

	func request(method: String, params := {}) -> Dictionary:
		if method == error_method:
			return {"ok": false, "error": "controlled %s failure" % method}
		match method:
			"encounter.list-complex":
				return _list_result([
					{"identity": "complex-encounter:2", "nativeId": 2, "label": "A Gate With Several Deliberately Long Choices", "populatedActions": 2, "rogueEnabled": true, "problems": 1},
					{"identity": "complex-encounter:4", "nativeId": 4, "label": "Silent Hall", "populatedActions": 0, "rogueEnabled": false, "problems": 0},
				])
			"encounter.open-complex":
				var requested := _identity_id(params, "complex-encounter")
				var native_id := requested + 1 if mismatch_method == method else requested
				return {"ok": true, "result": {"revision": 8, "encounter": _complex(native_id), "references": [
					{"source": "complex-encounter:%d" % native_id, "field": "promptMessageNativeId", "targetKind": "message", "targetId": "47", "resolution": "resolved"},
					{"source": "complex-encounter:%d" % native_id, "field": "thiefSuccess", "targetKind": "rogue-encounter", "targetId": "5", "resolution": "resolved"},
				], "diagnostics": [{"code": "controlled.complex.problem"}]}}
			"encounter.list-rogue":
				return _list_result([
					{"identity": "rogue-encounter:3", "nativeId": 3, "enabledActions": 4, "trapSet": false, "spell": 0, "tumblers": 2, "problems": 0},
					{"identity": "rogue-encounter:5", "nativeId": 5, "enabledActions": 8, "trapSet": true, "spell": 27, "tumblers": 4, "problems": 1},
				])
			"encounter.open-rogue":
				var requested := _identity_id(params, "rogue-encounter")
				var native_id := requested + 1 if mismatch_method == method else requested
				return {"ok": true, "result": {"revision": 8, "encounter": _rogue(native_id), "references": [
					{"source": "rogue-encounter:%d" % native_id, "field": "successText[0]", "targetKind": "message", "targetId": "47", "resolution": "resolved"},
				], "diagnostics": [{"code": "controlled.rogue.problem"}]}}
			"reference.used-by":
				var target_id := str(params.get("targetId", ""))
				if malformed_uses:
					return {"ok": true, "result": {"targetKind": "rogue-encounter", "targetId": target_id, "items": [{"source": "complex-encounter:bad", "field": "thiefSuccess", "targetKind": "rogue-encounter", "targetId": target_id, "resolution": "resolved"}]}}
				var owners := [2, 7] if target_id == "5" else [2]
				var items: Array = []
				for owner_id in owners:
					items.append({"source": "complex-encounter:%d" % owner_id, "field": "thiefSuccess", "targetKind": "rogue-encounter", "targetId": target_id, "resolution": "resolved"})
				return {"ok": true, "result": {"revision": 8, "targetKind": "rogue-encounter", "targetId": target_id, "items": items, "total": items.size(), "truncated": false}}
		return {"ok": false, "error": "unexpected encounter bridge method: %s" % method}

	func _list_result(items: Array) -> Dictionary:
		return {"ok": true, "result": {"revision": 8, "items": items, "offset": 0, "limit": 128, "total": items.size(), "truncated": false}}

	func _identity_id(params: Dictionary, prefix: String) -> int:
		return str(params.get("identity", "")).trim_prefix("%s:" % prefix).to_int()

	func _complex(native_id: int) -> Dictionary:
		return {
			"identity": "complex-encounter:%d" % native_id, "nativeId": float(native_id),
			"actions": [{"slot": 0, "rawOpcode": 1, "targetNativeId": 47}, {"slot": 9, "rawOpcode": 5, "targetNativeId": 4}],
			"actionResult": 1, "wordResult": 2, "groups": [1, 1, 0, 0, 0, 0, 0, 0],
			"spellIds": [27, 0, 0, 0, 0, 0, 0, 0, 0, 0], "spellResults": [3, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			"itemIds": [812, 0, 0, 0, 0], "itemResults": [2, 0, 0, 0, 0],
			"canBackOut": true, "thief": true, "maxTimes": 3, "casteSuccess": 0, "thiefSuccess": 5, "thiefFail": 4,
			"promptMessageNativeId": 47, "texts": ["Lift the latch", "Speak softly", "", "", "", "", "", "", "friend"], "authored": false,
		}

	func _rogue(native_id: int) -> Dictionary:
		return {
			"identity": "rogue-encounter:%d" % native_id, "nativeId": float(native_id),
			"typeFlags": [true, true, true, true, true, true, true, true, false, true],
			"modifiers": [5, -2, 10, 0, 4, 3, 12, -1], "successCodes": [1, 2, 3, 4, 1, 2, 3, 4], "failureCodes": [4, 3, 2, 1, 4, 3, 2, 1],
			"successText": [47, 48, 49, 50, 51, 52, 53, 54], "failureText": [-47, -48, -49, -50, -51, -52, -53, -54],
			"successSounds": [1, 2, 3, 4, 5, 6, 7, 8], "failureSounds": [8, 7, 6, 5, 4, 3, 2, 1],
			"spell": 27, "lowDamage": 3, "highDamage": 12, "tumblers": 4, "prompts": [47, 205, 6], "promptSounds": [206, 55, 33], "authored": false,
		}


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var tabs := TabContainer.new()
	root.add_child(tabs)
	tabs.size = Vector2(1220, 820)
	var complex: Control = load("res://src/complex_encounter_editor.tscn").instantiate()
	var rogue: Control = load("res://src/rogue_encounter_editor.tscn").instantiate()
	tabs.add_child(complex)
	tabs.add_child(rogue)
	await process_frame
	if not _verify_structure(complex, rogue):
		return
	var bridge := EncounterBridge.new()
	var opened := await complex.reload(bridge, 2) as Dictionary
	if not bool(opened.get("ok", false)) or complex.current_applied_native_id() != 2 or str(complex.current_record().get("identity", "")) != "complex-encounter:2":
		_fail("exact complex identity was not applied")
		return
	var responses := complex.find_child("ResponseEditor", true, false) as Tree
	var results := complex.find_child("ResultActionMatrix", true, false) as Tree
	if responses.get_root() == null or responses.get_root().get_child_count() < 5 or results.get_root() == null or results.get_root().get_child_count() != 2:
		_fail("Complex response/result projections were not rendered")
		return
	var search := complex.find_child("EncounterRecordPicker", true, false) as LineEdit
	search.text = "does-not-match"
	if complex.current_applied_native_id() != 2 or complex.trusted_applied_native_id(true) != -1:
		_fail("Complex filtering or draft guard changed trusted identity")
		return
	var selection := ProvidenceRebuiltPreviewSelection.new()
	var complex_target := selection.current_target("encounters.complex", "", Vector2i(-1, -1), {}, {}, "", -1, -1, -1, complex.trusted_applied_native_id(), -1, -1) as Dictionary
	var complex_draft_target := selection.current_target("encounters.complex", "", Vector2i(-1, -1), {}, {}, "", -1, -1, -1, complex.trusted_applied_native_id(true), -1, -1) as Dictionary
	if complex_target != {"kind": "complex-encounter", "id": 2} or not complex_draft_target.is_empty():
		_fail("Complex preview selection did not require the trusted applied identity")
		return
	bridge.mismatch_method = "encounter.open-complex"
	var mismatch := complex.open_native_id(2) as Dictionary
	if bool(mismatch.get("ok", true)) or complex.current_applied_native_id() != -1:
		_fail("mismatched Complex identity became applied")
		return
	bridge.mismatch_method = ""
	search.text = ""
	complex.open_native_id(2)
	tabs.current_tab = 1
	await process_frame
	if complex.current_applied_native_id() != -1:
		_fail("leaving Complex retained its applied identity")
		return
	opened = await rogue.reload(bridge, 5) as Dictionary
	if not bool(opened.get("ok", false)) or rogue.current_applied_native_id() != 5 or str(rogue.current_record().get("identity", "")) != "rogue-encounter:5":
		_fail("exact Rogue identity was not applied")
		return
	var owner_choice := rogue.find_child("ComplexOwnerChoice", true, false) as OptionButton
	if owner_choice.item_count != 3 or rogue.current_applied_owner_native_id() != -1:
		_fail("multiple typed Rogue owners were inferred instead of requiring explicit choice")
		return
	var ambiguous_target := selection.current_target("encounters.rogue", "", Vector2i(-1, -1), {}, {}, "", -1, -1, -1, -1, rogue.trusted_applied_native_id(), rogue.trusted_applied_owner_native_id()) as Dictionary
	if not ambiguous_target.is_empty():
		_fail("Rogue preview selection accepted an ambiguous owner")
		return
	owner_choice.select(2)
	owner_choice.item_selected.emit(2)
	if rogue.current_applied_owner_native_id() != 7 or rogue.trusted_applied_owner_native_id(true) != -1:
		_fail("explicit owner choice did not retain exact owner identity or draft guard")
		return
	var rogue_target := selection.current_target("encounters.rogue", "", Vector2i(-1, -1), {}, {}, "", -1, -1, -1, -1, rogue.trusted_applied_native_id(), rogue.trusted_applied_owner_native_id()) as Dictionary
	var rogue_draft_target := selection.current_target("encounters.rogue", "", Vector2i(-1, -1), {}, {}, "", -1, -1, -1, -1, rogue.trusted_applied_native_id(true), rogue.trusted_applied_owner_native_id(true)) as Dictionary
	if rogue_target != {"kind": "thief-encounter", "id": 5, "complexEncounterId": 7} or not rogue_draft_target.is_empty():
		_fail("Rogue preview selection did not require trusted record and owner identities")
		return
	search = rogue.find_child("EncounterRecordPicker", true, false) as LineEdit
	search.text = "does-not-match"
	if rogue.current_applied_native_id() != 5 or rogue.current_applied_owner_native_id() != 7:
		_fail("Rogue filtering changed the applied record or owner identity")
		return
	search.text = ""
	bridge.error_method = "reference.used-by"
	var failed := rogue.open_native_id(5) as Dictionary
	if bool(failed.get("ok", true)) or rogue.current_applied_native_id() != -1 or rogue.current_applied_owner_native_id() != -1:
		_fail("failed Rogue Uses operation retained applied identities")
		return
	bridge.error_method = ""
	bridge.malformed_uses = true
	failed = rogue.open_native_id(5) as Dictionary
	if bool(failed.get("ok", true)) or rogue.current_applied_native_id() != -1:
		_fail("malformed Rogue owner identity became applied")
		return
	bridge.malformed_uses = false
	rogue.open_native_id(3)
	if rogue.current_applied_owner_native_id() != 2:
		_fail("one typed Rogue owner was not applied unambiguously")
		return
	tabs.current_tab = 0
	await process_frame
	if rogue.current_applied_native_id() != -1 or rogue.current_applied_owner_native_id() != -1:
		_fail("leaving Rogue retained applied identities")
		return
	print("PROVIDENCE_COMPLEX_ROGUE_READONLY_OK complex=2 rogue=5 owners=explicit routeResets=2 draftGuards=2")
	tabs.queue_free()
	quit(0)


func _verify_structure(complex: Control, rogue: Control) -> bool:
	if complex.route_identity() != "encounters.complex" or rogue.route_identity() != "encounters.rogue":
		_fail("Encounter route identity changed")
		return false
	for pair in [
		[complex, ["ComplexEncounterHeader", "EncounterRecordPicker", "ComplexEncounterList", "SetupBar", "ResponseEditor", "ResultActionMatrix", "CopyPreview", "RecordProblems"]],
		[rogue, ["RogueEncounterHeader", "EncounterRecordPicker", "RogueEncounterList", "ComplexOwnerUses", "ComplexOwnerChoice", "ActionTestMatrix", "TrapLockSetup", "RecordProblems"]],
	]:
		for node_name in pair[1]:
			if (pair[0] as Control).find_child(node_name, true, false) == null:
				_fail("Encounter scene is missing required named region %s" % node_name)
				return false
	for control_name in ["Apply", "Repair"]:
		var control := complex.find_child(control_name, true, false) as BaseButton
		if control == null or not control.disabled:
			_fail("Complex %s must remain visible-disabled" % control_name)
			return false
	return true


func _fail(message: String) -> void:
	push_error("PROVIDENCE_COMPLEX_ROGUE_READONLY_FAILED: %s" % message)
	quit(1)
