extends RefCounted


static func run(host: SceneTree, slot: int, xap_identity: String) -> void:
	await _verify_direct_quantity(host, slot, xap_identity, "realmz.action.11", "targetNativeId", 120, 0, 32767)
	await _verify_direct_quantity(host, slot, xap_identity, "realmz.action.32", "targetNativeId", 200, 0, 32000)


static func _verify_direct_quantity(host: SceneTree, slot: int, xap_identity: String, action_identity: String, field_key: String, value: int, minimum: int, maximum: int) -> void:
	await host._choose_action(slot, action_identity)
	var amount: Dictionary = host._workbench._field_controls[field_key]
	assert(int(amount.field.minimum) == minimum)
	assert(int(amount.field.maximum) == maximum)
	assert(amount.field.targetKind == null)
	(amount.control as SpinBox).value = value
	await host._settle()
	await host._view.commit_selected()
	await host._settle()
	assert(not host._view.has_unapplied_changes())
	assert(await host._shell._scripts.open_extra_action_point(xap_identity))
	await host._settle()
	host._workbench.focus_slot(slot)
	await host._settle()
	assert(int((host._workbench._field_controls[field_key].control as SpinBox).value) == value)
	var step: Dictionary = host._workbench.draft_steps()[slot]
	assert(int(step.targetNativeId) == value)
