extends RefCounted


static func run(host: SceneTree, slot: int, xap_identity: String) -> void:
	await host._choose_action(slot, "realmz.action.90")
	assert(host._workbench._form_description.action.label == "Change Party State")
	assert(host._choice_labels("scope") == ["Each character", "Picked characters", "Spread across party"])
	assert(host._workbench._field_controls.amount.field.targetKind == null)
	assert(int(host._workbench._field_controls.amount.field.minimum) == 0)
	assert(int(host._workbench._field_controls.amount.field.maximum) == 32767)
	assert(host._workbench._field_controls.scope.field.targetKind == null)
	(host._workbench._field_controls.amount.control as SpinBox).value = 120
	await host._select_choice("scope", 1)
	await host._view.commit_selected()
	await host._settle()
	assert(not host._view.has_unapplied_changes())
	assert(await host._shell._scripts.open_extra_action_point(xap_identity))
	await host._settle()
	host._workbench.focus_slot(slot)
	await host._settle()
	assert(int((host._workbench._field_controls.amount.control as SpinBox).value) == 120)
	assert(host._selected_value("scope") == 1)
	var step: Dictionary = host._workbench.draft_steps()[slot]
	assert(int(step.settings.values.amount) == 120)
	assert(int(step.settings.values.scope) == 1)
