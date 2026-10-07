class_name ConditionalAuthoringMonsterNameTagChecks
extends RefCounted


static func choose(owner: Object, key: String) -> int:
	var workbench: ProvidenceActionStepWorkbench = owner._workbench
	var descriptor := workbench._field_controls[key] as Dictionary
	assert(descriptor.field.targetKind == null)
	assert(descriptor.field.valuePickerKind == "monster-name-tag")
	assert(descriptor.control is SpinBox)
	var page: Dictionary = owner._shell._bridge.request("action-target.list", {
		"query": {"kind": "monster-name-tag", "search": "", "limit": 40}
	})
	assert(page.get("ok", false))
	var candidates := page.result.get("items", []) as Array
	assert(not candidates.is_empty())
	var selected := int((candidates[0] as Dictionary).value)
	workbench._field_renderer.accept_target(key, selected)
	await owner._settle()
	return selected
