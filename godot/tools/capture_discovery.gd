extends SceneTree

var _shell: Control
var _discovery
var _output := ""
var _message: Dictionary = {}

func _initialize() -> void: call_deferred("_run")

func _run() -> void:
	_output = OS.get_environment("PROVIDENCE_DISCOVERY_CAPTURE_ROOT")
	assert(not _output.is_empty())
	root.content_scale_size = DisplayServer.window_get_size()
	root.gui_embed_subwindows = true
	_shell = load("res://src/editor_shell.tscn").instantiate()
	root.add_child(_shell)
	await process_frame
	var opened: Dictionary = _shell._bridge.start_project(OS.get_environment("PROVIDENCE_DISCOVERY_PROJECT"))
	assert(opened.get("ok", false), str(opened))
	await _shell._activate_session(opened)
	_discovery = _shell._commands._discovery
	await _measure_response()
	await _search_states()
	await _link_states()
	await _quest_states()
	_shell._close_project()
	_shell.queue_free()
	await process_frame
	print("PROVIDENCE_DISCOVERY_CAPTURE_OK realProject=true viewport=%s states=19 ambiguity=controlledProjection" % root.content_scale_size)
	quit()

func _search_states() -> void:
	_discovery.open_search()
	await _settle()
	_discovery._view.get_node("%Query").text = "string 349"
	await _discovery.search("string 349", "scenario", "all", 0)
	var rows := _discovery._view.get_node("%Rows") as Tree
	rows.get_root().get_first_child().select(0)
	await _settle()
	_message = _discovery._view._record.duplicate(true)
	await _capture("search-populated")
	_discovery._view.get_node("%Query").text = "courtyard"
	var kinds: OptionButton = _discovery._view.get_node("%Kind")
	for index in kinds.item_count:
		if kinds.get_item_metadata(index) == "quest-flag": kinds.select(index)
	await _discovery.search("courtyard", "scenario", "quest-flag", 0)
	await _capture("search-filtered")
	_discovery._view.get_node("%Query").text = "no-such-record-865463"
	kinds.select(0)
	await _discovery.search("no-such-record-865463", "scenario", "all", 0)
	await _capture("search-empty")
	_shell._operations.busy = true
	_discovery._view.refresh()
	await _capture("search-loading", false)
	_shell._operations.busy = false
	await _settle()
	await _discovery.preview("missing-discovery-record-365485")
	await _capture("search-failure")

func _link_states() -> void:
	_discovery._view.open_links(_message, "incoming")
	await _settle()
	var rows := _discovery._view.get_node("%Rows") as Tree
	rows.get_root().get_first_child().select(0)
	await _capture("links-incoming")
	var response: Dictionary = await _discovery._read("discovery.preview", {"identity":"complex-encounter:0"})
	_discovery._view.open_links(response.result.record, "outgoing")
	await _settle()
	_select_link("resolution", "missing")
	await _capture("links-unresolved")
	response = await _discovery._read("discovery.preview", {"identity":"extra-action-point:12"})
	_discovery._view.open_links(response.result.record, "outgoing")
	await _settle()
	_discovery._view.set_page({"items":[_ambiguous_fixture()], "total":1, "offset":0})
	rows.get_root().get_first_child().select(0)
	await _capture("links-ambiguous")
	response = await _discovery._read("discovery.preview", {"identity":"extra-action-point:90"})
	_discovery._view.open_links(response.result.record, "trace")
	await _settle()
	rows.get_root().get_first_child().select(0)
	await _capture("links-trace")
	_discovery._view.close_view()
	await _shell._navigation.open_script_source({"source":"complex-encounter:0", "field":"actions[8].settings.testA"})
	await _settle()
	_discovery._view.open_links(_message, "incoming")
	await _settle()
	rows.get_root().get_first_child().select(0)
	await _capture("links-nested")
	_discovery._view.close_view()
	var encounter = _shell._documents.view("encounters.complex")
	var workbench: ProvidenceActionStepWorkbench = encounter._step_dialog._workbench
	workbench.focus_slot(7)
	await _settle()
	assert(preload("res://tools/divinity_picker_test_actions.gd").choose(workbench, "realmz.action.1"))
	await _settle()
	await _shell._navigation.open_script_source({"source":"extra-action-point:12", "field":"actions[0].target"})
	await _settle()
	var confirmation := _shell.get_node("UnappliedChangesDialog") as ConfirmationDialog
	assert(confirmation.visible and encounter._step_dialog.visible and encounter.has_unapplied_changes())
	await _capture("links-dirty-navigation")
	confirmation.get_cancel_button().pressed.emit()
	await _settle()
	assert(not confirmation.visible and encounter._step_dialog.visible and encounter.has_unapplied_changes())
	_discovery._view.close_view()
	_shell._documents.view("encounters.complex")._step_dialog.cancel()
	await _shell._navigation.open_script_target("quest", 9, "quest:9", {})
	await _settle()
	var quest: ProvidenceQuestEditor = _shell._documents.view("scripts.quests")
	_discovery._view.open_links(_message, "incoming")
	await _settle()
	quest.find_child("QuestLabel", true, false).text = "Eastern gate opened · amended"
	assert((await quest.commit_selected()).get("ok", false))
	assert(not await _discovery._still_current())
	await _capture("links-stale")
	_discovery._view.close_view()
	await _shell._execute_history("undo")
	await _settle()

func _quest_states() -> void:
	await _shell._navigation.select_route("scripts.quests")
	await _settle()
	var quests: ProvidenceQuestEditor = _shell._documents.view("scripts.quests")
	assert((await quests.open_id(9)).ok)
	await _capture("quest-flow")
	assert((await quests.open_id(10)).ok)
	await _capture("quest-checks-only")
	assert((await quests.open_id(12)).ok)
	quests.highlight_reference({"source":"extra-action-point:179", "field":"actions[0].target"})
	await _capture("quest-setters-only")
	assert((await quests.open_id(126)).ok)
	await _capture("quest-unlabeled")
	assert((await quests.open_id(9)).ok)
	var label := quests.find_child("QuestLabel", true, false) as LineEdit
	var note := quests.find_child("ContextNotes", true, false) as TextEdit
	label.text = "Gatekeeper permission"
	label.text_changed.emit(label.text)
	note.text += "\nDraft note: review the route before applying."
	note.text_changed.emit()
	assert(quests.has_unapplied_changes() and not quests.find_child("ApplyLabel", true, false).disabled)
	await _capture("quest-dirty")
	label.text = ""
	label.text_changed.emit("")
	assert(quests.find_child("ApplyLabel", true, false).disabled and quests.find_child("DisabledReason", true, false).text.contains("Enter a Quest name"))
	await _capture("quest-invalid")
	quests.discard_draft()
	_shell._bridge.stop()
	await quests._read_flow("checks", "", 0)
	await _capture("quest-failure")

func _select_link(key: String, value: String) -> void:
	var rows := _discovery._view.get_node("%Rows") as Tree
	var item := rows.get_root().get_first_child()
	while item != null:
		if str(item.get_metadata(0).get(key, "")) == value:
			item.select(0)
			return
		item = item.get_next()
	assert(false, "The fixture does not contain the requested relationship")

func _ambiguous_fixture() -> Dictionary:
	return {"occurrence":"extra-action-point:12|actions[0].target|sound|36", "source":"extra-action-point:12", "field":"actions[0].target", "sourceLabel":"Extra Action Point 12 · Step 1", "targetKind":"sound", "targetId":"36", "targetIdentity":null, "targetScope":"scenario", "targetLabel":"Sound 36", "meaning":"Uses sound", "resolution":"ambiguous", "activity":"Two scenario-owned resources have this exact key; no Stock resource is substituted.", "rootReason":null}

func _capture(state: String, settle := true) -> void:
	if settle: await _settle()
	else:
		for frame in 3: await process_frame
	await RenderingServer.frame_post_draw
	var file := "%s/%s-%dx%d.png" % [_output, state, root.content_scale_size.x, root.content_scale_size.y]
	assert(root.get_texture().get_image().save_png(file) == OK)

func _settle() -> void:
	var deadline := Time.get_ticks_msec() + 10000
	var idle := 0
	while idle < 20:
		assert(Time.get_ticks_msec() < deadline)
		await process_frame
		idle = 0 if _shell._operations.busy else idle + 1

func _measure_response() -> void:
	_discovery.open_search()
	await _settle()
	var samples: Array[float] = []
	for index in 30:
		var started := Time.get_ticks_usec()
		await _discovery.search("quest", "scenario", "all", 0)
		await RenderingServer.frame_post_draw
		samples.append(float(Time.get_ticks_usec() - started) / 1000.0)
	samples.sort()
	var themes: Array = []
	var quests: ProvidenceQuestEditor = _shell._documents.view("scripts.quests")
	for mode in ["light", "dark", "high-contrast"]:
		for density in ["balanced", "compact"]:
			_discovery._view.apply_theme(mode, density)
			quests.apply_theme(mode, density)
			await RenderingServer.frame_post_draw
			assert(_discovery._view.size.x <= root.content_scale_size.x)
			themes.append({"theme":mode, "density":density, "layout":"bounded", "acceptance":"smoke only"})
	_discovery._view.apply_theme()
	quests.apply_theme()
	_discovery._view.close_view()
	var receipt := {"viewport":root.content_scale_size, "samples":30, "warmRenderedQueryP95Ms":samples[28], "maximumMs":samples.back(), "budgetMs":100, "themes":themes}
	var file := FileAccess.open("%s/response-%dx%d.json" % [_output, root.content_scale_size.x, root.content_scale_size.y], FileAccess.WRITE)
	file.store_string(JSON.stringify(receipt, "\t") + "\n")
	print("PROVIDENCE_DISCOVERY_RESPONSE ", JSON.stringify(receipt))
