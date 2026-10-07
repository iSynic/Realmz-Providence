extends SceneTree

var _editor: Control
var _out := ""
var _receipts: Array = []


func _initialize() -> void: call_deferred("_run")


func _run() -> void:
	create_timer(120).timeout.connect(func(): push_error("Player Scenario capture timed out"); quit(1))
	root.content_scale_size = DisplayServer.window_get_size()
	_out = OS.get_environment("PROVIDENCE_CAPTURE_PATH")
	DirAccess.make_dir_recursive_absolute(_out)
	_editor = load("res://src/editor_shell.tscn").instantiate(); root.add_child(_editor)
	for _frame in 4: await process_frame
	while _editor._operations.busy: await _editor._operations.completed
	await _editor._project_session.open_project(OS.get_environment("PROVIDENCE_CAPTURE_PROJECT"))
	while _editor._operations.busy: await _editor._operations.completed
	var routes := ["player-maps.map-records","scenario.startup","scenario.restrictions","scenario.contact","scenario.registration"]
	if not OS.get_environment("PROVIDENCE_CAPTURE_ROUTE").is_empty(): routes = [OS.get_environment("PROVIDENCE_CAPTURE_ROUTE")]
	for route in routes:
		await _settle()
		await _editor._navigation.select_route(route)
		await _settle()
		assert(_editor._navigation._tabs.current_tab == ProvidenceRouteCatalog.tab_for_route(route), "Capture route did not activate: " + route)
		while _editor._operations.busy: await _editor._operations.completed
		var view: Control = _editor._workbenches.player_maps if route.begins_with("player-") else _editor._workbenches.scenario_sections[ProvidenceRouteCatalog.tab_for_route(route)-26]
		await _capture(route, "populated", view)
		if route == "player-maps.map-records": await _player_map_states(view)
		elif route == "scenario.contact": await _contact_states(view)
		elif route == "scenario.restrictions": await _restriction_states(view)
		if route == "scenario.registration":
			view.text_field("RegistrationName").text = OS.get_environment("PROVIDENCE_REGISTRATION_NAME") if not OS.get_environment("PROVIDENCE_REGISTRATION_NAME").is_empty() else "Author"
			view.text_field("SerialNumber").text = "9140886"
			await view._generate()
			await _capture(route,"generated",view)
			if OS.get_environment("PROVIDENCE_REGISTRATION_NAME") == "SAMUEL":
				view.find_child("ResultsScroll",true,false).scroll_vertical = 10000
				await _capture(route,"recorded-evidence",view)
		elif route == "scenario.startup":
			view.find_child("ChooseStartupLand",true,false).pressed.emit()
			while _editor._operations.busy: await _editor._operations.completed
			for _frame in 4: await process_frame
			await _capture(route,"target-picker",view)
			view._picker.cancel()
			view.text_field("StartupX").text = "90"; view.draft_changed(); await view.controller.validate()
			await _capture(route,"invalid",view)
			await _discard(view)
	var size := DisplayServer.window_get_size()
	FileAccess.open(_out.path_join("captures-%dx%d.json" % [size.x,size.y]),FileAccess.WRITE).store_string(JSON.stringify({"project": OS.get_environment("PROVIDENCE_CAPTURE_PROJECT"),"viewport":size,"captures":_receipts,"buildIdentity":_editor._bridge.request("build.identity").get("result",{})},"  "))
	_editor._bridge.stop(); _editor.free()
	print("PROVIDENCE_PLAYER_SCENARIO_CAPTURE_OK routes=5")
	quit()


func _capture(route: String, state: String, view: Control) -> void:
	await _settle()
	assert(view.is_visible_in_tree(), "Capture view is hidden: " + route)
	assert(_editor._navigation._tabs.current_tab == ProvidenceRouteCatalog.tab_for_route(route), "Capture active route mismatch: " + route)
	for _frame in 4: await process_frame
	await RenderingServer.frame_post_draw
	var size := DisplayServer.window_get_size()
	var name := "%s-%s-%dx%d.png" % [route,state,size.x,size.y]
	var image := root.get_texture().get_image()
	assert(image.save_png(_out.path_join(name)) == OK)
	_receipts.append({"route":route,"state":state,"path":name,"viewRect":view.get_global_rect()})


func _player_map_states(view: Control) -> void:
	if view.current_player_map().is_empty(): return
	view.get_node("%PlayerMapSearch").text = "No matching map"
	view.get_node("%PlayerMapSearch").text_changed.emit("No matching map")
	await _capture("player-maps.map-records","no-results",view)
	view.get_node("%PlayerMapSearch").text = ""; view.get_node("%PlayerMapSearch").text_changed.emit("")
	view.get_node("%PlayerMapShow").value = 0
	view.get_node("%PlayerMapLevel").value = 0
	view.get_node("%StartX").value = 0; view.get_node("%StartY").value = 0
	await view.controller.validate_and_preview()
	await _capture("player-maps.map-records","terrain-draft",view)
	view.get_node("%ChooseMarker").pressed.emit()
	while _editor._operations.busy: await _editor._operations.completed
	await _capture("player-maps.map-records","marker-picker",view)
	view.get_node("ResourcePicker").cancel()
	view.get_node("%PlayerMapShow").value = -201
	await view.controller.validate_and_preview()
	await _capture("player-maps.map-records","text-draft",view)
	view.get_node("%PlayerMapShow").value = 1; view.get_node("%PlayerMapPictureId").value = 30000
	await view.controller.validate_and_preview()
	await _capture("player-maps.map-records","picture-draft",view)
	await _discard(view)


func _contact_states(view: Control) -> void:
	view.text_field("ContactEmail").text = "Author@example.invalid"; view.draft_changed()
	await view.controller.validate()
	await _capture("scenario.contact","dirty",view)
	view.show_result({"ok":false,"error":"Controlled write rejection · local draft retained."})
	await _capture("scenario.contact","known-failure",view)
	await _discard(view)


func _restriction_states(view: Control) -> void:
	var matrix: GridContainer = view.find_child("RaceChecklist", true, false)
	if matrix.get_child_count() > 1:
		matrix.get_child(0).button_pressed = true
		matrix.get_child(1).button_pressed = false
		await _capture("scenario.restrictions", "checked-unchecked", view)
		await _discard(view)
	view.find_child("RaceFilter",true,false).text = "No matching race"
	view.find_child("RaceFilter",true,false).text_changed.emit("No matching race")
	await _capture("scenario.restrictions","filtered",view)
	view.find_child("RaceFilter",true,false).text = ""
	view.find_child("RaceFilter",true,false).text_changed.emit("")
	view.set_interaction(true)
	view.status("Loading restrictions…")
	await _capture("scenario.restrictions","loading",view)
	view.set_interaction(false)


func _settle() -> void:
	await create_timer(0.4).timeout
	while _editor._operations.busy: await _editor._operations.completed
	await process_frame


func _discard(view: Control) -> void:
	await _settle()
	view.discard_draft()
	await _settle()
	assert(not view.has_unapplied_changes(), "Capture draft failed to discard")
