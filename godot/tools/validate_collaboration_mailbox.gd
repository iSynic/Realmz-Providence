extends SceneTree


func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	assert(args.size() == 1)
	var root_path := args[0]
	assert(DirAccess.dir_exists_absolute(root_path))
	var path := root_path.path_join("command-000001.json")
	var next := root_path.path_join("command-000002.json")
	var pending := root_path.path_join("command-000002.pending")
	var mailbox := preload("res://tools/collaboration_mailbox.gd")
	assert(mailbox.read_command(path, -1).is_empty())
	_write(path, "")
	# The former parse_string convenience call emits an engine error for this
	# unavailable payload. Check its parser failure without emitting that error.
	assert(JSON.new().parse(FileAccess.get_file_as_string(path)) != OK)
	assert(mailbox.read_command(path, -1).is_empty())
	_write(path, JSON.stringify({"sequence":1,"action":"inspect"}))
	_write(pending, "{")
	assert(mailbox.read_command(path, -1).sequence == 1)
	assert(mailbox.read_command(path, 1).is_empty())
	_write(pending, JSON.stringify({"sequence":2,"action":"stop"}))
	assert(DirAccess.rename_absolute(pending, next) == OK)
	assert(mailbox.read_command(next, 1).sequence == 2)
	assert(mailbox.read_command(path, -1).sequence == 1)
	assert(DirAccess.remove_absolute(path) == OK)
	assert(DirAccess.remove_absolute(next) == OK)
	assert(mailbox.read_command(path, 1).is_empty())
	print("PROVIDENCE_COLLABORATION_MAILBOX_OK missing empty unpublished-partial immutable-publication stale-sequence")
	quit()


func _write(path: String, text: String) -> void:
	var output := FileAccess.open(path, FileAccess.WRITE)
	assert(output != null)
	output.store_string(text)
	output.close()
