extends Window

signal accepted
signal canceled
signal review_requested
signal recovery_requested
var _focus: WeakRef
var _busy := false


func _ready() -> void:
	%ApplyMapCreation.pressed.connect(accepted.emit)
	%CancelMapCreation.pressed.connect(cancel); close_requested.connect(cancel)
	%ReviewMapCreation.pressed.connect(review_requested.emit)
	%RecoverMapCreation.pressed.connect(recovery_requested.emit)


func present(data: Dictionary, origin: Control) -> void:
	_focus = weakref(origin)
	var plan: Dictionary = data.plan
	%CreationDestination.text = "%s · %s" % [plan.name, plan.identity]
	%CreationSource.text = "New %s map" % str(plan.levelType).capitalize() if plan.source == null else "Copy %s into this new allocation" % str(plan.source)
	%CreationImpact.text = "%d cells copied\n%d Action Point markers cleared\n%d encounter regions reset\nNo Action Point records copied\nDark and line of sight start off\nThe source map stays unchanged" % [plan.copiedCells,plan.clearedMarkers,plan.resetRegions] if plan.source != null else "Create an empty 90 × 90 map with the configured default terrain.\nNo Action Points or encounter regions are created.\nEdit its name and behavior in Level setup after creation."
	%CreationStatus.text = "Allocation reviewed."
	set_busy(false); popup_centered(Vector2i(660,420)); %CancelMapCreation.grab_focus()


func loading(origin: Control) -> void:
	_focus = weakref(origin)
	%CreationDestination.text = "Reviewing map allocation…"
	%CreationSource.text = "The destination will be assigned by the project."
	%CreationImpact.text = "Your current maps are unchanged."
	%CreationStatus.text = "Reading allocation and copy impact…"
	set_busy(true); popup_centered(Vector2i(660,420))


func set_busy(enabled: bool, recovery := false) -> void:
	_busy = enabled
	%ApplyMapCreation.disabled = enabled
	%CancelMapCreation.disabled = enabled
	%ReviewMapCreation.disabled = enabled
	%RecoverMapCreation.visible = recovery
	%RecoverMapCreation.disabled = enabled and not recovery


func show_failure(message: String, recovery: bool) -> void:
	%CreationStatus.text = message
	set_busy(recovery,recovery)
	%ApplyMapCreation.disabled = true


func cancel() -> void:
	if _busy: return
	canceled.emit(); dismiss()


func dismiss() -> void:
	hide()
	if _focus != null and is_instance_valid(_focus.get_ref()) and _focus.get_ref().is_inside_tree(): _focus.get_ref().grab_focus()


func _unhandled_key_input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_cancel"): cancel(); set_input_as_handled()
