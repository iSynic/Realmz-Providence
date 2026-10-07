extends RefCounted


static func run(shell, settle: Callable, check: Callable) -> void:
	var controller = shell._issues
	var view = controller.workbench
	view.state.set_filters("extra-action-point:31000", "error")
	await settle.call()
	check.call(view.state.selected_finding().get("field") == "actions[5].target", "Async navigation fixture lost its remaining source")
	var original_revision: int = shell._session_view.revision
	shell._bridge.hold_validation = true
	(view.get_node("%OpenFinding") as Button).pressed.emit()
	for _frame in 8:
		await shell.get_tree().process_frame
	check.call(controller.is_selected() and view.state.has_pending_refresh(), "Source opened before its check finished")
	for _frame in 60:
		if not shell._bridge.operation_busy(): break
		await shell.get_tree().process_frame
	check.call(not shell._bridge.operation_busy(), "An unrelated editor operation did not settle during validation")
	var describe: Dictionary = shell._bridge.request("session.describe")
	check.call(bool(describe.get("ok", false)), "The request stream was unavailable during validation")
	var search: LineEdit = view.get_node("%SearchProblems")
	search.grab_focus()
	search.text = "unsubmitted query"
	search.text_changed.emit(search.text)
	shell._bridge.hold_validation = false
	await settle.call()
	check.call(controller.is_selected() and search.has_focus() and search.text == "unsubmitted query", "A late source check stole a newer query's focus or draft")
	shell._bridge.hold_validation = true
	(view.get_node("%OpenFinding") as Button).pressed.emit()
	view.state.set_filters("no matching source", "error")
	shell._bridge.hold_validation = false
	await settle.call()
	check.call(controller.is_selected() and view.state.status == "no-matches", "An obsolete source check reopened after the filter changed")
	view.state.set_filters("extra-action-point:31000", "error")
	await settle.call()
	shell._bridge.hold_validation = true
	(view.get_node("%OpenFinding") as Button).pressed.emit()
	await shell._navigation.select_tab(4)
	shell._bridge.hold_validation = false
	await settle.call()
	check.call(shell._document_tabs.current_tab == 4 and not view.state.has_pending_refresh(), "A late source check crossed navigation to another document")
	controller.request_show()
	await settle.call()
	(view.get_node("%OpenFinding") as Button).pressed.emit()
	await settle.call()
	check.call(shell._document_tabs.current_tab == 3 and shell._documents.view("scripts.macros")._semantic_steps._selected_slot == 5, "Completed source revalidation did not open the exact action")
	check.call(shell._session_view.revision == original_revision, "Read-only validation or navigation changed the scenario")
	controller.request_show()
	await settle.call()
