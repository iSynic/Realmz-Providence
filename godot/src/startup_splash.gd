extends Control

signal splash_displayed
signal scene_load_started
signal editor_presented

@export_file("*.tscn") var editor_scene_path := "res://src/editor_shell.tscn"


func _ready() -> void:
	$Failure/Buttons/Quit.pressed.connect(get_tree().quit)
	_begin_startup.call_deferred()


func _begin_startup() -> void:
	# The editor must not be parsed or instantiated before our first visible frame.
	if DisplayServer.get_name() == "headless":
		await get_tree().process_frame
	else:
		await RenderingServer.frame_post_draw
	if not is_inside_tree(): return
	splash_displayed.emit()
	if not ResourceLoader.exists(editor_scene_path, "PackedScene"):
		_fail("The editor scene is unavailable.")
		return
	scene_load_started.emit()
	# Godot 4.7.1 corrupts the heap when this script hierarchy loads on a worker.
	# Loading after presentation keeps the splash visible without that unsafe path.
	await _present_editor(load(editor_scene_path))


func _present_editor(scene: Resource) -> void:
	if not scene is PackedScene:
		_fail("The editor scene is unavailable.")
		return
	var editor := (scene as PackedScene).instantiate() as Control
	if editor == null:
		_fail("The editor scene is invalid.")
		return
	if not editor.has_signal("startup_completed"):
		editor.free()
		_fail("The editor startup interface is unavailable.")
		return
	# Node.ready does not wait for an asynchronous _ready method to finish.
	editor.hide()
	get_tree().root.add_child(editor)
	if not editor.startup_presentable:
		await editor.startup_completed
	if not is_inside_tree(): return
	await get_tree().process_frame
	get_tree().current_scene = editor
	editor.show()
	editor_presented.emit()
	queue_free()


func _fail(message: String) -> void:
	$Failure/Message.text = message
	$Failure.show()
	$Failure/Buttons/Quit.grab_focus()
	push_error(message)
