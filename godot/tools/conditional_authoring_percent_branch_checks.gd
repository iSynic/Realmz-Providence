extends RefCounted


static func run(host: SceneTree, slot: int, xap_identity: String) -> void:
	await host._choose_action(slot, "realmz.action.42")
	var percent := host._workbench._field_controls.percent as Dictionary
	assert(percent.field.targetKind == null)
	assert(percent.field.units == "percent")
	assert(int(percent.field.minimum) == 0)
	assert(int(percent.field.maximum) == 100)
	(percent.control as SpinBox).value = 75
	var behavior_labels: Array = host._choice_labels("successBehavior")
	for expected in ["Branch", "Exit and keep codes", "Exit and erase codes"]:
		assert(expected in behavior_labels)
	await host._select_choice("successBehavior", 1)
	await host._select_choice("branchMode", 0)
	assert(host._workbench._field_controls.target.field.targetKind == "extra-action-point")
	host._workbench._field_renderer.accept_target("target", 436)
	await host._settle()
	assert(not bool(host._workbench._field_controls.slot.field.editable))
	assert(host._workbench._field_controls.slot.field.targetKind == null)
	await host._view.commit_selected()
	await host._settle()
	assert(not host._view.has_unapplied_changes())
	assert(await host._shell._scripts.open_extra_action_point(xap_identity))
	await host._settle()
	host._workbench.focus_slot(slot)
	await host._settle()
	assert(int((host._workbench._field_controls.percent.control as SpinBox).value) == 75)
	assert(host._selected_value("successBehavior") == 1)
	assert(host._selected_value("branchMode") == 0)
	assert(int(host._workbench._field_controls.target.field.value) == 436)
	var step: Dictionary = host._workbench.draft_steps()[slot]
	assert(int(step.settings.values.percent) == 75)
	assert(int(step.settings.values.target) == 436)
