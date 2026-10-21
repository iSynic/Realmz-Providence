extends SceneTree

# Catalogs are absent unless the caller explicitly supplies isolated application
# media. Editing uses the real shell, workbenches, shared host and feature commands.
class Bridge extends "res://src/native_bridge.gd":
	func _prepare_project_start(path: String, _application: String, _reference: String, _monster: String, _require_snapshot := true) -> Dictionary:
		var library := OS.get_environment("PROVIDENCE_TEST_APPLICATION_LIBRARY")
		var arguments := PackedStringArray(["serve-native-project",path,"--native-client-id","live-fixture-window"])
		if not library.is_empty(): arguments.append_array(["--application-library-root", library])
		return {"ok":true,"arguments":arguments,"projectPath":path,"applicationLibrary":library,"referenceCatalog":"","monsterLibrary":""}
	func _request(method: String, params: Dictionary) -> Dictionary:
		var response := super._request(method,params)
		if method.begins_with("session."):
			print(JSON.stringify({"method":method,"ok":response.get("ok"),"error":response.get("error"),"intent":response.get("result",{}).get("writeIntent")}))
		return response

var _shell: Control
var _evidence := ""
var _sequence := -1
var _last_response: Dictionary = {}


func _initialize() -> void: _run.call_deferred()


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	assert(args.size()==2,"Expected project directory and retained evidence root")
	_evidence=args[1]
	OS.set_environment("PROVIDENCE_PROJECT_PATH","")
	OS.set_environment("PROVIDENCE_SHARED_SESSION","1")
	root.gui_embed_subwindows=true
	_shell=load("res://src/editor_shell.tscn").instantiate()
	root.add_child(_shell)
	if not _shell.startup_presentable: await _shell.startup_completed
	_shell._bridge.stop()
	_shell._bridge=Bridge.new(_evidence.path_join("settings.cfg"))
	var opened: Dictionary=_shell._bridge.start_project(args[0])
	assert(opened.get("ok",false),str(opened))
	assert((await _shell._activate_session(opened)).get("ok",false))
	await _idle()
	await _shell._navigation.select_route("text.messages")
	await _shell._strings.open_native(1)
	assert(_shell._strings.selected_identity()=="message:1" and _shell._strings.draft_text()=="Opening message")
	_publish("ready")
	var deadline := Time.get_ticks_msec()+110000
	while Time.get_ticks_msec()<deadline:
		await process_frame
		var command := _read_command()
		if command.is_empty(): continue
		_sequence=int(command.sequence)
		await _idle()
		if command.action=="stop":
			_shell._close_project()
			_shell.queue_free()
			await process_frame
			_publish("stopped")
			print("PROVIDENCE_LIVE_COLLABORATION_OK real-shell real-strings shared-host drafts history prepared-clock-free")
			quit()
			return
		await _command(command)
		_publish(command.action)
	push_error("Live collaboration fixture exceeded 110 seconds")
	quit(1)


func _command(command: Dictionary) -> void:
	_last_response={}
	match command.action:
		"allow":
			_last_response=await _shell._collaboration.command("session.external-edits",{"allowed":true})
		"draft":
			_shell._strings._message_editor.text=command.text
			assert(_shell._draft_apply.has_any_draft())
		"hide-draft": _shell._document_tabs.current_tab=_shell._documents.tab_for_route("scripts.quests")
		"show-draft": _shell._document_tabs.current_tab=_shell._documents.tab_for_route("text.messages")
		"discard": _shell._draft_apply.discard()
		"apply": _last_response=await _shell._draft_apply.commit()
		"undo", "redo": await _shell._execute_history(command.action)
		"inspect": pass
		"resources":
			await _shell._navigation.select_route("maps.land")
			_last_response = await _shell._maps.document.load_map("land:0")
			_shell._maps.paint_resources.open()
		"inspect-resources": pass
		"open-resource": await _shell._maps.paint_resources._open_entry(command.identity)
		"resource-draft": _shell._maps.paint_resources._window.get_node("%ResourceName").text = command.text
		"discard-resource": _shell._maps.paint_resources._window.discard_draft()
		"connections": _shell._commands._connections.open()
		"capture-ui": await _capture_ui(command)
		_:
			push_error("Unrecognized fixture action: "+str(command.action))
	await _idle()


func _capture_ui(command: Dictionary) -> void:
	assert(DisplayServer.get_name() != "headless", "Native visual capture requires a renderer")
	root.size = Vector2i(int(command.width), int(command.height))
	root.content_scale_size = root.size
	await _shell._collaboration.command("session.collaboration")
	_shell._collaboration.set_process(false)
	if command.mode in ["draft", "hold"]: _shell._strings._message_editor.text = "Human Café draft"
	var controls = _shell._commands._connections
	controls.open()
	var state: Dictionary = _shell._collaboration.state.duplicate(true)
	if command.mode in ["draft", "hold"]:
		# Prepared UI state only; host permissions and retained party/project truth are untouched.
		state.draftActive = true
		for client: Dictionary in state.get("clients", []):
			if client.kind == "native":
				client.draftActive = true
				client.draftLocations = _shell._draft_apply.draft_locations()
		state.disconnectedHolds = [{"owner":"review-window","draftActive":true,"locations":[{"route":"text.messages","identity":"message:2","label":"Message 2"}]}]
		controls._present(state)
	if command.mode == "hold": controls.get_node("%ReviewHold").pressed.emit()
	if command.mode == "setup":
		controls.get_node("%Setup").pressed.emit()
		controls.get_node("%ProjectRoot").text = _evidence
		controls.get_node("%ExportRoot").text = _evidence
		controls.get_node("%ProjectRoot").text_changed.emit(_evidence)
	if command.mode == "connected":
		var client = controls.get_node("%Clients").get_root().get_first_child()
		while client != null:
			if client.get_metadata(0).kind == "mcp":
				client.select(0)
				controls.get_node("%Clients").item_selected.emit()
				break
			client = client.get_next()
	for frame in 4: await process_frame
	await RenderingServer.frame_post_draw
	var path := _evidence.path_join("%s-%d.png" % [command.mode,command.width])
	assert(root.get_texture().get_image().save_png(path) == OK)
	controls.get_node("%SetupWindow").hide()
	controls.get_node("%ReleaseHold").hide()
	controls.get_node("%Close").pressed.emit()
	if command.mode in ["draft", "hold"]: _shell._draft_apply.discard()
	_shell._collaboration.set_process(true)


func _read_command() -> Dictionary:
	var name := "command-%06d.json" % maxi(1, _sequence + 1)
	return preload("res://tools/collaboration_mailbox.gd").read_command(_evidence.path_join(name), _sequence)


func _publish(action: String) -> void:
	var projection := {"action":action,"sequence":_sequence,"response":_last_response,"enginePid":OS.get_process_id()}
	if is_instance_valid(_shell) and _shell.is_inside_tree():
		projection.merge({"revision":_shell._session_view.revision,"draft":_shell._draft_apply.has_any_draft(),"text":_shell._strings.draft_text(),"collaboration":_shell._collaboration.state})
		var resources: Window = _shell._maps.paint_resources._window
		projection["paintResource"] = resources.draft()
		projection["paintEntries"] = resources.get_node("%Entries").item_count
	var name := "native-state-ready.json" if action == "ready" else "native-state-%06d.json" % _sequence
	var destination := _evidence.path_join(name)
	assert(not FileAccess.file_exists(destination), "Fixture responses are immutable")
	var pending := destination + ".pending"
	var output := FileAccess.open(pending,FileAccess.WRITE)
	output.store_string(JSON.stringify(projection))
	output.close()
	assert(DirAccess.rename_absolute(pending, destination) == OK)


func _idle() -> void:
	for frame in 3: await process_frame
	while _shell._operations.busy: await _shell._operations.completed
