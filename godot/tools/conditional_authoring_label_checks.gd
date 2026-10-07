extends RefCounted


static func run(host: SceneTree, slot: int) -> void:
	await _check_fields(host, slot, "realmz.action.73", {
		"range1Low": "Range 1 Low Item",
		"range1High": "Range 1 High Item",
		"range2Low": "Range 2 Low Item",
		"range2High": "Range 2 High Item",
	})
	await _check_fields(host, slot, "realmz.action.31", {
		"adjustment": "Check Modifier",
		"failureMacro": "On Failure",
	})
	await _check_fields(host, slot, "realmz.action.40", {
		"branchMode": "Branch Type",
	})
	await _check_fields(host, slot, "realmz.action.55", {
		"pickedSelector": "Success Condition",
		"failureBehavior": "On Failure",
		"successMacro": "On Success",
	})
	await _check_fields(host, slot, "realmz.action.72", {
		"testA": "Quest Range Start",
		"testB": "Quest Range End",
		"branchMode": "Branch Type",
	})
	await _check_fields(host, slot, "realmz.action.78", {
		"testA": "Tile Test",
		"testB": "Specific Tile",
		"branchMode": "Branch Type",
	})
	await _check_fields(host, slot, "realmz.action.92", {
		"isDungeon": "Map Type",
		"percentDelta": "Encounter Chance Adjustment",
	})
	var shape_mode := _described_field(host._workbench._form_description, "shapeMode")
	assert(str(shape_mode.label) == "Shape Mode")
	assert(not str(shape_mode.explanation).contains("once attached"))


static func _check_fields(
	host: SceneTree,
	slot: int,
	action_identity: String,
	expected: Dictionary,
) -> void:
	await host._choose_action(slot, action_identity)
	for key in expected:
		assert(str(host._workbench._field_controls[key].field.label) == expected[key])


static func _described_field(description: Dictionary, key: String) -> Dictionary:
	for candidate in description.get("fields", []):
		var field := candidate as Dictionary
		if str(field.get("key", "")) == key:
			return field
	return {}
