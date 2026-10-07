extends Window

signal rebase_requested(saved: Dictionary, keep: Array, origin: Vector2i, submitted: Dictionary)
const Labels = preload("res://src/monster_review_labels.gd")
var _saved: Dictionary = {}
var _origin := Vector2i.ZERO
var _submitted: Dictionary = {}
var _focus: Control
var _focus_generation := 0


func _ready() -> void:
	%Rebase.pressed.connect(_rebase)
	%Cancel.pressed.connect(cancel)
	close_requested.connect(cancel)
	%Fields.item_edited.connect(_validate)
	for column in 4: %Fields.set_column_title(column, ["Field", "Currently saved", "Your retained draft", "Use on rebase"][column])


func begin(draft, saved: Dictionary, origin: Vector2i, destination: String, source_focus: Control = null) -> void:
	_focus_generation += 1
	_focus = source_focus
	_saved = saved.duplicate(true)
	_origin = origin
	_submitted = draft.submission()
	%Destination.text = destination + " · Compare before rebasing"
	%Fields.clear()
	var root: TreeItem = %Fields.create_item()
	var retained: Dictionary = draft.retained_values()
	for path in retained:
		var current: Variant = draft.comparison_value(saved, path)
		var baseline: Variant = draft.comparison_value(draft.document, path)
		var row: TreeItem = %Fields.create_item(root)
		row.set_text(0, Labels.field(path))
		row.set_text(1, _value(current))
		row.set_text(2, _value(retained[path]))
		row.set_metadata(0, path)
		row.set_cell_mode(3, TreeItem.CELL_MODE_RANGE)
		row.set_text(3, "Choose…,Keep my draft,Use current")
		row.set_range_config(3, 0, 2, 1)
		row.set_editable(3, true)
		row.set_range(3, 2 if draft.values_match(current, retained[path]) else (1 if draft.values_match(current, baseline) else 0))
		if path == "normalNotOnMenu" and current == null:
			row.set_range(3, 2)
			row.set_editable(3, false)
			row.set_tooltip_text(3, "The active Normal owner is absent; this setting cannot be retained.")
	_validate()
	popup_centered(Vector2i(1040, 620))
	%Fields.grab_focus()


func _validate() -> void:
	var row: TreeItem = %Fields.get_root().get_first_child() if %Fields.get_root() != null else null
	var unresolved := 0
	while row != null:
		if int(row.get_range(3)) == 0: unresolved += 1
		row = row.get_next()
	%Rebase.disabled = unresolved > 0
	%Status.text = "%d conflicting fields need an explicit choice. Your draft is kept." % unresolved if unresolved else "Rebase updates the local baseline. Review your form, then Apply as a separate action."


func _rebase() -> void:
	if %Rebase.disabled: return
	var keep: Array = []
	var row: TreeItem = %Fields.get_root().get_first_child()
	while row != null:
		if int(row.get_range(3)) == 1: keep.append(row.get_metadata(0))
		row = row.get_next()
	rebase_requested.emit(_saved.duplicate(true), keep, _origin, _submitted.duplicate(true))
	cancel()


func cancel() -> void:
	_focus_generation += 1
	hide()
	var generation := _focus_generation
	var focus := _focus
	if is_instance_valid(focus):
		(func(): if not visible and generation == _focus_generation and is_instance_valid(focus): focus.grab_focus()).call_deferred()


func _input(event: InputEvent) -> void:
	if visible and event.is_action_pressed("ui_cancel"):
		cancel()
		set_input_as_handled()


func _value(value: Variant) -> String:
	return "Unavailable" if value == null else str(value)
