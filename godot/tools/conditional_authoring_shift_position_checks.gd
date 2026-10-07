extends RefCounted


static func run(host: SceneTree, slot: int, xap_identity: String) -> void:
	assert(await host._shell._scripts.open_extra_action_point(xap_identity))
	await host._settle()
	await host._choose_action(slot, "realmz.action.61")
	assert(host._choice_labels("shiftDistanceMode") == ["Exact distance", "Random distance"])
	await host._select_choice("shiftDistanceMode", 0)
	assert((host._workbench._field_controls.xShift.control as SpinBox).min_value == -32768)
	assert((host._workbench._field_controls.yShift.control as SpinBox).min_value == -32768)
	(host._workbench._field_controls.xShift.control as SpinBox).value = -4
	(host._workbench._field_controls.yShift.control as SpinBox).value = 6
	await host._select_choice("shiftDistanceMode", 1)
	assert(int(host._workbench._field_controls.xShift.field.minimum) == 1)
	assert(str(host._workbench._field_controls.xShift.field.availabilityReason).contains("Random X"))
	assert(int(host._workbench._field_controls.yShift.field.minimum) == 1)
	assert((host._workbench._field_controls.yShift.control as SpinBox).min_value == 1)
	(host._workbench._field_controls.xShift.control as SpinBox).value = 4
	await host._settle()
	assert((host._workbench._field_controls.xShift.control as SpinBox).min_value == 1)
	assert(host._workbench._field_controls.xShift.field.availabilityReason == null)
	(host._workbench._field_controls.yShift.control as SpinBox).value = 6
	await host._view.commit_selected()
	await host._settle()
	assert(not host._view.has_unapplied_changes())
	assert(await host._shell._scripts.open_extra_action_point(xap_identity))
	await host._settle()
	host._workbench.focus_slot(slot)
	await host._settle()
	assert(host._selected_value("shiftDistanceMode") == 1)
	assert((host._workbench._field_controls.xShift.control as SpinBox).min_value == 1)
	assert((host._workbench._field_controls.yShift.control as SpinBox).min_value == 1)
	var step: Dictionary = host._workbench.draft_steps()[slot]
	assert(int(step.settings.values.xShift) == 4)
	assert(int(step.settings.values.yShift) == 6)
	assert(int(step.settings.values.randomize) == 1)
