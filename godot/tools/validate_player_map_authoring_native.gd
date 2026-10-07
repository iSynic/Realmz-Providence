extends SceneTree

class IsolatedBridge extends "res://src/native_bridge.gd":
	var personal_root := ""
	func configured_personal_library_root() -> String: return personal_root
	func configured_application_library_root(_root: String = "") -> String: return ""
	func configured_reference_catalog_root(_root: String = "") -> String: return ""
	func configured_monster_library_root(_root: String = "") -> String: return ""
	func bundled_classic_application_data_root() -> String: return ""

var _bridge: IsolatedBridge
var _operations := ProvidenceEditorOperation.new()
var _controller := preload("res://src/player_maps_controller.gd").new()
var _view: ProvidencePlayerMapsEditor
var _revision := 0
var _receipts: Array = []
var _work_root := ""


func _initialize() -> void: call_deferred("_run")


func _run() -> void:
	create_timer(50).timeout.connect(func(): push_error("Native Player Map check timed out"); quit(1))
	var args := OS.get_cmdline_user_args()
	if not check(args.size() == 1, "disposable root required"): return
	_work_root = args[0]; DirAccess.make_dir_recursive_absolute(_work_root)
	_bridge = IsolatedBridge.new(_work_root.path_join("settings.cfg")); _bridge.personal_root = _work_root.path_join("personal-library")
	if not check(_bridge.create_project("player-map-native", _work_root.path_join("project")).get("ok", false), "create fresh project"): return
	if not write("map.create", {"levelType": "land"}): return
	if not _import_reference_media(): return
	root.add_child(_operations)
	_view = load("res://src/player_maps_editor.tscn").instantiate(); root.add_child(_view); _view.size = Vector2(1280, 740)
	_controller.initialize(_view, ProvidenceRebuiltPreviewSelection.new(), _operations, func(): return {"revision": _revision}, accept, accept)
	_controller.projection_applied.connect(func(projection: Dictionary): _revision = int(projection.revision))
	_controller.attach_session(_bridge)
	if not check((await _controller.reload()).get("ok", false), "fresh empty browser"): return
	if not check(not _view.get_node("%NewPlayerMap").disabled, "New allocation control available"): return
	if not check((await _controller.create_record()).get("ok", false), "create record through native controller"): return
	if not check(_view.current_player_map().identity == "player-map:0", "core allocation opens exact new record"): return
	_view.get_node("%AvailableName").text = "Élan map"; _view.draft_changed()
	_view.get_node("%UnavailableName").text = "Unexplored"; _view.draft_changed()
	_view.get_node("%PlayerMapNote").text = "Élan\u0007\u000b note"; _view.draft_changed()
	_view._select_marker(9); _view.get_node("%MarkerSlot").select(9)
	_view._selectors.choose_resource("marker", _view.get_node("%ChooseMarker"))
	if not await choose_resource(137): return
	_view.get_node("%MarkerX").value = 2; _view.get_node("%MarkerY").value = 3
	if not check(_view.draft_record().markers[9] == {"iconId": 137, "x": 2, "y": 3}, "exact marker assigned to tenth slot"): return
	_view._selectors.choose_resource("scrollingText", _view.get_node("%ChooseText"))
	if not await choose_resource(-201): return
	await _controller.validate_and_preview()
	if not check(_view.get_node("%TextPreview").text == "Élan: exact scrolling TEXT.", "exact TEXT draft preview · %s · %s · %s" % [_view.get_node("%PlayerMapStatus").text, _view.get_node("%PreviewReason").text, _view.get_node("%TextPreview").text]): return
	var before := _revision
	await _view.commit_selected()
	if not check(_revision == before + 1 and not _view.has_unapplied_changes(), "one record and names Apply"): return
	if not write("history.undo", {}): return
	var undone: Dictionary = _bridge.request("player-map.open", {"identity": "player-map:0"}).result
	if not check(undone.playerMap.markers[9].iconId == 0 and undone.names.availableName == "", "one undo restores body and names"): return
	if not write("history.redo", {}): return
	await _controller.reload()
	var saved := _view.draft_record()
	_view._selectors.choose_resource("scrollingText", _view.get_node("%ChooseText"))
	if not await choose_resource(-201): return
	if not check(not _view.has_unapplied_changes(), "same resource acceptance preserves draft"): return
	_view._selectors.choose_resource("picture", _view.get_node("%ChoosePicture"))
	_view.get_node("ResourcePicker").cancel()
	if not check(_view.draft_record() == saved, "picker cancellation preserves entire record"): return
	_view.get_node("%PlayerMapShow").value = 1
	_view._selectors.choose_resource("picture", _view.get_node("%ChoosePicture"))
	if not await choose_resource(30000): return
	await _controller.validate_and_preview()
	if not check(_view.get_node("%PlayerMapPreview").projection.mode == "picture", "exact picture draft preview"): return
	await _view.commit_selected()
	if not check(not _view.has_unapplied_changes(), "picture form Apply"): return
	if not _save_and_reopen(): return

	_controller.dispose(); _view.free(); _bridge.stop(); _operations.free()
	print("PROVIDENCE_PLAYER_MAP_AUTHORING_NATIVE_OK create-picker-marker-text-picture-same-cancel-atomic-history-save-reopen")
	quit()


func _import_reference_media() -> bool:
	if not write("text-resource.create", {"resourceId": -201, "label": "Signed scrolling note", "text": "Élan: exact scrolling TEXT."}): return false
	var image := Image.create(32, 32, false, Image.FORMAT_RGBA8)
	image.fill(Color("f5c54b")); image.save_png(_work_root.path_join("icon.png"))
	if not write("icon.import", {"path": _work_root.path_join("icon.png"), "label": "Exact marker", "resourceId": 137, "width": 32, "height": 32, "rgbaBase64": Marshalls.raw_to_base64(image.get_data())}): return false
	if not write("picture.import", {"path": _work_root.path_join("icon.png"), "label": "Exact picture", "resourceId": 30000, "width": 32, "height": 32, "rgbaBase64": Marshalls.raw_to_base64(image.get_data())}): return false
	return true


func _save_and_reopen() -> bool:
	var expected: Dictionary = _bridge.request("player-map.open", {"identity": "player-map:0"}).result
	if not check(_bridge.request("project.save").get("ok", false), "Save native project"): return false
	_bridge.stop()
	if not check(_bridge.start_project(_work_root.path_join("project")).get("ok", false), "reopen portable project"): return false
	var reopened: Dictionary = _bridge.request("player-map.open", {"identity": "player-map:0"}).result
	if not check(reopened.playerMap == expected.playerMap and reopened.names.availableName == expected.names.availableName, "record, names, signed references and ten slots persist"): return false
	FileAccess.open(_work_root.path_join("receipts.json"), FileAccess.WRITE).store_string(JSON.stringify({"buildIdentity": _bridge.request("build.identity").result, "checks": _receipts}, "  "))
	return true


func choose_resource(value: int) -> bool:
	var picker: Window = _view.get_node("ResourcePicker")
	for _frame in 240:
		await process_frame
		if not _operations.busy and picker.get_node("%Choices").item_count > 0: break
	var found := -1
	for index in picker._rows.size():
		if int(picker._rows[index].value) == value: found = index; break
	if not check(found >= 0, "picker resolves exact signed ID %d · %s · %s" % [value, str(picker._rows), picker.get_node("%Count").text]): return false
	picker.get_node("%Choices").select(found); picker._preview(found)
	for _frame in 240:
		await process_frame
		if not picker.get_node("%UseSelection").disabled: break
	if not check(not picker.get_node("%UseSelection").disabled, "payload preview enables explicit acceptance %d" % value): return false
	picker.get_node("%UseSelection").pressed.emit()
	await process_frame
	return true


func write(method: String, params: Dictionary) -> bool:
	params["expectedRevision"] = _revision
	var response: Dictionary = _bridge.request(method, params)
	if not check(response.get("ok", false), method + " · " + str(response.get("error", ""))): return false
	_revision = int(response.result.revision)
	return true


func accept(response: Dictionary) -> bool: return response.get("ok", false)


func check(condition: bool, label: String) -> bool:
	_receipts.append({"check": label, "passed": condition})
	if condition: return true
	push_error(label)
	if _bridge != null: _bridge.stop()
	quit(1); return false
