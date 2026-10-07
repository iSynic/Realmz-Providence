extends RefCounted


static func run(host: SceneTree, slot: int, xap_identity: String) -> void:
	await host._choose_action(slot, "realmz.action.15")
	assert(host._workbench._form_description.action.label == "Change Picked Stamina")
	assert(host._choice_labels("staminaDirection") == ["Heal stamina", "Damage stamina"])
	await host._select_choice("staminaDirection", 1)
	assert((host._workbench._field_controls.low.control as SpinBox).min_value == 0)
	assert((host._workbench._field_controls.high.control as SpinBox).min_value == 0)
	(host._workbench._field_controls.multiplier.control as SpinBox).value = 4
	(host._workbench._field_controls.low.control as SpinBox).value = 2
	(host._workbench._field_controls.high.control as SpinBox).value = 5
	await host._settle()
	await host._select_choice("staminaDirection", 0)
	assert(int((host._workbench._field_controls.multiplier.control as SpinBox).value) == 4)
	await host._select_choice("staminaDirection", 1)
	assert(int((host._workbench._field_controls.multiplier.control as SpinBox).value) == 4)
	await host._view.commit_selected()
	await host._settle()
	assert(not host._view.has_unapplied_changes())
	assert(await host._shell._scripts.open_extra_action_point(xap_identity))
	await host._settle()
	host._workbench.focus_slot(slot)
	await host._settle()
	assert(host._selected_value("staminaDirection") == 1)
	assert(int((host._workbench._field_controls.multiplier.control as SpinBox).value) == 4)
	var step: Dictionary = host._workbench.draft_steps()[slot]
	assert(int(step.settings.values.multiplier) == -4)
	assert(int(step.settings.values.low) == 2)
	assert(int(step.settings.values.high) == 5)
