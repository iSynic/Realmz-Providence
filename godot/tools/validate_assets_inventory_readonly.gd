extends SceneTree

var _shell


func _initialize() -> void:
	call_deferred("_run")


func _check(condition: bool, message: String) -> bool:
	if not condition:
		push_error(message)
		if _shell != null:
			_shell._bridge.stop()
		quit(1)
	return condition


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if not _check(args.size() == 1, "Expected an existing project directory"):
		return
	OS.set_environment("PROVIDENCE_PROJECT_PATH", "")
	_shell = load("res://src/editor_shell.tscn").instantiate()
	root.add_child(_shell)
	await _shell._project_session.open_project(args[0])
	if not _check(_shell._bridge.is_project_backed(), "Project did not open"):
		return
	var response: Dictionary = _shell._bridge.request("project-asset.list", {"kind": "all", "offset": 0, "limit": 25})
	if not _check(bool(response.get("ok", false)), str(response)):
		return
	var revision: int = _shell._session_view.revision
	await _shell._navigation.activate_domain("assets")
	var panel = _shell._assets.library_workbench.get_node("%Gallery")
	for frame in 30:
		await process_frame
	var expected: Array = response.result.items
	if not _check(panel._rows.size() == expected.size(), "Gallery omitted assets from its first bounded page"):
		return
	var kinds := {}
	for index in expected.size():
		if not _check(panel._rows[index].identity == expected[index].identity, "Gallery identity order differs from inventory"):
			return
		var kind: String = expected[index].kind
		kinds[kind] = int(kinds.get(kind, 0)) + 1
		if kind in ["icon", "picture"]:
			if not panel._previews.get(index, {}).has("texture"):
				var preview: Dictionary = _shell._bridge.request(expected[index].previewCommand, {"identity": expected[index].identity})
				print("Image preview metadata: ok=%s mime=%s encodedLength=%d" % [preview.get("ok", false), preview.get("result", {}).get("mimeType", ""), str(preview.get("result", {}).get("base64", "")).length()])
			if not _check(panel._previews.get(index, {}).has("texture"), "Existing image did not decode: %s (%s)" % [expected[index].identity, panel._previews.get(index, {})]):
				return
		if kind == "text-resource":
			await panel._select(index)
			if not _check(panel.get_node("%TextPreview").visible and not panel.get_node("%TextPreview").text.is_empty(), "Existing text did not render in preview"):
				return
	if not _check(_shell._session_view.revision == revision, "Browsing changed the project revision"):
		return
	for index in expected.size():
		if expected[index].kind == "picture":
			await panel._select(index)
			await _shell._assets.open_resource(expected[index])
			if not _check(_shell._document_tabs.current_tab == 7, "Picture edit did not open its editor"):
				return
			_shell._documents.view("assets.pictures").find_child("ScenarioAssets", true, false).pressed.emit()
			if not _check(not _shell._unapplied_dialog.visible and _shell._document_tabs.get_current_tab_control() == _shell._assets.library_workbench, "Untouched picture could not return to Assets"):
				return
			if not _check(panel._rows[panel._selected].identity == expected[index].identity, "Return lost the selected picture"):
				return
	print("PROVIDENCE_ASSETS_INVENTORY_READONLY_OK total=%d firstPage=%d kinds=%s revision=%d" % [int(response.result.total), expected.size(), kinds, revision])
	await panel.reload(null)
	await process_frame
	_shell.queue_free()
	await process_frame
	quit()
