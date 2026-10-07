extends RefCounted

const Fixture=preload("res://tools/action_settings_repair_fixture.gd")

func run(shell, work: String, capture: Callable, idle: Callable) -> void:
	await idle.call();shell._close_project()
	var fixture=Fixture.new()
	if not fixture.create(shell._bridge,work.path_join("recovery"),3): push_error(fixture.error); return
	await shell._activate_session(shell._bridge.request("session.describe"));await idle.call()
	shell._issues.request_show();await idle.call()
	var view=shell._issues.workbench
	view.state.open_category("action-settings");view.state.set_filters("extra-action-point:158","error");await idle.call()
	view.get_node("%OpenFinding").pressed.emit();await idle.call()
	var dialog=shell._issues.repair
	assert(dialog.visible)
	await capture.call("invalid","Real missing opcode-92 companion row; core-derived repair draft and allocation preview.")
	for entry in [["bound0","9"],["bound1","18"],["bound2","13"],["bound3","24"]]: await dialog.change_field(entry[0],entry[1])
	assert(dialog.view.canApply)
	dialog.request_cancel();await capture.call("dirty-guard","Real dirty repair guard; Keep Editing preserves local values without a mutation.")
	dialog._discard.get_cancel_button().pressed.emit()
	shell._bridge.fault="lost-before";await dialog.apply_repair();await idle.call()
	assert(dialog.phase=="unknown" and shell._bridge.repair_attempts==1)
	await capture.call("uncertain","Controlled lost acknowledgement before mutation; complete draft retained and no automatic retry.")
	await dialog.check_status();await capture.call("confirmed-not-applied","Nonmutating reconciliation confirms no write; explicit comparison precedes a new Apply.")
	await dialog.compare_current();await dialog.review_draft();await dialog.apply_repair();await idle.call()
	assert(not dialog.visible and shell._bridge.repair_attempts==2 and view.state.status=="no-matches")
	await capture.call("repaired","Explicit reviewed Apply committed once; current findings refreshed; project remains Unsaved.")
	await shell._undo();await idle.call();assert(not view.state.selected_finding().is_empty())
	await capture.call("undo","Real undo restores the original finding and missing companion settings.")
	await shell._redo();await idle.call();assert(view.state.status=="no-matches")
	await capture.call("redo","Real redo removes the repaired finding again without replaying Apply.")
