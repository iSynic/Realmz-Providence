extends RefCounted

func run(host) -> void:
	var shell = host.shell
	host.view.close_view()
	await shell._navigation.open_script_target("quest", 9, "quest:9", {})
	await host._settle()
	var quest = shell._documents.view("scripts.quests")
	var routes = quest.find_child("ContextRoutes", true, false)
	assert(routes.is_visible_in_tree() and routes.get_node("SF").button_pressed)
	await host._capture("quest-navigation")
	for key in ["AP", "EX", "GM"]:
		assert(not routes.get_node(key).disabled)
		routes.get_node(key).pressed.emit()
		await host._settle()
		var route: String = routes.ROUTES[key]
		assert(shell._documents.identity_for_tab(shell._document_tabs.current_tab) == route, "Quest navigation opens %s" % route)
		var destination = shell._documents.view(route).find_child("ContextRoutes", true, false)
		assert(destination.is_visible_in_tree() and destination.get_node(key).button_pressed)
		if key == "GM": await host._capture("global-navigation")
		destination.get_node("SF").pressed.emit()
		await host._settle()
		assert(shell._documents.identity_for_tab(shell._document_tabs.current_tab) == "scripts.quests", "Each script workbench returns to Story Flags")
	await _dirty_navigation(host, quest, routes)

func _dirty_navigation(host, quest, routes) -> void:
	quest.find_child("QuestLabel", true, false).text = "Unsaved navigation check"
	routes.get_node("AP").pressed.emit()
	await host._settle()
	var dialog: ConfirmationDialog = host.shell.get_node("UnappliedChangesDialog")
	assert(dialog.visible, "Script navigation uses the existing draft guard")
	dialog.get_cancel_button().pressed.emit()
	await host._settle()
	assert(host.shell._documents.identity_for_tab(host.shell._document_tabs.current_tab) == "scripts.quests")
	assert(quest.has_unapplied_changes() and routes.get_node("SF").button_pressed, "Cancel retains the draft and active navigation state")
	quest.discard_draft()
