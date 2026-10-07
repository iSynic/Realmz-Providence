extends RefCounted


static func run(host: SceneTree, slot: int, xap_identity: String) -> void:
	await host._choose_action(slot, "realmz.action.43")
	var labels: Array = host._choice_labels("conditionDuration")
	assert(labels == ["Timed", "Permanent"], "Unexpected condition-duration choices: %s" % [labels])
	await host._select_choice("conditionDuration", 1)
	(host._workbench._field_controls.durationOrDelta.control as SpinBox).value = 9
	await host._settle()
	await host._select_choice("conditionDuration", 0)
	assert(int((host._workbench._field_controls.durationOrDelta.control as SpinBox).value) == 9)
	await host._select_choice("conditionDuration", 1)
	assert(int((host._workbench._field_controls.durationOrDelta.control as SpinBox).value) == 9)
	await host._view.commit_selected()
	await host._settle()
	assert(not host._view.has_unapplied_changes())
	assert(await host._shell._scripts.open_extra_action_point(xap_identity))
	await host._settle()
	host._workbench.focus_slot(slot)
	await host._settle()
	assert(host._selected_value("conditionDuration") == 1)
	assert(int((host._workbench._field_controls.durationOrDelta.control as SpinBox).value) == 9)
	var step: Dictionary = host._workbench.draft_steps()[slot]
	assert(int(step.settings.values.durationOrDelta) == -9)
