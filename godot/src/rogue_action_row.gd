extends HBoxContainer

const KEYS := ["successText", "failureText", "successSounds", "failureSounds"]


func initialize(editor: Control, slot: int, label: String) -> void:
	$Available.text = label
	$Available.toggled.connect(func(v): editor.change_array("typeFlags", slot, v))
	$Modifier.value_changed.connect(func(v): editor.change_array("modifiers", slot, int(v)))
	for pair in [["Success", "successCodes"], ["Failure", "failureCodes"]]:
		var choice := get_node(pair[0]) as OptionButton
		choice.item_selected.connect(func(index): editor.change_array(pair[1], slot, int(choice.get_item_metadata(index))))
	for index in range(KEYS.size()):
		var field := get_node("Reference%d" % index) as ProvidenceEncounterReferenceField
		field.field_key = "%s[%d]" % [KEYS[index], slot]
		field.author_label = label + " · " + ["Success string", "Failure string", "Success sound", "Failure sound"][index]
		editor.bind_reference(field)


func present(row: Dictionary, targets: Dictionary, slot: int) -> void:
	$Available.set_pressed_no_signal(bool(row.typeFlags[slot]))
	$Modifier.set_value_no_signal(int(row.modifiers[slot]))
	for pair in [["Success", "successCodes"], ["Failure", "failureCodes"]]:
		var choice := get_node(pair[0]) as OptionButton
		var selected := int(row[pair[1]][slot])
		choice.clear()
		for value in range(5):
			choice.add_item("None" if value == 0 else str(value))
			choice.set_item_metadata(choice.item_count - 1, value)
		if selected < 0 or selected > 4:
			choice.add_item("Stored %d" % selected)
			choice.set_item_metadata(choice.item_count - 1, selected)
			choice.select(choice.item_count - 1)
		else: choice.select(selected)
	for index in range(KEYS.size()):
		var key := "%s[%d]" % [KEYS[index], slot]
		(get_node("Reference%d" % index) as ProvidenceEncounterReferenceField).set_value(int(row[KEYS[index]][slot]), targets.get(key, {}))
