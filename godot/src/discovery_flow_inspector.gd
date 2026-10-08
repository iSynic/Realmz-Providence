extends PanelContainer

signal action_requested(action: String)
signal step_selected(slot: int)
signal field_selected(id: String)
signal occurrence_selected(id: String)
signal inspect_requested(id: String)
signal caller_requested(selection: Dictionary)
signal candidate_requested(selection: Dictionary)
signal selection_changed
signal step_help_requested(step: Dictionary, anchor: Vector2, pinned: bool)
signal helper_dismissed
signal helper_focus_changed
var _model
var _row: Dictionary = {}
var _summary: Dictionary = {}
var _enabled := false
var occurrence_filter: Array:
	get: return _model.occurrence_filter if _model != null else []
	set(value): if _model != null: _model.occurrence_filter = value
var _target := ""
var _owner := ""
var _visible_step_key := ""

func _ready() -> void:
	%StepsTab.pressed.connect(_tab.bind("steps"))
	%ConnectionsTab.pressed.connect(_tab.bind("connections"))
	%DetailsTab.pressed.connect(_tab.bind("details"))
	%OpenSource.pressed.connect(func(): action_requested.emit("open-source"))
	%OpenRecord.pressed.connect(func(): action_requested.emit("open-record"))
	%Connections.item_selected.connect(func(index): occurrence_selected.emit(str(%Connections.get_item_metadata(index))))
	%AllUses.pressed.connect(func(): occurrence_filter.clear(); _tab("connections"))
	%InspectTarget.pressed.connect(func(): inspect_requested.emit(_target))
	%InspectOwner.pressed.connect(func(): inspect_requested.emit(_owner))
	%Caller.item_selected.connect(func(index): if index > 0: caller_requested.emit(%Caller.get_item_metadata(index)))
	%Candidates.item_selected.connect(func(index): candidate_requested.emit(%Candidates.get_item_metadata(index)))
	%ShowAllSteps.pressed.connect(func(): _model.steps_expanded = not _model.steps_expanded; %Scroll.scroll_vertical = 0; _render())

func present(model, row: Dictionary, enabled: bool) -> void:
	_model = model
	_row = row
	_summary = model.summaries.get(model.selected, {})
	_enabled = enabled
	%Family.text = preload("res://src/discovery_flow_card.gd").family(row).to_upper()
	%Title.text = preload("res://src/discovery_flow_canvas.gd").caption(row) if not row.is_empty() else "Select a record"
	%Meta.text = "%d used steps · 8 slots · %s" % [int(_summary.get("usedSteps", 0)), row.get("selection", {}).get("scope", "scenario")] if _summary.get("program", false) else str(row.get("label", ""))
	if row.get("resolution") in ["missing", "ambiguous"]: %Meta.text = str(row.resolution).capitalize() + " reference · source retained"
	%StepsTab.disabled = not _summary.get("program", false)
	if _model.inspector_tab == "steps" and %StepsTab.disabled and (_summary.has("program") or enabled): _model.inspector_tab = "details"
	%StepsTab.text = "Steps %d" % int(_summary.get("usedSteps", 0))
	%ConnectionsTab.text = "Connections %d" % model.related().size()
	_callers()
	_render()

func _tab(tab: String) -> void:
	_model.inspector_tab = tab
	if tab == "details" and not _model.edge.is_empty():
		_model.source_edge = _model.edge
		_model.edge = ""
	if tab == "steps": _model.edge = ""
	if tab != "steps": _model.step = -1
	_render()
	selection_changed.emit()

func _render() -> void:
	var tab: String = _model.inspector_tab
	var focused := get_viewport().gui_get_focus_owner()
	var focused_field: String = str(focused.get_meta("flow_field", "")) if is_instance_valid(focused) else ""
	for child in %StepFields.get_children(): %StepFields.remove_child(child); child.queue_free()
	for pair in [[%StepsTab,"steps"], [%ConnectionsTab,"connections"], [%DetailsTab,"details"]]: pair[0].set_pressed_no_signal(tab == pair[1])
	%Steps.visible = tab == "steps"
	%ShowAllSteps.visible = tab == "steps" and _model.step >= 0
	%Connections.visible = tab == "connections"
	%AllUses.visible = tab == "connections" and not occurrence_filter.is_empty()
	%Detail.clear()
	%InspectOwner.visible = false
	%InspectTarget.visible = false
	%Candidates.visible = false
	%OpenSource.disabled = true
	%OpenRecord.disabled = not _enabled or not _row.get("navigable", false)
	%OpenRecord.text = "Open record…"
	match tab:
		"steps": _steps()
		"connections": _connections()
		_: _details()
	var reference: Dictionary = _model.source_reference()
	var reason := preload("res://src/source_navigation.gd").unavailable_reason(reference)
	%OpenSource.disabled = not _enabled or reference.is_empty() or not reason.is_empty()
	%OpenSource.tooltip_text = reason
	%OpenSource.text = "Open step %d…" % (int(_model.step) % 8 + 1) if _model.step >= 0 and _model.edge.is_empty() else "Open owning field…"
	if tab == "steps" and _model.edges.has(_model.edge):
		%OpenSource.text = "Open condition…" if _model.edges[_model.edge].relationship == "state-check" else "Open branch…"
	for child in %StepFields.get_children():
		if not focused_field.is_empty() and child.get_meta("flow_field", "") == focused_field: child.grab_focus()

func _steps() -> void:
	%Context.text = "Loading step summary…" if _summary.is_empty() else "Authored step order; calls and conditions can change what runs."
	var key: String = _model.selected + ":" + str(_model.step)
	if key != _visible_step_key: %Scroll.scroll_vertical = 0; _visible_step_key = key
	var focused := get_viewport().gui_get_focus_owner()
	var focused_slot := int(focused.get_meta("step_slot", -1)) if is_instance_valid(focused) and %Steps.is_ancestor_of(focused) else -1
	for child in %Steps.get_children(): %Steps.remove_child(child); child.queue_free()
	var empty_start := -1
	var steps: Array = _summary.get("steps", [])
	%ShowAllSteps.text = "Focus selected step" if _model.steps_expanded else "Show all 8 slots"
	for index in steps.size():
		var step: Dictionary = steps[index]
		if _model.step >= 0 and not _model.steps_expanded and int(step.slot) != _model.step: continue
		if step.status == "empty":
			if empty_start < 0: empty_start = index
			if index + 1 < steps.size() and steps[index + 1].status == "empty" and steps[index + 1].inRange == step.inRange: continue
			_empty_slots(empty_start, index, step.inRange)
			empty_start = -1
		else: _step_row(step)
	var selected: Dictionary = {}
	for step: Dictionary in steps:
		if int(step.slot) == _model.step: selected = step
	if selected.is_empty():
		_field("Select a step", "Inspect its complete meaning and open its owning field, including steps with no mapped relationships.")
	else: _step_details(selected)
	if not selected.is_empty() and not _model.steps_expanded:
		%Context.text = "Step %d of 8 · original position%s" % [int(selected.position) + 1, " · outside entry range" if not selected.inRange else ""]
	for child in %Steps.get_children():
		if focused_slot >= 0 and child.get_meta("step_slot", -1) == focused_slot: child.grab_focus()

func _empty_slots(first: int, last: int, in_range: bool) -> void:
	var label := Label.new()
	label.text = "%02d–%02d  Empty slots%s" % [first + 1, last + 1, " · outside entry range" if not in_range else ""]
	label.add_theme_font_size_override("font_size", 11)
	label.add_theme_color_override("font_color", Color(theme.PALETTES[theme.mode][4]))
	label.custom_minimum_size.y = 32
	%Steps.add_child(label)

func _step_row(step: Dictionary) -> void:
	var button := preload("res://src/discovery_flow_step.tscn").instantiate()
	%Steps.add_child(button)
	button.set_meta("step_slot", int(step.slot))
	button.custom_minimum_size.y = 64 if theme.density == "compact" else 70
	button.get_node("%Title").text = "%02d  %s%s" % [int(step.position) + 1, "! " if step.status in ["unknown", "unavailable"] else "", step.cardSummary]
	button.get_node("%Summary").text = step.summary if not str(step.summary).is_empty() else step.warning
	button.get_node("%Summary").add_theme_color_override("font_color", Color(theme.PALETTES[theme.mode][4]))
	button.button_pressed = int(step.slot) == _model.step
	button.mouse_entered.connect(func(): step_help_requested.emit(step, button.global_position + Vector2(-410, 0), false))
	button.mouse_exited.connect(func(): helper_dismissed.emit())
	button.focus_entered.connect(func(): helper_focus_changed.emit())
	button.gui_input.connect(func(event):
		if event is InputEventKey and event.pressed and event.keycode == KEY_F1:
			step_help_requested.emit(step, button.global_position + Vector2(-410, 0), true)
			button.accept_event())
	if not step.inRange:
		button.get_node("%Title").text += " · outside range"
		button.modulate.a = 0.6
	button.pressed.connect(func(): step_selected.emit(int(step.slot)))

func _step_details(step: Dictionary) -> void:
	_field("STEP %d · %s" % [int(step.position) + 1, str(step.title).to_upper()], str(step.summary))
	_field("Condition / control flow", str(step.condition))
	if not str(step.warning).is_empty(): _field("! Availability", str(step.warning))
	for field: Dictionary in step.get("fields", []):
		var preview: Dictionary = field.get("preview") if field.get("preview") is Dictionary else {}
		_field(str(field.label), str(preview.get("label", field.value)))
		if not str(preview.get("detail", "")).is_empty(): _field("Target excerpt" if field.get("previewTruncated", false) else "Target detail", str(preview.detail))
	var matches: Array = _model.selected_step_edges()
	if matches.size() == 1: _inspect_link(matches[0])
	elif matches.size() > 1:
		for edge: Dictionary in matches: _step_field(edge)
		if _model.edges.has(_model.edge): _inspect_link(_model.edges[_model.edge])

func _step_field(edge: Dictionary) -> void:
	var button := Button.new()
	var condition: bool = edge.relationship == "state-check"
	var target: Dictionary = _model.nodes[edge.source if condition else edge.target]
	button.text = ("Condition · " if condition else "Branch · " if edge.relationship == "call" else "Uses · ") + preload("res://src/discovery_flow_canvas.gd").caption(target)
	if condition: button.text += " · " + str(edge.reference.targetLabel)
	button.tooltip_text = str(edge.details.get("condition", "")) + "\n" + str(edge.reference.meaning)
	button.alignment = HORIZONTAL_ALIGNMENT_LEFT
	button.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	button.custom_minimum_size.y = 36
	button.toggle_mode = true
	button.button_pressed = edge.id == _model.edge
	button.set_meta("flow_field", str(edge.id))
	button.pressed.connect(func(): field_selected.emit(str(edge.id)))
	%StepFields.add_child(button)

func _connections() -> void:
	%Context.text = "Exact loaded occurrences; selecting one preserves its owning source field."
	%Connections.clear()
	var rows: Array = _model.related() if occurrence_filter.is_empty() else occurrence_filter.filter(func(id): return _model.edges.has(id)).map(func(id): return _model.edges[id])
	for edge: Dictionary in rows:
		var index: int = %Connections.add_item(str(edge.reference.sourceLabel) + " · " + str(edge.reference.meaning))
		%Connections.set_item_metadata(index, edge.id)
		%Connections.set_item_tooltip(index, str(edge.reference.sourceLabel) + "\n" + str(edge.reference.meaning) + "\n" + str(edge.reference.targetLabel))
		if edge.id == _model.edge: %Connections.select(index)
	if _model.edges.has(_model.edge): _connection_details(_model.edges[_model.edge])
	else: _field("Select an occurrence", "%d loaded connections. A line can represent several distinct fields." % %Connections.item_count)

func _connection_details(edge: Dictionary) -> void:
	var link: Dictionary = edge.reference
	for pair in [["Meaning",link.meaning], ["Source",link.sourceLabel], ["Field",preload("res://src/discovery_preview.gd").field_label(link.field)], ["Target",link.targetLabel], ["Availability",str(link.resolution).capitalize()]]: _field(pair[0], pair[1])
	for key in ["condition", "effect", "branch"]:
		if not str(edge.details.get(key, "")).is_empty(): _field(key.capitalize(), str(edge.details[key]))
	if str(edge.relationship).begins_with("state-"): _field("State relationship", "This does not call the checking program or establish execution order.")
	_inspect_link(edge)
	_owner = _model.owning_node(edge)
	%InspectOwner.visible = not _owner.is_empty()
	%OpenRecord.disabled = not _enabled or not _model.nodes[_target].navigable
	%OpenRecord.text = "Open target…"

func _inspect_link(edge: Dictionary) -> void:
	# Checks point toward the checker; the typed reference still identifies its target.
	_target = ""
	for id in [edge.target, edge.source]:
		if _model.nodes[id].selection.identity == edge.reference.get("targetIdentity"): _target = id
	if _target.is_empty(): _target = edge.source if edge.relationship == "state-check" else edge.target
	%InspectTarget.text = "Inspect " + preload("res://src/discovery_flow_canvas.gd").caption(_model.nodes[_target]) + " →"
	%InspectTarget.visible = true

func _details() -> void:
	%Context.text = "Record details · possible authored behavior"
	_field("Summary", str(_summary.get("summary", _row.get("label", ""))))
	if not str(_summary.get("excerpt", "")).is_empty(): _field("Text excerpt" if _summary.get("excerptTruncated", false) else "Text", str(_summary.excerpt))
	if not _row.get("navigable", false) and _summary.get("candidates", []).is_empty(): _field("! Availability", str(_row.get("availabilityReason", "")))
	for key in ["entryPosition", "throughPosition", "callerContext"]:
		if _row.get("selection", {}).get(key) != null:
			_field({"entryPosition":"Entry step", "throughPosition":"Through step", "callerContext":"Calling encounter"}[key], str(int(_row.selection[key]) + 1) if key.ends_with("Position") else str(_row.selection[key]))
	_field("Loaded view", "%d related occurrences. Counts are limited to the loaded traversal." % _model.related().size())
	for item: Dictionary in _summary.get("details", []): _field(str(item.label), str(item.text))
	var candidates: Array = _summary.get("candidates", [])
	%Candidates.visible = not candidates.is_empty()
	%Candidates.clear()
	if not candidates.is_empty(): %Context.text = "%d of %d exact scenario candidates · inspect without choosing an owner." % [candidates.size(), int(_summary.candidatesTotal)]
	for candidate: Dictionary in candidates:
		var dimensions := "%d × %d" % [int(candidate.width), int(candidate.height)] if candidate.get("width") != null and candidate.get("height") != null else "Dimensions unavailable"
		var index: int = %Candidates.add_item(str(candidate.label) + " · " + dimensions)
		%Candidates.set_item_metadata(index, candidate.selection)
		%Candidates.set_item_tooltip(index, str(candidate.selection.identity) + " · " + str(candidate.kind) + " · scenario")

func _callers() -> void:
	%Caller.clear()
	var callers: Array = _summary.get("callers", [])
	%Caller.visible = not callers.is_empty()
	%Caller.add_item("Choose calling encounter…")
	for caller: Dictionary in callers:
		var index: int = %Caller.item_count
		%Caller.add_item(str(caller.callerContext).replace("complex-encounter:", "Complex "))
		%Caller.set_item_metadata(index, caller)
		if caller.get("callerContext") == _row.get("selection", {}).get("callerContext"): %Caller.select(index)

func _field(label: String, text: String) -> void:
	%Detail.push_color(Color(theme.PALETTES[theme.mode][4]))
	%Detail.add_text(label + "\n")
	%Detail.pop()
	%Detail.add_text(text + "\n\n")

func show_preview(result: Dictionary) -> void:
	if _model.inspector_tab != "details" or _summary.get("program", false): return
	if _summary.is_empty(): preload("res://src/discovery_preview.gd").record_details(%Detail, result)

func show_candidate(summary: Dictionary) -> void:
	%Detail.clear()
	_field("INSPECTED CANDIDATE", str(summary.title))
	for item: Dictionary in summary.get("details", []): _field(str(item.label), str(item.text))
	_field("Reference remains ambiguous", "Inspection does not choose a resource or change its owning field.")

func target_node() -> String: return _target
