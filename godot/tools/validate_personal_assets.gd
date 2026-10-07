extends SceneTree

class LibraryBridge extends "res://src/native_bridge.gd":
	var revision := 0
	var rows: Array = []
	var png := ""
	var mutation_delay_ms := 0
	func _request(method: String, params: Dictionary = {}) -> Dictionary:
		if method in ["personal-library.list", "media.library.list"]:
			assert(params.limit == 25)
			return {"ok": true, "result": {"revision": revision, "items": rows.duplicate(true), "total": rows.size()}}
		if method == "personal-library.preview":
			return {"ok": true, "result": {"base64": png, "width": 1, "height": 1}}
		if int(params.get("expectedRevision", -1)) != revision:
			return {"ok": false, "error": "Library changed"}
		OS.delay_msec(mutation_delay_ms)
		match method:
			"personal-library.import-image": rows.append({"identity": params.identity, "name": params.name})
			"personal-library.rename": rows[0].name = params.name
			"personal-library.remove": rows.clear()
			_: return {"ok": false, "error": "Unexpected command"}
		revision += 1
		return {"ok": true, "result": {"revision": revision}}


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	create_timer(20.0).timeout.connect(func(): quit(1))
	var panel = load("res://src/personal_assets_panel.tscn").instantiate()
	root.add_child(panel)
	panel.size = Vector2(1200, 760)
	var bridge := LibraryBridge.new()
	var image := Image.create(1, 1, false, Image.FORMAT_RGBA8)
	image.fill(Color.RED)
	bridge.png = Marshalls.raw_to_base64(image.save_png_to_buffer())
	await panel.reload(bridge)
	assert(panel.get_node("%Rename").disabled)
	await panel.import_file("C:/fixture/Ruby.png")
	for frame in 4:
		await process_frame
	assert(panel.get_node("%Gallery").item_count == 1)
	await panel._select(0)
	assert(panel.get_node("%Preview").texture != null)
	panel._rename_dialog()
	panel.get_node("%NewName").text = "Garnet"
	panel.get_node("%RenameDialog").hide()
	panel.get_node("%RenameDialog").confirmed.emit()
	while panel.get("_operations").busy: await process_frame
	assert(bridge.rows[0].name == "Garnet")
	await panel._select(0)
	panel._remove_dialog()
	assert(bridge.rows.size() == 1)
	panel.get_node("%RemoveDialog").confirmed.emit()
	while panel.get("_operations").busy: await process_frame
	assert(bridge.rows.is_empty())
	assert(panel.get_node("%Rename").disabled)
	await _check_late_search(panel, bridge)
	panel.queue_free()
	await process_frame
	print("Personal assets scene: import, preview, rename, confirmed removal and late search retention passed")
	quit()


func _check_late_search(panel: Control, bridge: LibraryBridge) -> void:
	bridge.mutation_delay_ms = 35
	panel.import_file("C:/fixture/Amber.png")
	assert(bridge.operation_busy())
	panel.get_node("%Search").text = "a newer search"
	while bridge.operation_busy(): await process_frame
	assert(bridge.rows.size() == 1 and bridge.rows[0].name == "Amber")
	assert(panel.get_node("%Search").text == "a newer search")
	assert(panel.get_node("%Gallery").item_count == 0)
	assert(panel.get_node("%Status").text.contains("search changed"))
