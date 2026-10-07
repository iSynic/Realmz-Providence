extends Window

signal accepted(review: Dictionary, context: Dictionary)
signal review_requested(destination: int, context: Dictionary)
var _review: Dictionary = {}
var _context: Dictionary = {}
var _focus: Control

func _ready() -> void:
	close_requested.connect(cancel)
	%Cancel.pressed.connect(cancel)
	%UseDraft.pressed.connect(func():
		var review := _review.duplicate(true); var context := _context.duplicate(true)
		cancel(); accepted.emit(review, context))
	%ReviewDestination.pressed.connect(func():
		%UseDraft.disabled = true
		review_requested.emit(%DestinationId.get_selected_id(), _context.duplicate(true)))

func begin(review: Dictionary, context: Dictionary, focus: Control) -> void:
	_review = review.duplicate(true); _context = context.duplicate(true); _focus = focus
	var definition: Dictionary = review.draft.edit.definition
	var original: Dictionary = review.get("original", {}).get("definition", definition)
	title = "Review " + str(context.action).capitalize() + " " + str(review.draft.edit.kind).capitalize()
	%Destination.text = "%s %02d · %s · reviewed revision %d" % [str(review.draft.edit.kind).capitalize(), int(review.authorId), str(original.name), int(review.revision)]
	%DestinationControls.visible = context.action != "clear"
	%DestinationId.clear()
	for row in review.get("vacantDestinations", []): %DestinationId.add_item("Custom %02d · vacant" % int(row.authorId), int(row.classicId))
	%DestinationId.select(%DestinationId.get_item_index(int(definition.classicId)))
	%Summary.text = "%d incoming uses · identity and callers retained" % int(review.get("incomingUses", 0)) if context.action == "clear" else "Vacant custom destination · no occupied record is replaced."
	%Affected.text = "Draft only.\n\n"
	if context.action == "clear": %Affected.text += "Proposed cleared record: %s\n\n" % str(definition.name)
	if review.draft.get("copySource") != null:
		%Affected.text += "Source: %s %d · %s\n\n" % [review.draft.copySource.kind, int(review.copySourceAuthorId), review.draft.copySource.scope]
	for row in review.get("uses", []): %Affected.text += "%s · %s\n" % [str(row.get("sourceLabel", row.source)), str(row.get("fieldLabel", row.field))]
	%UseDraft.disabled = false
	%UseDraft.text = "Stage cleared record" if context.action == "clear" else "Use this destination"
	popup_centered(Vector2i(850, 500)); %Cancel.grab_focus()

func show_failure(message: String) -> void:
	%Summary.text = message; %UseDraft.disabled = true

func cancel() -> void:
	hide(); _review.clear(); _context.clear()
	if is_instance_valid(_focus) and _focus.is_visible_in_tree(): _focus.grab_focus()
	_focus = null

func _input(event: InputEvent) -> void:
	if visible and event.is_action_pressed("ui_cancel"): cancel(); set_input_as_handled()
