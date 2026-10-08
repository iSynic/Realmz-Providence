extends SceneTree

var shell: Control
var flow
var view

func _initialize() -> void: call_deferred("_run")

func _run() -> void:
	root.content_scale_size = DisplayServer.window_get_size()
	root.gui_embed_subwindows = true
	OS.set_environment("PROVIDENCE_PROJECT_PATH", "")
	shell = load("res://src/editor_shell.tscn").instantiate()
	root.add_child(shell)
	await process_frame
	var opened: Dictionary = shell._bridge.start_project(OS.get_environment("PROVIDENCE_DISCOVERY_PROJECT"))
	assert(opened.get("ok", false), str(opened))
	await shell._activate_session(opened)
	flow = shell._commands._discovery.flow
	view = flow.view
	await shell._navigation.open_script_source({"source":"extra-action-point:40", "field":"actions[0]"})
	await _settle()
	await shell._commands.dispatch(&"navigate.view-flow")
	await _settle()
	assert(view.visible and view.model.nodes.size() > 1, "Navigate > View Flow opens the selected applied record")
	assert(view.model.root.identity == "extra-action-point:40")
	assert(view.model.edges.size() > 0)
	await _check_connections()
	await _check_keyboard_and_source()
	await _check_history()
	await _capture("populated")
	await _check_missing_and_themes()
	await _check_filters_and_cancellation()
	await _check_draft_guard()
	await _check_stale_and_refresh()
	await _check_retry()
	if OS.get_environment("PROVIDENCE_FLOW_DENSE") == "1": await _check_dense()
	_check_shared_collapse()
	view.close_view()
	await flow.open({"identity":"extra-action-point:40", "scope":"scenario"})
	await _settle()
	shell._close_project()
	await process_frame
	assert(view.stale and view.get_node("%OpenRecord").disabled, "Closing the project invalidates its flow")
	view.close_view()
	shell.queue_free()
	await process_frame
	print("PROVIDENCE_FLOW_NATIVE_OK")
	quit()

func _node(identity: String) -> String:
	for id in view.model.nodes:
		if view.model.nodes[id].selection.identity == identity: return id
	return ""

func _check_connections() -> void:
	var before: Dictionary = flow._context.call().duplicate(true)
	var root_id: String = view.root_id()
	view.select_node(root_id)
	var related: Array = view.model.related()
	assert(related.size() >= 2)
	var parallel: Array = related.filter(func(edge): return edge.reference.targetIdentity == "message:349")
	assert(parallel.size() == 2 and parallel[0].id != parallel[1].id, "Every parallel occurrence is individually selectable")
	view.select_edge(parallel[0].id)
	var first: String = view.get_node("%Detail").get_parsed_text()
	view.select_edge(parallel[1].id)
	assert(first != view.get_node("%Detail").get_parsed_text(), "Parallel steps show distinct owning fields")
	view.select_node(root_id)
	view.get_node("%NextEdge").pressed.emit()
	assert(not view.model.edge.is_empty())
	var occurrence: Dictionary = view.model.edges[view.model.edge]
	assert(view.get_node("%Detail").get_parsed_text().contains(occurrence.reference.meaning))
	assert(not occurrence.reference.field.is_empty())
	view.get_node("%NextEdge").pressed.emit()
	assert(view.model.edge != occurrence.id)
	await _settle()
	assert(before == flow._context.call(), "Flow inspection does not mutate the project")

func _check_keyboard_and_source() -> void:
	var root_id: String = view.root_id()
	view.graph.cards[root_id].grab_focus()
	await _settle()
	var key := InputEventKey.new()
	key.pressed = true
	key.keycode = KEY_LEFT
	view.graph.cards[root_id].gui_input.emit(key)
	await _settle()
	assert(view.model.selected != root_id, "Arrow keys select a nearby record")
	var edge_id := ""
	for edge: Dictionary in view.model.edges.values():
		if edge.reference.source == "extra-action-point:40" and edge.reference.field.begins_with("actions[1]"): edge_id = edge.id
	assert(not edge_id.is_empty())
	view.select_edge(edge_id)
	view.get_node("%OpenSource").grab_focus()
	await flow._action("open-source")
	await _settle()
	var macro = shell._documents.view("scripts.macros")
	assert(macro.read_state().identity == "extra-action-point:40" and macro.read_state().step.selectedSlot == 1)
	await shell._commands.dispatch(&"navigate.view-flow")
	await _settle()
	assert(view.visible and view.model.edge == edge_id)

func _check_missing_and_themes() -> void:
	var missing := ""
	for edge: Dictionary in view.model.edges.values():
		if edge.reference.resolution == "missing": missing = edge.id
	assert(not missing.is_empty())
	view.select_edge(missing)
	assert(view.get_node("%OpenRecord").disabled and not view.get_node("%OpenSource").disabled)
	assert(view.get_node("%Detail").get_parsed_text().contains("Missing"))
	if root.size.x == 1600:
		await _capture("missing")
		for pair in [["light", "compact"], ["high-contrast", "balanced"]]:
			view.apply_theme(pair[0], pair[1])
			view.render(true)
			await _capture(pair[0])
		view.apply_theme()
	view.select_node(view.root_id())

func _check_retry() -> void:
	await flow.open({"identity":"extra-action-point:40", "scope":"scenario"})
	await _settle()
	var before: Dictionary = view.model.nodes.duplicate(true)
	flow._pending = {"root":view.model.root.duplicate(), "direction":"both", "depth":2, "categories":view.model.categories.duplicate(), "group":"initial", "origin":"", "cursor":"expired-native-test"}
	await flow._load()
	assert(view.get_node("%Retry").visible and view.model.nodes == before, "Failed continuation preserves completed branches")
	if root.size.x == 1600: await _capture("retry")
	await flow._action("retry")
	await _settle()
	assert(not view.get_node("%Retry").visible and view.model.nodes == before)
	view.close_view()

func _check_dense() -> void:
	var started := Time.get_ticks_usec()
	await flow.open({"identity":"quest:12", "scope":"scenario"})
	var elapsed := float(Time.get_ticks_usec() - started) / 1000
	await _settle()
	assert(view.model.nodes.size() == 200 and view.model.edges.size() <= 600 and view.model.limited)
	assert(view.get_node("%Status").text.contains("limit"))
	print("FLOW_DENSE_NATIVE_MS ", elapsed)
	if root.size.x == 1600: await _capture("dense")
	await _measure_selection()
	view.select_node(view.model.nodes.keys()[1])
	await flow._action("focus")
	await _settle()
	assert(view.model.nodes.size() <= 200)
	view.close_view()

func _measure_selection() -> void:
	for pass_index in 2:
		var timings: Array[float] = []
		for id: String in view.model.nodes.keys().slice(0, 20):
			var started := Time.get_ticks_usec()
			view.select_node(id)
			while shell._operations.busy: await process_frame
			await process_frame
			timings.append(float(Time.get_ticks_usec() - started) / 1000)
		timings.sort()
		print("FLOW_DENSE_%s_SELECTION_P95_MS " % ("COLD" if pass_index == 0 else "WARM"), timings[18])
		if pass_index == 1: assert(timings[18] < 100, "Warm rendered selection budget exceeded")

func _check_history() -> void:
	var id := _node("extra-action-point:12")
	assert(not id.is_empty())
	view.select_node(id)
	await flow._action("upstream")
	await _settle()
	assert(view.model.can_collapse(id))
	view.graph.cards[id].position_offset += Vector2(13, 19)
	view.graph.zoom = 0.85
	view.graph.scroll_offset = Vector2(24, 35)
	view.graph.save_positions()
	var before: Dictionary = view.model.snapshot()
	await flow._action("focus")
	await _settle()
	assert(view.model.root.identity == "extra-action-point:12")
	await flow._action("back")
	await _settle()
	assert(view.model.root == before.root and view.model.positions == before.positions)
	assert(view.model.selected == before.selected and view.model.groups == before.groups)
	assert(is_equal_approx(view.graph.zoom, before.viewport.zoom) and view.graph.scroll_offset.is_equal_approx(before.viewport.scroll))
	await flow._action("collapse")
	assert(not view.model.can_collapse(id) and view.model.nodes.has(id))
	view.graph.fit_content()
	view.select_node(view.root_id())
	view.get_node("%NextEdge").pressed.emit()

func _check_filters_and_cancellation() -> void:
	view.get_node("%Calls").set_pressed_no_signal(false)
	view.get_node("%State").set_pressed_no_signal(false)
	await flow._action("filters")
	await _settle()
	for edge: Dictionary in view.model.edges.values(): assert(edge.relationship in ["reference", "eligibility"])
	view.get_node("%Calls").set_pressed_no_signal(true)
	view.get_node("%State").set_pressed_no_signal(true)
	await flow._action("filters")
	await _settle()
	shell._operations.busy = true
	flow.open({"identity":"quest:9", "scope":"scenario"})
	await process_frame
	view.close_view()
	shell._operations.busy = false
	await _settle()
	assert(not view.visible and view.model.nodes.is_empty(), "Closing rejects queued flow results")
	await flow.open({"identity":"extra-action-point:40", "scope":"scenario"})
	await _settle()
	assert(view.model.nodes.size() > 1)
	view.close_view()

func _check_draft_guard() -> void:
	await shell._navigation.open_script_target("quest", 9, "quest:9", {})
	await _settle()
	var quest = shell._documents.view("scripts.quests")
	quest.find_child("QuestLabel", true, false).text = "An unapplied author draft"
	assert(quest.has_unapplied_changes())
	quest.find_child("ViewFlow", true, false).pressed.emit()
	await _settle()
	assert(view.visible and view.model.root.identity == "quest:9")
	assert(quest.has_unapplied_changes())
	view.select_node(_node("extra-action-point:12"))
	flow._action("open-record")
	await _settle()
	var dialog := shell.get_node("UnappliedChangesDialog") as ConfirmationDialog
	assert(dialog.visible and not view.visible)
	dialog.get_cancel_button().pressed.emit()
	await _settle()
	assert(view.visible and quest.has_unapplied_changes(), "Cancel restores flow and preserves draft")
	assert(quest.find_child("QuestLabel", true, false).text == "An unapplied author draft")
	quest.discard_draft()
	await _settle()
	await flow._action("open-record")
	await _settle()
	assert(not view.visible and view.suspended)
	assert(shell._documents.view("scripts.macros").read_state().identity == "extra-action-point:12")
	await shell._commands.dispatch(&"navigate.view-flow")
	await _settle()
	assert(view.visible and view.model.root.identity == "quest:9", "Returning restores exploration")
	view.close_view()

func _check_stale_and_refresh() -> void:
	await shell._navigation.open_script_target("quest", 9, "quest:9", {})
	await _settle()
	var quest = shell._documents.view("scripts.quests")
	await flow.open({"identity":"quest:9", "scope":"scenario"})
	await _settle()
	quest.find_child("QuestLabel", true, false).text = "Updated applied quest label"
	assert((await quest.commit_selected()).get("ok", false))
	await _settle()
	assert(view.stale and view.get_node("%Upstream").disabled and view.get_node("%OpenRecord").disabled)
	await _capture("stale")
	await flow._action("refresh")
	await _settle()
	assert(not view.stale and view.model.nodes[view.root_id()].label == "Updated applied quest label")
	if root.size.x == 1600:
		quest.find_child("QuestLabel", true, false).text = "Eastern gate opened after returning the captain's seal, speaking to the sentry, and clearing the abandoned watchtower"
		assert((await quest.commit_selected()).get("ok", false))
		await flow._action("refresh")
		await _settle()
		await _capture("long-label")
	view.close_view()

func _check_shared_collapse() -> void:
	var state = preload("res://src/discovery_flow_state.gd").new()
	state.nodes = {"a":{}, "b":{}, "c":{}, "d":{}, "shared":{}}
	state.groups = {
		"initial":{"nodes":{"a":true}, "edges":{}, "origin":""},
		"left":{"nodes":{"a":true,"b":true,"shared":true}, "edges":{}, "origin":"a"},
		"child":{"nodes":{"b":true,"c":true}, "edges":{}, "origin":"b"},
		"right":{"nodes":{"a":true,"d":true,"shared":true}, "edges":{}, "origin":"shared"}}
	state.collapse("b")
	assert(state.nodes.has("shared") and not state.nodes.has("c"))
	state.collapse("a")
	assert(state.nodes.keys() == ["a"], "A descendant cannot retain its own vanished root")

func _settle() -> void:
	var deadline := Time.get_ticks_msec() + 15000
	var idle := 0
	while idle < 12:
		assert(Time.get_ticks_msec() < deadline, "Flow did not settle")
		await process_frame
		idle = 0 if shell._operations.busy or (view != null and view.visible and view.loading) else idle + 1

func _capture(label: String) -> void:
	var output := OS.get_environment("PROVIDENCE_FLOW_CAPTURE_ROOT")
	if output.is_empty(): return
	await process_frame
	await RenderingServer.frame_post_draw
	var image := root.get_texture().get_image()
	var path := output.path_join("%s-%dx%d.png" % [label, root.size.x, root.size.y])
	assert(image.save_png(path) == OK)
