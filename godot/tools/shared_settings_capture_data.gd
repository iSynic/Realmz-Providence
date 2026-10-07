extends RefCounted

const ActionCaptureData = preload("res://tools/action_authoring_capture_data.gd")


static func steps(extra: bool, definition: Callable) -> Array:
	if extra:
		return [{"slot": 0, "rawOpcode": 1, "opcode": 1, "targetNativeId": 190,
			"definition": definition.call("realmz.action.1")},
			{"slot": 1, "rawOpcode": -39, "opcode": 39, "targetNativeId": 17,
				"definition": definition.call("realmz.action.39")},
			{"slot": 4, "rawOpcode": 2, "opcode": 2, "targetNativeId": 2,
				"definition": definition.call("realmz.action.2"),
				"primarySettings": {"nativeId": 2, "typedValues": {"battleLow": 1,
					"battleHigh": 0, "soundOrReviveLossMacro": 0, "message": 240,
					"revivePartyFlag": 0}}, "primaryUsage": {"status": "shared", "callerCount": 3}}]
	return [{"slot": 0, "rawOpcode": 1, "opcode": 1, "targetNativeId": 190,
		"definition": definition.call("realmz.action.1")},
		{"slot": 1, "rawOpcode": 3, "opcode": 3, "targetNativeId": 2,
			"definition": definition.call("realmz.action.3"),
			"primarySettings": {"nativeId": 2, "typedValues": {"replyPolarity": 1,
				"branchMode": 0, "branchTarget": 0, "promptA": 240, "promptB": 0}},
			"primaryUsage": {"status": "shared", "callerCount": 3}},
		{"slot": 2, "rawOpcode": -39, "opcode": 39, "targetNativeId": 3,
			"definition": definition.call("realmz.action.39")}]


static func document(view: Control, extra: bool, projected_steps: Array) -> Dictionary:
	return _extra_document(view, projected_steps) if extra else _ordinary_document(view, projected_steps)


static func show_dialog(view: Control, extra: bool) -> void:
	var dialog := view.find_child("SemanticSharedImpactDialog", true, false)
	if dialog == null:
		push_error("Shared-impact capture could not find its review dialog.")
		return
	dialog.call("populate", impact(extra))
	dialog.call("show_review")
	dialog.get_cancel_button().grab_focus.call_deferred()


static func impact(extra: bool) -> Dictionary:
	var change := {"label": "String To Display Before Battle" if extra else "Left Option", "before": 0, "after": 240}
	var edited := {"location": "Extra Action Point 3 · Step 5" if extra else "Land 0 · Action Point 27 · Step 2",
		"label": "Battle" if extra else "Player Option", "changes": [change]}
	var ap := {"location": "Land 0 · Action Point 27 · Step 2", "label": "Player Option",
		"changes": [{"label": "Left Option", "before": 0, "after": 240}]}
	var xap := {"location": "Extra Action Point 3 · Step 5", "label": "Battle",
		"changes": [{"label": "String To Display Before Battle", "before": 0, "after": 240}]}
	var simple := {"location": "Simple Encounter 1 · Step 2", "label": "Battle",
		"changes": [{"label": "String To Display Before Battle", "before": 0, "after": 240}]}
	return {"total": 2, "editedAction": edited,
		"affectedActions": [ap, simple] if extra else [xap, simple]}


static func _extra_document(view: Control, projected_steps: Array) -> Dictionary:
	var summary := {"identity": "extra-action-point:3", "nativeId": 3, "descriptor": "Bywater battle", "reusable": true, "usedBy": 2, "problems": 0}
	var items := [summary,
		{"identity": "extra-action-point:4", "nativeId": 4, "descriptor": "Gate response", "usedBy": 1, "problems": 0},
		{"identity": "extra-action-point:5", "nativeId": 5, "descriptor": "Courtyard response", "usedBy": 2, "problems": 0}]
	view.call("set_summaries", {"items": items, "offset": 0, "limit": 5, "total": 241,
		"counts": {"all": 241, "macro": 72, "battle": 38, "monster": 24, "warnings": 0}}, 42, summary.identity)
	return {"revision": 42, "references": [], "usedBy": [
		{"source": "Action Point 27 · Land 0", "field": "actions[1].targetNativeId"}],
		"steps": projected_steps, "extraCodeAttachments": [], "extraActionPoint": {
			"identity": summary.identity, "descriptor": summary.descriptor, "nativeId": 3,
			"classicDoorId": 0, "postActionLevel": 0, "postActionX": 0, "postActionY": 0,
			"chancePercent": 100, "actions": ActionCaptureData.shared_impact_actions(true)}}


static func _ordinary_document(view: Control, projected_steps: Array) -> Dictionary:
	var map := {"identity": "land:0", "name": "Land level 0", "levelType": "land"}
	var identity := "action-point:land:0:27"
	var summary := {"identity": identity, "recordIndex": 27, "descriptor": "Bywater gate choice",
		"coordinate": {"x": 35, "y": 47}, "chancePercent": 100, "populatedActions": 3,
		"active": true, "problems": 0}
	view.call("set_maps", [map])
	view.call("set_summaries", {"items": [summary], "offset": 0, "limit": 5, "total": 100,
		"map": map, "counts": {"all": 320, "current-map": 100, "active": 95,
			"reusable": 5, "warnings": 0}}, 42, identity)
	return {"revision": 42, "references": [], "usedBy": [], "steps": projected_steps, "map": map,
		"actionPoint": {"identity": identity, "descriptor": summary.descriptor, "recordIndex": 27,
			"levelIndex": 0, "coordinate": summary.coordinate, "chancePercent": 100,
			"postActionLevel": 0, "postActionX": 35, "postActionY": 47,
			"actions": ActionCaptureData.shared_impact_actions(false)}}
