extends "res://tools/validate_character_navigation_native.gd"


func inspect_route(route: String, viewport: Vector2i) -> void:
	await super.inspect_route(route, viewport)
	if route == "rules.spells": return
	var table: GridContainer = view().form.find_child("AttributeLimits", true, false)
	check(table.columns == 3 and table.get_child_count() == 21, "Shared three-column attribute table " + route)
	for index in 12:
		var field: SpinBox = view().form.control_for(["definition", "attributeLimits", index])
		var heading: Control = table.get_child(index % 2 + 1)
		check(is_equal_approx(field.global_position.x, heading.global_position.x) and is_equal_approx(field.size.x, heading.size.x), "Aligned attribute index " + str(index))
		check(field.value == view().selected_definition().attributeLimits[index], "Imported signed attribute value retained " + str(index))


func copy_record(route: String) -> void:
	await super.copy_record(route)
	if route == "rules.spells": return
	for index in 12:
		var field: SpinBox = view().form.control_for(["definition", "attributeLimits", index])
		var expected := -1 - index / 2 if index % 2 == 0 else 25 + index / 2
		await replace_text(field.get_line_edit(), str(int(expected))); await key(KEY_ENTER)
		check(view().selected_definition().attributeLimits[index] == int(expected), "Real input edits exact attribute index " + str(index) + " in " + route)
	await verify_keyboard_order()


func verify_keyboard_order() -> void:
	var first: SpinBox = view().form.control_for(["definition", "attributeLimits", 0])
	first.get_line_edit().grab_focus()
	for index in range(1,12):
		await key(KEY_TAB)
		var next: SpinBox = view().form.control_for(["definition", "attributeLimits", index])
		check(root.gui_get_focus_owner() == next.get_line_edit(), "Tab follows attribute/minimum/maximum row order " + str(index))


func persistence() -> void:
	await super.persistence()
	for row in saved:
		if row.route == "rules.spells": continue
		var record: Dictionary = row.definition
		var response: Dictionary = shell._bridge.request("rule.open-authoring", {"kind":"race" if row.route == "rules.races" else "caste", "classicId":int(record.classicId)})
		check(response.ok, "Reopen attribute record " + row.route)
		var actual: Array = response.result.draft.edit.definition.attributeLimits
		check(actual.size() == 12, "Reopen retains twelve attribute limits " + row.route)
		for index in 12:
			check(actual[index] == record.attributeLimits[index], "Reopen preserves attribute index %d in %s: expected %s, actual %s" % [index,row.route,record.attributeLimits[index],actual[index]])
