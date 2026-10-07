extends SceneTree

func _initialize() -> void: call_deferred("_run")

func _run() -> void:
	var view=preload("res://src/issues_workbench.tscn").instantiate()
	root.add_child(view); await process_frame
	_check_empty(view,"Initial no-project scene")
	view._diagnostic.initialize(view,null,Callable())
	for name in ["FindUses","OpenRecords","OpenEvidence"]: view.get_node("%"+name).disabled=false
	view._diagnostic.present({}); _check_empty(view,"Repeated empty selection")
	for name in ["FindUses","OpenRecords","OpenEvidence"]: view.get_node("%"+name).disabled=false
	view._diagnostic.invalidate(); _check_empty(view,"Invalidated session")
	view.attach(null); _check_empty(view,"Disconnected project")
	view.free(); await process_frame
	print("PROVIDENCE_ISSUES_EMPTY_OK no-project first-open repeated-empty teardown actions-disabled")
	quit()

func _check_empty(view: Control, context: String) -> void:
	for name in ["OpenFinding","FindUses","OpenRecords","OpenEvidence"]:
		assert(view.get_node("%"+name).disabled,context+" enabled "+name)
