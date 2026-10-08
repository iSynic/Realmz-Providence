extends RefCounted

func dismiss_members(host) -> void:
	var view = host.view
	var original: String = view.model.selected
	var members: Array = view.model.nodes.keys()
	view.graph.members_requested.emit(members)
	await host.process_frame
	assert(view.get_node("%FindResults").visible)
	var click := InputEventMouseButton.new()
	click.button_index = MOUSE_BUTTON_LEFT
	click.pressed = true
	click.position = view.get_node("%Find").get_global_rect().get_center()
	view.push_input(click, true)
	assert(view.get_node("%FindResults").visible, "Clicking the search field keeps results available")
	click.pressed = false
	view.push_input(click, true)
	var activated := [false]
	var fit = view.get_node("%Fit")
	fit.gui_input.connect(func(event):
		if event is InputEventMouseButton and event.pressed: activated[0] = true)
	click.position = fit.get_global_rect().get_center()
	click.pressed = true
	var motion := InputEventMouseMotion.new()
	motion.position = click.position
	view.push_input(motion, true)
	view.push_input(click, true)
	click.pressed = false
	view.push_input(click, true)
	assert(not view.get_node("%FindResults").visible, "Clicking outside dismisses members")
	assert(activated[0], "The outside click still reaches its destination control")
	assert(view.visible and view.model.selected == original, "Dismissal preserves the open flow and selection")
	view.graph.members_requested.emit(members)
	var escape := InputEventKey.new()
	escape.pressed = true
	escape.keycode = KEY_ESCAPE
	view.push_input(escape, true)
	assert(view.visible and not view.get_node("%FindResults").visible, "Escape dismisses members without closing flow")
	view.graph.members_requested.emit(members)
	view.close_view()
	view.present()
	assert(not view.get_node("%FindResults").visible, "Reopening flow does not restore stale members")
	view.graph.members_requested.emit(members)
	await host.process_frame
	var list: ItemList = view.get_node("%List")
	click.position = list.global_position + list.get_item_rect(0).get_center()
	click.pressed = true
	view.push_input(click, true)
	click.pressed = false
	view.push_input(click, true)
	assert(not view.get_node("%FindResults").visible and view.model.selected == members[0], "Clicking a member still selects that exact record")
	view.select_node(original)

func interrupted_refresh(host) -> void:
	var view = host.view
	var previous: Dictionary = view.model.snapshot()
	host.flow._action("refresh")
	var deadline := Time.get_ticks_msec() + 10000
	while host.flow._replacement != null and host.flow._replacement.nodes.is_empty():
		assert(Time.get_ticks_msec() < deadline)
		await host.process_frame
	assert(host.flow._replacement != null and not host.flow._pending.is_empty(), "Interrupt after a real page, before atomic replacement")
	view.close_view()
	await host._settle()
	assert(view.model.nodes == previous.nodes and host.flow._pending.is_empty())
	await host.flow.open(previous.root)
	await host._settle()
	assert(not view.loading and not view.stale and view.model.nodes.size() == 200 and view.model.edges.size() == 199, "Reopen restarts the entire interrupted traversal")
	assert(view.model.revealed == previous.revealed, "Refresh retains disclosed members")

func draft_outcomes(host) -> void:
	for outcome in ["apply", "discard"]:
		await host.shell._navigation.open_script_target("quest", 9, "quest:9", {})
		await host._settle()
		var quest = host.shell._documents.view("scripts.quests")
		quest.find_child("QuestLabel", true, false).text = "Guard test " + outcome
		await host.flow.open({"identity":"quest:9", "scope":"scenario"})
		await host._settle()
		host.view.select_node(host._node("extra-action-point:12"))
		host.flow._action("open-record")
		await host._settle()
		var dialog: ConfirmationDialog = host.shell.get_node("UnappliedChangesDialog")
		assert(dialog.visible and quest.has_unapplied_changes())
		if outcome == "apply": dialog.confirmed.emit()
		else: dialog.custom_action.emit(&"discard")
		await host._settle()
		assert(not dialog.visible and not quest.has_unapplied_changes())
		assert(host.shell._documents.view("scripts.macros").read_state().identity == "extra-action-point:12")
		host.view.close_view()

func revision_during_load(host) -> void:
	await host.shell._navigation.open_script_target("quest", 9, "quest:9", {})
	await host._settle()
	await host.flow.open({"identity":"quest:9", "scope":"scenario"})
	await host._settle()
	var quest = host.shell._documents.view("scripts.quests")
	host.shell._operations.busy = true
	host.flow._action("refresh")
	await host.process_frame
	assert(host.view.loading)
	quest.find_child("QuestLabel", true, false).text = "Revision during flow read"
	host.shell._operations.busy = false
	assert((await quest.commit_selected()).get("ok", false))
	await host._settle()
	assert(host.view.stale and not host.view.loading and host.view.get_node("%Refresh").text == "Refresh")
	await host.flow._action("refresh")
	await host._settle()
	assert(not host.view.stale)
	host.view.close_view()
