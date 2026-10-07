extends Window

signal accepted
signal canceled


func _ready() -> void:
	%ApplySettingsImpact.pressed.connect(accepted.emit)
	%CancelSettingsImpact.pressed.connect(cancel)
	close_requested.connect(cancel)


func open_review(result: Dictionary, destination: String) -> void:
	%SettingsImpactContext.text = destination
	%SettingsImpactChanges.text = "Changes: " + ", ".join(result.changes)
	%AffectedSettingsMaps.clear()
	for map: Dictionary in result.affectedMaps:
		%AffectedSettingsMaps.add_item("%s · %s" % [map.identity, map.name])
	%SettingsImpactStatus.text = "%d affected levels" % result.affectedMaps.size()
	set_loading(false)
	popup_centered(Vector2i(720, 440))
	%CancelSettingsImpact.grab_focus()


func set_loading(value: bool) -> void:
	%ApplySettingsImpact.disabled = value
	%CancelSettingsImpact.disabled = value


func show_failure(response: Dictionary) -> void:
	%SettingsImpactStatus.text = str(response.get("error", "Your settings draft is kept."))
	%ApplySettingsImpact.disabled = response.get("outcomeUnknown", false) or response.get("viewRefreshPending", false)
	%CancelSettingsImpact.disabled = false


func cancel() -> void:
	if %CancelSettingsImpact.disabled: return
	hide()
	canceled.emit()
	get_parent().get_node("%ReviewSettings").grab_focus()


func _input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_cancel"): cancel(); get_viewport().set_input_as_handled()
