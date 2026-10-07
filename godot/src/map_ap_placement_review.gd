extends Window

signal accepted
signal canceled
signal review_requested
signal recovery_requested
var _busy := false
var _focus: WeakRef


func _ready() -> void:
	%CreateActionPoint.pressed.connect(accepted.emit)
	%CancelPlacement.pressed.connect(cancel); close_requested.connect(cancel)
	%ReviewPlacement.pressed.connect(review_requested.emit)
	%RecoverPlacement.pressed.connect(recovery_requested.emit)


func loading(cell: Vector2i, map_name: String, origin: Control) -> void:
	_focus = weakref(origin)
	%PlacementDestination.text = "%s · X %d · Y %d" % [map_name,cell.x,cell.y]
	%PlacementImpact.text = "Create one Action Point at this cell, then open its script.\nCancel keeps the map unchanged."
	%PlacementStatus.text = "Reviewing the available native slot…"
	set_busy(true); popup_centered(Vector2i(620,330))


func present(data: Dictionary) -> void:
	%PlacementStatus.text = "Action Point %d · destination reviewed" % int(data.recordIndex)
	set_busy(false); %CancelPlacement.grab_focus()


func set_busy(enabled: bool) -> void:
	_busy = enabled
	for button in [%CreateActionPoint,%CancelPlacement,%ReviewPlacement,%RecoverPlacement]: button.disabled = enabled
	%RecoverPlacement.hide()


func failure(message: String, recovery := false) -> void:
	set_busy(false); _busy = recovery
	%PlacementStatus.text = message
	%CreateActionPoint.disabled = true; %CancelPlacement.disabled = recovery
	%ReviewPlacement.disabled = recovery; %RecoverPlacement.visible = recovery


func dismiss() -> void:
	var was_visible := visible
	hide()
	if was_visible and _focus != null and is_instance_valid(_focus.get_ref()) and _focus.get_ref().is_inside_tree(): _focus.get_ref().grab_focus()


func cancel() -> void:
	if not _busy: canceled.emit()


func _unhandled_key_input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_cancel"): cancel(); set_input_as_handled()
