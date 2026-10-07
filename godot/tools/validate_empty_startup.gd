extends SceneTree


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	OS.set_environment("PROVIDENCE_PROJECT_PATH", "")
	var shell = load("res://src/editor_shell.tscn").instantiate()
	root.add_child(shell)
	await process_frame
	await process_frame
	_check_adapter_protocol(shell)
	assert(not shell._session_view.connected, "Ordinary startup must not launch a demo project")
	assert(shell._session_view.project_id.is_empty())
	assert(shell._strings._messages.is_empty() and shell._maps.document.maps.is_empty())
	assert(not shell._draft_apply.has_draft(), "Untouched startup must not ask to apply changes")
	var continued := {"value": false}
	shell._draft_navigation.request(func(): continued.value = true)
	assert(continued.value, "Open must proceed without an untouched-project prompt")
	assert(not shell._unapplied_dialog.visible)
	_check_new_project_menu(shell)
	var response: Dictionary = shell._bridge.start_demo()
	assert(bool(response.get("ok", false)), str(response))
	await shell._activate_session(response)
	assert(shell._document_tabs.current_tab == shell._documents.tab_for_route("scripts.action-points"))
	await shell._navigation.select_route("scripts.macros")
	assert(not shell._draft_apply.has_draft(), "Untouched loaded demo must not have a draft: %s versus %s" % [shell._documents.view("scripts.macros").read_state().draft, shell._documents.view("scripts.macros")._saved_record_draft])
	shell._documents.view("scripts.macros")._chance.value = 75
	assert(shell._draft_apply.has_draft(), "Real edits must retain the navigation guard: %s" % {"tab": shell._document_tabs.current_tab, "state": shell._documents.view("scripts.macros").read_state(), "document": shell._documents.view("scripts.macros").current_extra_action_point()})
	shell._documents.view("scripts.macros").discard_draft()
	assert(not shell._draft_apply.has_draft())
	_check_document_equality()
	await shell._navigation.select_tab(2)
	assert(not shell._documents.view("encounters.simple").current_encounter().is_empty())
	assert(not shell._draft_apply.has_draft(), "Untouched encounter must not have a numeric-type draft")
	await shell._navigation.activate_domain("assets")
	var assets = shell._assets.library_workbench
	assert(assets != null and assets._scope == "scenario")
	assert(shell._document_tabs.get_current_tab_control() == assets)
	for scope in ["stock", "personal", "scenario"]:
		await assets.show_scope(scope)
		assert(shell._document_tabs.get_current_tab_control() == assets)
		assert(assets._scope == scope)
	for route in shell._domain_navigation.buttons():
		if str(route.get_meta("route_id", "")) == "assets.library-assets":
			route.pressed.emit()
	while shell._operations.busy: await process_frame
	await process_frame
	assert(shell._document_tabs.get_current_tab_control() == assets and assets._scope == "stock")
	for tab in [7, 8, 9]:
		while shell._operations.busy: await process_frame
		await shell._navigation.select_tab(tab)
		while shell._operations.busy: await process_frame
		assert(shell._document_tabs.current_tab == tab, "Family editors must remain reachable")
	for entry in [["picture", 7], ["sound", 8], ["icon", 9], ["special-land-tile", 10]]:
		assert(shell._assets.import_editor(entry[0]).get_index() == entry[1])
	assert(shell._assets.import_editor("text-style-resource") == null)
	shell._close_project()
	assert(assets.get_node("%Gallery")._rows.is_empty())
	assert(assets.get_node("%Gallery").get_node("%Preview").texture == null)
	assert(assets.get_node("%Import").disabled)
	shell.queue_free()
	await process_frame
	print("PROVIDENCE_EMPTY_STARTUP_OK no-demo no-draft open-without-prompt adapter-protocol-guard")
	quit()


func _check_adapter_protocol(shell: Control) -> void:
	var legacy: Dictionary = shell._bridge._validate_startup_response({"ok": true, "result": {"revision": 0}})
	assert(not legacy.ok and legacy.adapterProtocolMismatch and "reported legacy" in legacy.error)
	var matching: Dictionary = shell._bridge._validate_startup_response({"ok": true, "result": {"adapterProtocol": 2}})
	assert(matching.ok)


func _check_document_equality() -> void:
	var equality = preload("res://src/document_value_equality.gd")
	assert(equality.equal({"actions": [{"target": 47.0}]}, {"actions": [{"target": 47}]}))
	assert(not equality.equal({"target": 47.5}, {"target": 47}))
	assert(not equality.equal({"target": 47}, {"target": "47"}))
	assert(not equality.equal({"target": 47}, {}))


func _check_new_project_menu(shell: Control) -> void:
	shell._commands.dispatch(&"file.new-project")
	assert(shell._new_project_dialog.visible)
	shell._new_project_dialog.hide()
