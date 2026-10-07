extends Window

signal accepted(review: Dictionary, context: Dictionary)
signal review_requested(destination: int, context: Dictionary)
var _review: Dictionary = {}
var _context: Dictionary = {}
var _focus: Control


func _ready() -> void:
	%Cancel.pressed.connect(cancel)
	close_requested.connect(cancel)
	%UseDraft.pressed.connect(func(): accepted.emit(_review.duplicate(true), _context.duplicate(true)); cancel())
	%ReviewDestination.pressed.connect(func(): review_requested.emit(int(%DestinationId.value) - 800, _context.duplicate(true)))
	%DestinationId.value_changed.connect(func(_value: float): %UseDraft.disabled = true; %Summary.text = "Destination changed; review required.")


func begin(review: Dictionary, context: Dictionary, focus: Control = null) -> void:
	_review = review.duplicate(true)
	_context = context.duplicate(true)
	if not visible: _focus = focus
	var clear := str(context.kind) == "clear"
	title = "Review Clear Item" if clear else "Review Scenario Item Allocation"
	var value: Dictionary = review.get("draft", {}) if clear else review.get("allocation", {}).get("draft", {})
	%Destination.text = "Item %d · %s" % [int(value.definition.classicId), "Clear definition; identity and incoming links retained" if clear else "New local scenario draft"]
	%DestinationControls.visible = not clear
	%DestinationId.set_value_no_signal(int(value.definition.classicId))
	%Summary.text = "%d incoming uses remain linked. Review their owning fields before clearing." % int(review.get("incomingUses", 0)) if clear else "%d of 100 custom slots available · destination Item %d" % [int(review.get("allocation", {}).get("availableSlots", 0)), int(value.definition.classicId)]
	%Affected.text = "\n".join(review.get("uses", []).map(func(row): return "%s · %s" % [str(row.get("source", "")), str(row.get("field", ""))]))
	%UseDraft.text = "Stage Clear" if clear else "Use This Destination"
	%UseDraft.disabled = false
	popup_centered(Vector2i(850, 560))
	%Cancel.grab_focus()


func cancel() -> void:
	hide()
	_review.clear(); _context.clear()
	if is_instance_valid(_focus) and _focus.is_inside_tree(): _focus.grab_focus()
	_focus = null


func show_failure(message: String) -> void:
	%Summary.text = message + " Your draft is unchanged. Review another ID or Cancel."
	%UseDraft.disabled = true


func _unhandled_key_input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_cancel"): cancel(); get_viewport().set_input_as_handled()
