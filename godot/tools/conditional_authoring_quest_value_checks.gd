extends RefCounted


static func run(host: SceneTree, slot: int, xap_identity: String) -> void:
	await host._choose_action(slot, "realmz.action.76")
	assert(host._choice_labels("autoBranch") == ["Disabled", "Branch at threshold"])
	assert(host._selected_value("autoBranch") == 0)
	assert(not host._workbench._field_controls.has("threshold"))
	assert(not host._workbench._field_controls.has("target"))
	await host._select_choice("autoBranch", 1)
	await host._select_choice("branchMode", 1)
	(host._workbench._field_controls.delta.control as SpinBox).value = 8
	(host._workbench._field_controls.threshold.control as SpinBox).value = 50
	host._workbench._field_renderer.accept_target("target", 436)
	await host._settle()
	await host._select_choice("autoBranch", 0)
	assert(not host._workbench._field_controls.has("threshold"))
	await host._select_choice("autoBranch", 1)
	assert(int((host._workbench._field_controls.threshold.control as SpinBox).value) == 50)
	assert(int(host._workbench._field_controls.target.field.value) == 436)
	await host._view.commit_selected()
	await host._settle()
	assert(not host._view.has_unapplied_changes())
	assert(await host._shell._scripts.open_extra_action_point(xap_identity))
	await host._settle()
	host._workbench.focus_slot(slot)
	await host._settle()
	assert(host._selected_value("autoBranch") == 1)
	assert(host._selected_value("branchMode") == 1)
	var step: Dictionary = host._workbench.draft_steps()[slot]
	assert(int(step.settings.values.delta) == 8)
	assert(int(step.settings.values.threshold) == 50)
	assert(int(step.settings.values.target) == 436)
