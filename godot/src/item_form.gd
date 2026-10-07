extends VBoxContainer

signal field_edited(field: String, value: Variant)
signal reference_requested(field: String)
signal sound_preview_requested

const Labels = preload("res://src/rule_display_format.gd")
const TYPE_NAMES := ["Ring", "Do not use", "Melee Weapon", "Shield", "Armor and Robe", "Gauntlet and Gloves", "Cloak and Cape", "Helmet and Cap", "Ion Stone", "Boots", "Quiver", "Waist and Belt", "Neck", "Scroll Case", "Misc Item", "Missile Weapon", "Broach", "Face and Mask", "Scabbard", "Belt Loop", "Scroll", "Magic Item", "Supply Item", "Extra Action Point Item", "Identified Item", "Scenario Item"]

var _definition: Dictionary = {}
var _binding := false
var _editable := false
var _locked := false
var _controls: Dictionary = {}
var _mask_controls: Array[CheckBox] = []
var _reference_buttons: Dictionary = {}
var _reference_labels: Dictionary = {}
var _section := "Identity"


func _ready() -> void:
	_bind_controls()
	for pair in [["ChooseIconId", "iconId"], ["ChooseItemType", "itemType"], ["ChooseSoundId", "soundId"], ["ChooseCursedItem", "cursedItemId"], ["ChooseSpecificRace", "specificRaceId"], ["ChooseSpecificCaste", "specificCasteId"], ["ChooseSpecial1", "special.0"], ["ChooseSpecial2", "special.1"], ["ChooseSpecial3", "special.2"], ["ChooseSpecial4", "special.3"], ["ChooseSpecial5", "special.4"]]:
		var control := find_child(pair[0], true, false) as Button
		_reference_buttons[pair[1]] = control
		control.pressed.connect(func(): reference_requested.emit(pair[1]))
	find_child("PlaySound", true, false).pressed.connect(sound_preview_requested.emit)
	find_child("ChooseCategories", true, false).pressed.connect(func(): reference_requested.emit("categories"))
	for pair in [["AdvancedRestrictions", "RestrictionsAdvanced"], ["AdvancedSpecial", "SpecialAdvanced"]]:
		find_child(pair[0], true, false).pressed.connect(func():
			var panel := find_child(pair[1], true, false) as Control
			panel.visible = not panel.visible)
	for section in ["Identity", "Equipment", "Special", "Restrictions", "UsedBy"]:
		get_node("SectionButtons/" + section).pressed.connect(show_section.bind(section))
	show_section("Identity")


func _bind_controls() -> void:
	for control in find_children("*", "Control", true, false):
		if control.has_meta("field_name"):
			var field := str(control.get_meta("field_name"))
			if not _controls.has(field): _controls[field] = []
			_controls[field].append(control)
			if control is SpinBox: control.value_changed.connect(func(value: float): _edit(field, int(value)))
			elif control is LineEdit: control.text_changed.connect(func(text: String): _edit(field, text))
			elif control is TextEdit: control.text_changed.connect(func(): _edit(field, control.text))
			elif control is CheckBox: control.toggled.connect(func(value: bool): _edit(field, value))
		elif control is CheckBox and control.has_meta("mask_field"):
			_mask_controls.append(control)
			control.toggled.connect(_mask_edited.bind(control))


func set_definition(definition: Dictionary, editable: bool) -> void:
	_definition = definition.duplicate(true)
	_editable = editable
	_binding = true
	for field: String in _controls:
		var value: Variant = _value(field)
		for control in _controls[field]:
			if control is SpinBox: control.set_value_no_signal(int(value) if value != null else 0)
			elif control is LineEdit or control is TextEdit: control.text = str(value) if value != null else ""
			elif control is CheckBox: control.set_pressed_no_signal(bool(value) if value != null else false)
	for control in _mask_controls:
		control.set_pressed_no_signal((int(_definition.get(control.get_meta("mask_field"), 0)) & (1 << int(control.get_meta("mask_bit")))) != 0)
	_binding = false
	_refresh_labels()
	set_locked(_locked)


func _value(field: String) -> Variant:
	if field.begins_with("special."):
		var values: Array = _definition.get("special", [0, 0, 0, 0, 0])
		return values[field.get_slice(".", 1).to_int()]
	return _definition.get(field)


func control_for(field: String) -> Control:
	return _controls.get(field, [null])[0]


func show_section(section: String) -> void:
	var target := get_node_or_null("BodyScroll/Sections/" + section) as Control
	if target == null: return
	_section = section
	for name in ["Identity", "Equipment", "Special", "Restrictions", "UsedBy"]:
		get_node("SectionButtons/" + name).set_pressed_no_signal(section == name)
	$BodyScroll.set_deferred("scroll_vertical", int(target.position.y))


func current_section() -> String:
	return _section


func read_navigation_state(focus: Control) -> Dictionary:
	var state := {"section": current_section(), "scroll": $BodyScroll.scroll_vertical, "advanced": {}}
	for name in ["RestrictionsAdvanced", "SpecialAdvanced"]: state.advanced[name] = find_child(name, true, false).visible
	if is_instance_valid(focus) and is_ancestor_of(focus):
		state.focus = str(get_path_to(focus))
		if focus is LineEdit: state.caret = focus.caret_column
		elif focus is TextEdit: state.caretLine = focus.get_caret_line(); state.caret = focus.get_caret_column()
	return state


func restore_navigation_state(state: Dictionary) -> void:
	show_section(str(state.get("section", "Identity")))
	for name in state.get("advanced", {}): find_child(name, true, false).visible = bool(state.advanced[name])
	$BodyScroll.set_deferred("scroll_vertical", int(state.get("scroll", 0)))
	var focus := get_node_or_null(str(state.get("focus", ""))) as Control
	if focus == null or not focus.is_visible_in_tree(): return
	focus.grab_focus()
	if focus is LineEdit: focus.caret_column = int(state.get("caret", 0))
	elif focus is TextEdit: focus.set_caret_line(int(state.get("caretLine", 0))); focus.set_caret_column(int(state.get("caret", 0)))


func set_locked(locked: bool) -> void:
	_locked = locked
	var enabled := _editable and not _locked and not _definition.is_empty()
	for controls: Array in _controls.values():
		for control in controls:
			if control is SpinBox: control.editable = enabled
			elif control is LineEdit or control is TextEdit: control.editable = enabled
			elif control is CheckBox: control.disabled = not enabled
	for control in _mask_controls: control.disabled = not enabled
	for control: Button in _reference_buttons.values(): control.disabled = not enabled
	find_child("ChooseCategories", true, false).disabled = not enabled
	var sound_preview := find_child("PlaySound", true, false) as Button
	var has_sound := not _definition.is_empty() and int(_definition.get("soundId", 0)) != 0
	sound_preview.disabled = _locked or not has_sound
	sound_preview.tooltip_text = "Preview the selected sound." if has_sound else "No sound selected."
	var xap := absi(int(_definition.get("itemType", 0))) == 23 or int(_value("special.0")) == -23
	_reference_buttons.get("special.4").disabled = not enabled or not xap
	_reference_buttons.get("special.4").tooltip_text = "Choose the exact Extra Action Point destination." if xap else "Special 5 is an effect amount for this item; edit its exact value."


func _edit(field: String, value: Variant) -> void:
	if _binding or not _editable or _locked: return
	if field.begins_with("special."): _definition.special[field.get_slice(".", 1).to_int()] = value
	else: _definition[field] = value
	field_edited.emit(field, value)
	_sync_values(field)
	_refresh_labels()
	set_locked(_locked)


func _mask_edited(pressed: bool, control: CheckBox) -> void:
	if _binding or not _editable or _locked: return
	var field := str(control.get_meta("mask_field"))
	var bit := 1 << int(control.get_meta("mask_bit"))
	var value := int(_definition.get(field, 0)) & 0xffff
	value = value | bit if pressed else value & ~bit
	_edit(field, value - 0x10000 if value >= 0x8000 else value)


func _refresh_labels() -> void:
	for pair in [["CursedItemReference", "cursedItemId"], ["SpecificRace", "specificRaceId"], ["SpecificCaste", "specificCasteId"]]:
		find_child(pair[0], true, false).text = "None" if _definition.get(pair[1]) == null else str(_definition[pair[1]])
		var resolved: Dictionary = _reference_labels.get(pair[1], {})
		if resolved.get("identity") == _definition.get(pair[1]) and resolved.has("label"): find_child(pair[0], true, false).text = str(resolved.label)
	var categories: Array[String] = []
	for index in Labels.ITEM_CATEGORIES.size():
		var field := "itemCategoryMaskLow" if index < 32 else "itemCategoryMaskHigh"
		if (int(_definition.get(field, 0)) & (1 << (31 - index % 32))) != 0: categories.append(Labels.ITEM_CATEGORIES[index])
	find_child("CategorySummary", true, false).text = "%d selected · %s" % [categories.size(), ", ".join(categories)]
	var item_type := int(_definition.get("itemType", 0))
	find_child("TypeExplanation", true, false).text = "%d · %s · Negative cost marks a unique item." % [item_type, TYPE_NAMES[absi(item_type)] if absi(item_type) < TYPE_NAMES.size() else "Unknown type; exact value retained"]
	for pair in [["ItemUnidentifiedName", "unidentifiedName"], ["ItemIdentifiedName", "name"], ["ItemDescription", "description"]]:
		find_child(pair[0] + "Count", true, false).text = "%d characters · 255-byte Classic limit" % str(_definition.get(pair[1], "")).length()
	find_child("EffectPreview", true, false).text = "Exact effects %s · Weight per charge %d · %s" % [str(_definition.get("special", [])), int(_definition.get("weightPerCharge", 0)), "Drop when empty" if _definition.get("dropOnEmpty", false) else "Retain when empty"]


func show_text_feedback(feedback: Array) -> void:
	for row in feedback:
		var control := control_for(str(row.field))
		if control == null: continue
		var count := find_child(control.name + "Count", true, false) as Label
		count.text = str(row.error) if row.get("error") != null else "%d / 255 bytes · Classic MacRoman" % int(row.byteCount)


func _sync_values(field: String) -> void:
	for control in _controls.get(field, []):
		if control is SpinBox: control.set_value_no_signal(int(_value(field)))
	for control in _mask_controls:
		if str(control.get_meta("mask_field")) == field:
			control.set_pressed_no_signal((int(_definition.get(field, 0)) & (1 << int(control.get_meta("mask_bit")))) != 0)


func show_effects(effects: Array) -> void:
	find_child("EffectPreview", true, false).text = "\n".join(effects)


func show_reference_labels(labels: Dictionary) -> void:
	_reference_labels = labels.duplicate(true)
	_refresh_labels()
