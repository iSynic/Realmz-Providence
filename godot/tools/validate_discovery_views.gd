extends SceneTree

var _shell: Control
var _discovery

func _initialize() -> void: call_deferred("_run")

func _run() -> void:
	OS.set_environment("PROVIDENCE_PROJECT_PATH", "")
	_shell = load("res://src/editor_shell.tscn").instantiate()
	root.add_child(_shell)
	await process_frame
	var project := OS.get_environment("PROVIDENCE_DISCOVERY_PROJECT")
	var opened: Dictionary = _shell._bridge.start_demo() if project.is_empty() else _shell._bridge.start_project(project)
	assert(opened.get("ok", false), str(opened))
	await _shell._activate_session(opened)
	_discovery = _shell._commands._discovery
	await _check_search()
	await _check_roles()
	if not project.is_empty(): await _check_link_caption_reset()
	if not project.is_empty():
		await _check_setter_authoring()
		await _check_connected_flow()
		await _check_origin_page()
		await _check_late_filter()
		await _check_late_selection()
		await _check_exact_record_fields()
		await _check_quest_reveal()
		await _check_failed_write()
		await _check_delete_ack_draft()
		await _check_target_step()
	_shell._close_project()
	_shell.queue_free()
	await process_frame
	print("PROVIDENCE_DISCOVERY_VIEWS_OK realAdapter=search-preview stale=reject back=selection-scroll roleState=independent empty=clear connected=condition-quest-setter-return nestedCancel=discard")
	quit()

func _check_search() -> void:
	_discovery.open_search()
	await _settle()
	var view: Window = _discovery._view
	var rows := view.get_node("%Rows") as Tree
	assert(rows.get_root() != null and rows.get_root().get_first_child() != null)
	var item := rows.get_root().get_first_child()
	item.select(0)
	await _settle()
	assert(not view._record.is_empty())
	var identity: String = view._record.identity
	var selected: Dictionary = item.get_metadata(0)
	view.show_links("outgoing")
	await _settle()
	assert(not selected.is_empty(), "Preview navigation must not mutate row metadata")
	view.go_back()
	await _settle()
	assert(view._record.identity == identity and rows.get_selected() != null)
	view.suspend_for_navigation()
	_discovery.open_search()
	await _settle()
	assert(view._record.identity == identity)
	await _discovery.search("no-such-discovery-entry-84620", "scenario", "all", 0)
	assert(rows.get_root().get_child_count() == 0 and view.get_node("%OpenRecord").disabled)
	assert(view._record.is_empty() and not view.get_node("%Detail").get_parsed_text().contains("guards step aside"))
	assert(view.get_node("%SearchUsedBy").text == "Used By" and view.get_node("%SearchUses").text == "Uses")
	_discovery._display_context = {"connected":true, "projectId":"stale", "revision":0}
	assert(not await _discovery._still_current())
	assert(rows.get_root() == null and view.get_node("%OpenSource").disabled)
	view.close_view()

func _check_roles() -> void:
	await _shell._navigation.select_route("scripts.quests")
	await _settle()
	var view: ProvidenceQuestEditor = _shell._documents.view("scripts.quests")
	var state := view.read_navigation_state()
	assert(state.has("checks") and state.has("changes"))
	assert(await view.restore_navigation_state(state))
	await _settle()
	assert(view.current_id() == int(state.id))
	for name in ["Checks", "Changes"]:
		var pane := view.find_child(name, true, false)
		var before: Dictionary = pane.state()
		pane.restore(before)
		await _settle()
		assert(pane.state().query == before.query)
		pane.set_page({"items":[], "total":0})
		assert(pane.find_child("OpenSource", true, false).disabled)

func _settle() -> void:
	var deadline := Time.get_ticks_msec() + 10000
	var idle := 0
	while idle < 20:
		assert(Time.get_ticks_msec() < deadline, "Discovery view did not settle")
		await process_frame
		idle = 0 if _shell._operations.busy else idle + 1

func _check_connected_flow() -> void:
	await _shell._navigation.open_script_source({"source":"complex-encounter:0", "field":"actions[8].settings.testA"})
	await _settle()
	var encounter = _shell._documents.view("encounters.complex")
	var original: Dictionary = encounter.read_state().draft.duplicate(true)
	var location: Dictionary = encounter.read_navigation_state()
	assert(location.result == 1 and location.step == 0 and location.dialog.visible)
	var target_field: Control = encounter._step_dialog._workbench._field_controls.testA.control
	assert(target_field.has_focus(), "The Quest condition focuses its exact picker field")
	await _shell._navigation.open_script_target("quest", 9, "quest:9", {})
	await _settle()
	var quest: ProvidenceQuestEditor = _shell._documents.view("scripts.quests")
	assert(quest.current_id() == 9)
	var checks: Tree = quest.find_child("Checks", true, false).find_child("QuestFlow", true, false)
	assert(checks.get_selected() != null, "The originating condition is highlighted")
	var changes = quest.find_child("Changes", true, false)
	var callers: Tree = changes.find_child("QuestFlow", true, false)
	callers.get_root().get_first_child().select(0)
	changes.open_selected()
	await _settle()
	var setter = _shell._documents.view("scripts.macros")
	assert(setter.read_state().step.selectedSlot == 0)
	await _shell._navigation.navigate_back()
	await _settle()
	assert(quest.current_id() == 9 and callers.get_selected() != null)
	await _shell._navigation.navigate_back()
	await _settle()
	assert(encounter.read_navigation_state().result == 1 and encounter._step_dialog.visible)
	assert(encounter.read_state().draft == original, "Read-only linked navigation preserves the encounter")
	var workbench: ProvidenceActionStepWorkbench = encounter._step_dialog._workbench
	workbench.focus_slot(7)
	await _settle()
	assert(preload("res://tools/divinity_picker_test_actions.gd").choose(workbench, "realmz.action.1"))
	await _settle()
	assert(encounter.has_unapplied_changes(), "An unaccepted nested step participates in draft protection")
	await _shell._navigation.open_script_source({"source":"extra-action-point:12", "field":"actions[0].target"})
	await _settle()
	var confirmation := _shell.get_node("UnappliedChangesDialog") as ConfirmationDialog
	assert(confirmation.visible and encounter._step_dialog.visible and encounter.has_unapplied_changes())
	confirmation.get_cancel_button().pressed.emit()
	await _settle()
	assert(not confirmation.visible and encounter._step_dialog.visible and encounter.has_unapplied_changes(), "Canceling navigation preserves the nested draft")
	encounter._step_dialog.cancel()
	assert(encounter.read_state().draft == original and not encounter.has_unapplied_changes())

func _check_setter_authoring() -> void:
	await _shell._navigation.open_script_source({"source":"extra-action-point:12", "field":"actions[0].target"})
	await _settle()
	var setter = _shell._documents.view("scripts.macros")
	var workbench: ProvidenceActionStepWorkbench = setter._semantic_steps
	var field: Button = workbench._field_controls.targetNativeId.control
	field.pressed.emit()
	await _settle()
	var targets := workbench.get_node("%SemanticTargetResults") as ItemList
	var selected := -1
	for index in targets.item_count:
		if int(targets.get_item_metadata(index).value) == 9: selected = index
	assert(selected >= 0)
	targets.select(selected)
	targets.item_activated.emit(selected)
	await _settle()
	assert(setter.has_unapplied_changes())
	await setter.commit_selected()
	await _settle()
	assert(not setter.has_unapplied_changes())
	await _shell._navigation.open_script_target("quest", 9, "quest:9", {})
	await _settle()
	var quest: ProvidenceQuestEditor = _shell._documents.view("scripts.quests")
	assert(_has_effect(quest._changes._page, "Set"))
	await _shell._execute_history("undo")
	await _settle()
	assert(not _has_effect(quest._changes._page, "Set"))
	await _shell._execute_history("redo")
	await _settle()
	assert(_has_effect(quest._changes._page, "Set"))
	var saved: Dictionary = await _shell._operations.run_workflow(_shell._bridge, "Save discovery fixture", func(operation): return await operation.request("project.save", {}))
	assert(saved.get("ok", false))
	var project := OS.get_environment("PROVIDENCE_DISCOVERY_PROJECT")
	_shell._close_project()
	var reopened: Dictionary = _shell._bridge.start_project(project)
	assert(reopened.get("ok", false))
	await _shell._activate_session(reopened)
	await _shell._navigation.select_route("scripts.quests")
	await _settle()
	quest = _shell._documents.view("scripts.quests")
	assert((await quest.open_id(9)).get("ok", false))
	assert(_has_effect(quest._changes._page, "Set"))
	assert(quest.read_state().noteDraft.contains("courtyard"))

func _has_effect(page: Dictionary, effect: String) -> bool:
	return (page.get("items", []) as Array).any(func(row): return row.effect == effect)

func _check_origin_page() -> void:
	await _shell._navigation.open_script_target("quest", 12, "quest:12", {})
	await _settle()
	var quest: ProvidenceQuestEditor = _shell._documents.view("scripts.quests")
	var opposite: Dictionary = quest._checks.state()
	quest.highlight_reference({"source":"extra-action-point:299", "field":"actions[0].target"})
	await _settle()
	assert(quest._changes._page.offset == 192)
	var item: TreeItem = quest._changes._rows.get_selected()
	assert(item != null and item.get_metadata(0).source == "extra-action-point:299")
	assert(quest._checks.state() == opposite, "Revealing a setter preserves the opposite pane")

func _check_late_filter() -> void:
	var quest: ProvidenceQuestEditor = _shell._documents.view("scripts.quests")
	var pane = quest._changes
	_shell._operations.busy = true
	quest._read_flow("changes", "", 0, "extra-action-point:100|actions[0]")
	await process_frame
	var filter: LineEdit = pane.find_child("RoleFilter", true, false)
	filter.text = "179"
	filter.text_changed.emit(filter.text)
	_shell._operations.busy = false
	await _settle()
	assert(filter.text == "179", "An older origin reply cannot erase a newly typed filter")
	filter.text = ""
	filter.text_changed.emit("")
	await create_timer(0.2).timeout
	await _settle()

func _check_exact_record_fields() -> void:
	for field in ["spells[0]", "items[0]", "deathMacro", "icon"]:
		await _shell._navigation.open_script_source({"source":"monster:0:7", "field":field})
		await _settle()
		var monster = _shell._documents.view("combat.monsters")
		assert(monster.focus_source("monster:0:7", -1, field), "Monster source must reveal and focus " + field)
	for field in ["successCodes[2]", "failureCodes[6]"]:
		await _shell._navigation.open_script_source({"source":"rogue-encounter:0", "field":field})
		await _settle()
		var rogue = _shell._documents.view("encounters.rogue")
		assert(rogue.focus_source("rogue-encounter:0", -1, field))
	for field in ["actionResult", "wordResult", "spellResults[7]", "itemResults[4]", "spellResults"]:
		await _shell._navigation.open_script_source({"source":"complex-encounter:0", "field":field})
		await _settle()
		assert(await _shell._documents.view("encounters.complex").focus_source("complex-encounter:0", -1, field))
	await _shell._navigation.open_script_source({"source":"rogue-encounter:0", "field":"successCodes[2]", "callerContext":"complex-encounter:0"})
	await _settle()
	assert(_shell._documents.view("encounters.rogue").trusted_applied_owner_native_id() == 0)
	assert(not preload("res://src/source_navigation.gd").unavailable_reason({"source":"player-map:0", "field":"partyMarker"}).is_empty())

func _check_late_selection() -> void:
	var quest: ProvidenceQuestEditor = _shell._documents.view("scripts.quests")
	var pane = quest._changes
	_shell._operations.busy = true
	quest._read_flow("changes", "", 0, "extra-action-point:179|actions[0]")
	await process_frame
	var row: TreeItem = pane._rows.get_root().get_first_child().get_next()
	row.select(0)
	var selected: String = row.get_metadata(0).occurrence
	_shell._operations.busy = false
	await _settle()
	assert(pane._rows.get_selected().get_metadata(0).occurrence == selected, "A deferred origin reply cannot replace a deliberate occurrence selection")

func _check_failed_write() -> void:
	await _shell._navigation.open_script_target("quest", 9, "quest:9", {})
	await _settle()
	var quest: ProvidenceQuestEditor = _shell._documents.view("scripts.quests")
	var baseline: String = quest.read_state().labelDraft
	quest.find_child("QuestLabel", true, false).text = "Keep this uncommitted draft"
	var updated: Dictionary = await _shell._operations.run_workflow(_shell._bridge, "Advance fixture revision", func(operation): return await operation.request("quest-label.upsert", {"expectedRevision":_shell._session_view.revision, "questLabel":{"id":13, "label":"Another flag", "note":""}}))
	assert(updated.get("ok", false))
	_shell._session_view.apply(updated.result, false)
	var failed: Dictionary = await quest.commit_selected()
	assert(not failed.get("ok", false) and not failed.get("outcomeUnknown", false))
	assert(quest.has_unapplied_changes() and quest.read_state().labelDraft == "Keep this uncommitted draft")
	quest.discard_draft()
	assert((await quest.open_id(9)).get("ok", false))
	assert(quest.read_state().labelDraft == baseline, "A rejected stale write cannot replace durable metadata")

func _check_delete_ack_draft() -> void:
	var quest: ProvidenceQuestEditor = _shell._documents.view("scripts.quests")
	var submitted := quest.read_state().duplicate(true)
	var response: Dictionary = await _shell._operations.run_workflow(_shell._bridge, "Delete label fixture", func(operation): return await operation.request("quest-label.delete", {"expectedRevision":quest.document_revision(), "id":9}))
	assert(response.get("ok", false))
	quest.find_child("QuestLabel", true, false).text = "Typed while deletion was pending"
	quest.find_child("ContextNotes", true, false).text = "Keep this newer note"
	_shell._session_view.apply(response.result, false)
	quest.accept_deleted(int(response.result.revision), submitted)
	assert(quest.has_unapplied_changes() and quest.read_state().labelDraft == "Typed while deletion was pending")
	assert(quest.read_state().noteDraft == "Keep this newer note")
	quest.discard_draft()
	assert((await quest.open_id(9)).get("ok", false))
	assert(not quest.has_unapplied_changes())
	quest.find_child("QuestLabel", true, false).text = submitted.labelDraft
	quest.find_child("ContextNotes", true, false).text = submitted.noteDraft
	assert((await quest.commit_selected()).get("ok", false))
	await _settle()

func _check_target_step() -> void:
	_discovery._display_context = _discovery._context.call().duplicate(true)
	await _discovery.open_record({"kind":"complex-encounter-result", "identity":"complex-encounter:0:result:1"}, {"originReference":{"codePosition":3}})
	await _settle()
	var encounter = _shell._documents.view("encounters.complex")
	var state: Dictionary = encounter.read_navigation_state()
	assert(state.result == 1 and state.step == 3, "Open Target must retain its result and code position")
	encounter._step_dialog.cancel()

func _check_quest_reveal() -> void:
	await _shell._navigation.open_script_target("quest", 126, "quest:126", {})
	await _settle()
	var quest: ProvidenceQuestEditor = _shell._documents.view("scripts.quests")
	assert((await quest.open_id(126)).get("ok", false))
	await _settle()
	var list := quest.find_child("QuestCollection", true, false) as Tree
	assert(list.get_selected() != null and list.get_scroll().y > 0, "Opening an offscreen Quest must reveal its catalog selection")
	var state := quest.read_navigation_state()
	assert((await quest.open_id(9)).get("ok", false))
	await _settle()
	assert(await quest.restore_navigation_state(state))
	await _settle()
	assert(quest.current_id() == 126 and absf(list.get_scroll().y - float(state.scroll)) < 2, "Back restores the saved catalog viewport")

func _check_link_caption_reset() -> void:
	var origin: Dictionary = await _discovery._read("discovery.preview", {"identity":"extra-action-point:90"})
	_discovery._view.open_links(origin.result.record, "outgoing")
	await _settle()
	assert(_discovery._view.get_node("%Uses").text == "Uses 1")
	var message: Dictionary = await _discovery._read("discovery.preview", {"identity":"message:349"})
	assert(message.result.uses == 0)
	_discovery._view.open_links(message.result.record, "incoming")
	await _settle()
	assert(_discovery._view.get_node("%Uses").text == "Uses", "Changing anchors cannot keep the earlier anchor's opposite-direction count")
	_discovery._view.show_failure("Simulated expired read")
	assert(_discovery._view.get_node("%UsedBy").text == "Used By" and _discovery._view.get_node("%Uses").text == "Uses")
	_discovery._view.close_view()
