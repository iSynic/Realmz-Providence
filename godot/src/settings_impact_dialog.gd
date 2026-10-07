class_name ProvidenceSettingsImpactDialog
extends ConfirmationDialog

signal decision_made(decision: String)

var _pending := false
@onready var _heading: Label = %ImpactHeading
@onready var _context: Label = %ImpactContext
@onready var _changes: Label = %ImpactChanges
@onready var _actions: VBoxContainer = %ImpactActions


func _ready() -> void:
	wrap_controls = false
	min_size = Vector2i(720, 460)
	add_button("Make this step independent", false, "independent")
	confirmed.connect(func(): _resolve("shared"))
	canceled.connect(func(): _resolve("cancel"))
	custom_action.connect(func(action): _resolve(str(action)))


func review(impact: Dictionary) -> String:
	if _pending: return "cancel"
	populate(impact)
	_pending = true
	show_review()
	get_cancel_button().grab_focus.call_deferred()
	return await decision_made


func show_review() -> void:
	reset_size()
	popup_centered(Vector2i(720, 460))


func populate(impact: Dictionary) -> void:
	var edited := impact.get("editedAction", {}) as Dictionary
	_heading.text = "This change affects %d other action%s" % [int(impact.total), "" if int(impact.total) == 1 else "s"]
	_context.text = "%s · %s" % [str(edited.get("location", "Selected step")), str(edited.get("label", ""))]
	_changes.text = _change_text(edited.get("changes", []) as Array)
	for child in _actions.get_children():
		_actions.remove_child(child)
		child.queue_free()
	for value in impact.get("affectedActions", []) as Array:
		var action := value as Dictionary
		var label := Label.new()
		label.text = "%s · %s\n%s" % [str(action.location), str(action.label), _change_text(action.changes)]
		label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		_actions.add_child(label)


func _change_text(changes: Array) -> String:
	var lines: Array[String] = []
	for change in changes:
		lines.append("%s: %d → %d" % [str(change.label), int(change.before), int(change.after)])
	return "\n".join(lines)


func _resolve(decision: String) -> void:
	if not _pending: return
	_pending = false
	hide()
	decision_made.emit(decision)


func _exit_tree() -> void:
	_resolve("cancel")
