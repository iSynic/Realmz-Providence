extends RefCounted


static func run(host: SceneTree, slot: int, xap_identity: String) -> void:
	await host._choose_action(slot, "realmz.action.92")
	assert(host._workbench._field_controls.level.field.units == null)
	assert(host._workbench._field_controls.rect.field.units == null)
	assert(str(host._workbench._field_controls.percentDelta.field.units) == "chance points per 10,000")
	host._workbench._field_renderer.accept_target("level", 0)
	await host._settle()
	host._workbench._field_renderer.accept_target("rect", 0)
	await host._settle()
	await host._select_choice("isDungeon", 0)
	await host._select_choice("shapeMode", 0)
	for key in ["shapeX1", "shapeY1", "shapeX2", "shapeY2"]:
		var field := host._workbench._field_controls[key] as Dictionary
		assert(str(field.field.units) == "map cells")
		assert(int(field.field.minimum) == 0)
		assert(int(field.field.maximum) == 89)
	var preserved_flags := _described_field(host._workbench._form_description, "shapeFlags")
	assert(preserved_flags.units == null)
	for setting in [["shapeX1", 1], ["shapeY1", 88], ["shapeX2", 2], ["shapeY2", 87]]:
		(host._workbench._field_controls[setting[0]].control as SpinBox).value = setting[1]
	await host._settle()
	await host._select_choice("shapeMode", 1)
	for key in ["shapeX1", "shapeY1"]:
		var field := host._workbench._field_controls[key] as Dictionary
		assert(int(field.field.minimum) == -32768)
		assert(int(field.field.maximum) == 32767)
	await host._select_choice("shapeMode", 0)
	assert(int((host._workbench._field_controls.shapeX2.control as SpinBox).value) == 2)
	assert(int((host._workbench._field_controls.shapeY2.control as SpinBox).value) == 87)
	await host._view.commit_selected()
	await host._settle()
	assert(not host._view.has_unapplied_changes())
	assert(await host._shell._scripts.open_extra_action_point(xap_identity))
	await host._settle()
	host._workbench.focus_slot(slot)
	await host._settle()
	assert(host._selected_value("shapeMode") == 0)
	var step: Dictionary = host._workbench.draft_steps()[slot]
	assert(int(step.settings.values.shapeMode) == 0)
	assert(int(step.settings.secondaryValues.shapeX1) == 1)
	assert(int(step.settings.secondaryValues.shapeY1) == 88)
	assert(int(step.settings.secondaryValues.shapeX2) == 2)
	assert(int(step.settings.secondaryValues.shapeY2) == 87)


static func _described_field(description: Dictionary, key: String) -> Dictionary:
	for candidate in description.get("fields", []):
		var field := candidate as Dictionary
		if str(field.get("key", "")) == key:
			return field
	return {}
