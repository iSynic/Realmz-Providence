extends RefCounted


static func prepare(editor: Control, tree: SceneTree) -> void:
	preload("res://src/readonly_editor_registry.gd").select_tab(editor._document_tabs, 2)
	while editor._operations.busy:
		await editor._operations.completed
	await editor._presentation.select_document(2)
	if not await editor._scripts.open_simple_encounter("simple-encounter:1"):
		push_error("Simple Encounter capture could not open Half Truth encounter 1.")
		return
	await _frames(tree, 6)
	var view: Control = editor._documents.view("encounters.simple")
	match OS.get_environment("PROVIDENCE_CAPTURE_ACTION_STATE"):
		"step-editor":
			view.call("_open_step", 9)
		"copy-from":
			view.call("_copy")
			await _frames(tree, 4)
			while editor._operations.busy:
				await editor._operations.completed
			if view._copy_dialog._items.size() > 1:
				view._copy_dialog.get_node("%Source").select(1)
				view._copy_dialog.call("_select_source", 1)
				while editor._operations.busy:
					await editor._operations.completed
		"code-helper":
			view.call("_open_step", 9)
			await _frames(tree, 4)
			view.call("_open_code_helper")
		"manual":
			view.call("_open_manual")
	await _frames(tree, 10)


static func _frames(tree: SceneTree, count: int) -> void:
	for _frame in range(count):
		await tree.process_frame
