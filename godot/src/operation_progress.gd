extends Window

signal cancel_requested


func _ready() -> void:
	theme = preload("res://theme/scenario_control_theme.gd").new()
	%Cancel.pressed.connect(func(): cancel_requested.emit())
	close_requested.connect(func(): if not %Cancel.disabled: cancel_requested.emit())


func present(phase: String, count: String, cancellable: bool) -> void:
	%Phase.text = phase
	%Count.text = count
	%Cancel.disabled = not cancellable
	if not visible and DisplayServer.get_name() != "headless": popup_centered()
