extends SceneTree

const ROUTES := ["encounters.simple", "encounters.complex", "encounters.rogue", "encounters.timed"]

var _shell


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	OS.set_environment("PROVIDENCE_PROJECT_PATH", "")
	_shell = load("res://src/editor_shell.tscn").instantiate()
	_shell._bridge = preload("res://tools/validate_assets_corpus.gd").CorpusBridge.new("user://encounter-route-navigation-unused.cfg")
	root.add_child(_shell)
	await process_frame
	await _prepare_session()
	var tabs: ProvidenceEncounterRouteTabs = _shell.get_node("%EncounterRouteTabs")
	assert(not tabs.visible)
	_verify_hidden_bar_layout(tabs)
	for viewport in [Vector2i(1920, 1080), Vector2i(1600, 900)]:
		root.size = viewport
		root.content_scale_size = viewport
		await _shell._navigation.select_route("encounters.simple")
		await _wait_for_route("encounters.simple")
		_verify_bar(tabs, "encounters.simple", viewport)
		for route in ROUTES.slice(1) + ["encounters.simple"]:
			tabs.button_for(route).pressed.emit()
			await _wait_for_route(route)
			_verify_bar(tabs, route, viewport)
		await _shell._navigation.navigate_back()
		await _wait_for_route("encounters.timed")
		await _shell._navigation.navigate_forward()
		await _wait_for_route("encounters.simple")
	await _verify_history_record_selection()
	await _verify_draft_guards(tabs)
	await _shell._navigation.select_route("scripts.action-points")
	await _wait_for_route("scripts.action-points")
	assert(not tabs.visible)
	_verify_hidden_bar_layout(tabs)
	_shell.free()
	_shell = null
	for frame in 3: await process_frame
	print("PROVIDENCE_ENCOUNTER_ROUTE_NAVIGATION_OK routes=4 viewports=2 history=back-forward-exact-record draft-guard=both-routes-all-outcomes")
	quit(0)


func _verify_bar(tabs: ProvidenceEncounterRouteTabs, route: String, viewport: Vector2i) -> void:
	assert(tabs.visible and tabs.active_route() == route)
	assert(not _shell._domain_sidebar.visible and not _shell.get_node("%InspectorHost").visible)
	assert(tabs.get_global_rect().end.x <= viewport.x and tabs.get_global_rect().end.y <= viewport.y)
	for identity in ROUTES:
		var button := tabs.button_for(identity)
		assert(button != null and button.focus_mode != Control.FOCUS_NONE)
		assert(button.button_pressed == (identity == route))
		assert(tabs.get_global_rect().encloses(button.get_global_rect()))


func _verify_hidden_bar_layout(_tabs: ProvidenceEncounterRouteTabs) -> void:
	var host: Control = _shell.get_node("%DocumentHost")
	var workspace: Control = _shell.get_node("%DocumentWorkspace")
	assert(absf(workspace.global_position.y - host.global_position.y) < 1.0)


func _verify_history_record_selection() -> void:
	_shell._navigation.clear_history()
	await _shell._navigation.select_route("encounters.simple")
	var simple: ProvidenceSimpleEncounterEditor = _shell._documents.view("encounters.simple")
	var simple_result := _simple_document()
	simple_result.encounter.identity = "simple-encounter:7"
	simple_result.encounter.nativeId = 7
	simple.set_document(simple_result)
	simple._selected_result = 2
	simple._selected_step = 5
	await _shell._navigation.select_route("encounters.complex")
	var complex: ProvidenceComplexEncounterEditor = _shell._documents.view("encounters.complex")
	var complex_result := _complex_document()
	complex_result.encounter.identity = "complex-encounter:9"
	complex_result.encounter.nativeId = 9
	complex.set_document(complex_result)
	complex._selected_result = 3
	complex._selected_step = 6
	await _shell._navigation.select_route("encounters.rogue")
	await _shell._navigation.navigate_back()
	await _wait_for_route("encounters.complex")
	assert(complex.read_state().identity == "complex-encounter:9")
	assert(complex.read_state().result == 3 and complex.read_state().step == 6)
	await _shell._navigation.navigate_back()
	await _wait_for_route("encounters.simple")
	assert(simple.read_state().identity == "simple-encounter:7")
	assert(simple.read_state().result == 2 and simple.read_state().step == 5)
	await _shell._navigation.navigate_forward()
	await _wait_for_route("encounters.complex")
	assert(complex.read_state().identity == "complex-encounter:9")


func _verify_draft_guards(tabs: ProvidenceEncounterRouteTabs) -> void:
	var shell_error := Callable(_shell, "_show_error")
	if _shell._draft_navigation.failed.is_connected(shell_error):
		_shell._draft_navigation.failed.disconnect(shell_error)
	await _verify_simple_draft_guard(tabs)
	await _verify_complex_draft_guard(tabs)


func _verify_simple_draft_guard(tabs: ProvidenceEncounterRouteTabs) -> void:
	await _shell._navigation.select_route("encounters.simple")
	var simple: ProvidenceSimpleEncounterEditor = _shell._documents.view("encounters.simple")
	simple.set_document(_simple_document())
	var response := (simple._response_controls[0] as Dictionary).text as TextEdit
	response.text = "Changed response"
	response.text_changed.emit()
	assert(simple.has_unapplied_changes())
	tabs.button_for("encounters.complex").pressed.emit()
	await _wait_for_dialog()
	assert(_current_route() == "encounters.simple")
	_shell._unapplied_dialog.canceled.emit()
	_shell._unapplied_dialog.hide()
	assert(_current_route() == "encounters.simple" and simple.has_unapplied_changes())
	tabs.button_for("encounters.complex").pressed.emit()
	await _wait_for_dialog()
	await _shell._draft_navigation.discard_and_continue(&"discard")
	await _wait_for_route("encounters.complex")
	assert(not simple.has_unapplied_changes())
	await _shell._navigation.select_route("encounters.simple")
	simple.set_document(_simple_document())
	response = (simple._response_controls[0] as Dictionary).text as TextEdit
	response.text = "Apply this response"
	response.text_changed.emit()
	simple.commit_handler = func(_draft): _shell._draft_apply.accept({"ok": false, "error": "Controlled rejection"})
	tabs.button_for("encounters.complex").pressed.emit()
	await _wait_for_dialog()
	await _shell._draft_navigation.apply_and_continue()
	assert(_shell._unapplied_dialog.visible and _current_route() == "encounters.simple" and simple.has_unapplied_changes())
	simple.commit_handler = func(draft):
		simple.accept_saved_document(draft)
		_shell._draft_apply.accept({"ok": true})
	await _shell._draft_navigation.apply_and_continue()
	await _wait_for_route("encounters.complex")
	assert(not simple.has_unapplied_changes())


func _verify_complex_draft_guard(tabs: ProvidenceEncounterRouteTabs) -> void:
	var complex: ProvidenceComplexEncounterEditor = _shell._documents.view("encounters.complex")
	complex.set_document(_complex_document())
	complex._typed.text = "changed"
	complex._typed.text_changed.emit(complex._typed.text)
	assert(complex.has_unapplied_changes())
	tabs.button_for("encounters.timed").pressed.emit()
	await _wait_for_dialog()
	_shell._unapplied_dialog.canceled.emit()
	_shell._unapplied_dialog.hide()
	for frame in 3: await process_frame
	assert(_current_route() == "encounters.complex" and complex.has_unapplied_changes())
	tabs.button_for("encounters.timed").pressed.emit()
	await _wait_for_dialog()
	await _shell._draft_navigation.discard_and_continue(&"discard")
	await _wait_for_route("encounters.timed")
	assert(not complex.has_unapplied_changes())
	await _shell._navigation.select_route("encounters.complex")
	complex.set_document(_complex_document())
	complex._typed.text = "apply this change"
	complex._typed.text_changed.emit(complex._typed.text)
	complex.commit_handler = func(_draft): _shell._draft_apply.accept({"ok": false, "error": "Controlled rejection"})
	tabs.button_for("encounters.timed").pressed.emit()
	await _wait_for_dialog()
	await _shell._draft_navigation.apply_and_continue()
	assert(_shell._unapplied_dialog.visible and _current_route() == "encounters.complex" and complex.has_unapplied_changes())
	complex.commit_handler = func(draft):
		complex.accept_saved_document(draft)
		_shell._draft_apply.accept({"ok": true})
	await _shell._draft_navigation.apply_and_continue()
	await _wait_for_route("encounters.timed")
	assert(not complex.has_unapplied_changes())


func _wait_for_dialog() -> void:
	for frame in 10:
		if _shell._unapplied_dialog.visible: return
		await process_frame
	assert(false, "Encounter route change did not invoke the draft guard")


func _current_route() -> String:
	return _shell._documents.identity_for_tab(_shell._document_tabs.current_tab)


func _simple_document() -> Dictionary:
	return {"revision": 1, "encounter": {"identity": "simple-encounter:0", "nativeId": 0,
		"promptMessageNativeId": 0, "canBackOut": true, "maxTimes": 1, "casteSuccess": 0,
		"texts": ["Original", "", "", ""], "choiceResults": [1, 0, 0, 0]},
		"promptPreview": "", "references": [], "steps": []}


func _complex_document() -> Dictionary:
	return {"revision": 1, "encounter": {"identity": "complex-encounter:0", "nativeId": 0,
		"promptMessageNativeId": 0, "canBackOut": true, "maxTimes": 1,
		"actionResult": 1, "wordResult": 2, "groups": [0, 0, 0, 0, 0, 0, 0, 0],
		"spellIds": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], "spellResults": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
		"itemIds": [0, 0, 0, 0, 0], "itemResults": [0, 0, 0, 0, 0],
		"thief": false, "casteSuccess": 0, "thiefSuccess": 0, "thiefFail": 0,
		"texts": ["", "", "", "", "", "", "", "", "original"]},
		"promptPreview": "", "references": [], "steps": [], "responseControls": {}, "roguePreview": {}}


func _wait_for_route(route: String) -> void:
	var idle := 0
	for frame in 1200:
		await process_frame
		idle = idle + 1 if _current_route() == route and not _shell._operations.busy else 0
		if idle >= 20: return
	assert(false, "Encounter route navigation did not reach " + route)

func _prepare_session() -> void:
	var opened: Dictionary = _shell._bridge.start_demo()
	assert(opened.get("ok", false))
	for family in ["simple", "complex"]:
		var bound := 7 if family == "simple" else 9
		var listed: Dictionary = _shell._bridge.request("encounter.list-" + family, {"limit":128})
		assert(listed.get("ok", false))
		var identities: Array = listed.result.items.map(func(row): return int(row.nativeId))
		while not identities.has(bound):
			var revision: int = _shell._bridge.request("session.describe", {}).result.revision
			var created: Dictionary = _shell._bridge.request("encounter.create-" + family, {"expectedRevision":revision})
			assert(created.get("ok", false), str(created))
			identities.append(int(created.result.document.encounter.nativeId))
	var described: Dictionary = _shell._bridge.request("session.describe", {})
	assert(described.get("ok", false))
	await _shell._activate_session(described)
