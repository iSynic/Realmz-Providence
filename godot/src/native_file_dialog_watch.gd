## Godot 4.7's Windows display server waits at exit for every native file dialog thread, but only a
## message to the dialog's hidden owner window honours that close request, and none arrives. Quitting
## with a native dialog still open (easily left behind the editor window) therefore hangs. This watch
## tracks open native dialogs; after the scene tree has shut down, it ends the process instead.
extends RefCounted

var _open: Dictionary[int, bool] = {}
var _watched: Dictionary[int, bool] = {}


func watch(tree: SceneTree) -> void:
	tree.node_added.connect(_track)
	for dialog: Node in tree.root.find_children("*", "FileDialog", true, false):
		_track(dialog)
	# The root leaves the tree after every node's exit-tree cleanup, before the display server closes.
	tree.root.tree_exited.connect(_end_if_dialog_open)


func has_open_dialog() -> bool:
	return not _open.is_empty()


func _track(node: Node) -> void:
	var dialog := node as FileDialog
	if dialog == null or _watched.has(dialog.get_instance_id()):
		return
	var id := dialog.get_instance_id()
	_watched[id] = true
	# Every popup variant emits about_to_popup before handing a native dialog to the display server.
	dialog.about_to_popup.connect(_opened.bind(dialog))
	dialog.canceled.connect(func(): _open.erase(id))
	dialog.file_selected.connect(func(_path: String): _open.erase(id))
	dialog.dir_selected.connect(func(_path: String): _open.erase(id))
	dialog.files_selected.connect(func(_paths: PackedStringArray): _open.erase(id))


func _opened(dialog: FileDialog) -> void:
	if dialog.use_native_dialog:
		_open[dialog.get_instance_id()] = true


func _end_if_dialog_open() -> void:
	if has_open_dialog() and OS.get_name() == "Windows" \
			and DisplayServer.has_feature(DisplayServer.FEATURE_NATIVE_DIALOG_FILE):
		OS.kill(OS.get_process_id())
