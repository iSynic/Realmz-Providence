extends RefCounted

func run(host) -> void:
	await _main(host)
	await _range(host)
	await _callers(host)
	await _ambiguity(host)
	await preload("res://tools/discovery_flow_lifetime_checks.gd").new().draft_outcomes(host)
	await preload("res://tools/discovery_flow_lifetime_checks.gd").new().revision_during_load(host)
	host.view.close_view()

func _main(host) -> void:
	var flow = host.flow
	var view = host.view
	await flow.open({"identity":"extra-action-point:12", "scope":"scenario"})
	view.get_node("%Depth").select(view.DEPTHS.find(4))
	await flow._action("query")
	await host._settle()
	assert(view.graph.grouping.groups.values().any(func(group): return group.row.kind == "cycle-group"), "The loaded call cycle is grouped")
	assert(view.graph.grouping.groups.values().any(func(group): return group.row.kind == "simple-encounter"), "Encounter results remain grouped")
	view.select_node(view.root_id())
	view.select_step(0)
	await _step_keyboard(host)
	assert(view.graph.cards[host._node("quest:9")].related, "Selecting a state-changing step emphasizes its exact target card")
	view.graph.fit_content()
	await host._settle()
	for card in view.graph.cards.values():
		var bounds := Rect2(card.position_offset * view.graph.zoom - view.graph.scroll_offset, card.size * view.graph.zoom)
		# The headless dummy display clamps subwindows to 1280x720; rendered runs own visual bounds.
		if DisplayServer.get_name() != "headless":
			assert(bounds.position.x >= 0 and bounds.position.y >= 0 and bounds.end.x <= view.graph.size.x and bounds.end.y <= view.graph.size.y, "The primary fixture must fit: %s in %s at zoom %s" % [bounds, view.graph.size, view.graph.zoom])
	await host._capture("v2-main")
	view._symbols()
	assert(view.get_node("%Helper").visible)
	await host._capture("v2-key")
	view._dismiss_helper()
	view._queue_helper(view.root_id(), Vector2(450, 340), true)
	assert(view.get_node("%Text").text.contains("F1"))
	var pinned: String = view.get_node("%Text").text
	view._queue_helper(host._node("extra-action-point:40"), Vector2.ZERO, false)
	assert(view.get_node("%Text").text == pinned and view._helper_pinned, "Passive hover cannot overwrite pinned help")
	await host._capture("v2-helper")
	view._dismiss_helper()
	var cycle: Dictionary = view.graph.grouping.groups.values().filter(func(group): return group.row.kind == "cycle-group")[0]
	var member: String = cycle.members[0]
	view.reveal_node(member)
	assert(view.graph.cards.has(member), "Disclosure reveals an exact loaded member")
	assert(view.get_node("%Status").text.contains("%d grouped" % view.graph.grouped_count()))
	view.graph.disclose(member)
	assert(not view.graph.cards.has(member), "Collapse returns a member to its group")
	assert(view.get_node("%Status").text.contains("%d grouped" % view.graph.grouped_count()))
	await _conditional_fields(host)
	_helper_excerpt(host)
	view.close_view()

func _step_keyboard(host) -> void:
	var view = host.view
	var button = view.inspector.get_node("%Steps").get_child(0)
	button.grab_focus()
	button.pressed.emit()
	await host._settle()
	var focused = view.gui_get_focus_owner()
	assert(is_instance_valid(focused) and focused.get_meta("step_slot", -1) == 0, "Step selection retains keyboard focus")
	var event := InputEventKey.new()
	event.keycode = KEY_F1
	event.pressed = true
	focused.gui_input.emit(event)
	assert(view.get_node("%Helper").visible and view._helper_pinned, "F1 remains available after selecting the step")
	assert(focused.find_next_valid_focus() != null, "Tab has a valid destination after selecting the step")
	view._dismiss_helper()
	view.get_node("%Close").grab_focus()

func _conditional_fields(host) -> void:
	var view = host.view
	var owner: String = host._node("complex-encounter:0:result:1")
	view.reveal_node(owner)
	view.select_step(8)
	assert(view.model.summaries[owner].cardText.contains("Quest 9"))
	var check: Dictionary = view.model.selected_step_edges().filter(func(edge): return edge.relationship == "state-check")[0]
	var fields = view.inspector.get_node("%StepFields")
	assert(fields.get_child_count() >= 2, "Condition and branch are directly selectable fields")
	for button in fields.get_children():
		if button.get_meta("flow_field") == check.id: button.pressed.emit(); break
	assert(view.model.source_reference().source == "complex-encounter:0")
	assert(view.model.source_reference().field == check.reference.field and view.model.step == 8)
	assert(view.inspector.get_node("%OpenSource").text == "Open condition…")
	await host._capture("v2-condition")
	await host.flow._action("open-source")
	await host._settle()
	var destination: Dictionary = host.shell._documents.view("encounters.complex").read_navigation_state()
	assert(destination.result == 1 and destination.step == 0, "Open condition edits its actual Result 2 Step 1 owner")
	assert(destination.flowSelection.identity == "complex-encounter:0:result:1")
	await host.flow.open(view.model.root)
	await host._settle()
	view.reveal_node(owner)
	view.select_step(8)
	view.select_step_field(check.id)
	view.inspector._tab("details")
	var ids: Array = view.model.edges.keys().slice(0, 2)
	view.select_occurrences(ids)
	assert(view.model.source_reference().is_empty() and view.inspector.get_node("%OpenSource").disabled, "A new parallel chooser cannot reuse the old owning field")

func _helper_excerpt(host) -> void:
	var view = host.view
	var id: String = host._node("message:349")
	var retained: Dictionary = view.model.summaries[id].duplicate(true)
	view.model.summaries[id].excerpt = "Long text ".repeat(60)
	view._queue_helper(id, Vector2(400, 300), true)
	assert(view.get_node("%Text").text.contains("Text excerpt:") and view.get_node("%Text").text.contains("…"))
	view._dismiss_helper()
	view.model.summaries[id] = retained

func _range(host) -> void:
	var selection := {"identity":"simple-encounter:1:result:0", "scope":"scenario", "entryPosition":2, "throughPosition":5}
	await host.flow.open(selection)
	await host._settle()
	var view = host.view
	assert(view.model.same_selection(selection, view.model.root))
	var summary: Dictionary = view.model.summaries[view.root_id()]
	assert(summary.steps.size() == 8 and not summary.steps[0].inRange and summary.steps[2].inRange)
	assert(summary.steps[4].status == "unknown" and summary.steps[3].status == "known")
	view.select_step(3)
	assert(view.inspector.get_node("%Steps").get_child_count() == 1, "Selected meaning takes priority over surrounding slots")
	view.inspector.get_node("%ShowAllSteps").pressed.emit()
	assert(view.model.steps_expanded and view.inspector.get_node("%Steps").get_child_count() > 1)
	assert(view.inspector.get_node("%Steps").get_children().any(func(row): return row.get_meta("step_slot", -1) == 4), "All-slot disclosure retains original positions")
	view.inspector.get_node("%ShowAllSteps").pressed.emit()
	assert(not view.inspector.get_node("%OpenSource").disabled, "A step without a relationship retains source navigation")
	assert(view.model.source_reference().field == "actions[3].targetNativeId")
	await host._capture("v2-range")
	await host.flow._action("open-source")
	await host._settle()
	assert(not view.visible, "Open step navigates through the ordinary editor")
	var destination: Dictionary = host.shell._documents.view("encounters.simple").read_navigation_state()
	assert(view.model.same_selection(destination.flowSelection, selection), "The destination editor receives the complete entry range")
	await host.shell._commands.dispatch(&"navigate.view-flow")
	await host._settle()
	assert(view.visible and view.model.same_selection(selection, view.model.root), "Returning retains the complete result range")
	view.select_step(4)
	assert(view.inspector.get_node("%Detail").get_parsed_text().contains("no effect is inferred"))
	assert(not summary.steps[4].summary.contains("Returns"))
	await host._capture("v2-unknown")
	view.close_view()

func _callers(host) -> void:
	var view = host.view
	await host.flow.open({"identity":"rogue-encounter:1", "scope":"scenario"})
	await host._settle()
	assert(view.inspector.get_node("%Caller").item_count == 3, "Two exact calling encounters remain independently selectable")
	view.inspector.get_node("%Caller").item_selected.emit(1)
	await host._settle()
	assert(view.model.root.callerContext == "complex-encounter:4")
	assert(view.model.edges.values().filter(func(edge): return edge.reference.source == "rogue-encounter:1").all(func(edge): return edge.reference.callerContext == "complex-encounter:4"))
	await host._capture("v2-caller")
	view.inspector.get_node("%Caller").item_selected.emit(2)
	await host._settle()
	assert(view.model.root.callerContext == "complex-encounter:5")
	await host.flow._action("back")
	await host._settle()
	assert(view.model.root.callerContext == "complex-encounter:4")
	view.select_node(view.root_id())
	await host.flow._action("open-record")
	await host._settle()
	assert(host.shell._documents.view("encounters.rogue").read_navigation_state().owner == 4, "Open record carries the selected caller into the Rogue workbench")
	view.close_view()

func _ambiguity(host) -> void:
	var view = host.view
	await host.flow.open({"identity":"extra-action-point:405", "scope":"scenario"})
	await host._settle()
	var links: Array = view.model.edges.values().filter(func(edge): return edge.reference.resolution == "ambiguous")
	assert(links.size() == 1)
	view.select_edge(links[0].id)
	view.inspector.get_node("%InspectTarget").pressed.emit()
	await host._settle()
	assert(view.inspector.get_node("%Candidates").item_count == 2)
	assert(not view.inspector.get_node("%OpenSource").disabled and view.inspector.get_node("%OpenRecord").disabled)
	view.inspector.get_node("%Candidates").select(0)
	view.inspector.get_node("%Candidates").item_selected.emit(0)
	await host._settle()
	assert(view.inspector.get_node("%Detail").get_parsed_text().contains("INSPECTED CANDIDATE"))
	assert(not view.inspector.get_node("%OpenSource").disabled, "Candidate inspection retains the owning repair field without choosing a resource")
	await host._capture("v2-ambiguity")
	await host.flow._action("open-source")
	await host._settle()
	assert(host.shell._documents.view("scripts.macros").read_state().step.selectedSlot == 1)
	view.close_view()
