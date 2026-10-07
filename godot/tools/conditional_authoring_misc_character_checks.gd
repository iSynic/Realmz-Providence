extends RefCounted


static func run(host: SceneTree, slot: int, xap_identity: String) -> void:
	await host._choose_action(slot, "realmz.action.52")
	assert(host._choice_labels("miscellaneousCheck")[5] == "Failed resistance save")
	await host._select_choice("miscellaneousCheck", 3)
	assert(host._workbench._field_controls.value.field.label == "Chance")
	assert(int(host._workbench._field_controls.value.field.minimum) == 0)
	assert(int(host._workbench._field_controls.value.field.maximum) == 100)
	(host._workbench._field_controls.value.control as SpinBox).value = 45
	await host._select_choice("miscellaneousCheck", 5)
	assert(host._workbench._field_controls.value.field.label == "Resistance Save")
	assert(host._choice_labels("value")[3] == "Electrical")
	await host._select_choice("value", 3)
	await host._select_choice("sourceSet", 1)
	await host._view.commit_selected()
	await host._settle()
	assert(await host._shell._scripts.open_extra_action_point(xap_identity))
	await host._settle()
	host._workbench.focus_slot(slot)
	await host._settle()
	assert(host._selected_value("miscellaneousCheck") == 5)
	assert(host._selected_value("value") == 3)
	assert(host._selected_value("sourceSet") == 1)
	var step: Dictionary = host._workbench.draft_steps()[slot]
	assert(int(step.settings.values.selector) == 5)
	assert(int(step.settings.values.value) == 3)
	assert(int(step.settings.values.sourceSet) == 1)
