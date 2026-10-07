extends Window

signal choice_changed
signal apply_requested
signal reload_requested
signal dismissed

var _binding := false
var _busy := false
var _unknown := false
var _blocked := false
var _saved_slot: Variant = null
var _focus: Control
var _submitted: Dictionary = {}
var _shade: CanvasLayer


func _ready() -> void:
	_shade = CanvasLayer.new()
	_shade.layer = 100
	var shade := ColorRect.new()
	shade.color = Color(0, 0, 0, 0.53)
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_shade.add_child(shade)
	get_parent().add_child(_shade)
	_shade.hide()
	visibility_changed.connect(func(): _shade.visible = visible)
	%RuleSource.add_item("Not configured", 0)
	%RuleSource.add_item("Application rules", 1)
	%RuleSource.add_item("Scenario rules when present", 2)
	%RuleSource.item_selected.connect(_policy_changed)
	%MenuSlot.value_changed.connect(func(_value: float): if not _binding: _changed())
	%ApplyChoice.pressed.connect(apply_requested.emit)
	%ReloadSaved.pressed.connect(reload_requested.emit)
	%Cancel.pressed.connect(cancel)
	%CopyChoice.pressed.connect(func(): DisplayServer.clipboard_set(JSON.stringify(_submitted)))
	close_requested.connect(cancel)


func begin(saved: Dictionary, focus: Control, keep_local := false) -> void:
	_focus = focus
	_saved_slot = saved.get("context", {}).get("nativeMenuSelection") if saved.get("context") is Dictionary else null
	%SavedChoice.text = "Saved choice: " + describe_slot(_saved_slot)
	_binding = true
	if not keep_local:
		%RuleSource.select(0 if _saved_slot == null else 1 if int(_saved_slot) < 20 else 2)
		%MenuSlot.value = 10 if _saved_slot == null else int(_saved_slot)
	_binding = false
	_busy = false
	_unknown = false
	_blocked = false
	_submitted.clear()
	_refresh()
	_open_window()
	%RuleSource.grab_focus()
	_changed()


func has_receipt() -> bool:
	return _unknown


func can_apply() -> bool:
	return visible and choice_is_valid() and not %ApplyChoice.disabled


func choice_is_valid() -> bool:
	var slot := int(%MenuSlot.value)
	return %RuleSource.selected == 0 or (%RuleSource.selected == 1 and slot >= 1 and slot < 20) or (%RuleSource.selected == 2 and slot >= 20 and slot <= 32767)


func choice() -> Variant:
	return null if %RuleSource.selected == 0 else int(%MenuSlot.value)


func describe_slot(slot: Variant) -> String:
	if slot == null: return "Not configured"
	return "%s · Castle menu slot %d" % ["Application rules" if int(slot) < 20 else "Scenario rules when present", int(slot)]


func _policy_changed(index: int) -> void:
	if _binding: return
	_binding = true
	if index == 1 and %MenuSlot.value >= 20: %MenuSlot.value = 1
	if index == 2 and %MenuSlot.value < 20: %MenuSlot.value = 20
	_binding = false
	_changed()


func _changed() -> void:
	_refresh()
	if not choice_is_valid():
		%Preview.text = "Enter a valid Castle menu slot to preview the rules."
		%Status.text = "Enter a slot from 20 through 32767." if %RuleSource.selected == 2 else "Enter a slot from 1 through 19."
		%Status.theme_type_variation = &"RuleError"
		%ApplyChoice.disabled = true
		choice_changed.emit()
		return
	%Preview.text = "Checking effective rules…"
	%Status.text = "Checking the selected tables and inherited rules. Cancel leaves the saved choice unchanged."
	%Status.theme_type_variation = &"RuleContext"
	%ApplyChoice.disabled = true
	choice_changed.emit()


func present_preview(response: Dictionary) -> void:
	if not choice_is_valid(): return
	if not response.get("ok", false):
		%Preview.text = "Effective rules unavailable."
		%Status.text = str(response.get("error", "Rule preview failed."))
		%Status.theme_type_variation = &"RuleError"
		%ApplyChoice.disabled = true
		return
	var result: Dictionary = response.result
	var ready := bool(result.get("ready", false))
	%Preview.text = "Race: %s   ·   Caste: %s\nScenario Race/Caste names are preserved independently." % [
		str(result.get("raceSource", "unresolved")).capitalize(), str(result.get("casteSource", "unresolved")).capitalize()]
	if choice() == null:
		%Status.text = "Apply clears the saved choice. Rebuilt export will need a new choice." if _saved_slot != null else str(result.get("message", ""))
	elif not ready:
		%Preview.text = "Invalid · " + %Preview.text
		%Status.text = str(result.get("message", "")) + ". This choice can be saved; Rebuilt export stays blocked."
	else:
		%Status.text = "Unsaved choice" if choice() != _saved_slot else "Saved choice"
	%Status.theme_type_variation = &"RuleContext" if ready else &"RuleWarning"
	_refresh()
	%ApplyChoice.disabled = _busy or _unknown or _blocked or not result.get("validChoice", false) or choice() == _saved_slot


func writing(params: Dictionary) -> void:
	_busy = true
	_submitted = params.duplicate(true)
	%Status.text = "Saving Classic rule choice…"
	_refresh()


func present_failure(response: Dictionary) -> void:
	_busy = false
	_unknown = bool(response.get("outcomeUnknown", false))
	_blocked = true
	if _unknown:
		%SavedChoice.text = "Last known " + %SavedChoice.text.to_lower()
		%Status.text = "The write could not be confirmed. The submitted choice is frozen; Copy choice keeps that attempt. Close keeps this receipt. Reopen the project before another write."
	else:
		%Status.text = str(response.get("error", "The write was rejected.")) + " Your choice is kept; reload the saved choice to compare before applying again."
	%Status.theme_type_variation = &"RuleWarning"
	_refresh()


func _refresh() -> void:
	%RuleSource.disabled = _busy or _unknown
	%MenuSlot.editable = not _busy and not _unknown and %RuleSource.selected != 0
	%MenuSlot.visible = %RuleSource.selected != 0
	%NoSlot.visible = %RuleSource.selected == 0
	%ApplyChoice.disabled = _busy or _unknown or _blocked or not choice_is_valid() or choice() == _saved_slot
	%ApplyChoice.visible = not _unknown
	%Cancel.disabled = _busy
	%Cancel.text = "Close" if _unknown else "Cancel"
	%CopyChoice.visible = _unknown
	%ReloadSaved.visible = _blocked and not _unknown
	%ReloadSaved.disabled = _busy


func cancel(restore_focus := true) -> void:
	if _busy: return
	hide()
	if restore_focus and is_instance_valid(_focus): _focus.grab_focus()
	dismissed.emit()


func reset(keep_receipt := false) -> void:
	_busy = false
	if not keep_receipt:
		_unknown = false
		_submitted.clear()
	cancel(false)


func reopen_receipt(focus: Control) -> bool:
	if not _unknown: return false
	_focus = focus
	_open_window()
	%CopyChoice.grab_focus()
	return true


func _open_window() -> void:
	var parent_theme: Theme = theme
	if get_parent() is Control and get_parent().theme != null: parent_theme = get_parent().theme
	var theme_script := preload("res://src/classic_rule_selection_theme.gd")
	var controls: Theme = theme if theme != null and theme.get_script() == theme_script else theme_script.new()
	if parent_theme != null and "mode" in parent_theme:
		if controls.mode != parent_theme.mode: controls.mode = parent_theme.mode
		if controls.density != parent_theme.density: controls.density = parent_theme.density
	if theme != controls: theme = controls
	popup_centered(Vector2i(820, 516))
	position.y += 18


func _unhandled_key_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and event.keycode == KEY_ESCAPE:
		cancel()
		set_input_as_handled()
