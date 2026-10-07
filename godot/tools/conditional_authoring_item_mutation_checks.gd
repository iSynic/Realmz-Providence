extends RefCounted


static func run(host: SceneTree, slot: int, xap_identity: String) -> void:
	await host._choose_action(slot, "realmz.action.22")
	var count := host._workbench._field_controls.maxMatches as Dictionary
	assert(int(count.field.minimum) == 1)
	assert(int(count.field.maximum) == 180)
	(count.control as SpinBox).value = 4
	var mode_labels: Array = host._choice_labels("mode")
	for expected in ["Drop item", "Change charges", "Replace item"]:
		assert(expected in mode_labels)
	await host._select_choice("mode", 2)
	assert(host._workbench._field_controls.chargeDelta.field.editable)
	assert(not bool(host._workbench._field_controls.replacementItem.field.editable))
	host._workbench._field_renderer.accept_target("item", 1)
	await host._settle()
	(host._workbench._field_controls.chargeDelta.control as SpinBox).value = -3
	await host._settle()
	assert(host._view.draft_error().is_empty(), str(host._view.draft_error()))
	await host._view.commit_selected()
	await host._settle()
	assert(not host._view.has_unapplied_changes(), str(host._view._validation.text))
	assert(await host._shell._scripts.open_extra_action_point(xap_identity))
	await host._settle()
	host._workbench.focus_slot(slot)
	await host._settle()
	assert(int((host._workbench._field_controls.maxMatches.control as SpinBox).value) == 4)
	assert(host._selected_value("mode") == 2)
	var step: Dictionary = host._workbench.draft_steps()[slot]
	assert(int(step.settings.values.item) == 1)
	assert(int(step.settings.values.maxMatches) == 4)
	assert(int(step.settings.values.chargeDelta) == -3)
