extends SceneTree

const Catalog = preload("res://src/economy_record_catalog.gd")


func _initialize() -> void: _run.call_deferred()


func _run() -> void:
	var calls: Array = []
	var result := await Catalog.load_all(func(_method, params):
		calls.append(params.offset)
		var rows: Array = []
		for id in range(params.offset, mini(params.offset + params.limit, 194)): rows.append({"nativeId":id})
		return {"ok":true,"result":{"items":rows,"total":194,"revision":7}}, "treasure.list", func(): return true)
	assert(result.ok and result.result.items.size() == 194 and calls == [0,128])
	var changed := await Catalog.load_all(func(_method, params):
		return {"ok":true,"result":{"items":[{"nativeId":0}],"total":2,"revision":params.offset}}, "treasure.list", func(): return true)
	assert(not changed.ok)
	var stale := await Catalog.load_all(func(_method, _params):
		return {"ok":true,"result":{"items":[{"nativeId":0}],"total":2}}, "treasure.list", func(): return false)
	assert(not stale.ok and stale.connectionChanged)
	var args := OS.get_cmdline_user_args()
	if not args.is_empty():
		assert(args.size() == 1 and args[0].get_file() == "project" and args[0].get_base_dir().get_file().begins_with("release-polish-native-capture-"))
		await _real_catalog(args[0])
		print("PROVIDENCE_ECONOMY_CATALOG_REAL_OK Trouble-194 tail193 search mouse-open no-write")
	print("PROVIDENCE_ECONOMY_CATALOG_OK all-pages revision-change stale-session")
	quit()


func _real_catalog(project: String) -> void:
	OS.set_environment("PROVIDENCE_PROJECT_PATH", "")
	var shell = load("res://src/editor_shell.tscn").instantiate()
	root.add_child(shell); await process_frame
	var opened: Dictionary = shell._bridge.start_project(project)
	assert(opened.ok); await shell._activate_session(opened)
	await shell._navigation.select_route("economy.treasure")
	while shell._operations.busy: await process_frame
	var view = shell._workbenches.treasure
	assert(view._summaries.size() == 194 and not view.get_node("%RecordStatus").text.contains("128"))
	var revision: int = shell._session_view.revision
	var search: LineEdit = view.get_node("%RecordSearch")
	search.text = "193"; search.text_changed.emit(search.text)
	var list: ItemList = view.get_node("%RecordList")
	assert(list.item_count == 1 and int(list.get_item_metadata(0)) == 193)
	list.select(0); list.item_selected.emit(0)
	for frame in 1200:
		await process_frame
		if view.current_selection() == 193 and not shell._operations.busy: break
	assert(view.current_selection() == 193 and not view.has_unapplied_changes() and shell._session_view.revision == revision)
	shell.free(); await process_frame
