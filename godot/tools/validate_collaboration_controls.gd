extends SceneTree

class Session extends Node:
	signal state_changed(state: Dictionary)
	var state: Dictionary = {"editsPaused": false, "draftActive": false, "clients": [{"id": 1,"kind":"mcp","connected":true,"draftActive":false,"ready":true},{"id":2,"kind":"native","owner":"this-window","connected":true,"draftActive":false,"ready":true}],"disconnectedHolds":[]}
	var calls: Array = []
	func command(method: String, params: Dictionary = {}) -> Dictionary:
		calls.append({"method":method,"params":params})
		match method:
			"session.external-edits": state.editsPaused = not params.allowed
			"session.disconnect-client": state.clients = state.clients.filter(func(client): return client.id != params.clientId)
			"session.release-hold": state.disconnectedHolds = []
		state_changed.emit(state)
		return {"ok":true,"result":state}

class Bridge extends RefCounted:
	var binary := ""
	func is_project_backed() -> bool: return true
	func shared_session_enabled() -> bool: return true
	func mcp_setup_context() -> Dictionary: return {"server":binary,"supportOptions":[]}

class Drafts extends RefCounted:
	var active := false
	var editor: Control
	func has_any_draft() -> bool: return active
	func first_draft() -> Control: return editor if active else null

var _session := Session.new()
var _bridge := Bridge.new()
var _drafts := Drafts.new()
var _controller: Node
var _output := ""
var _draft_opened := false


func _initialize() -> void: _run.call_deferred()


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	assert(args.size()>=2,"Expected evidence directory and MCP executable")
	_output=args[0]
	_bridge.binary=args[1]
	root.gui_embed_subwindows=true
	root.size=Vector2i(1600,900)
	root.add_child(_session)
	var editor := LineEdit.new()
	editor.text="Pending human text"
	root.add_child(editor)
	_drafts.editor=editor
	_controller=load("res://src/mcp_connections_controller.tscn").instantiate()
	root.add_child(_controller)
	_controller.initialize(_session,_drafts,func():return _bridge,func():return {"projectId":"scenario","revision":3},func(_editor): _draft_opened=true)
	await _check_windows()
	await _check_commands()
	await _check_input_guard(editor)
	_controller.queue_free()
	_session.queue_free()
	editor.queue_free()
	await process_frame
	print("PROVIDENCE_COLLABORATION_CONTROLS_OK actual-scenes permission disconnect draft hold setup focus input-guard viewports=1600+1920 prepared-state-fixture")
	quit()


func _check_windows() -> void:
	for viewport in [Vector2i(1600,900),Vector2i(1920,1080)]:
		root.size=viewport
		root.content_scale_size=viewport
		_controller.open()
		await _settle()
		var window: Window=_controller.get_node("%Connections")
		assert(window.size==Vector2i(980,650),"Actual modal size: %s; content minimum: %s" % [window.size,window.get_contents_minimum_size()])
		assert(window.position==Vector2i((viewport-Vector2i(980,650))/2))
		await _capture("connected-%d" % viewport.x)
		_drafts.active=true
		_session.state.draftActive=true
		_session.state.disconnectedHolds=[{"owner":"old-window","draftActive":true}]
		_session.state_changed.emit(_session.state)
		assert(_controller.get_node("%Draft").visible and _controller.get_node("%ReviewHold").visible)
		await _capture("draft-%d" % viewport.x)
		_controller.get_node("%ReviewHold").pressed.emit()
		await _capture("hold-%d" % viewport.x)
		_controller.get_node("%CancelHold").pressed.emit()
		_controller.get_node("%Setup").pressed.emit()
		await _capture("setup-%d" % viewport.x)
		_controller.get_node("%SetupClose").pressed.emit()
		_drafts.active=false
		_session.state.draftActive=false
		_session.state.disconnectedHolds=[]
		_session.state_changed.emit(_session.state)
		_controller.get_node("%Close").pressed.emit()


func _check_commands() -> void:
	_controller.open()
	_controller.get_node("%Pause").pressed.emit()
	assert(_session.state.editsPaused)
	_controller.get_node("%AllowEdits").toggled.emit(true)
	assert(not _session.state.editsPaused)
	var clients: Tree=_controller.get_node("%Clients")
	clients.get_root().get_first_child().select(0)
	clients.item_selected.emit()
	assert(not _controller.get_node("%Disconnect").disabled)
	_controller.get_node("%Disconnect").pressed.emit()
	assert(_session.state.clients.size()==1)
	_drafts.active=true
	_session.state_changed.emit(_session.state)
	_controller.get_node("%Draft").pressed.emit()
	assert(_draft_opened and _drafts.editor.text=="Pending human text")
	_session.state.disconnectedHolds=[{"owner":"old-window","draftActive":true}]
	_session.state_changed.emit(_session.state)
	_controller.get_node("%ReviewHold").pressed.emit()
	_controller.get_node("%ConfirmHold").pressed.emit()
	assert(_session.state.disconnectedHolds.is_empty())
	_controller.get_node("%Setup").pressed.emit()
	_controller.get_node("%ProjectRoot").text=_output
	_controller.get_node("%ExportRoot").text=_output
	_controller.get_node("%ProjectRoot").text_changed.emit(_output)
	assert(not _controller.get_node("%Copy").disabled)
	_controller.get_node("%ExportRoot").text=""
	_controller.get_node("%ExportRoot").text_changed.emit("")
	assert(_controller.get_node("%Copy").disabled)
	_controller.get_node("%SetupClose").pressed.emit()
	_controller.get_node("%Close").pressed.emit()


func _check_input_guard(editor: LineEdit) -> void:
	var guard := preload("res://src/collaboration_input_guard.gd").new()
	var prior := root.gui_disable_input
	guard.freeze(self)
	assert(root.gui_disable_input)
	var window := Window.new()
	root.add_child(window)
	assert(window.gui_disable_input)
	assert(editor.text=="Pending human text")
	guard.release(self)
	assert(root.gui_disable_input==prior and not window.gui_disable_input)
	window.queue_free()


func _capture(label: String) -> void:
	await _settle()
	if DisplayServer.get_name()=="headless": return
	await RenderingServer.frame_post_draw
	var image := root.get_texture().get_image()
	assert(image.save_png(_output.path_join(label+".png"))==OK)


func _settle() -> void:
	for frame in 3: await process_frame
