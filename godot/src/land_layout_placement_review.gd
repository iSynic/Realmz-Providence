extends Window

signal accepted
signal canceled

var _origin: WeakRef
var _can_apply := false


func _ready() -> void:
	%AcceptPlacement.pressed.connect(accepted.emit)
	%CancelPlacement.pressed.connect(cancel)
	close_requested.connect(cancel)


func _input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_cancel") and not %CancelPlacement.disabled:
		cancel()
		get_viewport().set_input_as_handled()


func open_review(result: Dictionary, origin: Control) -> void:
	_origin = weakref(origin)
	var placement: Dictionary = result.placement
	var target: Dictionary = placement.target if placement.target is Dictionary else {}
	%PlacementHeading.text = "Clear this layout cell" if target.is_empty() else "Place %s" % target.name
	%PlacementDestination.text = "World layout · Row %d · Column %d" % [int(placement.row) + 1, int(placement.column) + 1]
	var replaced: Dictionary = placement.replaced if placement.replaced is Dictionary else {}
	%Replacement.text = "Destination is empty." if replaced.is_empty() else "Replaces %s%s." % [replaced.name, " (missing map)" if replaced.missing else ""]
	%ChangedLocations.clear()
	for change: Dictionary in placement.changes:
		var destination := int(change.row) == int(placement.row) and int(change.column) == int(placement.column)
		%ChangedLocations.add_item("Row %d · Column %d · %s" % [int(change.row) + 1, int(change.column) + 1,
			("Clear selected cell" if target.is_empty() else "Place selected map") if destination else "Clear previous placement"])
	%PlacementSummary.text = "%d cells change." % placement.changes.size()
	_can_apply = bool(result.get("canApply", false))
	if not _can_apply: %PlacementSummary.text = "This cell already matches. No changes are needed."
	%PlacementStatus.text = "Placement review required."
	set_loading(false)
	popup_centered(Vector2i(720, 440))
	%CancelPlacement.grab_focus()


func set_loading(value: bool) -> void:
	%AcceptPlacement.disabled = value or not _can_apply
	%CancelPlacement.disabled = value


func show_failure(message: String, recovery: bool) -> void:
	%PlacementStatus.text = message
	%AcceptPlacement.disabled = recovery or not _can_apply
	%CancelPlacement.disabled = false


func cancel() -> void:
	hide()
	canceled.emit()
	restore_focus()


func complete() -> void:
	hide()
	restore_focus()


func restore_focus() -> void:
	if _origin == null: return
	var control: Control = _origin.get_ref()
	if control != null and control.is_inside_tree() and control.is_visible_in_tree(): control.grab_focus()
