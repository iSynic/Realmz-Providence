extends Window

signal review_requested
signal preview_changed(mode: String, focal: Vector2i)
signal erase_artwork_requested

var identity := ""
var revision := 0
var _baseline: Dictionary = {}
var _landlooks: Array = []
var _selected: Dictionary = {}
var _origin: WeakRef
var _locked := false
var _recovery := false
var _binding := false
var _current_cell := Vector2i(-1, -1)


func _ready() -> void:
	%ReviewSettings.pressed.connect(review_requested.emit)
	%CancelSettings.pressed.connect(close)
	%DiscardSettings.pressed.connect(discard_draft)
	close_requested.connect(close)
	%ChooseLandlook.pressed.connect(_choose_landlook)
	%ChooseEraseTile.pressed.connect(erase_artwork_requested.emit)
	%EraseTilePicker.tile_selected.connect(func(tile: int): %SharedEraseTile.value = tile)
	%UseCurrentFocal.pressed.connect(_use_current_focal)
	%LandlookPicker.selected.connect(_select_landlook)
	%PreviewMode.item_selected.connect(func(_index): _update_preview())
	%FocalX.value_changed.connect(func(_value): _update_preview())
	%FocalY.value_changed.connect(func(_value): _update_preview())
	for field in [%SettingsName, %SettingsDark, %SettingsLos, %SharedEraseTile]:
		var changed: Signal = field.text_changed if field is LineEdit else (field.toggled if field is CheckBox else field.value_changed)
		changed.connect(func(_value): _refresh_controls())
	var bold: Font = %SettingsHeading.get_theme_font("font").duplicate()
	if bold is SystemFont: bold.font_weight = 700
	%SettingsHeading.add_theme_font_override("font", bold)


func set_projection(result: Dictionary, origin: Control) -> void:
	identity = str(result.identity)
	revision = int(result.revision)
	_origin = weakref(origin)
	_baseline = result.settings.duplicate(true)
	_landlooks = result.landlooks.duplicate(true)
	%ChooseLandlook.disabled = bool(result.dungeon)
	%ChooseLandlook.set_meta("dungeon", bool(result.dungeon))
	%SettingsContext.text = "%s · scenario-owned level settings" % str(_baseline.get("name", "No level open"))
	_recovery = false
	_locked = false
	discard_draft()


func show_draft() -> void:
	popup_centered(Vector2i(820, 560))
	%SettingsName.grab_focus()


func submitted() -> Dictionary:
	return {"identity": identity, "expectedRevision": revision, "edit": {
		"name": %SettingsName.text, "dark": %SettingsDark.button_pressed, "usesLos": %SettingsLos.button_pressed,
		"landlook": int(_selected.get("id", _baseline.get("landlook"))) if _selected.get("id", _baseline.get("landlook")) != null else null,
		"sharedBaseTile": int(%SharedEraseTile.value) if _selected.get("sharedBaseEditable", false) else null}}


func has_unapplied_changes() -> bool:
	if _baseline.is_empty(): return _recovery
	var edit: Dictionary = submitted().edit
	return _recovery or edit.name != _baseline.name or edit.dark != _baseline.dark or edit.usesLos != _baseline.usesLos or edit.landlook != _baseline.landlook or (edit.sharedBaseTile != null and edit.sharedBaseTile != _selected.get("baseTile"))


func discard_draft() -> void:
	if _locked or _recovery or _baseline.is_empty(): return
	_binding = true
	%SettingsName.text = str(_baseline.name)
	%SettingsDark.set_pressed_no_signal(bool(_baseline.dark))
	%SettingsLos.set_pressed_no_signal(bool(_baseline.usesLos))
	_selected.clear()
	for choice: Dictionary in _landlooks:
		if choice.id == _baseline.landlook: _selected = choice.duplicate(true); break
	%SharedEraseTile.value = int(_selected.get("baseTile", 0)) if _selected.get("baseTile") != null else 0
	_binding = false
	%SettingsStatus.text = "Stock shared erase tiles are protected. Custom erase changes are reviewed for every affected level. Preview and focal cell are local."
	_refresh_controls()


func acknowledge(result: Dictionary) -> void:
	_baseline = result.settings.duplicate(true)
	revision = int(result.revision)
	if _selected.get("sharedBaseEditable", false):
		_selected.baseTile = int(%SharedEraseTile.value)
		for choice: Dictionary in _landlooks:
			if choice.id == _selected.id: choice.baseTile = _selected.baseTile
	_recovery = false
	set_loading(false)
	%SettingsStatus.text = "Level settings applied."


func _choose_landlook() -> void:
	%LandlookPicker.open_picker(_landlooks, _selected.get("id"), str(_baseline.name), %ChooseLandlook)


func _select_landlook(choice: Dictionary) -> void:
	if choice.id == _selected.get("id"): return
	_selected = choice.duplicate(true)
	%SharedEraseTile.value = int(choice.baseTile) if choice.baseTile != null else 0
	_refresh_controls()


func _update_preview() -> void:
	if _binding: return
	preview_changed.emit(["off", "los", "darkness", "both"][%PreviewMode.selected], Vector2i(int(%FocalX.value), int(%FocalY.value)))


func set_preview_preferences(preference: Dictionary) -> void:
	_binding = true
	%PreviewMode.select(["off", "los", "darkness", "both"].find(preference.mode))
	%FocalX.value = preference.focal.x
	%FocalY.value = preference.focal.y
	_binding = false


func set_current_cell(cell: Vector2i) -> void:
	_current_cell = cell
	%UseCurrentFocal.disabled = cell.x < 0


func _use_current_focal() -> void:
	if _current_cell.x < 0: return
	_binding = true
	%FocalX.value = _current_cell.x
	%FocalY.value = _current_cell.y
	_binding = false
	_update_preview()


func present_erase_artwork(projection: Dictionary) -> void:
	if not %EraseTilePicker.open_picker(projection, int(%SharedEraseTile.value), str(_selected.get("name", "Custom Landlook")), %ChooseEraseTile):
		%SettingsStatus.text = "This Landlook has no readable exact atlas. Your erase tile is unchanged."


func set_loading(value: bool) -> void:
	_locked = value or _recovery
	_refresh_controls()


func show_failure(response: Dictionary) -> void:
	_recovery = response.get("outcomeUnknown", false) or response.get("viewRefreshPending", false)
	%SettingsStatus.text = str(response.get("error", "Your settings draft is kept."))
	set_loading(false)


func rebase(revision_value: int) -> void:
	revision = revision_value
	_recovery = false
	set_loading(false)


func _refresh_controls() -> void:
	if _binding or not is_node_ready(): return
	%SettingsName.editable = not _locked
	%SettingsDark.disabled = _locked
	%SettingsLos.disabled = _locked
	%ChooseLandlook.disabled = _locked or bool(%ChooseLandlook.get_meta("dungeon", false))
	%ChooseLandlook.text = "Dungeon top-down" if bool(%ChooseLandlook.get_meta("dungeon", false)) else "%s · %s · Choose…" % [_selected.get("name", "Preserved Landlook"), _selected.get("ownership", "Imported")]
	%SharedEraseTile.editable = not _locked and _selected.get("sharedBaseEditable", false)
	%ChooseEraseTile.disabled = not %SharedEraseTile.editable
	%SharedEraseReason.text = "Shared by all levels using this Custom Landlook." if _selected.get("sharedBaseEditable", false) else "Stock protected · choose a scenario-owned Custom Landlook to customize."
	%ReviewSettings.disabled = _locked or not has_unapplied_changes()
	%DiscardSettings.disabled = _locked or not has_unapplied_changes()
	%CancelSettings.disabled = _locked and not _recovery
	%ReconcileSettings.visible = _recovery


func close() -> void:
	if _locked and not _recovery: return
	%LandlookPicker.cancel()
	%EraseTilePicker.cancel()
	if %SettingsImpact.visible: %SettingsImpact.cancel()
	hide()
	if _origin != null:
		var origin: Control = _origin.get_ref()
		if origin != null and origin.is_visible_in_tree(): origin.grab_focus()


func _input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_cancel") and not %CancelSettings.disabled: close(); get_viewport().set_input_as_handled()
