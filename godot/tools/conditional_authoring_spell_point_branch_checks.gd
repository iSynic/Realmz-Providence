extends RefCounted


static func run(host: SceneTree, slot: int, xap_identity: String) -> void:
	await host._choose_action(slot, "realmz.action.75")
	var required := host._workbench._field_controls.testB as Dictionary
	assert(required.field.targetKind == null)
	assert(int(required.field.minimum) == 0)
	assert(int(required.field.maximum) == 32767)
	assert("Picked characters" in host._choice_labels("testA"))
	assert("All living characters" in host._choice_labels("testA"))
	await host._select_choice("testA", 2)
	required = host._workbench._field_controls.testB as Dictionary
	(required.control as SpinBox).value = 12
	await host._select_choice("falseBehavior", 1)
	await host._select_choice("branchMode", 0)
	assert(host._workbench._field_controls.target.field.targetKind == "extra-action-point")
	host._workbench._field_renderer.accept_target("target", 436)
	await host._settle()
	await host._view.commit_selected()
	await host._settle()
	assert(not host._view.has_unapplied_changes())
	assert(await host._shell._scripts.open_extra_action_point(xap_identity))
	await host._settle()
	host._workbench.focus_slot(slot)
	await host._settle()
	assert(host._selected_value("testA") == 2)
	assert(int((host._workbench._field_controls.testB.control as SpinBox).value) == 12)
	assert(host._selected_value("falseBehavior") == 1)
	assert(host._selected_value("branchMode") == 0)
	assert(int(host._workbench._field_controls.target.field.value) == 436)
	var step: Dictionary = host._workbench.draft_steps()[slot]
	assert(int(step.settings.values.testB) == 12)
	assert(int(step.settings.values.target) == 436)
