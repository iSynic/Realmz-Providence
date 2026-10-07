extends SceneTree

var _failures: Array[String] = []


func _init() -> void:
	_run.call_deferred()


func _run() -> void:
	var form = load("res://src/item_form.tscn").instantiate()
	root.add_child(form)
	await process_frame
	var edits: Array = []
	form.field_edited.connect(func(field: String, value: Variant): edits.append({"field": field, "value": value}))
	var definition := {"id": "classic.item.901", "classicId": 901, "name": "Café",
		"unidentifiedName": " Blade ", "description": "Exact text\n", "cost": -10,
		"special": [-99, 1101, 32767, -40, -22], "itemType": -23,
		"raceRestrictions": -32764, "itemCategoryMaskLow": -2147483648,
		"itemCategoryMaskHigh": -7, "magical": true, "dropOnEmpty": true}
	form.set_definition(definition, true)
	_check(edits.is_empty(), "Binding a complete or preserved definition must not author fields.")
	_check(form.control_for("name").text == "Café", "MacRoman names reach the native authoring control.")
	_check(form.control_for("unidentifiedName").text == " Blade ", "Untouched name whitespace is retained.")
	form.control_for("cost").value = -11
	_check(edits.size() == 1 and edits[0] == {"field": "cost", "value": -11}, "A cost edit owns only cost.")
	var race: CheckBox = form.get_node("BodyScroll/Sections/Restrictions/Limits/CannotUse/Body/Matrices/RaceTypes/Bit0")
	race.button_pressed = true
	_check(edits.back() == {"field": "raceRestrictions", "value": -32763}, "A named restriction edit preserves unknown signed bits.")
	form.show_section("Special")
	_check(form.current_section() == "Special", "Section navigation reaches the Special form.")
	_check(not form.find_child("ChooseSpecial5", true, false).disabled, "Signed XAP item type enables its exact destination picker.")
	form.set_definition(definition, false)
	_check(not form.control_for("cost").editable, "Stock mechanics are protected.")
	_check(form.find_child("ChooseCursedItem", true, false).disabled, "Stock reference choices are protected.")
	form.queue_free()
	await process_frame
	if not _failures.is_empty():
		for failure in _failures: push_error(failure)
		quit(1)
	else:
		print("ITEM_FORM_CONTRACT_OK: binding, field ownership, signed restrictions, sections and Stock protection")
		quit()


func _check(condition: bool, message: String) -> void:
	if not condition: _failures.append(message)
