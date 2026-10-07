extends VBoxContainer

signal history_requested(redo: bool)
signal apply_requested
signal canceled
signal changed
signal comparison_changed
signal recovery_requested

@onready var counts: Label = %Counts
@onready var status: Label = %Status
var _busy := false


func _ready() -> void:
	%Tolerance.item_selected.connect(func(_i): changed.emit())
	%ShowBefore.toggled.connect(func(_value): comparison_changed.emit())
	%UndoStroke.pressed.connect(history_requested.emit.bind(false))
	%RedoStroke.pressed.connect(history_requested.emit.bind(true))
	%Apply.pressed.connect(apply_requested.emit)
	%Cancel.pressed.connect(canceled.emit)
	%Recover.pressed.connect(recovery_requested.emit)


func tolerance() -> String:
	return ["literal","gentle","balanced","strong"][%Tolerance.selected]


func sample(description: String) -> void:
	%Sample.text = description


func present(plan: Dictionary, strokes: int) -> void:
	counts.text = "%d staged strokes · %d changed cells\n%d transition warnings" % [strokes,plan.get("paintedCells",[]).size(),plan.get("unresolvedCells",[]).size()]
	status.text = str(plan.unresolvedReason) if plan.get("unresolvedReason")!=null else "" if plan.get("canApply",false) else "No strokes."
	if strokes > 0 and not plan.get("canApply",false):
		status.text = "No tile changes." + (" " + str(plan.unresolvedReason) if plan.get("unresolvedReason")!=null else "")
	%Apply.disabled = _busy or not plan.get("canApply",false)


func controls(busy: bool, undo: bool, redo: bool, recover := false) -> void:
	_busy = busy
	%Tolerance.disabled = busy; %Cancel.disabled = busy
	%UndoStroke.disabled = busy or not undo; %RedoStroke.disabled = busy or not redo
	%Recover.visible = recover
	if busy: %Apply.disabled = true


func failure(message: String) -> void:
	status.text = message; %Apply.disabled = true


func _input(event: InputEvent) -> void:
	if not visible or _busy or not event is InputEventKey or not event.pressed or event.echo: return
	if (event.ctrl_pressed or event.meta_pressed) and event.keycode in [KEY_Z,KEY_Y]:
		history_requested.emit(event.keycode==KEY_Y or event.shift_pressed)
		get_viewport().set_input_as_handled()
