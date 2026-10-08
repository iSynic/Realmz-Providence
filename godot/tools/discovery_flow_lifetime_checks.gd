extends RefCounted

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
