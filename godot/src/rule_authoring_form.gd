extends VBoxContainer

signal field_edited(path: Array, value: Variant)
signal reference_requested(field: String, slot: int)
signal resource_requested(field: String, slot: int)
var _controls: Array[Control] = []
var _edit: Dictionary = {}
var _editable := false
var _locked := false
var _binding := false
var _portrait_target := false
var _item_choices: Dictionary = {}

func set_item_choices(choices: Array) -> void:
	for choice in choices:
		if choice.get("targetIdentity") != null: _item_choices[str(choice.targetIdentity)] = choice

func _ready() -> void:
	for control in find_children("*", "Control", true, false):
		if control.has_meta("item_slot"):
			control.pressed.connect(reference_requested.emit.bind("startingItem", int(control.get_meta("item_slot"))))
		elif control.has_meta("open_item_slot"):
			control.pressed.connect(resource_requested.emit.bind("startingItem", int(control.get_meta("open_item_slot"))))
		if not control.has_meta("field_path"): continue
		_controls.append(control)
		if control is SpinBox: control.value_changed.connect(func(value: float): _edit_control(control, int(value)))
		elif control is LineEdit: control.text_changed.connect(func(value: String): _edit_control(control, value))
		elif control is TextEdit: control.text_changed.connect(func(): _edit_control(control, control.text))
		elif control is CheckBox: control.toggled.connect(func(value: bool): _edit_control(control, value))
	var choose := get_node_or_null("%ChoosePortrait")
	var open := get_node_or_null("%OpenPortrait")
	if choose != null: choose.pressed.connect(func(): reference_requested.emit("defaultIconSet", -1))
	if open != null: open.pressed.connect(func(): resource_requested.emit("defaultIconSet", -1))

func read_path(path: Array) -> Variant:
	var node: Variant = _edit
	for key in path:
		if node is Dictionary and not node.has(key): return null
		if node is Array and (int(key) < 0 or int(key) >= node.size()): return null
		node = node[key]
	return node

func _edit_control(control: Control, value: Variant) -> void:
	if _binding or not _editable or _locked: return
	var path: Array = control.get_meta("field_path")
	if control.has_meta("bit"):
		var bit := 1 << int(control.get_meta("bit"))
		var word := int(read_path(path))
		value = (word | bit) if bool(value) else (word & ~bit)
		if int(value) > 0x7fffffff: value = int(value) - 0x100000000
	elif control.has_meta("reference_id"):
		var identities: Array = (read_path(path) as Array).duplicate()
		var identity := str(control.get_meta("reference_id"))
		identities.erase(identity)
		if bool(value): identities.append(identity)
		identities.sort()
		value = identities

	if control is CheckBox and not control.has_meta("bit") and not control.has_meta("reference_id"):
		control.text = "Enabled" if control.button_pressed else "Off"
	var node: Variant = _edit
	for index in path.size() - 1: node = node[path[index]]
	node[path[-1]] = value
	set_locked(_locked)
	field_edited.emit(path, value)

func set_edit(edit: Dictionary, editable: bool) -> void:
	_edit = edit.duplicate(true)
	_editable = editable
	_binding = true
	for control in _controls:
		var value: Variant = read_path(control.get_meta("field_path"))
		if control is SpinBox: control.set_value_no_signal(float(value) if value != null else 0)
		elif control is LineEdit or control is TextEdit: control.text = str(value) if value != null else ""
		elif control is CheckBox:
			if control.has_meta("bit"): value = value != null and (int(value) & (1 << int(control.get_meta("bit")))) != 0
			elif control.has_meta("reference_id"): value = value is Array and value.has(str(control.get_meta("reference_id")))
			control.set_pressed_no_signal(value != null and bool(value))
			if not control.has_meta("bit") and not control.has_meta("reference_id"): control.text = "Enabled" if control.button_pressed else "Off"
	_binding = false
	for slot in 20:
		var button := find_child("ChooseItem" + str(slot), true, false)
		if button == null: continue
		var items: Array = edit.get("nativeFields", {}).get("startingItems", [])
		var identity := str(items[slot]) if slot < items.size() and items[slot] != null else ""
		var choice: Dictionary = _item_choices.get(identity, {})
		button.text = "%s · %s" % [identity.trim_prefix("classic.item."), choice.get("label", "Missing item")] if not identity.is_empty() else "Empty · Choose…"
		button.tooltip_text = str(choice.get("detail", "Choose an item for this exact slot.")) if not identity.is_empty() else "Choose an item for this exact slot."
		var open_button := find_child("OpenItem" + str(slot), true, false)
		if open_button != null: open_button.disabled = _locked or slot >= items.size() or items[slot] == null
	set_locked(_locked)

func set_locked(locked: bool) -> void:
	_locked = locked
	for control in _controls:
		if control is SpinBox or control is LineEdit or control is TextEdit: control.editable = _editable and not locked
		elif control is BaseButton: control.disabled = not _editable or locked or (control.get_meta("missing_reference", false) and not control.button_pressed)
	var choose := get_node_or_null("%ChoosePortrait")
	var open := get_node_or_null("%OpenPortrait")
	if choose != null: choose.disabled = not _editable or locked
	if open != null: open.disabled = locked or not _portrait_target
	for control in find_children("ChooseItem*", "Button", true, false): control.disabled = not _editable or locked
	var items: Array = _edit.get("nativeFields", {}).get("startingItems", [])
	for control in find_children("OpenItem*", "Button", true, false):
		var slot := int(control.get_meta("open_item_slot"))
		control.disabled = locked or slot >= items.size() or items[slot] == null

func set_eligibility_names(rows: Array) -> void:
	for control in _controls:
		if not control.has_meta("reference_id"): continue
		var identity := str(control.get_meta("reference_id"))
		var row: Dictionary = {}
		for candidate in rows:
			if candidate.identity == identity: row = candidate; break
		var unavailable: bool = row.is_empty() or row.get("ownership") == "vacant"
		var label := "Empty slot · create first" if row.get("ownership") == "vacant" else str(row.get("displayName", "Missing identity"))
		control.text = "%02d · %s" % [int(row.get("authorId", -1)), label]
		control.set_meta("missing_reference", unavailable)
		control.disabled = not _editable or _locked or (unavailable and not control.button_pressed)
		control.tooltip_text = "Existing permission is retained. You can remove it; create this target before adding a new permission." if unavailable and control.button_pressed else "Create this target before permitting it." if unavailable else str(row.get("ownership", ""))

func show_portrait(choice: Dictionary, textures: Array) -> void:
	if get_node_or_null("%PortraitPreview") == null: return
	%PortraitPreview.texture = textures[0] if not textures.is_empty() else null
	%PortraitMeaning.text = str(choice.get("detail", "")) if choice.get("available", false) else str(choice.get("reason", "Portrait unavailable; the stored value is retained."))
	_portrait_target = choice.get("targetIdentity") != null
	%OpenPortrait.disabled = _locked or not _portrait_target

func control_for(path: Array) -> Control:
	for control in _controls:
		if control.get_meta("field_path") == path: return control
	return null
