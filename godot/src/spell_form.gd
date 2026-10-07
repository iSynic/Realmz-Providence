extends HBoxContainer

signal field_edited(field: String, value: Variant)
signal reference_requested(field: String)
signal sound_requested(field: String, play: bool)
signal resource_requested(field: String, frame: int)

const TARGETS := ["Multi Open Space", "Multi Target", "Single Target", "Fixed Size", "Area X Power", "Target Self", "Ray", "Target Party", "Single Open", "All Friendly", "All Enemies", "Special"]
const DAMAGE_TYPES := ["Charm", "Heat", "Cold", "Electrical", "Chemical", "Mental", "Magical", "Special", "Weapon", "Misc"]
const RESISTANCE_CHECKS := ["Normal", "Skip resistance", "Skip DRV", "Skip resistance and DRV", "Reverse friendly result"]
var _controls: Dictionary = {}
var _binding := false
var _definition: Dictionary = {}
var _editable := false
var _locked := false
var _frames: Dictionary = {}
var _reference_choices: Dictionary = {}
var _animation_field := ""
var _animation_frame := 0


func _ready() -> void:
	for control in find_children("*", "Control", true, false):
		if not control.has_meta("field_name"): continue
		var field := str(control.get_meta("field_name"))
		_controls[field] = control
		if control is SpinBox: control.value_changed.connect(func(value: float): _edit(field, int(value)))
		elif control is LineEdit: control.text_changed.connect(func(text: String): _edit(field, text))
		elif control is TextEdit: control.text_changed.connect(func(): _edit(field, control.text))
		elif control is CheckBox: control.toggled.connect(func(value: bool): _edit(field, int(value) if field == "canRotate" else value))
		elif control is OptionButton: control.item_selected.connect(func(index: int): _edit(field, control.get_item_id(index)))
	for field in ["soundStart", "soundEnd", "lookStart", "lookEnd", "queueIcon", "spellClass"]:
		find_child("Choose" + field, true, false).pressed.connect(reference_requested.emit.bind(field))
	for field in ["soundStart", "soundEnd"]:
		find_child("Play" + field, true, false).pressed.connect(sound_requested.emit.bind(field, true))
		find_child("Stop" + field, true, false).pressed.connect(sound_requested.emit.bind(field, false))
		find_child("Open" + field, true, false).pressed.connect(resource_requested.emit.bind(field, 0))
	for field in ["lookStart", "lookEnd"]:
		for frame in 8: find_child(field + "Frame" + str(frame), true, false).pressed.connect(resource_requested.emit.bind(field, frame))
		find_child("Play" + field, true, false).pressed.connect(_animate.bind(field))
		find_child("Stop" + field, true, false).pressed.connect(stop_animation)
	%AnimationTimer.timeout.connect(_advance_animation)
	%OpenqueueIcon.pressed.connect(resource_requested.emit.bind("queueIcon", 0))
	%TargetHelp.pressed.connect(func():
		var dialog := AcceptDialog.new()
		dialog.title = "Spell targeting"
		dialog.dialog_text = TARGETS[int(_definition.get("targetType", 0))] if int(_definition.get("targetType", 0)) < TARGETS.size() else "Imported target type; exact value retained."
		dialog.dialog_text += "\nSize controls the selected target pattern. Fixed and power range are independent. Rotate permits choosing an orientation."
		dialog.confirmed.connect(dialog.queue_free)
		dialog.canceled.connect(dialog.queue_free)
		add_child(dialog); dialog.popup_centered(Vector2i(550, 250)))


func _edit(field: String, value: Variant) -> void:
	if not _binding and _editable and not _locked: field_edited.emit(field, value)


func set_definition(definition: Dictionary, editable: bool) -> void:
	stop_animation()
	_definition = definition.duplicate(true)
	_editable = editable
	_binding = true
	for field in _controls:
		var control: Control = _controls[field]
		var value: Variant = definition.get(field, "" if field in ["name", "description"] else 0)
		if control is SpinBox: control.set_value_no_signal(float(value))
		elif control is LineEdit or control is TextEdit: control.text = str(value)
		elif control is CheckBox: control.set_pressed_no_signal(bool(value))
		elif control is OptionButton: _set_options(control, field, int(value))
	%PackedSpellId.text = str(int(definition.classicId)) if not definition.is_empty() else ""
	var id := int(definition.get("classicId", 0))
	%ClassLevelSlot.text = "%s / %d / %d" % [["", "Sorcerer", "Priest", "Enchanter", "Special", "Custom"][clampi(id / 1000, 0, 5)], (id / 100) % 10, id % 100] if id > 0 else ""
	%TargetMeaning.text = "%s\nSize %d · fixed range %d · power range %d" % [_target_label(int(definition.get("targetType", 0))), int(definition.get("size", 0)), int(definition.get("rangeMin", 0)), int(definition.get("rangeMax", 0))] if not definition.is_empty() else ""
	_binding = false
	set_locked(_locked)


func _set_options(control: OptionButton, field: String, current: int) -> void:
	var values: Array = TARGETS if field == "targetType" else DAMAGE_TYPES if field == "damageType" else RESISTANCE_CHECKS
	control.clear()
	for index in values.size(): control.add_item("%d · %s" % [index, values[index]], index)
	if current >= values.size(): control.add_item("%d · Imported value (preserved)" % current, current)
	control.select(control.get_item_index(current))


func _target_label(value: int) -> String:
	return TARGETS[value] if value >= 0 and value < TARGETS.size() else "Imported target %d" % value


func set_locked(locked: bool) -> void:
	_locked = locked
	if locked: stop_animation()
	var enabled := _editable and not locked
	for control in _controls.values():
		if control is SpinBox or control is LineEdit or control is TextEdit: control.editable = enabled
		elif control is BaseButton: control.disabled = not enabled
	for field in ["soundStart", "soundEnd", "lookStart", "lookEnd", "queueIcon", "spellClass"]:
		find_child("Choose" + field, true, false).disabled = not enabled or (field == "spellClass" and int(_definition.get("special", 0)) != 58)
	%ChoosespellClass.tooltip_text = "Choose a Normal-set summon monster; zero means random eligible monster." if int(_definition.get("special", 0)) == 58 else "Summon selection is available only for effect 58."
	for field in ["soundStart", "soundEnd", "lookStart", "lookEnd"]:
		find_child("Stop" + field, true, false).disabled = true
	for field in _reference_choices:
		show_reference(field, _reference_choices[field], _frames.get(field, []))
	%OpenqueueIcon.disabled = locked or %QueuePreview.texture == null


func show_reference(field: String, choice: Dictionary, textures: Array = []) -> void:
	_reference_choices[field] = choice
	_frames[field] = textures
	find_child("Choose" + field, true, false).text = "%d · %s · Choose…" % [int(choice.get("value", 0)), str(choice.get("label", "Unavailable"))]
	find_child("Choose" + field, true, false).tooltip_text = str(choice.get("reason", "")) + "\n" + str(choice.get("detail", ""))
	if field in ["lookStart", "lookEnd"]:
		_frames[field] = textures
		find_child("Play" + field, true, false).disabled = _locked or textures.size() != 8
		find_child("Stop" + field, true, false).disabled = _locked or _animation_field != field
		for index in 8:
			var button: TextureButton = find_child(field + "Frame" + str(index), true, false)
			button.texture_normal = textures[index] if index < textures.size() else null
			var resources: Array = choice.get("resources", [])
			button.disabled = _locked or index >= resources.size()
			button.tooltip_text = "Open exact CICN %s · %s" % [str(resources[index].resourceId), str(resources[index].ownership)] if index < resources.size() else "No frame"
		find_child(field + "Meaning", true, false).text = str(choice.get("reason", "")) if not choice.get("available", false) else "8 frames" if not textures.is_empty() else "Blank cast"
		find_child(field + "Meaning", true, false).visible = not choice.get("available", false) and not str(choice.get("reason", "")).is_empty()
		find_child(field + "Frames", true, false).tooltip_text = "Eight exact resource frames. Play highlights the sequence; click a frame to open its owner."
	elif field == "queueIcon":
		%QueuePreview.texture = textures[0] if not textures.is_empty() else null
		%OpenqueueIcon.disabled = _locked or choice.get("targetIdentity") == null
	elif field in ["soundStart", "soundEnd"]:
		find_child("Play" + field, true, false).disabled = _locked or int(choice.get("value", 0)) == 0 or not choice.get("available", false)
		find_child("Open" + field, true, false).disabled = _locked or int(choice.get("value", 0)) == 0 or choice.get("targetIdentity") == null


func show_playback(field: String, playing: bool) -> void:
	for name in ["soundStart", "soundEnd"]: find_child("Stop" + name, true, false).disabled = _locked or not playing or name != field


func control_for(field: String) -> Control:
	return _controls.get(field)


func _animate(field: String) -> void:
	stop_animation()
	if _locked or _frames.get(field, []).size() != 8: return
	_animation_field = field
	_animation_frame = 0
	find_child("Stop" + field, true, false).disabled = false
	%AnimationTimer.start()
	_advance_animation()


func _advance_animation() -> void:
	if _animation_field.is_empty(): return
	for frame in 8:
		find_child(_animation_field + "Frame" + str(frame), true, false).modulate = Color.WHITE if frame == _animation_frame else Color(0.35, 0.35, 0.35)
	_animation_frame = (_animation_frame + 1) % 8


func stop_animation() -> void:
	%AnimationTimer.stop()
	for field in ["lookStart", "lookEnd"]:
		find_child("Stop" + field, true, false).disabled = true
		for frame in 8: find_child(field + "Frame" + str(frame), true, false).modulate = Color.WHITE
	_animation_field = ""
